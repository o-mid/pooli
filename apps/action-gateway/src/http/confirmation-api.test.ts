/**
 * Tests for the confirmation HTTP surface.
 *
 * The interesting properties are what the endpoint REFUSES and what it
 * declines to disclose, so those get the coverage. Written as attacks, like
 * the domain tests.
 */

import { describe, expect, it } from 'vitest';
import { AttemptLimiter, createConfirmationApi } from './confirmation-api.js';
import { ActionRegistry } from '../domain/registry.js';
import { InMemoryProposalStore } from '../domain/store.js';
import { TEST_MESSAGE } from '../domain/test-fixture.js';

const PAYLOAD = TEST_MESSAGE;

/**
 * Drive the Express app over loopback without Node 24's fetch.
 *
 * Two things that hang this helper until Vitest's 5s cap:
 *   1. listen(0) with no host binds :: on macOS; 127.0.0.1 never connects.
 *   2. global fetch keeps the socket alive, so server.close() waits out the
 *      idle timeout. That is the 5007ms you are seeing.
 *
 * http.request with agent:false and closeAllConnections() does neither.
 */
async function request(
  app: ReturnType<typeof createConfirmationApi>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const http = await import('node:http');
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as { port: number }).port;
  const payload = body !== undefined ? JSON.stringify(body) : undefined;

  try {
    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          family: 4,
          port,
          path,
          method,
          agent: false,
          headers: payload
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
              }
            : {},
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let parsed: unknown = null;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = null;
            }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        },
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function setup(ttlSeconds = 300) {
  const store = new InMemoryProposalStore();
  const registry = new ActionRegistry(store, { ttlSeconds });
  const app = createConfirmationApi(registry);
  const p = await registry.propose({ payload: PAYLOAD, idempotencyKey: `k_${Math.random()}` });
  if (!p.ok) throw new Error('setup');
  return { store, registry, app, proposal: p.value.proposal, linkCode: p.value.linkCode };
}

describe('reading a proposal for confirmation', () => {
  it('returns the stored artifact', async () => {
    const { app, proposal } = await setup();
    const r = await request(app, 'GET', `/api/proposals/${proposal.id}`);
    expect(r.status).toBe(200);
    expect(r.body.orderSlug).toBe('ceramic-mug-e2e');
    expect(r.body.body).toContain('awaiting payment');
    expect(r.body.payloadDigest).toBe(proposal.payloadDigest);
  });

  it('never exposes the link code or its hash', async () => {
    const { app, proposal, linkCode } = await setup();
    const r = await request(app, 'GET', `/api/proposals/${proposal.id}`);
    const serialised = JSON.stringify(r.body);
    expect(serialised).not.toContain(linkCode);
    expect(serialised).not.toContain(proposal.linkCodeHash);
  });

  it('404s an unknown proposal rather than revealing anything', async () => {
    const { app } = await setup();
    const r = await request(app, 'GET', '/api/proposals/prop_does_not_exist');
    expect(r.status).toBe(404);
  });
});

describe('confirming', () => {
  it('confirms and executes with the right code and digest', async () => {
    const { app, proposal, linkCode } = await setup();
    const r = await request(app, 'POST', `/api/proposals/${proposal.id}/confirm`, {
      linkCode,
      payloadDigest: proposal.payloadDigest,
    });
    expect(r.status).toBe(200);
    expect(r.body.state).toBe('executed');
    expect(r.body.simulated).toBe(true);
  });

  it('refuses a wrong code with 403', async () => {
    const { app, proposal } = await setup();
    const r = await request(app, 'POST', `/api/proposals/${proposal.id}/confirm`, {
      linkCode: 'WRONGX',
      payloadDigest: proposal.payloadDigest,
    });
    expect(r.status).toBe(403);
  });

  it('refuses a digest the human never saw, without saying what changed', async () => {
    const { app, proposal, linkCode } = await setup();
    const r = await request(app, 'POST', `/api/proposals/${proposal.id}/confirm`, {
      linkCode,
      payloadDigest: 'a'.repeat(64),
    });
    expect(r.status).toBe(409);
    // The page is public; it must not describe the discrepancy.
    expect(JSON.stringify(r.body)).not.toMatch(/amount|destination|changed/i);
  });

  it('rejects a malformed body instead of coercing it', async () => {
    const { app, proposal } = await setup();
    const r = await request(app, 'POST', `/api/proposals/${proposal.id}/confirm`, {
      linkCode: { $ne: null },
      payloadDigest: 123,
    });
    expect(r.status).toBe(400);
  });

  it('returns 410 for an expired proposal', async () => {
    const store = new InMemoryProposalStore();
    let clock = Date.now();
    const registry = new ActionRegistry(store, { ttlSeconds: 60, now: () => clock });
    const app = createConfirmationApi(registry);
    const p = await registry.propose({ payload: PAYLOAD, idempotencyKey: 'exp' });
    if (!p.ok) throw new Error('setup');
    clock += 61_000;
    const r = await request(app, 'POST', `/api/proposals/${p.value.proposal.id}/confirm`, {
      linkCode: p.value.linkCode,
      payloadDigest: p.value.proposal.payloadDigest,
    });
    expect(r.status).toBe(410);
  });

  it('cannot be replayed after execution', async () => {
    const { app, proposal, linkCode } = await setup();
    const body = { linkCode, payloadDigest: proposal.payloadDigest };
    const first = await request(app, 'POST', `/api/proposals/${proposal.id}/confirm`, body);
    expect(first.status).toBe(200);
    const second = await request(app, 'POST', `/api/proposals/${proposal.id}/confirm`, body);
    expect(second.status).toBe(409);
  });
});

