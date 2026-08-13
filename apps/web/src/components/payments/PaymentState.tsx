"use client";

import { useT } from "@/i18n/LocaleProvider";
import { exceptionKind } from "@/lib/payment-handoff/exceptions";
import { resolvePaymentUiState, type PaymentUiState } from "@/lib/paymentUiState";

export function PaymentState({
  intentStatus,
  openingWallet,
  offline,
  confirmations,
  requiredConfirmations,
}: {
  intentStatus?: string | null;
  openingWallet?: boolean;
  offline?: boolean;
  confirmations?: number | null;
  requiredConfirmations?: number | null;
}) {
  const t = useT();
  const ui = resolvePaymentUiState({ intentStatus, openingWallet, offline });
  const copy = copyFor(ui, t, intentStatus);
  const conf =
    (ui === "CONFIRMING" || ui === "PAYMENT_DETECTED") &&
    typeof confirmations === "number" &&
    typeof requiredConfirmations === "number"
      ? t.checkout.progress.confirmations
          .replace("{current}", String(confirmations))
          .replace("{required}", String(requiredConfirmations))
      : null;

  return (
    <section className={`payment-state payment-state-${ui.toLowerCase()}`} aria-live="polite" aria-atomic="true">
      <p className="payment-state-title">{copy.title}</p>
      {copy.body ? <p className="payment-state-body">{copy.body}</p> : null}
      {conf ? <p className="payment-state-meta tabular">{conf}</p> : null}
    </section>
  );
}

function copyFor(
  ui: PaymentUiState,
  t: ReturnType<typeof useT>,
  intentStatus?: string | null,
): { title: string; body?: string } {
  switch (ui) {
    case "OPENING_WALLET":
      return { title: t.checkout.openingWallet };
    case "WAITING_FOR_PAYMENT":
    case "READY":
      return { title: t.checkout.waitingTitle, body: t.checkout.waitingBody };
    case "PAYMENT_DETECTED":
      return { title: t.checkout.paymentDetected, body: t.checkout.detectedBody };
    case "CONFIRMING":
      return { title: t.checkout.progress.confirming, body: t.checkout.confirmingBody };
    case "PAID":
      return { title: t.orders.paidCheck };
    case "EXPIRED":
      return { title: t.checkout.exception.expiredTitle, body: t.checkout.exception.expiredBody };
    case "NEEDS_ATTENTION": {
      const kind = exceptionKind(intentStatus);
      if (kind === "UNDERPAID") return { title: t.checkout.exception.underpaidTitle, body: t.checkout.exception.underpaidBody };
      if (kind === "OVERPAID") return { title: t.checkout.exception.overpaidTitle, body: t.checkout.exception.overpaidBody };
      if (kind === "LATE_PAYMENT") return { title: t.checkout.exception.lateTitle, body: t.checkout.exception.lateBody };
      return { title: t.checkout.exception.reviewTitle, body: t.checkout.exception.reviewBody };
    }
    case "OFFLINE":
      return { title: t.common.offline, body: t.common.reconnect };
    default:
      return { title: t.checkout.waitingTitle };
  }
}
