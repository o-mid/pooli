"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Order = {
  id: string;
  slug: string;
  title: string;
  fiat_amount_toman: number;
  payment_status: string;
  checkout_url: string;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    api<{ orders: Order[] }>("/api/v1/orders").then((d) => setOrders(d.orders)).catch(() => undefined);
  }, []);

  return (
    <div className="rise">
      <h1>Orders</h1>
      <div style={{ display: "grid", gap: "0.65rem" }}>
        {orders.map((o) => (
          <Link key={o.id} href={`/app/orders/${o.id}`} className="card-panel">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{o.title || o.slug}</strong>
              <span className="muted">{o.payment_status}</span>
            </div>
            <div>{o.fiat_amount_toman.toLocaleString()} TMN</div>
          </Link>
        ))}
        {!orders.length && <p className="muted">No orders yet.</p>}
      </div>
    </div>
  );
}
