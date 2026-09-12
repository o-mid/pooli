/**
 * Adversarial tests for the proposal state machine.
 *
 * These are written as attacks rather than as feature checks. Each one names
 * the thing an attacker (or a confused agent, or a race) would try, and
 * asserts the domain refuses it. The happy path is covered almost incidentally
 *. It is the least interesting property here.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  confirm,
  createProposal,
  digestPayload,
  expireIfDue,
  hashLinkCode,
  markExecuted,
  markFailed,
  reject,
} from './state-machine.js';
import type { Proposal } from './types.js';
import { TEST_MESSAGE } from './test-fixture.js';

const PAYLOAD = TEST_MESSAGE;

const CODE = 'ABC123';
const TTL = 300;

function make(overrides: Partial<Parameters<typeof createProposal>[0]> = {}): Proposal {
  return createProposal({
    id: 'prop_1',
    payload: PAYLOAD,
    linkCode: CODE,
    idempotencyKey: 'idem_1',
    ttlSeconds: TTL,
    ...overrides,
  });
}

const good = (p: Proposal) => ({ linkCode: CODE, seenDigest: p.payloadDigest });

describe('creation', () => {
  it('starts awaiting a human and is not executable', () => {
    const p = make();
    expect(p.state).toBe('pending_confirmation');
    expect(markExecuted(p, 'ref').ok).toBe(false);
  });

  it('never stores the link code in plaintext', () => {
    const p = make();
    expect(JSON.stringify(p)).not.toContain(CODE);
    expect(p.linkCodeHash).toHaveLength(64);
  });
});

describe('the agent cannot execute', () => {
  it('refuses execution straight from pending_confirmation', () => {
    const r = markExecuted(make(), 'ref');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_STATE');
  });

  it('refuses execution of a rejected proposal', () => {
    const rejected = reject(make());
    expect(rejected.ok).toBe(true);
    if (rejected.ok) expect(markExecuted(rejected.value, 'ref').ok).toBe(false);
  });

  it('only reaches executed by way of confirmed', () => {
    const p = make();
    const c = confirm(p, good(p));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.value.state).toBe('confirmed');
    const e = markExecuted(c.value, 'sim_1');
    expect(e.ok).toBe(true);
    if (e.ok) expect(e.value.state).toBe('executed');
  });
});

describe('confirmation is bound to a person', () => {
  it('rejects a wrong link code', () => {
    const p = make();
    const r = confirm(p, { linkCode: 'WRONG1', seenDigest: p.payloadDigest });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('LINK_CODE_MISMATCH');
  });

  it('rejects an empty link code', () => {
    const p = make();
    expect(confirm(p, { linkCode: '', seenDigest: p.payloadDigest }).ok).toBe(false);
  });

  it('is insensitive to case and surrounding whitespace, since a human retypes it', () => {
    const p = make();
    expect(confirm(p, { linkCode: '  abc123 ', seenDigest: p.payloadDigest }).ok).toBe(true);
  });

  it('compares in constant time, so the code cannot be recovered by timing', () => {
    // Uniform refusals close the semantic oracle; a timing difference would
    // reopen it. Asserted structurally rather than by measuring wall-clock,
    // which is far too noisy to be a reliable test: the comparison must go
    // through timingSafeEqual over fixed-width digests, never `===` on the
    // codes themselves.
    const src = readFileSync(new URL('./state-machine.ts', import.meta.url), 'utf8');
    expect(src).toContain('timingSafeEqual');
    // Digests are fixed-width, so no length side-channel exists either.
    const a = hashLinkCode('A');
    const b = hashLinkCode('a-much-longer-code-than-that');
    expect(a).toHaveLength(b.length);
    // And the raw code must never be compared directly.
    expect(src).not.toMatch(/input\.linkCode\s*===/);
  });

  it('does not leak whether the code was right once expired', () => {
    const p = make({ now: Date.now() - (TTL + 1) * 1000 });
    const wrongCode = confirm(p, { linkCode: 'WRONG1', seenDigest: p.payloadDigest });
    const rightCode = confirm(p, good(p));
    expect(wrongCode.ok).toBe(false);
    expect(rightCode.ok).toBe(false);
    // Identical refusal either way: the attacker learns nothing about the code.
    if (!wrongCode.ok && !rightCode.ok) {
      expect(wrongCode.error.code).toBe(rightCode.error.code);
      expect(wrongCode.error.code).toBe('EXPIRED');
    }
  });
});

describe('confirmation is bound to what the human saw', () => {
  it('refuses when the payload changed after the proposal', () => {
    const p = make();
    const tampered: Proposal = {
      ...p,
      payload: { ...PAYLOAD, body: 'Tampered body after propose' },
      payloadDigest: digestPayload({ ...PAYLOAD, body: 'Tampered body after propose' }),
    };
    // The human is still confirming the digest they were originally shown.
    const r = confirm(tampered, { linkCode: CODE, seenDigest: p.payloadDigest });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('PAYLOAD_TAMPERED');
      // Detail withheld from the agent: it must not learn what changed.
      expect(r.error.agentSafe).toBe(false);
    }
  });

  it('notices a changed destination even when the amount is untouched', () => {
    const p = make();
    const swapped = digestPayload({ ...PAYLOAD, orderSlug: 'attacker-slug' });
    expect(swapped).not.toBe(p.payloadDigest);
    expect(confirm(p, { linkCode: CODE, seenDigest: swapped }).ok).toBe(false);
  });

  it('digest ignores key order but not values', () => {
    expect(digestPayload({ ...PAYLOAD })).toBe(digestPayload(PAYLOAD));
    expect(digestPayload({ ...PAYLOAD, locale: 'fa' })).not.toBe(digestPayload(PAYLOAD));
  });
});

describe('replay and double-spend', () => {
  it('cannot be confirmed twice', () => {
    const p = make();
    const first = confirm(p, good(p));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = confirm(first.value, good(p));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('INVALID_STATE');
  });

  it('cannot be executed twice', () => {
    const p = make();
    const c = confirm(p, good(p));
    if (!c.ok) throw new Error('setup');
    const e1 = markExecuted(c.value, 'sim_1');
    expect(e1.ok).toBe(true);
    if (e1.ok) expect(markExecuted(e1.value, 'sim_2').ok).toBe(false);
  });

  it('cannot be confirmed after rejection', () => {
    const r = reject(make());
    if (!r.ok) throw new Error('setup');
    expect(confirm(r.value, good(r.value)).ok).toBe(false);
  });

  it('cannot be rejected after confirmation', () => {
    const p = make();
    const c = confirm(p, good(p));
    if (!c.ok) throw new Error('setup');
    expect(reject(c.value).ok).toBe(false);
  });

  it('bumps version on every transition, giving the store a CAS token', () => {
    const p = make();
    expect(p.version).toBe(1);
    const c = confirm(p, good(p));
    if (!c.ok) throw new Error('setup');
    expect(c.value.version).toBe(2);
    const e = markExecuted(c.value, 'sim');
    if (e.ok) expect(e.value.version).toBe(3);
  });

  it('two concurrent confirmations both derive from version 1, so the store can only accept one', () => {
    const p = make();
    const a = confirm(p, good(p));
    const b = confirm(p, good(p));
    // The domain is pure, so both succeed in isolation. That is correct. The
    // guarantee is that both produce version 2 from version 1, so a
    // compare-and-swap on (id, version) admits exactly one.
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.version).toBe(2);
      expect(b.value.version).toBe(2);
    }
  });
});

describe('expiry', () => {
  it('refuses confirmation once the ttl has elapsed', () => {
    const p = make({ now: Date.now() - (TTL + 1) * 1000 });
    const r = confirm(p, good(p));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('EXPIRED');
  });

  it('still accepts confirmation one second before the deadline', () => {
    const p = make({ now: Date.now() - (TTL - 1) * 1000 });
    expect(confirm(p, good(p)).ok).toBe(true);
  });

  it('expires lazily, without a sweeper having run', () => {
    const p = make({ now: Date.now() - (TTL + 60) * 1000 });
    expect(p.state).toBe('pending_confirmation'); // nothing swept it
    expect(expireIfDue(p).state).toBe('expired'); // still refused on use
  });

  it('does not expire a proposal already confirmed', () => {
    const p = make({ now: Date.now() - (TTL - 1) * 1000 });
    const c = confirm(p, good(p));
    if (!c.ok) throw new Error('setup');
    const later = expireIfDue(c.value, Date.now() + TTL * 2000);
    expect(later.state).toBe('confirmed');
  });
});

describe('audit trail', () => {
  it('records every transition with actor and reason', () => {
    const p = make();
    const c = confirm(p, good(p));
    if (!c.ok) throw new Error('setup');
    const e = markExecuted(c.value, 'sim_9');
    if (!e.ok) throw new Error('setup');
    expect(e.value.history.map((h) => h.to)).toEqual([
      'pending_confirmation',
      'confirmed',
      'executed',
    ]);
    expect(e.value.history.at(1)?.actor).toBe('human');
    expect(e.value.history.at(2)?.actor).toBe('system');
    // The agent appears exactly once, at the proposal, and never after.
    expect(e.value.history.filter((h) => h.actor === 'agent')).toHaveLength(1);
  });

  it('records failure reasons without discarding earlier history', () => {
    const p = make();
    const c = confirm(p, good(p));
    if (!c.ok) throw new Error('setup');
    const f = markFailed(c.value, 'downstream timeout');
    if (!f.ok) throw new Error('setup');
    expect(f.value.state).toBe('failed');
    expect(f.value.history).toHaveLength(3);
    expect(f.value.history.at(-1)?.reason).toContain('timeout');
  });
});
