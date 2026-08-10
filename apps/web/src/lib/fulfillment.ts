import type { Messages } from "@/i18n/messages/en";

export type FulfillmentStatus =
  | "UNFULFILLED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export function fulfillmentLabel(status: string | undefined, t: Messages): string {
  if (!status) return t.fulfillment.UNFULFILLED;
  const key = status as keyof typeof t.fulfillment;
  return t.fulfillment[key] ?? status;
}

export function canFulfill(paymentStatus: string | undefined): boolean {
  return paymentStatus === "PAID" || paymentStatus === "LATE_PAYMENT";
}
