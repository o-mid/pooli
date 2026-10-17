"use client";

import { motion, useReducedMotion } from "motion/react";
import { PaymentState } from "@/components/payments/PaymentState";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { Icons8Icon } from "@/components/icons/Icons8Icon";
import { useT } from "@/i18n/LocaleProvider";

export function CheckoutDemo({ label, className }: { label: string; className?: string }) {
  const t = useT();
  const reduce = useReducedMotion();

  return (
    <motion.figure
      className={["checkout-preview checkout-preview-ai", className].filter(Boolean).join(" ")}
      aria-label={label}
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={reduce ? undefined : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
    >
      <div className="checkout-preview-chrome">
        <Icons8Icon name="sparkles" size="sm" />
        <span className="checkout-preview-title">{t.brand}</span>
      </div>
      <div className="checkout-preview-body">
        <p className="checkout-preview-merchant muted">{t.marketing.hero.demoOrder}</p>
        <AmountDisplay primary={`125,000 ${t.checkout.toman}`} secondary="12.45 USDT" primaryClassName="mono-ltr" />
        <PaymentState intentStatus="PAID" />
      </div>
      <figcaption className="checkout-demo-label">{label}</figcaption>
    </motion.figure>
  );
}
