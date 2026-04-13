# ADR-002: Unique amount matching

## Decision

Match incoming USDT transfers to payment options using a unique payable amount reserved per destination address + network + token contract for the active window.

## Consequences

- Postgres unique partial index enforces reservations.
- Redis may cache but is not the consistency layer.
- Rounded / under / over / late / duplicate payments become explicit exception states.
- Ambiguous approximates never auto-settle.
