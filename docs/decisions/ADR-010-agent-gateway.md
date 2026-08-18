# ADR-010: Agent gateway boundary

## Status

Accepted (2026-10-11)

## Context

Pooli will expose MCP tools via a separate action gateway (Phase C). Models must not receive raw SQL, admin fields, or unredacted buyer PII. Payment truth stays in Go (`internal/payment`, worker, matcher).

## Decision

1. **Read-only agent HTTP surface** on the Go API (`GET /api/v1/agent/merchants/{merchantId}/orders/{orderId}/snapshot`), authenticated service-to-service with `X-Pooli-Gateway-Secret` and merchant scope header `X-Pooli-Merchant-Id`.
2. **`internal/agent`** builds a versioned snapshot from Postgres, applies **policy** (allowed fields) and **redaction** (phone, email, and other PII excluded unless explicitly allowed later).
3. The snapshot is the **only** narrative payment truth agents should use — no write routes under `/api/v1/agent/*` in Phase B (proposals arrive in Phase C on the gateway).
4. **Forbidden capabilities** stay off MCP: mark paid, verify payment, create intent, send message without human confirm.

## Consequences

- Gateway holds OAuth/API keys and proposal state; Go API remains money authority.
- Integration tests must prove snapshot status matches merchant REST and that redaction rules hold.

## Related

- Internal playbook: agent snapshot + propose/confirm split
- Future: ADR-011 proposal lifecycle and idempotency
