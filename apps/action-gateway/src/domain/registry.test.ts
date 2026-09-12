/**
 * Adversarial tests for the registry, the store's CAS, and validation.
 *
 * The state-machine tests cover what is legal. These cover what happens when
 * two callers race, when a proposal is replayed, and when the agent sends
 * values chosen to break something.
 */

import { describe, expect, it } from 'vitest';
import { ActionRegistry } from './registry.js';
import { InMemoryProposalStore } from './store.js';
import { MAX_BODY_LEN, validateMessageDraft, lintFalsePaidClaim } from './validation.js';
import { TEST_MESSAGE } from './test-fixture.js';

const PAYLOAD = TEST_MESSAGE;

function setup(ttlSeconds = 300) {
  const store = new InMemoryProposalStore();
  return { store, registry: new ActionRegistry(store, { ttlSeconds }) };
}

const propose = (r: ActionRegistry, key = 'idem_1', payload = PAYLOAD) =>
  r.propose({ payload, idempotencyKey: key });

describe('propose', () => {
  it('creates a proposal awaiting confirmation and returns the link code once', async () => {
    const { registry } = setup();
    const r = await propose(registry);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.proposal.state).toBe('pending_confirmation');
    expect(r.value.linkCode).toHaveLength(6);
    expect(r.value.deduplicated).toBe(false);
  });

  it('never returns the link code again on a later read', async () => {
    const { registry } = setup();
    const r = await propose(registry);
    if (!r.ok) return;
    const read = await registry.getForConfirmation(r.value.proposal.id);
    expect(JSON.stringify(read)).not.toContain(r.value.linkCode);
  });

  it('deduplicates a retried idempotency key instead of creating a second proposal', async () => {
    const { registry } = setup();
    const first = await propose(registry, 'same-key');
    const second = await propose(registry, 'same-key');
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.proposal.id).toBe(first.value.proposal.id);
    expect(second.value.deduplicated).toBe(true);
  });

  it('does not re-issue the link code to a replayed proposal', async () => {
    const { registry } = setup();
    const first = await propose(registry, 'same-key');
    const replay = await propose(registry, 'same-key');
    if (!first.ok || !replay.ok) return;
    // Whoever replayed the call must not receive a usable code.
    expect(replay.value.linkCode).toBe('');
    expect(first.value.linkCode).not.toBe('');
  });

  it('requires an idempotency key', async () => {
    const { registry } = setup();
    const r = await registry.propose({ payload: PAYLOAD, idempotencyKey: '   ' });
    expect(r.ok).toBe(false);
  });
});

describe('the agent cannot execute', () => {
  it('refuses execution of a proposal that was never confirmed', async () => {
    const { registry } = setup();
    const p = await propose(registry);
    if (!p.ok) return;
    const e = await registry.execute(p.value.proposal.id);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.error.code).toBe('INVALID_STATE');
  });

  it('executes only after a valid confirmation', async () => {
    const { registry } = setup();
    const p = await propose(registry);
    if (!p.ok) return;
    const { proposal, linkCode } = p.value;
    const c = await registry.confirm(proposal.id, linkCode, proposal.payloadDigest);
    expect(c.ok).toBe(true);
    const e = await registry.execute(proposal.id);
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.value.state).toBe('executed');
      // Simulated: the reference is derived locally, nothing external is called.
      expect(e.value.history.at(-1)?.reason).toMatch(/^simulated execution sim_/);
    }
  });
});

