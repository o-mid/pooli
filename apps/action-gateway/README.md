# Pooli action gateway

MCP server for **buyer follow-up drafts**: agents may `get_order_snapshot` and
`propose_buyer_message`; merchants confirm on `/p/:id` with an out-of-band code.
Nothing sends to buyers or marks orders paid from this surface.

## Quick verify

```bash
npm run build && npm test && npm run e2e:sticky
```

From repo root: `make verify-agent`.

---

Adapted from the [secure-action-gateway](https://github.com/o-mid/secure-action-gateway) transfer pattern; Pooli payloads are message drafts bound to order slug and payment status at propose time.

## The invariant everything else serves

> **The human confirms the stored artifact, not the model's description of it.**

The confirmation surface renders the proposal by reading it back from the
server record, keyed by proposal id. It never renders anything the model
supplied, and never accepts a payload passed through the agent's channel.

This is enforced, not merely intended. Each proposal stores a
`payloadDigest` — a SHA-256 over the amount, currency, source, destination and
reference — taken at proposal time. Confirmation must present the digest the
human was shown, and the state machine refuses the transition if it no longer
matches what is stored. A payload altered anywhere between proposal and
execution invalidates the confirmation rather than silently executing something
the person never agreed to.

The digest covers every field a human would care about. Adding a field to
`TransferPayload` without adding it to `digestPayload` would create a field
that can be changed after approval, so the two must always move together.

## Why confirmation happens out of band

The agent's channel is assumed hostile. An agent under prompt injection can
compose the text a human reads and interpret the reply that comes back, so any
confirmation that traverses that channel can be misrepresented in both
directions — including MCP elicitation, which is in-band by construction.

This holds regardless of protocol revision. The security property is not
"elicitation is unavailable"; it is **confirmation must not traverse the
channel the attacker controls**. See `docs/decision-log.md` L-045.

## Why a link code exists

Measured, not assumed: AIFindr forwards no conversation id, no user id and no
`_meta` of any kind on a tool call — only the tool name and its arguments
(L-042d). The OAuth token proves *AIFindr* is calling; it says nothing about
*who is chatting*, because it is issued once at project level.

So the protocol cannot identify the person. The link code, issued out of band
and presented at confirmation, is the only thing that binds a proposal to a
human. It is stored as a hash, compared in constant time, and an expired
proposal refuses identically whether the code was right or wrong so that a late
attacker learns nothing.

## Domain rules

| Rule | Where it is enforced |
|---|---|
| `executed` is reachable only via `confirmed` | `guard()` transition table |
| Terminal states never transition again | `isTerminal()` check, before anything else |
| Expiry is evaluated on use, not by a sweeper | `expireIfDue()` at the head of `confirm`/`reject` |
| Confirmation requires link code **and** payload digest | `confirm()` |
| Every transition bumps `version` | `applied()` — gives the store a compare-and-swap token |
| The agent appears in the audit trail exactly once, at proposal | `TransitionRecord.actor` |

The domain is pure: transitions return new values and never mutate. Deciding
*whether* a transition is legal belongs here; deciding *who won a race* belongs
to the store's compare-and-swap on `(id, version)`. Neither layer does the
other's job.

## Tests

Written as attacks rather than feature checks, and landed with the state
machine rather than after it.

```
npm test         # vitest
npm run typecheck
```
