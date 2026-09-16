import { describe, expect, it } from 'vitest';
import { createProposal, markExecuted } from '../domain/state-machine.js';
import { TEST_MESSAGE } from '../domain/test-fixture.js';
import { renderNotFound, renderProposal } from './confirmation-page.js';
import type { Proposal } from '../domain/types.js';

const build = (over: Partial<Proposal['payload']> = {}, ttl = 300): Proposal =>
  createProposal({
    id: 'prop_test',
    payload: { ...TEST_MESSAGE, ...over },
    linkCode: 'ABC234',
    idempotencyKey: 'idem_1',
    ttlSeconds: ttl,
    now: Date.now(),
  });

describe('what the human is shown', () => {
  it('renders the stored draft and order slug', () => {
    const html = renderProposal(build());
    expect(html).toContain('ceramic-mug-e2e');
    expect(html).toContain('Your order is awaiting payment.');
  });

  it('never puts the link code or its hash on the page', () => {
    const p = build();
    const html = renderProposal(p);
    expect(html).not.toContain('ABC234');
    expect(html).not.toContain(p.linkCodeHash);
  });

  it('carries the payload digest so approval binds to what was displayed', () => {
    const p = build();
    expect(renderProposal(p)).toContain(p.payloadDigest);
  });

  it('escapes an injection attempt in the draft body', () => {
    const html = renderProposal(build({ body: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows the approve form only while approval is possible', () => {
    expect(renderProposal(build())).toContain('Approve draft');
    const executed = markExecuted({ ...build(), state: 'confirmed' } as Proposal, 'sim_abc123');
    expect(executed.ok).toBe(true);
    if (executed.ok) {
      const html = renderProposal(executed.value);
      expect(html).not.toContain('Approve draft');
      expect(html).toContain('Ready to send');
    }
  });

  it('does not leak whether an unknown id ever existed', () => {
    const html = renderNotFound();
    expect(html).not.toMatch(/expired|executed|rejected/i);
  });
});