describe('concurrency', () => {
  it('admits exactly one of two simultaneous confirmations', async () => {
    const { registry } = setup();
    const p = await propose(registry);
    if (!p.ok) return;
    const { proposal, linkCode } = p.value;

    const [a, b] = await Promise.all([
      registry.confirm(proposal.id, linkCode, proposal.payloadDigest),
      registry.confirm(proposal.id, linkCode, proposal.payloadDigest),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const loser = losers[0];
    if (loser && !loser.ok) expect(loser.error.code).toBe('VERSION_CONFLICT');
  });

  it('admits exactly one of a simultaneous confirm and reject', async () => {
    const { registry } = setup();
    const p = await propose(registry);
    if (!p.ok) return;
    const { proposal, linkCode } = p.value;
    const [c, r] = await Promise.all([
      registry.confirm(proposal.id, linkCode, proposal.payloadDigest),
      registry.reject(proposal.id),
    ]);
    expect([c, r].filter((x) => x.ok)).toHaveLength(1);
  });

  it('cannot double-execute under a race', async () => {
    const { registry } = setup();
    const p = await propose(registry);
    if (!p.ok) return;
    const { proposal, linkCode } = p.value;
    await registry.confirm(proposal.id, linkCode, proposal.payloadDigest);
    const [a, b] = await Promise.all([
      registry.execute(proposal.id),
      registry.execute(proposal.id),
    ]);
    expect([a, b].filter((x) => x.ok)).toHaveLength(1);
  });
});

describe('confirmation binding', () => {
  it('refuses a wrong link code', async () => {
    const { registry } = setup();
    const p = await propose(registry);
    if (!p.ok) return;
    const c = await registry.confirm(p.value.proposal.id, 'ZZZZZZ', p.value.proposal.payloadDigest);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error.code).toBe('LINK_CODE_MISMATCH');
  });

  it('refuses a digest the human never saw', async () => {
    const { registry } = setup();
    const p = await propose(registry);
    if (!p.ok) return;
    const c = await registry.confirm(p.value.proposal.id, p.value.linkCode, 'a'.repeat(64));
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error.code).toBe('PAYLOAD_TAMPERED');
  });

  it('expires and records the expiry in the audit trail', async () => {
    const store = new InMemoryProposalStore();
    let clock = Date.now();
    const registry = new ActionRegistry(store, { ttlSeconds: 60, now: () => clock });
    const p = await registry.propose({ payload: PAYLOAD, idempotencyKey: 'k' });
    if (!p.ok) return;
    clock += 61_000;
    const c = await registry.confirm(p.value.proposal.id, p.value.linkCode, p.value.proposal.payloadDigest);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error.code).toBe('EXPIRED');
    const after = await store.get(p.value.proposal.id);
    expect(after?.state).toBe('expired');
    expect(after?.history.at(-1)?.actor).toBe('system');
  });
});

describe('validation treats agent input as hostile', () => {
  const bad: Array<[string, Partial<typeof PAYLOAD>]> = [
    ['empty body', { body: '   ' }],
    ['over-long body', { body: 'x'.repeat(MAX_BODY_LEN + 1) }],
    ['bad slug', { orderSlug: 'UPPER CASE' }],
    ['bad locale', { locale: 'de' }],
    ['bad payment status', { paymentStatus: 'MAGIC' }],
    ['false paid claim', { body: 'Thanks, your payment is confirmed!', paymentStatus: 'AWAITING_PAYMENT' }],
  ];

  for (const [label, patch] of bad) {
    it(`rejects ${label}`, () => {
      expect(validateMessageDraft({ ...PAYLOAD, ...patch }).ok).toBe(false);
    });
  }

  it('allows paid language when status is PAID', () => {
    expect(
      lintFalsePaidClaim('Payment received — thank you!', 'PAID').ok,
    ).toBe(true);
  });

  it('strips control characters from the body', () => {
    const r = validateMessageDraft({ ...PAYLOAD, body: 'Hello\u0000 there' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.body).toBe('Hello there');
  });

  it('refuses to register an invalid proposal at all', async () => {
    const { registry, store } = setup();
    const r = await registry.propose({
      payload: { ...PAYLOAD, body: 'payment received' },
      idempotencyKey: 'k',
    });
    expect(r.ok).toBe(false);
    expect(await store.findByIdempotencyKey('k')).toBeNull();
  });
});
