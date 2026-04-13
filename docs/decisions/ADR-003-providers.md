# ADR-003: External providers

## Decision

| Concern | Provider |
|---|---|
| TRON | TronGrid V1 TRC-20 history |
| EVM/BSC | JSON-RPC `eth_getLogs` via configurable RPC URL |
| Rates | Nobitex primary, Wallex fallback, Mock for local |
| Notifications | Telegram Bot API |
| Deploy | Railway |

Adapters hide provider specifics behind `ChainAdapter` and `RateProvider`.
