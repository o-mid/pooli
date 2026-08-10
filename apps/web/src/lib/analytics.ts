/**
 * Privacy-safe friction analytics. No PII, no full addresses/hashes.
 * No external dependency — safe no-op sink with optional window hook.
 */

export type AnalyticsEvent =
  | "checkout_opened"
  | "network_selected"
  | "pay_with_wallet_clicked"
  | "wallet_selected"
  | "wallet_handoff_attempted"
  | "wallet_handoff_failed"
  | "qr_opened"
  | "payment_details_copied"
  | "amount_copied"
  | "address_copied"
  | "payment_detected"
  | "payment_confirmed"
  | "payment_exception"
  | "quote_refreshed";

export type AnalyticsProps = Record<string, string | number | boolean | undefined | null>;

type Sink = (event: AnalyticsEvent, props?: AnalyticsProps) => void;

let sink: Sink | null = null;

export function setAnalyticsSink(fn: Sink | null): void {
  sink = fn;
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  const clean: AnalyticsProps = {};
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue;
      // Never forward obvious PII / secrets / full chain identifiers.
      if (/address|hash|phone|email|name|customer/i.test(k)) continue;
      clean[k] = v;
    }
  }
  try {
    if (sink) {
      sink(event, clean);
      return;
    }
    if (typeof window !== "undefined") {
      const w = window as Window & { pooliAnalytics?: Sink };
      if (typeof w.pooliAnalytics === "function") {
        w.pooliAnalytics(event, clean);
      }
    }
  } catch {
    // never break checkout on analytics
  }
}
