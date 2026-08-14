# BNB Smart Chain mainnet pilot runbook

Goal: a buyer selects **BNB Chain** on a Pooli checkout, sends the exact USDT amount on BNB Smart Chain mainnet, and Pooli detects → matches → confirms → settles using the **same** payment lifecycle as TRON.

See also [ADR-006](./decisions/ADR-006-bsc-mainnet-rail.md).

## Architecture

```
Buyer USDT (BEP-20)
  → BSC JSON-RPC (eth_getLogs)
  → Pooli EVMAdapter
  → ChainEvent (6-decimal AmountBaseUnits)
  → Matcher → PaymentIntent → PAID
  → REST polling → buyer + merchant UI
```

TRON and BSC converge immediately after observation. There is no separate BSC settlement engine.

## USDT contract (verified)

| Field | Value |
|-------|--------|
| Network | BNB Smart Chain mainnet |
| Chain ID | `56` |
| Contract | `0x55d398326f99059fF775485246999027B3197955` |
| Symbol | USDT (Binance-Peg / BSC-USD) |
| Decimals | **18** (on-chain `decimals()` = `0x12`) |

Evidence:

- BscScan token page for the address above (`decimals() → 18`)
- Live `eth_call` `decimals()` against a BSC RPC returned `18`
- Pooli stores `BSC_USDT_CONTRACT` + `BSC_USDT_DECIMALS=18` and refuses other values when the BSC mainnet watcher is enabled

**Do not** paste contract addresses from blogs/memory without re-checking BscScan + `decimals()`.

### Decimal scaling

Pooli’s product money model is **6-decimal USDT `int64` base units** (shared with TRON).

The EVM adapter converts at the boundary:

- observe: `on_chain_amount / 10^12 → AmountBaseUnits`
- wallet URI: `AmountBaseUnits * 10^12 → uint256`

Checkout still shows amounts like `0.406620 USDT`. Matching compares 6-decimal units only.

## Environment

```bash
ENABLE_BSC_WATCHER=true
ENABLE_CHAIN_SIMULATOR=false

BSC_NETWORK=mainnet
BSC_CHAIN_ID=56
BSC_RPC_URL=<provider JSON-RPC URL with eth_getLogs>
BSC_USDT_CONTRACT=0x55d398326f99059fF775485246999027B3197955
BSC_USDT_DECIMALS=18
BSC_CONFIRMATIONS=15
BSC_EXPLORER_TX_URL=https://bscscan.com/tx/%s
```

Keep secrets out of git. Prefer a paid/authenticated RPC for production; public dataseeds often rate-limit or truncate `eth_getLogs`.

### Recommended RPC providers (Omid creates account — do not purchase via agent)

| Provider | Notes |
|----------|--------|
| **Chainstack** | Simple RU pricing; confirm `eth_getLogs` on BSC mainnet |
| **Ankr** | Free/paid tiers; verify log query limits for indexing |
| Alternatives | QuickNode, NodeReal — also fine if `eth_getLogs` is reliable |

Avoid anonymous public dataseeds for money movement. Paginate log ranges (Pooli caps span ≤64 blocks with 32-block overlap so non-archive RPCs such as Chainstack Developer accept `eth_getLogs`).

Local development may keep:

```bash
ENABLE_BSC_WATCHER=false
ENABLE_BSC_CHECKOUT=false
```

Production rule: **never** set `ENABLE_BSC_CHECKOUT=true` until watcher + WalletConnect device E2E pass. See [`e2e-checklists.md`](./e2e-checklists.md).

### RPC requirements

Required methods:

- `eth_chainId` (must report `56` when `BSC_CHAIN_ID=56`)
- `eth_blockNumber`
- `eth_getLogs` (address + topic filters, bounded ranges)
- `eth_getBlockByNumber` (block timestamp)
- `eth_getTransactionReceipt`

Provider switch: change `BSC_RPC_URL` only — no code change.

## Cursor / recovery

- Durable cursor in `watcher_cursors` for `network='bsc'`
- Value = next block number (decimal string), not a tx hash
- Each poll uses bounded span (≤64 blocks) with **32-block overlap**
- Idempotency via unique `event_id = bsc:{txHash}:{logIndex}`
- Worker restart resumes from cursor; overlap + dedupe covers races

## Confirmations / reorg policy (pilot)

- `confirmations = latestBlock - txBlock + 1`
- Default required depth: **15** (`BSC_CONFIRMATIONS`)
- Before finality: intent may be `SEEN` / `CONFIRMING`; UI polls as usual
- If a pre-final Transfer log disappears (reorg): `VerifyTransfer` fails; event is not settled
- Phase 4 does **not** roll back an already-`PAID` intent; depth is the pilot safety margin

## Merchant wallets

Merchants must configure an **EVM** address under BNB Smart Chain — never reuse a TRON address.

Checkout already offers TRON / BNB Chain; BNB is only available when a BSC wallet + option exist.

## Operator E2E (deferred to final suite)

1. Enable BSC watcher with a production-capable RPC.
2. Ensure merchant has an active BSC USDT wallet.
3. Create checkout → select BNB Chain → note exact amount + address.
4. Send exact USDT-BEP20 from an external wallet.
5. Wait for ≥ `BSC_CONFIRMATIONS`.
6. Expect intent/order `PAID`, reservation consumed, option `SETTLED`, usage +1, BscScan link.
7. Buyer/merchant UIs update via REST polling without hard refresh.

Do not mix with TRON amounts/addresses.

## Failure triage

| Symptom | Check |
|--------|--------|
| Never detected | `ENABLE_BSC_WATCHER`; RPC `eth_getLogs`; merchant BSC wallet; contract; decimals scaling |
| Wrong amount / no match | Buyer sent 6-dec thinking on-chain units; dust not divisible by `10^12` |
| Stuck CONFIRMING | RPC head; `BSC_CONFIRMATIONS`; `block_number` on `chain_events` |
| chain id error | RPC is not BSC mainnet (`eth_chainId` ≠ 56) |
| Rate limited | Switch `BSC_RPC_URL` to a provider that allows log queries |
| UI stale | REST polling; hard-refresh once to confirm DB `PAID` |

## Explorer

Mainnet tx URL template: `https://bscscan.com/tx/%s` (`BSC_EXPLORER_TX_URL`).
