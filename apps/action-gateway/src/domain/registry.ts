/**
 * Action registry. The only way a proposal is created, confirmed or executed.
 *
 * Responsibilities are split deliberately:
 *
 *   state-machine.ts  decides whether a transition is LEGAL
 *   store.ts          decides who WON a concurrent write
 *   registry.ts       sequences the two, and owns idempotency
 *
 * Keeping them apart is what lets the state machine stay pure and fully
 * testable while the concurrency guarantee remains real.
 */

import { randomUUID, randomBytes, createHash } from 'node:crypto';
import {
  confirm as smConfirm,
  createProposal,
  expireIfDue,
  markExecuted,
  markFailed,
  reject as smReject,
} from './state-machine.js';
import type { ProposalStore } from './store.js';
import { type Proposal, type Result, type MessageDraftPayload, err, ok } from './types.js';
import { validateMessageDraft } from './validation.js';

export interface ProposeInput {
  readonly payload: MessageDraftPayload;
  readonly idempotencyKey: string;
}

export interface ProposeOutput {
  readonly proposal: Proposal;
  /**
   * Returned exactly once, at proposal time, for delivery over the OUT-OF-BAND
   * channel. It is never stored in plaintext and never returned again, not
   * on read, not on retry. If it is lost, the proposal is unconfirmable and a
   * new one must be made, which is the correct failure mode.
   */
  readonly linkCode: string;
  /** True when this was a retry that matched an existing proposal. */
  readonly deduplicated: boolean;
}

/**
 * Human-typed, so the alphabet excludes characters people misread: 0/O, 1/I/L.
 * Six characters over a 26-symbol alphabet is ~28 bits, which is only safe
 * because the code is single-use, expires in minutes, and is rate limited.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateLinkCode(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) {
    // Modulo bias over a 31-symbol alphabet is negligible at this length and
    // this threat model; rejection sampling would be the fix if it were not.
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export interface RegistryOptions {
  readonly ttlSeconds?: number;
  readonly newId?: () => string;
  readonly newLinkCode?: () => string;
  readonly now?: () => number;
}

export class ActionRegistry {
  readonly #store: ProposalStore;
  readonly #ttl: number;
  readonly #newId: () => string;
  readonly #newLinkCode: () => string;
  readonly #now: () => number;

  constructor(store: ProposalStore, opts: RegistryOptions = {}) {
    this.#store = store;
    this.#ttl = opts.ttlSeconds ?? 300;
    this.#newId = opts.newId ?? (() => `prop_${randomUUID()}`);
    this.#newLinkCode = opts.newLinkCode ?? generateLinkCode;
    this.#now = opts.now ?? Date.now;
  }

  /**
   * Register an intent. This is the ONLY operation the agent can reach, and it
   * cannot move money, by construction, not by policy.
   */
  async propose(input: ProposeInput): Promise<Result<ProposeOutput>> {
    // Validation is deterministic and server-side. The model's opinion that a
    // transfer is reasonable carries no weight here.
    const v = validateMessageDraft(input.payload);
    if (!v.ok) return v;

    if (!input.idempotencyKey.trim()) {
      return err('VALIDATION_FAILED', 'an idempotency key is required');
    }

    const existing = await this.#store.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      // A retry must not mint a second proposal for the same intent, and must
      // not re-issue the link code. Returning it again would hand a fresh
      // copy to whoever replayed the call.
      return ok({ proposal: existing, linkCode: '', deduplicated: true });
    }

    const linkCode = this.#newLinkCode();
    const proposal = createProposal({
      id: this.#newId(),
      payload: v.value,
      linkCode,
      idempotencyKey: input.idempotencyKey,
      ttlSeconds: this.#ttl,
      now: this.#now(),
    });

    const inserted = await this.#store.insert(proposal);
    if (!inserted.ok) return inserted;

    return ok({ proposal: inserted.value, linkCode, deduplicated: false });
  }

  /**
   * Read for display on the confirmation surface.
   *
   * Returns the STORED artifact. The confirmation UI renders this and nothing
   * the model supplied. That is the invariant the payload digest exists to
   * enforce.
   */
  async getForConfirmation(id: string): Promise<Proposal | null> {
    const p = await this.#store.get(id);
    if (!p) return null;
    return expireIfDue(p, this.#now());
  }

  async confirm(id: string, linkCode: string, seenDigest: string): Promise<Result<Proposal>> {
    const current = await this.#store.get(id);
    if (!current) return err('INVALID_STATE', 'no such proposal');

    const next = smConfirm(current, { linkCode, seenDigest, now: this.#now() });
    if (!next.ok) {
      // Persist a lazily-detected expiry so the audit trail records it once,
      // rather than re-deriving it on every subsequent read.
      const expired = expireIfDue(current, this.#now());
      if (expired.state === 'expired' && expired.version !== current.version) {
        await this.#store.compareAndSwap(expired, current.version);
      }
      return next;
    }
    return this.#store.compareAndSwap(next.value, current.version);
  }

  async reject(id: string): Promise<Result<Proposal>> {
    const current = await this.#store.get(id);
    if (!current) return err('INVALID_STATE', 'no such proposal');
    const next = smReject(current, this.#now());
    if (!next.ok) return next;
    return this.#store.compareAndSwap(next.value, current.version);
  }

  /**
   * Simulated execution.
   *
   * Takes no credentials and calls nothing external. The brief specifies
   * simulated execution, and a component that has no means to move money
   * cannot be argued into moving money.
   */
  async execute(id: string): Promise<Result<Proposal>> {
    const current = await this.#store.get(id);
    if (!current) return err('INVALID_STATE', 'no such proposal');
    if (current.state !== 'confirmed') {
      return err('INVALID_STATE', `cannot execute a proposal that is ${current.state}`);
    }

    const reference = `sim_${createHash('sha256').update(current.id).digest('hex').slice(0, 12)}`;
    const next = markExecuted(current, reference);
    if (!next.ok) return next;
    return this.#store.compareAndSwap(next.value, current.version);
  }

  async fail(id: string, reason: string): Promise<Result<Proposal>> {
    const current = await this.#store.get(id);
    if (!current) return err('INVALID_STATE', 'no such proposal');
    const next = markFailed(current, reason);
    if (!next.ok) return next;
    return this.#store.compareAndSwap(next.value, current.version);
  }
}
