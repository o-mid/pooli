"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PaymentProgress } from "@/components/PaymentProgress";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useT } from "@/i18n/LocaleProvider";
import { api, openSSE } from "@/lib/api";
import { usePaymentStatusPoll } from "@/lib/usePaymentStatusPoll";

type PaymentOption = {
  network: string;
  destination_address: string;
  pay_usdt_amount: string;
  payment_uri?: string;
  explorer_base?: string;
};

type PaymentIntent = {
  id: string;
  status: string;
  options?: PaymentOption[];
  matched_tx?: {
    tx_hash?: string;
    explorer_url?: string;
    confirmations?: number;
    required_confirmations?: number;
  };
};

type Order = {
  id: string;
  slug: string;
  title: string;
  fiat_amount_toman: number;
  status: string;
  checkout_url: string;
  payment_intent?: PaymentIntent;
  field_values?: Array<{ key: string; label: string; value: string }>;
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const t = useT();
  const [order, setOrder] = useState<Order | null>(null);
  const [copied, setCopied] = useState(false);

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

  if (!order) return <p className="muted">{t.common.loading}</p>;

  const matched = intent?.matched_tx;
  const displayStatus = status || order.status;

  async function copyLink() {
    if (!order) return;
    await navigator.clipboard.writeText(order.checkout_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rise page-stack">
      <PageHeader
        title={order.title || t.checkout.orderRef}
        trailing={<StatusBadge status={displayStatus} t={t} />}
      />

      <Link href="/app/orders" className="btn btn-tertiary" style={{ alignSelf: "flex-start", width: "auto" }}>
        {t.common.back}
      </Link>

      <div className="card-panel">
        <AmountDisplay
          primary={`${order.fiat_amount_toman.toLocaleString()} ${t.checkout.toman}`}
        />

        <PaymentProgress
          status={displayStatus}
          confirmations={matched?.confirmations}
          requiredConfirmations={matched?.required_confirmations}
          txHash={matched?.tx_hash}
          explorerUrl={matched?.explorer_url}
        />

        <p className="mono-ltr muted" style={{ fontSize: "var(--text-footnote)", marginTop: "var(--space-4)" }}>
          {order.checkout_url}
        </p>
        <div className="qr-card" style={{ marginTop: "var(--space-3)", border: 0, padding: 0 }}>
          <div className="qr-frame">
            <QRCodeSVG value={order.checkout_url} size={160} bgColor="#ffffff" fgColor="#0b1f1a" />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: "var(--space-3)" }} onClick={copyLink}>
          {copied ? t.common.copied : t.create.copyLink}
        </button>
      </div>

      {order.field_values && order.field_values.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t.checkout.customerInfo}</h2>
          <div className="list-group">
            {order.field_values.map((f) => (
              <div key={f.key} className="list-row" style={{ cursor: "default" }}>
                <div className="list-row-body">
                  <div className="list-row-meta">{f.label}</div>
                  <div className="list-row-title">{f.value}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
