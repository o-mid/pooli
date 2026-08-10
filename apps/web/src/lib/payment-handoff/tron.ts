import type { HandoffInput, LaunchResult } from "./types";

/**
 * Launch TRON wallet handoff using documented mechanisms only.
 *
 * - Prefer API `payment_uri` (`tron:address?amount=&token=`) when present.
 * - Optionally open TronLink app via documented `open` action (no transfer prefill claim).
 * - Do NOT build tronlinkoutside transfer payloads that require buyer `from`/`loginAddress`.
 */
export function launchTronHandoff(input: HandoffInput, mode: "uri" | "tronlink_open" = "uri"): LaunchResult {
  if (typeof window === "undefined") {
    return { ok: false, reason: "unsupported" };
  }

  const uri = input.option.payment_uri || "";
  if (mode === "uri" && uri) {
    try {
      window.location.href = uri;
      return { ok: true, method: "tron_uri" };
    } catch {
      return { ok: false, reason: "failed", message: "Could not open payment URI" };
    }
  }

  if (mode === "tronlink_open") {
    // Documented open-wallet action — does not prefill transfer fields.
    const param = encodeURIComponent(
      JSON.stringify({
        action: "open",
        protocol: "TronLink",
        version: "1.0",
      }),
    );
    try {
      window.location.href = `tronlinkoutside://pull.activity?param=${param}`;
      return { ok: true, method: "tronlink_open" };
    } catch {
      return { ok: false, reason: "failed" };
    }
  }

  if (uri) {
    window.location.href = uri;
    return { ok: true, method: "tron_uri" };
  }

  return { ok: false, reason: "unsupported", message: "No TRON payment URI available" };
}

/** Attempt URI first; if in-app browser, caller should show recovery UI on failure. */
export async function payWithTronWallet(input: HandoffInput): Promise<LaunchResult> {
  const first = launchTronHandoff(input, "uri");
  if (first.ok) return first;
  if (input.env.isMobile) {
    return launchTronHandoff(input, "tronlink_open");
  }
  return first;
}
