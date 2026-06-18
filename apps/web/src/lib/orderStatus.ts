import type { Messages } from "@/i18n/messages/en";

const ATTENTION = new Set([
  "NEEDS_REVIEW",
  "UNDERPAID",
  "OVERPAID",
  "LATE_PAYMENT",
  "DUPLICATE_PAYMENT",
]);

export function orderStatusLabel(status: string, t: Messages): string {
  const key = status as keyof typeof t.orders.status;
  return t.orders.status[key] ?? status;
}

export function needsAttention(status: string): boolean {
  return ATTENTION.has(status);
}
