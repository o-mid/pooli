/**
 * HTTP surface for the confirmation channel.
 *
 * This is deliberately a SEPARATE surface from the MCP endpoint. The agent
 * reaches the MCP endpoint; the human reaches this one. They share a registry
 * and nothing else, no session, no token, no trust. That separation is the
 * whole point: a prompt-injected agent cannot reach into this channel to
 * approve its own proposal, because approving requires a code it was never
 * given and a request it cannot originate.
 *
 * The invariant this file exists to uphold:
 *
 *     The human confirms the stored artifact, not the model's description
 *     of it.
 *
 * `GET /api/proposals/:id` therefore reads the proposal back from the store
 * and returns the server's own record. It accepts no payload from the caller
 * and echoes nothing the agent supplied.
 */

import express, { type Express, type Request, type Response } from 'express';
import type { ActionRegistry } from '../domain/registry.js';
import type { DomainError, Proposal } from '../domain/types.js';
import { renderNotFound, renderProposal } from './confirmation-page.js';

/**
 * The link code is six characters over a 31-symbol alphabet, roughly 28 bits.
 * That is only safe because it is single-use, short-lived, AND guessing is rate
 * limited. Without this limiter the code is brute-forceable in minutes, so the
 * limiter is a load-bearing control rather than hygiene.
 */
class AttemptLimiter {
  readonly #attempts = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly max = 5,
    private readonly windowMs = 60_000,
  ) {}

  /** Attempts already consumed in the current window, for aggregate checks. */
  used(key: string, now = Date.now()): number {
    const cur = this.#attempts.get(key);
    if (!cur || now >= cur.resetAt) return 0;
    return cur.count;
  }

  /** Returns false when the caller has exhausted its attempts. */
  consume(key: string, now = Date.now()): boolean {
    const cur = this.#attempts.get(key);
    if (!cur || now >= cur.resetAt) {
      this.#attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (cur.count >= this.max) return false;
    cur.count += 1;
    return true;
  }

  /** A correct code clears the counter; a wrong one must not. */
  clear(key: string): void {
    this.#attempts.delete(key);
  }
}

/** HTTP status per domain error. Refusals are not 500s. */
function statusFor(e: DomainError): number {
  switch (e.code) {
    case 'INVALID_STATE':
      return 409;
    case 'VERSION_CONFLICT':
      return 409;
    case 'EXPIRED':
      return 410;
    case 'LINK_CODE_MISMATCH':
      return 403;
    case 'PAYLOAD_TAMPERED':
      return 409;
    case 'VALIDATION_FAILED':
      return 400;
    case 'IDEMPOTENCY_CONFLICT':
      return 409;
    default:
      return 400;
  }
}

/**
 * What the confirmation page is allowed to see.
 *
 * Built field by field from the stored record rather than by spreading the
 * proposal, so adding an internal field cannot accidentally publish it. The
 * link code hash never appears here.
 */
function toView(p: Proposal) {
  return {
    id: p.id,
    state: p.state,
    orderId: p.payload.orderId,
    orderSlug: p.payload.orderSlug,
    body: p.payload.body,
    locale: p.payload.locale,
    paymentStatus: p.payload.paymentStatus,
    payloadDigest: p.payloadDigest,
    expiresAt: p.expiresAt,
    createdAt: p.createdAt,
  };
}

export interface ApiOptions {
  readonly limiter?: AttemptLimiter;
  readonly globalLimiter?: AttemptLimiter;
}

