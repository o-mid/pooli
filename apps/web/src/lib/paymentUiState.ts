import { exceptionKind, moneyDetected } from "@/lib/payment-handoff/exceptions";

export type PaymentUiState =
  | "READY"
  | "OPENING_WALLET"
  | "WAITING_FOR_PAYMENT"
  | "PAYMENT_DETECTED"
  | "CONFIRMING"
  | "PAID"
  | "EXPIRED"
  | "NEEDS_ATTENTION"
  | "OFFLINE";

export function resolvePaymentUiState(opts: {
  intentStatus?: string | null;
  openingWallet?: boolean;
  offline?: boolean;
}): PaymentUiState {
  if (opts.offline) return "OFFLINE";
  const status = opts.intentStatus || "";
  if (status === "PAID") return "PAID";
  const ex = exceptionKind(status);
  if (ex === "EXPIRED") return "EXPIRED";
  if (ex) return "NEEDS_ATTENTION";
  if (status === "CONFIRMING") return "CONFIRMING";
  if (status === "SEEN") return "PAYMENT_DETECTED";
  if (opts.openingWallet) return "OPENING_WALLET";
  if (status === "AWAITING_PAYMENT" || status === "CREATED") return "WAITING_FOR_PAYMENT";
  if (moneyDetected(status)) return "PAYMENT_DETECTED";
  return "READY";
}
