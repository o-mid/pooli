"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { orderStatusLabel } from "@/lib/orderStatus";

type Order = {
  id: string;
  slug: string;
  title: string;
  fiat_amount_toman: number;
  payment_status: string;
  checkout_url: string;
};

export default function OrdersPage() {
  const t = useT();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ orders: Order[] }>("/api/v1/orders")
      .then((d) => setOrders(d.orders))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>{t.orders.title}</h1>
      {loading && <p className="muted">{t.common.loading}</p>}
      <div style={{ display: "grid", gap: "0.65rem" }}>
        {orders.map((o) => (
          <Link key={o.id} href={`/app/orders/${o.id}`} className="card-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <strong>{o.title || o.slug}</strong>
              <span className="muted">{orderStatusLabel(o.payment_status, t)}</span>
            </div>
            <div className="tabular">
              {o.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
            </div>
          </Link>
        ))}
        {!loading && !orders.length && <p className="muted">{t.orders.empty}</p>}
      </div>
    </div>
  );
}
