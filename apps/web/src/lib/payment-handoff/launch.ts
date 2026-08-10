import { launchEip681, payWithWalletConnect } from "./evm";
import { buildHandoffPlan } from "./registry";
import { payWithTronWallet } from "./tron";
import type { HandoffInput, LaunchResult, WalletId } from "./types";

export async function launchWalletHandoff(
  input: HandoffInput,
  walletId?: WalletId | null,
): Promise<LaunchResult> {
  const plan = buildHandoffPlan(input);
  const id = walletId || plan.primary.id;

  if (id === "qr") {
    return { ok: false, reason: "unsupported", message: "Use QR surface" };
  }

  if (plan.network === "tron") {
    return payWithTronWallet(input);
  }

  // EVM paths
  if (id === "walletconnect" || id === "trust") {
    const wc = await payWithWalletConnect(input);
    if (wc.ok || wc.reason === "user_rejected" || wc.reason === "missing_project_id") {
      return wc;
    }
    // Degrade to EIP-681 if WC fails for non-user reasons.
    const eip = launchEip681(input);
    if (eip.ok) return eip;
    return wc;
  }

  if (id === "other") {
    return launchEip681(input);
  }

  // Default EVM: prefer WC when configured
  if (input.walletConnectProjectId) {
    return payWithWalletConnect(input);
  }
  return launchEip681(input);
}
