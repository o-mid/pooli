export type PaymentStatus =
  | "CREATED"
  | "AWAITING_PAYMENT"
  | "SEEN"
  | "CONFIRMING"
  | "PAID"
  | "EXPIRED"
  | "UNDERPAID"
  | "OVERPAID"
  | "LATE_PAYMENT"
  | "NEEDS_REVIEW"
  | "DUPLICATE_PAYMENT";

export type Network = "tron" | "bsc";

export type FieldType = "text" | "phone" | "email" | "textarea" | "select";

export interface CheckoutField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
}
