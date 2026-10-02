/**
 * End-to-end walk of the Pooli action gateway (OAuth + MCP + human confirm).
 *
 * Run twice against the same server process to catch session-scoped idempotency bugs:
 *   node e2e.mjs http://localhost:8791
 *   node e2e.mjs http://localhost:8791
 *
 * Or: npm run e2e:sticky
 */

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const H = (process.argv[2] || 'http://localhost:8791').replace(/\/$/, '');
const CB = 'https://example.test/callback';
const FIXTURE_ORDER = 'ord_e2e_fixture';
let pass = 0;
let fail = 0;
const ok = (c, label, detail = '') => {
  if (c) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label} ${detail}`);
  }
};

const reg = await (
  await fetch(`${H}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'e2e', redirect_uris: [CB] }),
  })
).json();
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const az = await fetch(`${H}/authorize?${new URLSearchParams({
  client_id: reg.client_id,
  redirect_uri: CB,
  state: 'x',
  code_challenge: challenge,
  code_challenge_method: 'S256',
})}`, { redirect: 'manual' });
const code = new URL(az.headers.get('location')).searchParams.get('code');
const tok = await (
  await fetch(`${H}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: reg.client_id,
      redirect_uri: CB,
      code_verifier: verifier,
    }),
  })
).json();
ok(!!tok.access_token, 'OAuth connect succeeds against the composed server');

const rpc = async (method, params, id = 1) => {
  const r = await fetch(`${H}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${tok.access_token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await r.text();
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  return { status: r.status, body: line ? JSON.parse(line.slice(5)) : text };
};

await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'e2e', version: '1' },
});

const list = await rpc('tools/list', {}, 2);
const names = (list.body?.result?.tools ?? []).map((t) => t.name).sort();
ok(
  JSON.stringify(names) ===
    JSON.stringify(['check_proposal_status', 'get_order_snapshot', 'propose_buyer_message']),
  'tools/list exposes snapshot, propose, and status only',
  JSON.stringify(names),
);
const desc =
  (list.body?.result?.tools ?? []).find((t) => t.name === 'propose_buyer_message')?.description ?? '';
ok(desc.includes('never sends'), 'the refusal ships inside the tool contract');

const snap = await rpc('tools/call', {
  name: 'get_order_snapshot',
  arguments: { orderId: FIXTURE_ORDER },
}, 3);
const snapText = snap.body?.result?.content?.map((c) => c.text).join('\n') ?? '';
ok(snapText.includes('AWAITING_PAYMENT'), 'snapshot returns canonical payment status');

const proposed = await rpc('tools/call', {
  name: 'propose_buyer_message',
  arguments: {
    orderId: FIXTURE_ORDER,
    orderSlug: 'ceramic-mug-e2e',
    body: 'Hi — your order is waiting for payment. Pay here when ready.',
    locale: 'en',
    paymentStatus: 'AWAITING_PAYMENT',
  },
}, 4);
const agentText = proposed.body?.result?.content?.map((c) => c.text).join('\n') ?? '';
const proposalId = /Proposal ID: (\S+)/.exec(agentText)?.[1];
ok(!!proposalId, 'the agent can register a proposal');
ok(/NOTHING HAS BEEN SENT/.test(agentText), 'the agent is told plainly that nothing was sent');

const STATE = process.env.OAUTH_STATE_DIR || '/tmp/gw-state';
const readLines = (f) => {
  try {
    return readFileSync(`${STATE}/${f}`, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

const deliveredCode =
  [...readLines('outbox.jsonl')].reverse().find((l) => l.proposalId === proposalId)?.linkCode ?? null;
ok(!!deliveredCode, 'the link code reached the out-of-band channel');
ok(
  deliveredCode !== null && !agentText.includes(deliveredCode),
  'the delivered link code appears NOWHERE in the agent result',
);

const diagRaw = (() => {
  try {
    return readFileSync(`${STATE}/diag.jsonl`, 'utf8');
  } catch {
    return '';
  }
})();
ok(
  deliveredCode !== null && diagRaw.length > 0 && !diagRaw.includes(deliveredCode),
  'NO line in the audit log contains the live link code',
);
ok(
  readLines('diag.jsonl').some((l) => l.kind === 'link_code_delivered' && l.proposalId === proposalId),
  'the audit log still records THAT delivery happened',
);

const page = await fetch(`${H}/p/${proposalId}`);
const html = await page.text();
ok(page.status === 200, 'the confirmation page renders for the merchant');
ok(html.includes('ceramic-mug-e2e'), 'the page shows the STORED order slug');
ok(html.includes('AWAITING_PAYMENT'), 'the page shows payment status at propose time');
const digest = /name="payloadDigest" value="([a-f0-9]+)"/.exec(html)?.[1];
ok(!!digest, 'the page carries the payload digest for binding');

const forged = await fetch(`${H}/p/${proposalId}/confirm`, {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    authorization: `Bearer ${tok.access_token}`,
  },
  body: new URLSearchParams({ linkCode: 'AAAAAA', payloadDigest: digest ?? '' }),
});
ok(forged.status !== 200, 'the agent token cannot approve its proposal', `got ${forged.status}`);

const after = await rpc('tools/call', {
  name: 'check_proposal_status',
  arguments: { proposalId },
}, 5);
const statusText = after.body?.result?.content?.map((c) => c.text).join('\n') ?? '';
ok(/pending_confirmation/.test(statusText), 'the proposal is still pending after the failed attempt');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
