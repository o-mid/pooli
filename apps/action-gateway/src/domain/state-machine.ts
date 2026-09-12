/**
 * Proposal state machine.
 *
 * Pure functions over immutable values: every transition returns a new
 * Proposal rather than mutating one. That is what makes the compare-and-swap
 * in the persistence layer meaningful, the domain decides *whether* a
 * transition is legal and what it produces, the store decides whether this
 * caller won the race, and neither can quietly do the other's job.
 *
 * The rules that matter, all enforced here rather than at call sites:
 *
 *   1. `executed` is reachable only from `confirmed`. An agent cannot execute.
 *   2. Terminal states are terminal. No resurrection.
 *   3. Expiry is evaluated at transition time, not by a background sweep, so a
 *      proposal that sat past its TTL cannot be confirmed even if a sweeper
 *      never ran or the clock skewed.
 *   4. Confirmation requires the link code AND the payload digest to match.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type Proposal,
  type ProposalState,
  type Result,
  type MessageDraftPayload,
  type TransitionRecord,
  err,
  isTerminal,
  ok,
} from './types.js';

/** Stable digest of a payload. Key order is fixed so it cannot drift. */
export function digestPayload(p: MessageDraftPayload): string {
  const canonical = JSON.stringify([
    p.orderId,
    p.orderSlug,
    p.body,
    p.locale,
    p.paymentStatus,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

/** Constant-time compare, so a mismatch cannot be found one character at a time. */
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

const LEGAL: Readonly<Record<ProposalState, readonly ProposalState[]>> = {
  pending_confirmation: ['confirmed', 'rejected', 'expired'],
  confirmed: ['executed', 'failed'],
  rejected: [],
  expired: [],
  executed: [],
  failed: [],
};

function applied(
  p: Proposal,
  to: ProposalState,
  reason: string,
  actor: TransitionRecord['actor'],
): Proposal {
  return {
    ...p,
    state: to,
    version: p.version + 1,
    history: [...p.history, { from: p.state, to, at: Date.now(), reason, actor }],
  };
}

export interface CreateInput {
  readonly id: string;
  readonly payload: MessageDraftPayload;
  readonly linkCode: string;
  readonly idempotencyKey: string;
  readonly ttlSeconds: number;
  readonly now?: number;
}

export function createProposal(input: CreateInput): Proposal {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    state: 'pending_confirmation',
    payload: input.payload,
    payloadDigest: digestPayload(input.payload),
    linkCodeHash: hashLinkCode(input.linkCode),
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    expiresAt: now + input.ttlSeconds * 1000,
    version: 1,
    history: [
      { from: 'pending_confirmation', to: 'pending_confirmation', at: now, reason: 'proposed', actor: 'agent' },
    ],
  };
}

function guard(p: Proposal, to: ProposalState): Result<true> {
  if (isTerminal(p.state)) {
    return err('INVALID_STATE', `proposal is already ${p.state} and cannot change`);
  }
  if (!LEGAL[p.state].includes(to)) {
    return err('INVALID_STATE', `cannot move from ${p.state} to ${to}`);
  }
  return ok(true);
}

/**
 * Lazily expire. Called before any confirmation decision so that a proposal
 * past its deadline is refused even if nothing swept it.
 */
// I chose lazy expiry (checked at transition time) instead of a background
// sweeper. In production, you'd sweep. For a demo, lazy is simpler, fully
// correct under concurrency (CAS handles the race), and avoids a cron job
// I'd have to test. The trade-off: stale records linger until touched.
export function expireIfDue(p: Proposal, now = Date.now()): Proposal {
  if (p.state === 'pending_confirmation' && now >= p.expiresAt) {
    return applied(p, 'expired', 'ttl elapsed', 'system');
  }
  return p;
}

export interface ConfirmInput {
  readonly linkCode: string;
  /** Digest the human was shown. Must still match what is stored. */
  readonly seenDigest: string;
  readonly now?: number;
}

export function confirm(p: Proposal, input: ConfirmInput): Result<Proposal> {
  const now = input.now ?? Date.now();

  // Expiry first: an expired proposal must not even reach the code comparison,
  // or a late attacker learns whether their guessed code was right.
  const current = expireIfDue(p, now);
  if (current.state === 'expired') {
    return err('EXPIRED', 'this confirmation has expired; ask for a new one');
  }

  const g = guard(current, 'confirmed');
  if (!g.ok) return g;

  if (!safeEqualHex(hashLinkCode(input.linkCode), current.linkCodeHash)) {
    return err('LINK_CODE_MISMATCH', 'that confirmation code is not valid');
  }

  // The person approved a specific amount to a specific recipient. If the
  // stored payload no longer matches what they were shown, this is not the
  // action they agreed to.
  if (!safeEqualHex(input.seenDigest, current.payloadDigest)) {
    return err('PAYLOAD_TAMPERED', 'the transfer details changed; please review again', false);
  }

  return ok(applied(current, 'confirmed', 'confirmed by human', 'human'));
}

export function reject(p: Proposal, now = Date.now()): Result<Proposal> {
  const current = expireIfDue(p, now);
  if (current.state === 'expired') return err('EXPIRED', 'this confirmation has expired');
  const g = guard(current, 'rejected');
  if (!g.ok) return g;
  return ok(applied(current, 'rejected', 'declined by human', 'human'));
}

/**
 * Simulated execution. Deliberately takes no credentials and touches no
 * external system: the brief calls for simulated execution only, and a domain
 * that cannot move money cannot be tricked into moving money.
 */
export function markExecuted(p: Proposal, reference: string): Result<Proposal> {
  const g = guard(p, 'executed');
  if (!g.ok) return g;
  return ok(applied(p, 'executed', `simulated execution ${reference}`, 'system'));
}

/**
 * Recovers the simulated execution reference from the audit trail.
 *
 * Deliberately derived rather than stored in its own field. History is the
 * source of truth for what happened, and a duplicate field is a second place
 * that can disagree with it, exactly the divergence the audit-log invariant
 * exists to make impossible.
 */
export function executionReferenceOf(p: Proposal): string | null {
  const entry = [...p.history].reverse().find((h) => h.to === 'executed');
  return entry ? (/simulated execution (\S+)/.exec(entry.reason)?.[1] ?? null) : null;
}

export function markFailed(p: Proposal, reason: string): Result<Proposal> {
  const g = guard(p, 'failed');
  if (!g.ok) return g;
  return ok(applied(p, 'failed', reason, 'system'));
}
