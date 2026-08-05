# ADR-006: BNB Smart Chain mainnet USDT rail

## Status

Accepted (Phase 4)

## Context

Pooli already normalizes chain transfers into `ChainEvent` and settles via a shared matcher. TRON mainnet (Phase 3) proved the lifecycle. BSC needs a production-ready watcher that converges on the same pipeline without forking payment rules.

Binance-Peg USDT on BNB Smart Chain uses **18 decimals**, while Pooli’s money model stores USDT as **6-decimal `int64` base units** (same as TRC-20 USDT). Changing the global money model would redesign the payment domain.

## Decision

1. Treat BSC as another `chain.Adapter` (`EVMAdapter`) feeding the existing matcher.
2. Keep Pooli-internal amounts in 6-decimal USDT base units for reservations, matching, UI, and usage.
3. Perform **18↔6 scaling only inside the EVM adapter**:
   - observe/verify: `on_chain / 10^12 → AmountBaseUnits`
   - payment URI: `AmountBaseUnits * 10^12 → uint256`
4. Use durable **block-number** cursors with bounded overlap + `event_id` dedupe (`bsc:{txHash}:{logIndex}`).
5. Require configurable confirmation depth before `PAID` (pilot default **15**). Pre-finality disappearance of a log fails verify and does not settle; Phase 4 does not implement automatic rollback of already-`PAID` intents.

## Consequences

- Matcher / late-payment / reservations remain chain-agnostic.
- Merchants must configure a distinct EVM address for BSC (never a TRON address).
- Operators must supply an RPC that supports `eth_getLogs` over bounded ranges.
- Dust below Pooli precision (not divisible by `10^12` wei) is ignored at the adapter boundary.
