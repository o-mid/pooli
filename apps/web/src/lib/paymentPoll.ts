/** Statuses that should keep polling the API for chain-driven updates. */
export const POLL_STATUSES = new Set([
  "CREATED",
  "AWAITING_PAYMENT",
  "SEEN",
  "CONFIRMING",
]);

/** Terminal / review statuses: stop aggressive polling. */
export const STOP_POLL_STATUSES = new Set([
  "PAID",
  "EXPIRED",
  "CANCELLED",
  "NEEDS_REVIEW",
  "UNDERPAID",
  "OVERPAID",
  "LATE_PAYMENT",
  "DUPLICATE_PAYMENT",
]);

export function shouldPollPaymentStatus(status: string | undefined | null): boolean {
  if (!status) return true;
  if (STOP_POLL_STATUSES.has(status)) return false;
  return POLL_STATUSES.has(status);
}

/** Interval grows from 2s toward 5s as attempts increase. */
export function pollIntervalMs(attempt: number): number {
  if (attempt <= 5) return 2000;
  if (attempt <= 20) return 3000;
  return 5000;
}
