import type { Messages } from "@/i18n/messages/en";

export function checkoutFieldLabel(key: string, t: Messages, fallback?: string): string {
  switch (key) {
    case "full_name":
      return t.settings.fieldFullName;
    case "phone":
      return t.settings.fieldPhone;
    case "shipping_address":
      return t.settings.fieldShipping;
    case "postal_code":
      return t.settings.fieldPostal;
    case "email":
      return t.settings.fieldEmail;
    case "customer_note":
      return t.settings.fieldNote;
    default:
      return fallback?.trim() || key;
  }
}
