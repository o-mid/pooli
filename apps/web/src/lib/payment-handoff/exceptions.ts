export type PaymentExceptionKind =
  | "EXPIRED"
  | "UNDERPAID"
  | "OVERPAID"
  | "LATE_PAYMENT"
  | "NEEDS_REVIEW"
  | "DUPLICATE_PAYMENT"
  | null;

const EXCEPTION_STATUSES = new Set([
  "EXPIRED",
  "UNDERPAID",
  "OVERPAID",
  "LATE_PAYMENT",
  "NEEDS_REVIEW",
  "DUPLICATE_PAYMENT",
]);

export function exceptionKind(status?: string | null): PaymentExceptionKind {
  if (!status || !EXCEPTION_STATUSES.has(status)) return null;
  return status as PaymentExceptionKind;
}

/** Money was observed — never tell the buyer to send again immediately. */
export function moneyDetected(status?: string | null): boolean {
  return (
    status === "SEEN" ||
    status === "CONFIRMING" ||
    status === "PAID" ||
    status === "UNDERPAID" ||
    status === "OVERPAID" ||
    status === "LATE_PAYMENT" ||
    status === "NEEDS_REVIEW" ||
    status === "DUPLICATE_PAYMENT"
  );
}

export function canRefreshQuote(status?: string | null, expiresAt?: string | null): boolean {
  if (moneyDetected(status)) return false;
  if (status === "EXPIRED") return true;
  if (status === "AWAITING_PAYMENT" || status === "CREATED") {
    if (!expiresAt) return false;
    const t = new Date(expiresAt).getTime();
    return Number.isFinite(t) && t <= Date.now();
  }
  return false;
}

export function isAwaitingPayment(status?: string | null): boolean {
  return status === "AWAITING_PAYMENT" || status === "CREATED";
}
