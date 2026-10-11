"use client";

import { PaymentState } from "@/components/payments/PaymentState";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { useT } from "@/i18n/LocaleProvider";

export function CheckoutDemo({ label, className }: { label: string; className?: string }) {
  const t = useT();
  const trail = [
    t.checkout.progress.requested,
    t.checkout.progress.detected,
    t.checkout.progress.confirming,
    t.checkout.progress.complete,
  ];

  return (
    <figure className={["story-phone", className].filter(Boolean).join(" ")} aria-label={label}>
      <div className="story-phone-screen">
        <AmountDisplay
          primary="12.45 USDT"
          secondary={`≈ 125,000 ${t.checkout.toman}`}
          primaryClassName="mono-ltr"
        />
        <PaymentState intentStatus="PAID" />
      </div>
      <p className="story-trail-summary mono-ltr" aria-hidden="true">
        {trail.join(" · ")}
      </p>
      <figcaption className="checkout-demo-label">{label}</figcaption>
    </figure>
  );
}
