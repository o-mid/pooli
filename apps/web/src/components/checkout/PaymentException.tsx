"use client";

import { useT } from "@/i18n/LocaleProvider";
import type { PaymentExceptionKind } from "@/lib/payment-handoff";

export function PaymentException({
  kind,
  expectedAmount,
  receivedAmount,
  asset = "USDT",
  onRefresh,
  refreshing,
}: {
  kind: PaymentExceptionKind;
  expectedAmount?: string;
  receivedAmount?: string;
  asset?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const t = useT();
  if (!kind) return null;

  if (kind === "EXPIRED") {
    return (
      <section className="card-panel" role="alert">
        <p style={{ margin: 0, fontWeight: 650 }}>{t.checkout.exception.expiredTitle}</p>
        <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
          {t.checkout.exception.expiredBody}
        </p>
        {onRefresh ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: "var(--space-4)" }}
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? t.common.loading : t.checkout.refreshAmount}
          </button>
        ) : null}
      </section>
    );
  }

  if (kind === "UNDERPAID") {
    return (
      <section className="card-panel" role="alert">
        <p style={{ margin: 0, fontWeight: 650 }}>{t.checkout.exception.underpaidTitle}</p>
        <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
          {t.checkout.exception.underpaidBody}
        </p>
        <dl className="pay-kv" style={{ marginTop: "var(--space-3)" }}>
          <div>
            <dt>{t.checkout.exception.expected}</dt>
            <dd className="mono-ltr tabular">
              {expectedAmount} {asset}
            </dd>
          </div>
          <div>
            <dt>{t.checkout.exception.received}</dt>
            <dd className="mono-ltr tabular">
              {receivedAmount || "—"} {asset}
            </dd>
          </div>
        </dl>
        <p className="alert alert-warning" style={{ marginTop: "var(--space-3)" }}>
          {t.checkout.exception.dontSendAgain}
        </p>
        <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
          {t.common.moneySafe}
        </p>
      </section>
    );
  }

  if (kind === "OVERPAID") {
    return (
      <section className="card-panel" role="alert">
        <p style={{ margin: 0, fontWeight: 650 }}>{t.checkout.exception.overpaidTitle}</p>
        <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
          {t.checkout.exception.overpaidBody}
        </p>
        <p className="alert alert-warning" style={{ marginTop: "var(--space-3)" }}>
          {t.checkout.exception.dontSendAgain}
        </p>
        <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
          {t.common.moneySafe}
        </p>
      </section>
    );
  }

  if (kind === "LATE_PAYMENT") {
    return (
      <section className="card-panel" role="alert">
        <p style={{ margin: 0, fontWeight: 650 }}>{t.checkout.exception.lateTitle}</p>
        <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
          {t.checkout.exception.lateBody}
        </p>
        <p className="alert alert-warning" style={{ marginTop: "var(--space-3)" }}>
          {t.checkout.exception.dontSendAgain}
        </p>
        <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
          {t.common.moneySafe}
        </p>
      </section>
    );
  }

  if (kind === "NEEDS_REVIEW" || kind === "DUPLICATE_PAYMENT") {
    return (
      <section className="card-panel" role="alert">
        <p style={{ margin: 0, fontWeight: 650 }}>{t.checkout.exception.reviewTitle}</p>
        <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
          {t.checkout.exception.reviewBody}
        </p>
        <p className="alert alert-warning" style={{ marginTop: "var(--space-3)" }}>
          {t.checkout.exception.dontSendAgain}
        </p>
        <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
          {t.common.moneySafe}
        </p>
      </section>
    );
  }

  return null;
}
