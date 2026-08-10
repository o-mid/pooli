# Payment handoff — manual device matrix

Record only what was actually tested. Do not mark unperformed cases as passed.

## Environment

- Production: https://pooli.shop
- Local: checkout `/p/[slug]`
- EVM WalletConnect requires `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

## Matrix (fill during real-device runs)

| Device / browser | Wallet | Opens? | Recipient prefilled? | Amount prefilled? | Network/token OK? | Return to Pooli? | SSE/poll resumes? | Fallback OK? |
|------------------|--------|--------|----------------------|-------------------|-------------------|------------------|-------------------|--------------|
| iPhone Safari | TronLink | | | | | | | |
| iPhone Telegram | TronLink | | | | | | | |
| iPhone Instagram | TronLink | | | | | | | |
| Android Chrome | TronLink | | | | | | | |
| Android Telegram | TronLink | | | | | | | |
| Android Instagram | TronLink | | | | | | | |
| Mobile | Trust (WC / BSC) | | | | | | | |
| Mobile | MetaMask (WC / BSC) | | | | | | | |
| Desktop | QR scan | | | | | | | |

## Known limitations (code-level)

- TronLink **transfer** deeplink requires buyer `from` / `loginAddress` and may require dApp whitelist — Pooli does **not** fake transfer prefills via that API. Primary TRON path uses `tron:` URI + QR/copy.
- EIP-681 ERC-20 support is unreliable in many wallets; EVM primary path is WalletConnect `eth_sendTransaction`.
- Without WC project id, EVM falls back to EIP-681 URI / QR / copy.
- Instagram/Telegram in-app browsers often block custom schemes — UI offers Open in browser / QR / copy details.
- Production SSE from chain-worker remains best-effort; REST poll + visibility refetch are authoritative.
