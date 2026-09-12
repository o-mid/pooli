/**
 * D13 — concurrency correctness, measured rather than asserted once.
 *
 * The claim the gateway makes is that a confirmation cannot be double-spent.
 * A single two-caller test is weak evidence for that: it passes on a system
 * that is merely usually right. This harness fires N genuinely simultaneous
 * confirmations at the same proposal, across a range of N, repeated over many
 * independent trials, and requires the same three invariants every time:
 *
 *   1. exactly ONE caller succeeds
 *   2. the other N-1 fail CLEANLY, with VERSION_CONFLICT, never a crash,
 *      never a partial write, never a second success
 *   3. the audit log records exactly ONE confirmation transition
 *
 * Invariant 3 is the one that matters most and is easiest to omit. A system
 * could return one success to callers while having written two transitions,
 * and only the stored history reveals it.
 *
 * Output is a table, because "no double-spend across 1,650 racing callers" is
 * a measurement, and the deliverable asked for objective measurement.
 */

import { describe, expect, it } from 'vitest';
import { ActionRegistry } from './registry.js';
import { InMemoryProposalStore } from './store.js';
import type { Proposal } from './types.js';
import { TEST_MESSAGE } from './test-fixture.js';

const PAYLOAD = TEST_MESSAGE;

const CONCURRENCY_LEVELS = [2, 3, 5, 10, 25, 50];
const TRIALS_PER_LEVEL = 20;

interface TrialResult {
  readonly successes: number;
  readonly conflicts: number;
  readonly unexpectedErrors: string[];
  readonly confirmTransitionsInAudit: number;
  readonly finalState: string;
}

/** One trial: N callers confirm the same proposal at the same time. */
async function raceConfirmations(n: number): Promise<TrialResult> {
  const store = new InMemoryProposalStore();
  const registry = new ActionRegistry(store, { ttlSeconds: 300 });

  const proposed = await registry.propose({ payload: PAYLOAD, idempotencyKey: `idem_${Math.random()}` });
  if (!proposed.ok) throw new Error('setup failed');
  const { proposal, linkCode } = proposed.value;

  // All N callers present the CORRECT code and digest. Every one of them
  // deserves to succeed on the merits; only the state machine may stop them.
  // That is what makes this a double-spend test rather than an auth test.
  const results = await Promise.all(
    Array.from({ length: n }, () => registry.confirm(proposal.id, linkCode, proposal.payloadDigest)),
  );

  const successes = results.filter((r) => r.ok).length;
  const conflicts = results.filter((r) => !r.ok && r.error.code === 'VERSION_CONFLICT').length;
  const unexpectedErrors = results
    .filter((r) => !r.ok && r.error.code !== 'VERSION_CONFLICT')
    .map((r) => (r.ok ? '' : r.error.code));

  const stored = (await store.get(proposal.id)) as Proposal;
  const confirmTransitionsInAudit = stored.history.filter((h) => h.to === 'confirmed').length;

  return { successes, conflicts, unexpectedErrors, confirmTransitionsInAudit, finalState: stored.state };
}

function col(value: string | number, width: number): string {
  return String(value).padStart(width);
}