export function createConfirmationApi(registry: ActionRegistry, opts: ApiOptions = {}): Express {
  const app = express();
  const limiter = opts.limiter ?? new AttemptLimiter();
  // Deliberately generous relative to the per-proposal limit: it exists to cap
  // an aggregate attack, not to interfere with legitimate concurrent users.
  const globalLimiter = opts.globalLimiter ?? new AttemptLimiter(100, 60_000);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => void res.json({ ok: true }));

  // Read the stored artifact for display. No agent-supplied data is involved.
  app.get('/api/proposals/:id', async (req: Request, res: Response) => {
    const p = await registry.getForConfirmation(String(req.params.id));
    if (!p) return void res.status(404).json({ error: 'not_found' });
    res.json(toView(p));
  });

  app.post('/api/proposals/:id/confirm', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { linkCode, payloadDigest } = req.body ?? {};

    if (typeof linkCode !== 'string' || typeof payloadDigest !== 'string') {
      return void res.status(400).json({ error: 'invalid_request' });
    }

    // Two dimensions, because either alone is defeatable.
    //
    // PER PROPOSAL, not per IP: the secret being guessed belongs to the
    // proposal, and an attacker varies source addresses freely.
    //
    // PLUS A GLOBAL CEILING: per-proposal counting alone hands an attacker a
    // fresh ~28-bit budget for every proposal they can cause to exist. If
    // proposing is cheap, guessing becomes cheap in aggregate even though each
    // individual proposal looks well defended. The global window bounds total
    // failed attempts across all proposals, so the attack does not scale by
    // simply creating more targets.
    if (!limiter.consume(`confirm:${id}`) || !globalLimiter.consume('confirm:all')) {
      return void res.status(429).json({
        error: 'too_many_attempts',
        message: 'Too many attempts. Request a new confirmation.',
      });
    }

    const r = await registry.confirm(id, linkCode, payloadDigest);
    if (!r.ok) {
      return void res.status(statusFor(r.error)).json({
        error: r.error.code,
        // Non-agent-safe details are withheld even here: the confirmation page
        // is public, so it must not explain what changed in a tampered payload.
        message: r.error.agentSafe ? r.error.message : 'This request could not be completed.',
      });
    }

    limiter.clear(`confirm:${id}`);

    // Execution is a separate step, so a confirmation that succeeds but an
    // execution that fails are distinguishable in the audit trail.
    const executed = await registry.execute(id);
    if (!executed.ok) {
      return void res.status(statusFor(executed.error)).json({ error: executed.error.code });
    }
    res.json({ ...toView(executed.value), simulated: true });
  });

  app.post('/api/proposals/:id/reject', async (req: Request, res: Response) => {
    const r = await registry.reject(String(req.params.id));
    if (!r.ok) return void res.status(statusFor(r.error)).json({ error: r.error.code });
    res.json(toView(r.value));
  });

  // ---------------------------------------------------------------------
  // Human-facing views. Same registry, same rules. The HTML is a renderer
  // over the JSON surface above, not a second path with its own logic.
  // ---------------------------------------------------------------------

  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  const html = (res: Response, code: number, body: string) =>
    void res.status(code).type('html').send(body);

  /** Confirmation page, and afterwards the status view for the same proposal. */
  app.get('/p/:id', async (req: Request, res: Response) => {
    const p = await registry.getForConfirmation(String(req.params.id));
    if (!p) return html(res, 404, renderNotFound());
    html(res, 200, renderProposal(p));
  });

  app.post('/p/:id/confirm', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const linkCode = String(req.body?.linkCode ?? '').trim().toUpperCase();
    const payloadDigest = String(req.body?.payloadDigest ?? '');

    const show = async (msg: string, code = 400) => {
      const p = await registry.getForConfirmation(id);
      return p ? html(res, code, renderProposal(p, msg)) : html(res, 404, renderNotFound());
    };

    if (!limiter.consume(`confirm:${id}`) || !globalLimiter.consume('confirm:all')) {
      return void (await show('Too many attempts. Ask for a new message proposal.', 429));
    }

    const r = await registry.confirm(id, linkCode, payloadDigest);
    if (!r.ok) {
      // One message for every refusal reason. Distinct wording for "wrong
      // code" versus "expired" versus "already used" would tell someone
      // guessing which of those they had gotten past.
      return void (await show('That code is not valid for this request.', statusFor(r.error)));
    }

    limiter.clear(`confirm:${id}`);
    const executed = await registry.execute(id);
    if (!executed.ok) return void (await show('This request could not be completed.', 409));
    html(res, 200, renderProposal(executed.value));
  });

  app.post('/p/:id/reject', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    // Declining needs no code: refusing is always safe, and requiring a secret
    // to say "no" would leave a suspicious user with no way to stop a transfer.
    await registry.reject(id);
    const p = await registry.getForConfirmation(id);
    if (!p) return html(res, 404, renderNotFound());
    html(res, 200, renderProposal(p));
  });

  return app;
}

export { AttemptLimiter };
