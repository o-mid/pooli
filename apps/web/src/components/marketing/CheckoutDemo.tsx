"use client";

import { PaymentState } from "@/components/payments/PaymentState";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { useT } from "@/i18n/LocaleProvider";

export function CheckoutDemo({ label }: { label: string }) {
  const t = useT();
  const trail = [
    t.checkout.progress.requested,
    t.checkout.progress.detected,
    t.checkout.progress.confirming,
    t.checkout.progress.complete,
  ];

  return (
    <figure className="story-phone" aria-label={label}>
      <div className="story-phone-screen">
        <AmountDisplay
          primary={`125,000 ${t.checkout.toman}`}
          secondary="12.45 USDT"
        />
        <PaymentState intentStatus="PAID" />
      </div>
      <ol className="story-trail">
        {trail.map((item, i) => (
          <li key={item} className={i === trail.length - 1 ? "is-current" : undefined}>
            {item}
          </li>
        ))}
      </ol>
      <figcaption className="checkout-demo-label">{label}</figcaption>
    </figure>
  );
}