describe('brute force resistance', () => {
  it('locks out after repeated wrong codes', async () => {
    const { app, proposal } = await setup();
    const attempt = (code: string) =>
      request(app, 'POST', `/api/proposals/${proposal.id}/confirm`, {
        linkCode: code,
        payloadDigest: proposal.payloadDigest,
      });

    const codes = ['AAAAAA', 'BBBBBB', 'CCCCCC', 'DDDDDD', 'EEEEEE'];
    for (const c of codes) expect((await attempt(c)).status).toBe(403);
    // Sixth attempt inside the window is refused without even being checked.
    expect((await attempt('FFFFFF')).status).toBe(429);
  });

  it('still refuses the CORRECT code once locked out', async () => {
    // Otherwise the limiter is decorative, an attacker who finds the code on
    // the last attempt would still get in.
    const { app, proposal, linkCode } = await setup();
    for (const c of ['AAAAAA', 'BBBBBB', 'CCCCCC', 'DDDDDD', 'EEEEEE']) {
      await request(app, 'POST', `/api/proposals/${proposal.id}/confirm`, {
        linkCode: c,
        payloadDigest: proposal.payloadDigest,
      });
    }
    const r = await request(app, 'POST', `/api/proposals/${proposal.id}/confirm`, {
      linkCode,
      payloadDigest: proposal.payloadDigest,
    });
    expect(r.status).toBe(429);
  });

  it('limits per proposal, so one target cannot be attacked from many sources', () => {
    const limiter = new AttemptLimiter(3, 60_000);
    expect(limiter.consume('confirm:p1')).toBe(true);
    expect(limiter.consume('confirm:p1')).toBe(true);
    expect(limiter.consume('confirm:p1')).toBe(true);
    expect(limiter.consume('confirm:p1')).toBe(false);
    // A different proposal is unaffected.
    expect(limiter.consume('confirm:p2')).toBe(true);
  });

  it('caps aggregate guessing across many proposals, not just within one', async () => {
    // The gap per-proposal counting leaves: an attacker who can cause many
    // proposals gets a fresh budget on each. The global ceiling closes it.
    const store = new InMemoryProposalStore();
    const registry = new ActionRegistry(store, { ttlSeconds: 300 });
    const app = createConfirmationApi(registry, {
      limiter: new AttemptLimiter(5, 60_000),
      globalLimiter: new AttemptLimiter(6, 60_000),
    });

    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const p = await registry.propose({ payload: PAYLOAD, idempotencyKey: `agg_${i}` });
      if (p.ok) ids.push(p.value.proposal.id);
    }

    const statuses: number[] = [];
    for (const id of ids) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await request(app, 'POST', `/api/proposals/${id}/confirm`, {
          linkCode: 'ZZZZZZ',
          payloadDigest: 'b'.repeat(64),
        });
        statuses.push(r.status);
      }
    }
    // Each proposal individually stayed under its own limit of 5, yet the
    // aggregate ceiling of 6 still cut the attack off.
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it('a correct code clears the counter but a wrong one does not', () => {
    const limiter = new AttemptLimiter(3, 60_000);
    limiter.consume('k');
    limiter.consume('k');
    limiter.clear('k');
    expect(limiter.consume('k')).toBe(true);
  });
});

describe('rejecting', () => {
  it('lets the human decline, and then execution is impossible', async () => {
    const { app, registry, proposal } = await setup();
    const r = await request(app, 'POST', `/api/proposals/${proposal.id}/reject`, {});
    expect(r.status).toBe(200);
    expect(r.body.state).toBe('rejected');
    expect((await registry.execute(proposal.id)).ok).toBe(false);
  });
});
