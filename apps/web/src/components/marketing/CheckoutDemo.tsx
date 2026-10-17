"use client";

import { PaymentState } from "@/components/payments/PaymentState";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { useT } from "@/i18n/LocaleProvider";

export function CheckoutDemo({ label, className }: { label: string; className?: string }) {
  const t = useT();

  return (
    <figure
      className={["checkout-preview", className].filter(Boolean).join(" ")}
      aria-label={label}
    >
      <div className="checkout-preview-chrome">
        <span className="checkout-preview-dot" aria-hidden="true" />
        <span className="checkout-preview-title">{t.brand}</span>
      </div>
      <div className="checkout-preview-body">
        <p className="checkout-preview-merchant muted">{t.marketing.hero.demoOrder}</p>
        <AmountDisplay primary={`125,000 ${t.checkout.toman}`} secondary="12.45 USDT" primaryClassName="mono-ltr" />
        <PaymentState intentStatus="PAID" />
      </div>
      <figcaption className="checkout-demo-label">{label}</figcaption>
    </figure>
  );
}
