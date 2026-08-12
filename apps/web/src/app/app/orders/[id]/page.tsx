"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PaymentProgress } from "@/components/PaymentProgress";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { api, openSSE } from "@/lib/api";
import { checkoutFieldLabel } from "@/lib/checkoutFields";
import { canFulfill, fulfillmentLabel } from "@/lib/fulfillment";
import { buildShareText, sharePaymentLink } from "@/lib/share";
import { networkLabel } from "@/lib/address";
import { timelineLabel } from "@/lib/timeline";
import { usePaymentStatusPoll } from "@/lib/usePaymentStatusPoll";

type TimelineEvent = {
  id?: string;
  event_type: string;
  title: string;
  detail?: string;
  created_at: string;
};

type Receipt = {
  merchant?: string;
  order_title?: string;
  order_reference?: string;
  fiat_amount_toman?: number;
  usdt_amount?: string;
  received_usdt_amount?: string;
  network?: string;
  tx_hash?: string;
  explorer_url?: string;
  paid_at?: string;
};

type Order = {
  id: string;
  slug: string;
  title: string;
  fiat_amount_toman: number;
  status: string;
  fulfillment_status: string;
  shipping_provider?: string;
  tracking_number?: string;
  checkout_url: string;
  payment_intent?: {
    id: string;
    status: string;
    options?: Array<{ network: string; pay_usdt_amount: string; destination_address: string }>;
    matched_tx?: {
      tx_hash?: string;
      explorer_url?: string;
      confirmations?: number;
      required_confirmations?: number;
    };
  };
  field_values?: Array<{ key: string; label: string; value: string }>;
  timeline?: TimelineEvent[];
  receipt?: Receipt | null;
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const t = useT();
  const { locale } = useLocale();
  const { showToast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [carrier, setCarrier] = useState("Iran Post");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setOrder(await api<Order>(`/api/v1/orders/${params.id}`));
  }

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    const intentID = order?.payment_intent?.id;
    if (!intentID) return;
    const es = openSSE(`/api/v1/merchant/events`, () => {
      load().catch(() => undefined);
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.payment_intent?.id]);

  const intent = order?.payment_intent;
  const status = intent?.status || order?.status;
  usePaymentStatusPoll(status, () => load().catch(() => undefined));

  if (!order) {
    return (
      <div className="rise page-stack">
        <Skeleton height="1.75rem" width="40%" />
        <Skeleton height="3rem" width="100%" />
        <Skeleton height="12rem" width="100%" />
      </div>
    );
  }

  const matched = intent?.matched_tx;
  const displayStatus = status || order.status;
  const paid = canFulfill(displayStatus);

  async function copyLink() {
    if (!order) return;
    await navigator.clipboard.writeText(order.checkout_url);
    showToast(t.common.copied);
  }

  async function share() {
    if (!order) return;
    const text = buildShareText({
      title: order.title,
      amountToman: order.fiat_amount_toman,
      tomanLabel: t.checkout.toman,
      completeLabel: t.create.completeOrder,
      url: order.checkout_url,
    });
    const outcome = await sharePaymentLink({ title: order.title || t.brand, text, url: order.checkout_url });
    if (outcome === "copied") showToast(t.common.copied);
  }

  async function setFulfillment(next: string, extra?: { shipping_provider?: string; tracking_number?: string }) {
    if (!order) return;
    setBusy(true);
    try {
      const res = await api<Order>(`/api/v1/orders/${order.id}/fulfillment`, {
        method: "PATCH",
        body: JSON.stringify({
          fulfillment_status: next,
          ...extra,
        }),
      });
      setOrder(res);
      setShipOpen(false);
      showToast(t.common.saved);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function confirmShip(e: FormEvent) {
    e.preventDefault();
    await setFulfillment("SHIPPED", {
      shipping_provider: carrier.trim(),
      tracking_number: tracking.trim(),
    });
  }

  function fmtWhen(iso: string) {
    try {
      return new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
    } catch {
      return iso;
    }
  }

  return (
    <div className="rise page-stack">
      <BackLink href="/app/orders" />
      <PageHeader title={order.title || t.checkout.orderRef} />

      <div className="card-panel">
        {displayStatus === "PAID" ? (
          <strong style={{ fontSize: "var(--text-title3)" }}>
            {(order.field_values?.find((f) => f.key === "full_name")?.value || "").trim()
              ? `${order.field_values?.find((f) => f.key === "full_name")?.value} ${t.orders.paidCheck}`
              : t.orders.paidCheck}
          </strong>
        ) : (
          <StatusBadge status={displayStatus} t={t} />
        )}

        {order.field_values?.find((f) => f.key === "full_name")?.value && displayStatus !== "PAID" ? (
          <p style={{ margin: "var(--space-2) 0 0", fontWeight: 650 }}>
            {order.field_values.find((f) => f.key === "full_name")?.value}
          </p>
        ) : null}

        <div style={{ marginTop: "var(--space-3)" }}>
          <AmountDisplay primary={`${order.fiat_amount_toman.toLocaleString()} ${t.checkout.toman}`} />
        </div>

        {displayStatus !== "PAID" ? (
          <div className="cta-stack" style={{ marginTop: "var(--space-4)" }}>
            <button className="btn btn-primary" onClick={share}>
              {t.create.share}
            </button>
            <button className="quiet-link" type="button" onClick={copyLink} style={{ background: "none", border: 0 }}>
              {t.create.copyLink}
            </button>
          </div>
        ) : null}

        <details className="details-block">
          <summary>{t.checkout.paymentDetails}</summary>
          <PaymentProgress
            status={displayStatus}
            network={matched?.tx_hash ? intent?.options?.[0]?.network : undefined}
            confirmations={matched?.confirmations}
            requiredConfirmations={matched?.required_confirmations}
            txHash={matched?.tx_hash}
            explorerUrl={matched?.explorer_url}
            compact
          />
          {intent?.options?.[0] ? (
            <p className="muted" style={{ marginTop: "var(--space-3)" }}>
              {intent.options[0].pay_usdt_amount} {t.receipt.usdt} ·{" "}
              {networkLabel(intent.options[0].network || "", t.wallets.tron, t.wallets.bsc)}
            </p>
          ) : null}
          <p className="mono-ltr muted" style={{ fontSize: "var(--text-footnote)", marginTop: "var(--space-3)" }}>
            {order.checkout_url}
          </p>
          <div className="qr-card" style={{ marginTop: "var(--space-3)", border: 0, padding: 0 }}>
            <div className="qr-frame">
              <QRCodeSVG value={order.checkout_url} size={140} bgColor="#ffffff" fgColor="#0b1f1a" />
            </div>
          </div>
        </details>
      </div>

      {order.receipt ? (
        <ReceiptCard
          storeName={order.receipt.merchant}
          title={order.receipt.order_title || order.title}
          fiatAmountToman={order.fiat_amount_toman}
          receipt={{
            merchant: order.receipt.merchant,
            order_title: order.receipt.order_title || order.title,
            order_reference: order.receipt.order_reference || order.slug,
            fiat_amount_toman: order.fiat_amount_toman,
            usdt_amount: order.receipt.usdt_amount,
            network: order.receipt.network,
            tx_hash: order.receipt.tx_hash,
            explorer_url: order.receipt.explorer_url,
          }}
        />
      ) : null}

      {paid && order.fulfillment_status !== "DELIVERED" && order.fulfillment_status !== "CANCELLED" ? (
        <section className="section">
          <h2 className="section-title">{t.orders.order}</h2>
          {!shipOpen ? (
            <div className="cta-stack">
              {order.fulfillment_status === "UNFULFILLED" ? (
                <button className="btn btn-secondary" disabled={busy} onClick={() => setFulfillment("PROCESSING")}>
                  {t.fulfillment.markProcessing}
                </button>
              ) : null}
              <button className="btn btn-primary" disabled={busy} onClick={() => setShipOpen(true)}>
                {t.fulfillment.markShipped}
              </button>
              {order.fulfillment_status === "SHIPPED" ? (
                <button className="btn btn-secondary" disabled={busy} onClick={() => setFulfillment("DELIVERED")}>
                  {t.fulfillment.markDelivered}
                </button>
              ) : null}
            </div>
          ) : (
            <form className="card-panel" onSubmit={confirmShip}>
              <h3 style={{ margin: 0, fontSize: "var(--text-headline)" }}>{t.fulfillment.shipTitle}</h3>
              <div className="field" style={{ marginTop: "var(--space-3)" }}>
                <label htmlFor="carrier">{t.fulfillment.carrier}</label>
                <input id="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="tracking">{t.fulfillment.tracking}</label>
                <input
                  id="tracking"
                  className="mono-ltr"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="12345678901234567890"
                />
              </div>
              <div className="cta-stack">
                <button className="btn btn-primary" disabled={busy}>
                  {t.fulfillment.confirmShip}
                </button>
                <button className="btn btn-tertiary" type="button" onClick={() => setShipOpen(false)}>
                  {t.common.back}
                </button>
              </div>
            </form>
          )}
          {order.tracking_number ? (
            <p className="mono-ltr muted" style={{ marginTop: "var(--space-3)" }}>
              {order.shipping_provider} · {order.tracking_number}
            </p>
          ) : null}
        </section>
      ) : null}

      {order.field_values && order.field_values.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t.checkout.customerInfo}</h2>
          <div className="list-group">
            {order.field_values.map((f) => (
              <div key={f.key} className="list-row" style={{ cursor: "default" }}>
                <div className="list-row-body">
                  <div className="list-row-meta">{checkoutFieldLabel(f.key, t, f.label)}</div>
                  <div className="list-row-title">{f.value}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {order.timeline && order.timeline.length > 0 ? (
        <details className="details-block">
          <summary>{t.timeline.title}</summary>
          <ol className="timeline-list">
            {order.timeline.map((e, i) => (
              <li key={e.id || `${e.event_type}-${i}`}>
                <div className="timeline-title">{timelineLabel(e.event_type, t, e.title)}</div>
                {e.detail ? <div className="timeline-detail">{e.detail}</div> : null}
                <div className="timeline-when muted">{fmtWhen(e.created_at)}</div>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
