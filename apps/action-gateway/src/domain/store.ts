/**
 * Persistence port for proposals.
 *
 * Kept as an interface so the domain never depends on a database. The only
 * thing the domain asks of a store is that it can perform a compare-and-swap
 * on `(id, expectedVersion)`. That single operation is what turns the pure
 * state machine into something safe under concurrency.
 *
 * Without the version check, two confirmations arriving at once both read
 * `pending_confirmation`, both decide the transition is legal, and both write
 * `confirmed`. The state machine is not wrong in either case. It was asked
 * twice from the same starting point and answered the same way twice. The
 * result is one proposal executed two times, which in this domain means the
 * money moves twice. The version is what makes the second writer lose.
 *
 * The in-memory implementation below is the reference. A Postgres
 * implementation is a conditional UPDATE:
 *
 *   UPDATE proposals SET ... WHERE id = $1 AND version = $2
 *
 * and `rowCount === 0` means the caller lost the race. Nothing else changes.
 */

import type { Proposal, Result } from './types.js';
import { err, ok } from './types.js';

export interface ProposalStore {
  get(id: string): Promise<Proposal | null>;
  /** Look up by idempotency key so a retried proposal returns the original. */
  findByIdempotencyKey(key: string): Promise<Proposal | null>;
  insert(p: Proposal): Promise<Result<Proposal>>;
  /**
   * Replace the record only if its stored version still equals
   * `expectedVersion`. Returns VERSION_CONFLICT if another writer got there
   * first. That refusal is the concurrency guarantee, not an error to retry
   * blindly.
   */
  compareAndSwap(next: Proposal, expectedVersion: number): Promise<Result<Proposal>>;
}

export class InMemoryProposalStore implements ProposalStore {
  readonly #byId = new Map<string, Proposal>();
  readonly #byIdempotency = new Map<string, string>();

  async get(id: string): Promise<Proposal | null> {
    return this.#byId.get(id) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<Proposal | null> {
    const id = this.#byIdempotency.get(key);
    return id ? (this.#byId.get(id) ?? null) : null;
  }

  async insert(p: Proposal): Promise<Result<Proposal>> {
    if (this.#byId.has(p.id)) {
      return err('IDEMPOTENCY_CONFLICT', 'a proposal with this id already exists');
    }
    const existing = this.#byIdempotency.get(p.idempotencyKey);
    if (existing) {
      return err('IDEMPOTENCY_CONFLICT', 'this idempotency key is already in use');
    }
    this.#byId.set(p.id, p);
    this.#byIdempotency.set(p.idempotencyKey, p.id);
    return ok(p);
  }

  async compareAndSwap(next: Proposal, expectedVersion: number): Promise<Result<Proposal>> {
    const current = this.#byId.get(next.id);
    if (!current) return err('INVALID_STATE', 'proposal not found');
    if (current.version !== expectedVersion) {
      // Someone else transitioned it between our read and our write. The
      // caller must re-read rather than overwrite: the other writer may have
      // confirmed, rejected, or executed it.
      return err('VERSION_CONFLICT', 'this proposal was modified concurrently');
    }
    this.#byId.set(next.id, next);
    return ok(next);
  }
}
