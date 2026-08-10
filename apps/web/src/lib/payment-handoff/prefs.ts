import type { PaymentNetwork, WalletId } from "./types";

const NETWORK_KEY = "pooli.checkout.network";
const WALLET_KEY = "pooli.checkout.wallet";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Non-sensitive buyer network preference. */
export function getPreferredNetwork(): PaymentNetwork | null {
  const v = safeStorage()?.getItem(NETWORK_KEY);
  if (v === "tron" || v === "bsc") return v;
  return null;
}

export function setPreferredNetwork(network: PaymentNetwork): void {
  const s = safeStorage();
  if (!s) return;
  if (network === "tron" || network === "bsc") s.setItem(NETWORK_KEY, network);
}

/** Non-sensitive wallet brand preference (never keys/secrets). */
export function getPreferredWallet(network: PaymentNetwork): WalletId | null {
  const s = safeStorage();
  if (!s) return null;
  const raw = s.getItem(`${WALLET_KEY}.${network}`);
  if (!raw) return null;
  if (raw === "tronlink" || raw === "walletconnect" || raw === "trust" || raw === "other" || raw === "qr") {
    return raw;
  }
  return null;
}

export function setPreferredWallet(network: PaymentNetwork, wallet: WalletId): void {
  const s = safeStorage();
  if (!s) return;
  s.setItem(`${WALLET_KEY}.${network}`, wallet);
}
