/**
 * Deployable composition of the Secure Action Gateway.
 *
 * Three surfaces, one process, and the separation between them is the design:
 *
 *   /mcp    the AGENT talks here, over OAuth. It can propose and read status.
 *   /p/:id  the HUMAN talks here. No token, no session, no shared trust with
 *           the agent's channel, just a proposal id and a code delivered
 *           somewhere the agent cannot read.
 *   /.well-known/*, /register, /authorize, /token
 *           the OAuth authorization server AIFindr discovers and connects to.
 *
 * `oauth.mjs` is the module the spike proved against a live AIFindr connect,
 * copied verbatim rather than rewritten. Rewriting it would have discarded the
 * evidence, and the OAuth state it persists (signing key, client
 * registrations) is what lets this deploy REPLACE the spike on the same volume
 * without AIFindr having to reconnect.
 */

import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { installOAuth } from './oauth.mjs';
import { ActionRegistry } from './dist/domain/registry.js';
import { InMemoryProposalStore } from './dist/domain/store.js';
import { createConfirmationApi } from './dist/http/confirmation-api.js';
import { createInternalApi } from './dist/http/internal-api.js';
import { redact } from './dist/observability/redact.js';
import { createMcpServer } from './dist/mcp/server.js';

const PORT = Number(process.env.PORT ?? 8080);
const MCP_PATH = '/mcp';
const STATE_DIR = (process.env.OAUTH_STATE_DIR ?? '.').replace(/\/$/, '');
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const TTL_SECONDS = Number(process.env.PROPOSAL_TTL_SECONDS ?? 600);
// Demo-only. Unset in any real deployment: it gates the stand-in for the
// customer's phone, which in production is a device we do not serve.
const OPERATOR_TOKEN = process.env.OPERATOR_TOKEN ?? '';

// Diagnostics on the writable volume, never beside the source. The image
// directory is root-owned while this process runs unprivileged, and a
// diagnostic write that throws took the whole server down once already.
const DIAG = `${STATE_DIR}/diag.jsonl`;

// The simulated customer device. Separate file, separate purpose: this is the
// only sink permitted to hold a plaintext link code, and it is git-ignored.
const OUTBOX = `${STATE_DIR}/outbox.jsonl`;

/**
 * The single boundary every log line passes through.
 *
 * Redaction happens HERE, not at call sites. A rule enforced at call sites
 * holds only until someone adds a call site, and a live link code reaching
 * this log once already proved the point.
 */
function record(kind, payload) {
  const line = JSON.stringify({ ts: new Date().toISOString(), kind, ...redact(payload) });
  console.log(line);
  try {
    appendFileSync(DIAG, line + '\n');
  } catch (e) {
    // An observability failure must never propagate into the request path.
    console.error(`diag write failed (${e.code ?? e.message}); continuing`);
  }
}

/**
 * The simulated out-of-band channel, the ONLY place a plaintext code exists.
 *
 * Kept rigorously separate from the audit log. In production this is SMS or a
 * push into the banking app; here it is a file standing in for the customer's
 * phone, which the demo operator reads. Treating it as a distinct sink rather
 * than "the log, but with the code in it" is what makes the audit log safe to
 * ship, screenshot, or paste into CI output.
 */
function deliverOutOfBand(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  try {
    appendFileSync(OUTBOX, line + '\n');
  } catch (e) {
    // Delivery failure must be visible: the caller turns it into a refusal
    // rather than telling the user to await a code that will never arrive.
    throw new Error(`out-of-band delivery failed: ${e.code ?? e.message}`);
  }
}

const app = express();
app.disable('x-powered-by');
// Railway terminates TLS upstream, so without this the OAuth issuer would be
// advertised as http:// and every discovery document would be wrong.
app.set('trust proxy', true);
app.locals.record = record;

const store = new InMemoryProposalStore();
const registry = new ActionRegistry(store, { ttlSeconds: TTL_SECONDS });

