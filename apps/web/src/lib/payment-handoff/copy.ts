import type { PaymentOption } from "./types";

/** Exact numeric payable amount only — no rounding, locale, or symbol. */
export function exactPayableAmount(option: PaymentOption): string {
  return String(option.pay_usdt_amount ?? "").trim();
}

export function fullDestinationAddress(option: PaymentOption): string {
  return String(option.destination_address ?? "").trim();
}

export function assetSymbol(option: PaymentOption): string {
  const s = (option.asset || "USDT").trim();
  return s || "USDT";
}

export function networkLabel(network: string): string {
  if (network === "tron") return "TRON";
  if (network === "bsc") return "BNB Chain";
  return (network || "").toUpperCase();
}

/** Human-readable clipboard payload without customer PII. */
export function buildPaymentDetailsText(opts: {
  storeName?: string;
  option: PaymentOption;
  labels?: {
    heading?: string;
    merchant?: string;
    amount?: string;
    network?: string;
    address?: string;
  };
}): string {
  const amount = exactPayableAmount(opts.option);
  const asset = assetSymbol(opts.option);
  const L = {
    heading: opts.labels?.heading || "Pooli Payment",
    merchant: opts.labels?.merchant || "Merchant",
    amount: opts.labels?.amount || "Amount",
    network: opts.labels?.network || "Network",
    address: opts.labels?.address || "Address",
  };
  const lines = [
    L.heading,
    opts.storeName ? `${L.merchant}: ${opts.storeName}` : null,
    `${L.amount}: ${amount} ${asset}`,
    `${L.network}: ${networkLabel(opts.option.network)}`,
    `${L.address}: ${fullDestinationAddress(opts.option)}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
