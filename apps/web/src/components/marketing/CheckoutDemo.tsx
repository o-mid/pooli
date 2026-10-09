"use client";

import { PaymentState } from "@/components/payments/PaymentState";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { useT } from "@/i18n/LocaleProvider";

const SAMPLE_STATUSES = ["AWAITING_PAYMENT", "SEEN", "CONFIRMING", "PAID"] as const;

export function CheckoutDemo({ label }: { label: string }) {
  const t = useT();
  return (
    <figure className="checkout-demo" aria-label={label}>
      <figcaption className="checkout-demo-label">{label}</figcaption>
      <div className="checkout-demo-card">
        <AmountDisplay
          primary={`125,000 ${t.checkout.toman}`}
          secondary="12.45 USDT"
        />
        <div className="checkout-demo-states">
          {SAMPLE_STATUSES.map((status) => (
            <div key={status} className="checkout-demo-state">
              <PaymentState intentStatus={status} confirmations={2} requiredConfirmations={12} />
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
