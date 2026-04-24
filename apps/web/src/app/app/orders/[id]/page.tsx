"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, openSSE } from "@/lib/api";

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);

  async function load() {
    setOrder(await api(`/api/v1/orders/${params.id}`));
  }

  useEffect(() => {
    load().catch(() => undefined);
    // intentionally refetch when route id changes
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

  if (!order) return <p className="muted">Loading…</p>;

  return (
    <div className="rise">
      <h1>{order.title || "Order"}</h1>
      <div className="card-panel">
        <p>
          <strong>{order.fiat_amount_toman.toLocaleString()}</strong> TMN
        </p>
        <p className="muted">Status: {order.payment_intent?.status || order.status}</p>
        <p style={{ wordBreak: "break-all" }}>{order.checkout_url}</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "1rem 0" }}>
          <QRCodeSVG value={order.checkout_url} size={160} bgColor="transparent" fgColor="#f3f7f4" />
        </div>
        <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(order.checkout_url)}>
          Copy Link
        </button>
      </div>
      {order.field_values?.length > 0 && (
        <div className="card-panel" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Customer</h3>
          {order.field_values.map((f: any) => (
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
