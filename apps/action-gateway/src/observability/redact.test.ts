/**
 * The load-bearing assertion here is the last describe block: given a live
 * link code, no log line the system can produce may contain it.
 */

import { describe, expect, it } from 'vitest';
import { createProposal } from '../domain/state-machine.js';
import { describeSecret, redact } from './redact.js';

const LIVE_CODE = 'ABC234';

describe('redaction at the logging boundary', () => {
  it('replaces a link code with its shape', () => {
    const out = redact({ proposalId: 'prop_1', linkCode: LIVE_CODE }) as Record<string, string>;
    expect(out.linkCode).not.toContain(LIVE_CODE);
    expect(out.linkCode).toBe('<redacted len=6 shape=upper>');
    // Non-secret context survives, or the log stops being useful.
    expect(out.proposalId).toBe('prop_1');
  });

  it('catches the same field under other spellings', () => {
    for (const key of ['linkCode', 'link_code', 'LinkCode', 'LINK_CODE']) {
      const out = redact({ [key]: LIVE_CODE }) as Record<string, string>;
      expect(JSON.stringify(out)).not.toContain(LIVE_CODE);
    }
  });

  it('redacts OAuth material too', () => {
    const out = redact({
      access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
      refresh_token: 'rt_secret_value_here',
      client_secret: 'cs_secret_value_here',
      code_verifier: 'v'.repeat(43),
      code: 'authorization-code-value',
    }) as Record<string, string>;
    const s = JSON.stringify(out);
    expect(s).not.toContain('eyJhbGci');
    expect(s).not.toContain('rt_secret_value_here');
    expect(s).not.toContain('cs_secret_value_here');
    expect(s).not.toContain('authorization-code-value');
    expect(out.code_verifier).toContain('len=43');
  });

  it('does NOT publish a hash of a low-entropy secret', () => {
    // Hashing looks like the obvious way to keep lines correlatable, and for a
    // 6-character code over a 31-symbol alphabet, ~28 bits, the entire
    // space enumerates in under a second. A hash of it is an encoding, not a
    // redaction. Shape only.
    const out = describeSecret(LIVE_CODE);
    expect(out).not.toMatch(/[a-f0-9]{8,}/);
    expect(out).toBe('<redacted len=6 shape=upper>');
  });

  it('keeps diagnostics that merely contain the word code', () => {
    // A logger that destroys useful context gets switched off, and a
    // switched-off logger redacts nothing at all.
    const out = redact({
      statusCode: 429,
      errorCode: 'LINK_CODE_MISMATCH',
      currencyCode: 'PEN',
      httpCode: 500,
    }) as Record<string, unknown>;
    expect(out.statusCode).toBe(429);
    expect(out.errorCode).toBe('LINK_CODE_MISMATCH');
    expect(out.currencyCode).toBe('PEN');
  });

  it('reaches secrets nested inside larger payloads', () => {
    const out = redact({
      event: 'proposal',
      detail: { inner: { linkCode: LIVE_CODE }, amount: 100 },
      list: [{ linkCode: LIVE_CODE }],
    });
    expect(JSON.stringify(out)).not.toContain(LIVE_CODE);
  });

  it('survives a cyclic structure instead of hanging', () => {
    const a: Record<string, unknown> = { linkCode: LIVE_CODE };
    a.self = a;
    const s = JSON.stringify(redact(a));
    expect(s).not.toContain(LIVE_CODE);
    expect(s).toContain('depth-limit');
  });

  it('distinguishes absent from empty, which matters when debugging', () => {
    expect(describeSecret(undefined)).toBe('<absent>');
    expect(describeSecret('')).toBe('<empty>');
  });
});

describe('the invariant: no log line may contain a live code', () => {
  it('holds for a full proposal object passed to the logger wholesale', () => {
    // The realistic accident: someone logs the whole proposal for context.
    const p = createProposal({
      id: 'prop_x',
      payload: {
        amountMinor: 25050,
        currency: 'PEN',
        sourceAccountId: 'ACC-1',
        destinationAccountId: 'ACC-2',
        reference: null,
      },
      linkCode: LIVE_CODE,
      idempotencyKey: 'idem',
      ttlSeconds: 300,
      now: Date.now(),
    });

    const line = JSON.stringify(redact({ kind: 'proposal_created', proposal: p, linkCode: LIVE_CODE }));
    expect(line).not.toContain(LIVE_CODE);
    // The stored hash is fine to log. It is what the store already holds,
    // and it is a SHA-256 over a value the server never returns twice.
    expect(line).toContain('prop_x');
  });
});