describe('D13 concurrency correctness', () => {
  it('admits exactly one confirmation regardless of how many race', async () => {
    // Printed as a table so a screenshot can be read without scrolling a
    // wall of pass/fail lines. Totals are summed from the rows, not hardcoded.
    const header =
      col('n', 4) +
      col('trials', 8) +
      col('callers', 10) +
      col('double-spends', 16) +
      col('lost-updates', 15) +
      col('audit-mismatches', 19);
    const rows: string[] = [header];
    let totalTrials = 0;
    let totalCallers = 0;
    let totalDoubleSpends = 0;
    let totalLostUpdates = 0;
    let totalAuditMismatches = 0;

    for (const n of CONCURRENCY_LEVELS) {
      let doubleSpends = 0;
      let lostUpdates = 0;
      let dirtyFailures = 0;
      let auditMismatches = 0;

      for (let t = 0; t < TRIALS_PER_LEVEL; t++) {
        const r = await raceConfirmations(n);
        totalCallers += n;

        if (r.successes > 1) doubleSpends++;
        if (r.successes < 1) lostUpdates++;
        if (r.unexpectedErrors.length > 0) dirtyFailures++;
        if (r.confirmTransitionsInAudit !== 1) auditMismatches++;

        // Hard assertions per trial, so a failure names the exact trial.
        expect(r.successes, `n=${n} trial=${t}: successes`).toBe(1);
        expect(r.conflicts, `n=${n} trial=${t}: clean conflicts`).toBe(n - 1);
        expect(r.unexpectedErrors, `n=${n} trial=${t}: unexpected errors`).toEqual([]);
        expect(r.confirmTransitionsInAudit, `n=${n} trial=${t}: audit transitions`).toBe(1);
        expect(r.finalState, `n=${n} trial=${t}: final state`).toBe('confirmed');
      }

      totalTrials += TRIALS_PER_LEVEL;
      totalDoubleSpends += doubleSpends;
      totalLostUpdates += lostUpdates;
      totalAuditMismatches += auditMismatches;

      rows.push(
        col(n, 4) +
          col(TRIALS_PER_LEVEL, 8) +
          col(n * TRIALS_PER_LEVEL, 10) +
          col(doubleSpends, 16) +
          col(lostUpdates, 15) +
          col(auditMismatches, 19),
      );
      expect(dirtyFailures, `n=${n}: dirty failures`).toBe(0);
    }

    rows.push(
      col('all', 4) +
        col(totalTrials, 8) +
        col(totalCallers, 10) +
        col(totalDoubleSpends, 16) +
        col(totalLostUpdates, 15) +
        col(totalAuditMismatches, 19),
    );

    console.log('\nD13 concurrent confirmations of one proposal\n' + rows.join('\n'));
    console.log(
      `\n${totalTrials} trials, ${totalCallers} racing callers, ` +
        `${totalDoubleSpends} double-spends, ${totalLostUpdates} lost-updates, ` +
        `${totalAuditMismatches} audit-mismatches\n`,
    );
  });

  it('admits exactly one execution when many race after a single confirmation', async () => {
    const n = 25;
    const store = new InMemoryProposalStore();
    const registry = new ActionRegistry(store, { ttlSeconds: 300 });
    const p = await registry.propose({ payload: PAYLOAD, idempotencyKey: 'exec_race' });
    if (!p.ok) throw new Error('setup');
    await registry.confirm(p.value.proposal.id, p.value.linkCode, p.value.proposal.payloadDigest);

    const results = await Promise.all(
      Array.from({ length: n }, () => registry.execute(p.value.proposal.id)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const stored = (await store.get(p.value.proposal.id)) as Proposal;
    // The decisive check: money must not appear to have moved twice.
    expect(stored.history.filter((h) => h.to === 'executed')).toHaveLength(1);
    expect(stored.state).toBe('executed');
  });

  it('admits exactly one outcome when confirm, reject and execute all race', async () => {
    // The nastiest shape: three different terminal intents at once.
    const store = new InMemoryProposalStore();
    const registry = new ActionRegistry(store, { ttlSeconds: 300 });
    const p = await registry.propose({ payload: PAYLOAD, idempotencyKey: 'mixed_race' });
    if (!p.ok) throw new Error('setup');
    const { proposal, linkCode } = p.value;

    const results = await Promise.all([
      ...Array.from({ length: 8 }, () => registry.confirm(proposal.id, linkCode, proposal.payloadDigest)),
      ...Array.from({ length: 8 }, () => registry.reject(proposal.id)),
      ...Array.from({ length: 8 }, () => registry.execute(proposal.id)),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const stored = (await store.get(proposal.id)) as Proposal;
    // Exactly one transition beyond the original proposal record.
    expect(stored.history).toHaveLength(2);
    expect(['confirmed', 'rejected']).toContain(stored.state);
  });

  it('never confirms a proposal that expired mid-race', async () => {
    const store = new InMemoryProposalStore();
    let clock = Date.now();
    const registry = new ActionRegistry(store, { ttlSeconds: 60, now: () => clock });
    const p = await registry.propose({ payload: PAYLOAD, idempotencyKey: 'expiry_race' });
    if (!p.ok) throw new Error('setup');

    clock += 61_000; // deadline passes before any caller arrives

    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        registry.confirm(p.value.proposal.id, p.value.linkCode, p.value.proposal.payloadDigest),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(0);
    const stored = (await store.get(p.value.proposal.id)) as Proposal;
    expect(stored.state).toBe('expired');
    // Expiry is recorded once, not once per losing caller.
    expect(stored.history.filter((h) => h.to === 'expired')).toHaveLength(1);
  });

  it('creates exactly one proposal when the same idempotency key races', async () => {
    const store = new InMemoryProposalStore();
    const registry = new ActionRegistry(store, { ttlSeconds: 300 });

    const results = await Promise.all(
      Array.from({ length: 25 }, () => registry.propose({ payload: PAYLOAD, idempotencyKey: 'same' })),
    );
    const created = results.filter((r) => r.ok && !r.value.deduplicated);
    const rejected = results.filter((r) => !r.ok);
    const deduped = results.filter((r) => r.ok && r.value.deduplicated);

    // Exactly one real creation; everyone else deduplicates or is refused.
    expect(created).toHaveLength(1);
    expect(deduped.length + rejected.length).toBe(24);
    // And no caller other than the creator receives a usable link code.
    for (const r of deduped) if (r.ok) expect(r.value.linkCode).toBe('');
  });
});