/**
 * The out-of-band channel, stubbed.
 *
 * In production this is SMS or a push into the banking app. Here it writes to
 * the audit log and nowhere else, which is exactly the property that matters
 * for the demo: the code exists somewhere the AGENT cannot read it. The demo
 * operator reads it from the server log, playing the part of the customer's
 * phone.
 */
async function notifyPooliDraftReady(proposal, proposalId) {
  const base = (process.env.POOLI_API_URL ?? '').trim().replace(/\/$/, '');
  const secret = (process.env.POOLI_GATEWAY_SECRET ?? process.env.AGENT_GATEWAY_SECRET ?? '').trim();
  const merchantId = proposal.payload.merchantId ?? '';
  if (!base || !secret || !merchantId) return;

  const reviewBase = (process.env.POOLI_WEB_PUBLIC_URL ?? process.env.POOLI_PUBLIC_BASE_URL ?? '').trim().replace(/\/$/, '');
  const confirmUrl = `${PUBLIC_URL}/p/${proposalId}`;
  const body = {
    merchant_id: merchantId,
    order_id: proposal.payload.orderId,
    order_slug: proposal.payload.orderSlug,
    proposal_id: proposalId,
    confirm_url: confirmUrl,
    locale: proposal.payload.locale,
  };

  try {
    const res = await fetch(`${base}/api/v1/agent/draft-ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pooli-Gateway-Secret': secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    record('pooli_draft_ready_notify', {
      proposalId,
      orderId: proposal.payload.orderId,
      status: res.status,
      ok: res.ok,
    });
  } catch (e) {
    record('pooli_draft_ready_notify_failed', {
      proposalId,
      message: e?.message ?? String(e),
    });
  }
}

async function deliverLinkCode({ proposalId, linkCode, proposal }) {
  // Plaintext goes to the side channel and nowhere else.
  deliverOutOfBand({
    to: 'customer-device',
    proposalId,
    linkCode,
    message: `Your confirmation code is ${linkCode}. Approve at ${PUBLIC_URL}/p/${proposalId}`,
    orderSlug: proposal.payload.orderSlug,
    paymentStatus: proposal.payload.paymentStatus,
  });

  record('link_code_delivered', {
    proposalId,
    channel: 'out-of-band (simulated: outbox file stands in for the merchant device)',
    orderSlug: proposal.payload.orderSlug,
    paymentStatus: proposal.payload.paymentStatus,
    confirmUrl: `${PUBLIC_URL}/p/${proposalId}`,
  });

  await notifyPooliDraftReady(proposal, proposalId);
}

// Body parsers must be installed BEFORE the OAuth routes.
//
// Both are required, and the second is not optional trivia: RFC 6749 specifies
// the token endpoint as form-encoded and AIFindr sends it that way. A server
// with only express.json() parses those bodies as empty and rejects every
// token exchange with a misleading `unsupported_grant_type`, exactly the
// failure that blocked the first live connect (L-041).
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// --- OAuth authorization + resource server -------------------------------
// Installed BEFORE the MCP route so the 401 challenge and the discovery
// documents are in place for the paths they protect.
// Awaited: it loads or mints the persistent signing key before serving.
const { requireToken } = await installOAuth(app, { mcpPath: MCP_PATH });

// --- Agent surface --------------------------------------------------------
app.post(MCP_PATH, requireToken, async (req, res) => {
  const reqId = randomUUID();
  record('mcp_request', {
    reqId,
    method: req.body?.method ?? null,
    protocolVersion: req.get('mcp-protocol-version') ?? null,
  });

  // Stateless: a fresh server and transport per request. AIFindr opens a new
  // session for every call and DELETEs it afterwards (observed in the spike),
  // so holding session state would accumulate garbage for no benefit.
  const server = createMcpServer({
    registry,
    deliverLinkCode,
    confirmationBaseUrl: PUBLIC_URL,
    // Scopes deduplication to the caller. The token's subject is the only
    // stable identity available, AIFindr forwards no conversation id and no
    // user id on tool calls (L-042d), so this is per-integration, not
    // per-person, and the README says so rather than implying otherwise.
    principal: req.auth?.clientId ?? req.auth?.sub ?? 'aifindr',
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    record('mcp_error', { reqId, message: e?.message ?? String(e) });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'internal error' },
        id: req.body?.id ?? null,
      });
    }
  }
});

// The stateless transport has no session to resume or delete, but AIFindr
// issues both. Answering cleanly keeps its logs free of spurious errors.
app.get(MCP_PATH, requireToken, (_req, res) => void res.status(405).end());
app.delete(MCP_PATH, requireToken, (_req, res) => void res.status(204).end());

// --- The simulated customer device ---------------------------------------
//
// In production the link code arrives by SMS or a push into the banking app,
// and the customer reads it off their phone. In this deployment it lands in a
// file on a volume, which nobody can reach, and a side channel nobody can
// read is not a side channel. This route is the stand-in for the phone.
//
// It is genuinely a faithful simulation rather than a weakening, PROVIDED it
// keeps the property that makes the side channel a side channel: the agent
// cannot reach it. So:
//
//   - it is disabled entirely unless OPERATOR_TOKEN is set,
//   - it requires that token, which is never given to the agent and never
//     travels over the MCP connection,
//   - the token is compared in constant time, and
//   - it is a separate credential from the OAuth token, so a compromised agent
//     credential does not open it.
//
// If this were production code the route would not exist; the customer's phone
// is not an endpoint we serve.
if (OPERATOR_TOKEN) {
  const deviceAuthOk = (given) => {
    const a = Buffer.from(String(given ?? ''));
    const b = Buffer.from(OPERATOR_TOKEN);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  // The token arrives in the query string once, then moves into a cookie and
  // the URL is rewritten without it.
  //
  // This is a RECORDING concern before it is a security one: `?token=...` sits
  // in the browser's address bar, and the address bar is on screen for the
  // whole demo. A credential that is fine in a terminal is not fine burned
  // into a video frame. The cookie is httpOnly and sameSite=strict, so it is
  // also the better place for it regardless of the camera.
  const cookieToken = (req) =>
    /(?:^|;\s*)dev_op=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];

  const tokenFrom = (req) =>
    req.query.token ?? req.get('x-operator-token') ?? req.body?.token ?? cookieToken(req);

  // Clearing the simulated handset between demo takes. Stale codes are
  // clutter on camera and at least one of them is usually already spent.
  //
  // Three properties this deliberately keeps:
  //   - POST, not GET. It mutates, so it must not be reachable by a link, a
  //     prefetch, or the page's own 5-second refresh.
  //   - It empties the OUTBOX ONLY. The audit log is a different file and is
  //     never touched here; the outbox is a simulated phone's inbox, the audit
  //     log is the record of what the system did.
  //   - The clear is ITSELF recorded to the audit log. Wiping the visible
  //     evidence while leaving no trace that it was wiped is the wrong habit
  //     to build even in a demo surface, and the count is worth keeping.
  app.post('/demo/device/clear', (req, res) => {
    if (!deviceAuthOk(tokenFrom(req))) {
      return void res.status(404).type('html').send('<h1>Not found</h1>');
    }

    let cleared = 0;
    try {
      cleared = readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).length;
    } catch {
      // Nothing to clear is a normal state.
    }
    try {
      writeFileSync(OUTBOX, '');
    } catch (e) {
      // Same rule as L-058: a failure here must not take the server down.
      record('demo_outbox_clear_failed', { message: e?.message ?? String(e) });
      return void res.status(500).type('html').send('<h1>Could not clear</h1>');
    }
    record('demo_outbox_cleared', { entries: cleared });

    res.redirect(303, '/demo/device');
  });

  app.get('/demo/device', (req, res) => {
    if (!deviceAuthOk(tokenFrom(req))) {
      // Same answer as a route that does not exist, so the presence of the
      // demo surface is not discoverable without the token.
      return void res.status(404).type('html').send('<h1>Not found</h1>');
    }

    // Token supplied in the URL: park it in a cookie and bounce to the clean
    // path, so the address bar stops showing it before anything is recorded.
    if (req.query.token) {
      res.setHeader(
        'Set-Cookie',
        `dev_op=${encodeURIComponent(OPERATOR_TOKEN)}; HttpOnly; Secure; SameSite=Strict; Path=/demo; Max-Age=14400`,
      );
      return void res.redirect(303, '/demo/device');
    }

    let messages = [];
    try {
      messages = readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean)
        .map((l) => JSON.parse(l)).slice(-5).reverse();
    } catch {
      // No messages yet is a normal state, not an error.
    }

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    res.type('html').send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="refresh" content="5">
<title>Messages</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; padding:1.5rem 1rem; font:16px/1.5 system-ui,-apple-system,sans-serif;
         background:#f4f5f7; display:flex; justify-content:center; }
  @media (prefers-color-scheme: dark) { body { background:#15171a; color:#e8e8ea; } }
  .phone { width:100%; max-width:22rem; }
  h1 { font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:#888; margin:0 0 1rem; }
  .msg { background:#fff; border-radius:14px; padding:.9rem 1rem; margin-bottom:.75rem;
         box-shadow:0 1px 2px rgba(0,0,0,.1); }
  @media (prefers-color-scheme: dark) { .msg { background:#1e2126; } }
  .from { font-size:.75rem; color:#888; margin-bottom:.3rem; }
  .code { font:600 2rem/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.25em; margin:.4rem 0; }
  .body { font-size:.85rem; color:#555; word-break:break-word; }
  @media (prefers-color-scheme: dark) { .body { color:#9aa0a6; } }
  .empty { color:#888; font-size:.9rem; }
  .clear { margin-top:1.25rem; text-align:center; }
  .clear button { font:inherit; font-size:.8rem; color:#888; background:none;
                  border:0; padding:.4rem; cursor:pointer; text-decoration:underline; }
</style>
</head><body><main class="phone">
<h1>Bank &middot; messages</h1>
${messages.length === 0 ? '<p class="empty">No messages yet.</p>' : messages.map((m) => `
  <div class="msg">
    <div class="from">Bank alerts &middot; ${esc(new Date(m.ts).toLocaleTimeString())}</div>
    <div class="code">${esc(m.linkCode)}</div>
    <div class="body">${esc(m.orderSlug ?? 'order')} &middot; approve at /p/${esc(m.proposalId)}</div>
  </div>`).join('')}
${messages.length === 0 ? '' : `<form class="clear" method="post" action="/demo/device/clear">
  <button type="submit">Clear messages</button>
</form>`}
</main></body></html>`);
  });
}

const gatewaySecret = (
  process.env.POOLI_GATEWAY_SECRET ??
  process.env.AGENT_GATEWAY_SECRET ??
  ''
).trim();

if (gatewaySecret) {
  app.use(
    '/internal',
    createInternalApi({
      registry,
      gatewaySecret,
      deliverLinkCode,
      confirmationBaseUrl: PUBLIC_URL,
    }),
  );
}

// --- Human surface --------------------------------------------------------
// Mounted last, and deliberately WITHOUT requireToken: the person approving a
// transfer holds a link and a code, not an OAuth token. Requiring the agent's
// credential here would collapse the two channels into one and destroy the
// property the whole design rests on.
app.use(createConfirmationApi(registry));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'pooli-action-gateway' });
});

app.listen(PORT, () => {
  record('boot', {
    port: PORT,
    mcpPath: MCP_PATH,
    publicUrl: PUBLIC_URL,
    stateDir: STATE_DIR,
    ttlSeconds: TTL_SECONDS,
    tools: ['get_order_snapshot', 'propose_buyer_message', 'check_proposal_status'],
  });
});
