import { executionReferenceOf } from '../domain/state-machine.js';
import type { Proposal, ProposalState } from '../domain/types.js';

const STATE_COPY: Record<ProposalState, { label: string; tone: string; detail: string }> = {
  pending_confirmation: {
    label: 'Awaiting your approval',
    tone: 'pending',
    detail: 'Nothing has been sent to the buyer. Review the draft below carefully.',
  },
  confirmed: { label: 'Approved', tone: 'ok', detail: 'You approved this draft.' },
  executed: {
    label: 'Ready to send',
    tone: 'ok',
    detail: 'This is a demonstration system. Copy the approved text from Pooli when wired to production.',
  },
  rejected: { label: 'Declined', tone: 'bad', detail: 'You declined this draft. Nothing was sent.' },
  expired: {
    label: 'Expired',
    tone: 'bad',
    detail: 'This proposal was not approved in time. Ask the agent for a new draft.',
  },
  failed: { label: 'Failed', tone: 'bad', detail: 'Delivery did not complete.' },
};

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:2rem 1rem; font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;
         background:#f4f5f7; color:#111; display:flex; justify-content:center; }
  @media (prefers-color-scheme: dark) { body { background:#15171a; color:#e8e8ea; } }
  .card { width:100%; max-width:26rem; background:#fff; border-radius:14px; padding:1.5rem;
          box-shadow:0 1px 3px rgba(0,0,0,.12),0 8px 24px rgba(0,0,0,.08); }
  @media (prefers-color-scheme: dark) { .card { background:#1e2126; } }
  h1 { font-size:1.15rem; margin:0 0 .25rem; }
  .sub { color:#666; font-size:.875rem; margin:0 0 1.25rem; }
  @media (prefers-color-scheme: dark) { .sub { color:#9aa0a6; } }
  .draft { white-space:pre-wrap; font-size:.95rem; padding:1rem; background:#f8f9fb; border-radius:10px;
           margin:.75rem 0 1rem; border:1px solid #e2e5ea; }
  @media (prefers-color-scheme: dark) { .draft { background:#12151a; border-color:#2a2f38; } }
  dl { margin:0 0 1.25rem; display:grid; grid-template-columns:auto 1fr; gap:.5rem 1rem; font-size:.9rem; }
  dt { color:#666; } dd { margin:0; text-align:right; word-break:break-all; }
  @media (prefers-color-scheme: dark) { dt { color:#9aa0a6; } }
  .badge { display:inline-block; padding:.2rem .6rem; border-radius:999px; font-size:.75rem; font-weight:600; }
  .pending { background:#fff4d6; color:#7a5200; }
  .ok { background:#d8f5e0; color:#0f5132; }
  .bad { background:#fadbd8; color:#7a1c12; }
  label { display:block; font-size:.85rem; font-weight:600; margin:1rem 0 .35rem; }
  input { width:100%; padding:.7rem; font-size:1.35rem; letter-spacing:.35em; text-align:center;
          text-transform:uppercase; border:1px solid #ccc; border-radius:8px; background:transparent;
          color:inherit; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .row { display:flex; gap:.6rem; margin-top:1rem; }
  button { flex:1; padding:.75rem; font-size:.95rem; font-weight:600; border-radius:8px;
           border:1px solid transparent; cursor:pointer; }
  .approve { background:#0a7d3c; color:#fff; }
  .decline { background:transparent; border-color:#ccc; color:inherit; }
  .warn { margin-top:1.25rem; padding:.7rem .8rem; border-left:3px solid #d9a406;
          background:#fffaf0; font-size:.8rem; color:#5a4300; border-radius:0 6px 6px 0; }
  @media (prefers-color-scheme: dark) { .warn { background:#2a2418; color:#e0c98a; } }
  .err { margin-top:1rem; padding:.7rem .8rem; background:#fadbd8; color:#7a1c12;
         border-radius:8px; font-size:.85rem; }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head><body><main class="card">${body}</main></body></html>`;
}

export function renderNotFound(): string {
  return shell(
    'Not found',
    `<h1>Request not found</h1>
     <p class="sub">This confirmation link is not valid, or it has already been cleaned up.</p>`,
  );
}

export function renderProposal(p: Proposal, error?: string): string {
  const copy = STATE_COPY[p.state];
  const actionable = p.state === 'pending_confirmation';
  const execRef = executionReferenceOf(p);

  const details = `
    <dl>
      <dt>Order</dt><dd>${esc(p.payload.orderSlug)}</dd>
      <dt>Payment</dt><dd>${esc(p.payload.paymentStatus)}</dd>
      <dt>Locale</dt><dd>${esc(p.payload.locale)}</dd>
      <dt>Requested</dt><dd>${esc(new Date(p.createdAt).toLocaleString())}</dd>
      ${execRef ? `<dt>Reference no.</dt><dd>${esc(execRef)}</dd>` : ''}
    </dl>`;

  const form = actionable
    ? `<form method="post" action="/p/${esc(p.id)}/confirm">
         <input type="hidden" name="payloadDigest" value="${esc(p.payloadDigest)}">
         <label for="code">Enter the 6-character code sent to you</label>
         <input id="code" name="linkCode" maxlength="6" autocomplete="one-time-code"
                inputmode="latin" autocapitalize="characters" required autofocus>
         <div class="row">
           <button class="approve" type="submit">Approve draft</button>
           <button class="decline" type="submit" formaction="/p/${esc(p.id)}/reject">Decline</button>
         </div>
       </form>
       <p class="warn">Only approve if this draft matches what you want to send.
          Payment status is ${esc(p.payload.paymentStatus)} — do not approve a draft that claims otherwise.</p>`
    : '';

  return shell(
    'Confirm buyer message',
    `<h1>Confirm buyer message</h1>
     <p class="sub"><span class="badge ${copy.tone}">${esc(copy.label)}</span></p>
     <p class="sub">${esc(copy.detail)}</p>
     <div class="draft">${esc(p.payload.body)}</div>
     ${details}
     ${error ? `<div class="err">${esc(error)}</div>` : ''}
     ${form}`,
  );
}
