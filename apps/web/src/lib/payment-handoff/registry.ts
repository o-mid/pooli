import type { HandoffInput, HandoffPlan, WalletCandidate, WalletId } from "./types";

function isEvm(network: string): boolean {
  return network === "bsc" || network.startsWith("eip155:") || Boolean(network && network !== "tron");
}

function isTron(network: string): boolean {
  return network === "tron";
}

function candidate(
  id: WalletId,
  labelKey: WalletCandidate["labelKey"],
  kind: WalletCandidate["kind"],
  caps: Pick<WalletCandidate, "canPrefillRecipient" | "canPrefillAmount">,
  recommended?: boolean,
): WalletCandidate {
  return { id, labelKey, kind, recommended, ...caps };
}

/**
 * Select wallet handoff options for the current network/env.
 * Never lists TronLink on EVM or MetaMask deeplink-only for unreliable EIP-681 ERC-20.
 */
export function buildHandoffPlan(input: HandoffInput): HandoffPlan {
  const { option, env, preferredWalletId, walletConnectProjectId } = input;
  const network = option.network || "tron";
  const asset = (option.asset || "USDT").trim() || "USDT";
  const paymentUri = option.payment_uri || "";
  const qrPayload = paymentUri || option.destination_address || "";
  const hasWc = Boolean(walletConnectProjectId);

  const wallets: WalletCandidate[] = [];

  if (isTron(network)) {
    wallets.push(
      candidate("tronlink", "tronlink", "deeplink", { canPrefillRecipient: true, canPrefillAmount: true }, true),
      candidate("other", "other", "deeplink", { canPrefillRecipient: Boolean(paymentUri), canPrefillAmount: Boolean(paymentUri) }),
      candidate("qr", "qr", "qr", { canPrefillRecipient: true, canPrefillAmount: Boolean(paymentUri) }),
    );
  } else if (isEvm(network)) {
    if (hasWc) {
      wallets.push(
        candidate("walletconnect", "walletconnect", "walletconnect", {
          canPrefillRecipient: true,
          canPrefillAmount: true,
        }, true),
      );
    }
    // Trust / MetaMask via WalletConnect only — do not advertise broken EIP-681 MetaMask deep links.
    if (hasWc) {
      wallets.push(
        candidate("trust", "trust", "walletconnect", { canPrefillRecipient: true, canPrefillAmount: true }),
      );
    }
    wallets.push(
      candidate("other", "other", "deeplink", {
        canPrefillRecipient: Boolean(paymentUri),
        canPrefillAmount: false, // EIP-681 ERC-20 amount support is unreliable
      }),
      candidate("qr", "qr", "qr", { canPrefillRecipient: true, canPrefillAmount: Boolean(paymentUri) }),
    );
  } else {
    wallets.push(candidate("qr", "qr", "qr", { canPrefillRecipient: true, canPrefillAmount: Boolean(paymentUri) }));
  }

  let primary =
    wallets.find((w) => w.id === preferredWalletId && w.id !== "qr") ||
    wallets.find((w) => w.recommended) ||
    wallets.find((w) => w.id !== "qr") ||
    wallets[0];

  const qrPrimary = env.isDesktop;
  const showPayWithWallet = env.isMobile && primary?.kind !== "qr";

  if (qrPrimary && !showPayWithWallet) {
    // Desktop: QR is the primary surface; keep wallet list for secondary actions.
  }

  return {
    network,
    asset,
    primary,
    wallets,
    qrPayload,
    paymentUri,
    qrPrimary,
    showPayWithWallet,
  };
}

export function filterValidWallets(plan: HandoffPlan): WalletCandidate[] {
  return plan.wallets.filter((w) => w.id !== "qr");
}
