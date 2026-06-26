"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PaymentProgress } from "@/components/PaymentProgress";
import { useT } from "@/i18n/LocaleProvider";
import { api, openSSE } from "@/lib/api";
import { orderStatusLabel } from "@/lib/orderStatus";

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

  if (!order) return <p className="muted">{t.common.loading}</p>;

  const intent = order.payment_intent;
  const status = intent?.status || order.status;
  const matched = intent?.matched_tx;

  async function copyLink() {
    if (!order) return;
    await navigator.clipboard.writeText(order.checkout_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>{order.title || t.checkout.orderRef}</h1>

      <div className="card-panel">
        <p className="tabular" style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
          {order.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
        </p>
        <p className="muted">{orderStatusLabel(status, t)}</p>

        <PaymentProgress
          status={status}
          confirmations={matched?.confirmations}
          requiredConfirmations={matched?.required_confirmations}
          txHash={matched?.tx_hash}
          explorerUrl={matched?.explorer_url}
        />

        <p className="mono-ltr muted" style={{ fontSize: "0.85rem", marginTop: "1rem" }}>
          {order.checkout_url}
        </p>
        <div style={{ display: "flex", justifyContent: "center", margin: "1rem 0" }}>
          <QRCodeSVG value={order.checkout_url} size={160} bgColor="#ffffff" fgColor="#0b1f1a" />
        </div>
        <button className="btn btn-primary" onClick={copyLink}>
          {copied ? t.common.copied : t.create.copyLink}
        </button>
      </div>

      {order.field_values && order.field_values.length > 0 && (
        <div className="card-panel" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>{t.checkout.customerInfo}</h3>
          {order.field_values.map((f) => (
            <div key={f.key} style={{ marginBottom: "0.5rem" }}>
              <div className="muted">{f.label}</div>
              <div>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
