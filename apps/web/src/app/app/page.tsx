"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { api, openSSE } from "@/lib/api";
import { needsAttention, orderStatusLabel } from "@/lib/orderStatus";

type Home = {
  today_paid_orders: number;
  today_toman_volume: number;
  today_usdt_received: string;
  pending_payments: number;
  recent_orders: Array<{
    id: string;
    slug: string;
    title: string;
    fiat_amount_toman: number;
    status: string;
  }>;
};

type OrderRow = {
  id: string;
  payment_status: string;
};

export default function HomePage() {
  const t = useT();
  const [data, setData] = useState<Home | null>(null);
  const [attention, setAttention] = useState(0);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [home, ordersRes] = await Promise.all([
        api<Home>("/api/v1/home"),
        api<{ orders: OrderRow[] }>("/api/v1/orders").catch(() => ({ orders: [] as OrderRow[] })),
      ]);
      setData(home);
      setAttention(ordersRes.orders.filter((o) => needsAttention(o.payment_status)).length);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  useEffect(() => {
    load();
    const es = openSSE("/api/v1/merchant/events", () => {
      load();
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && !data) {
    return (
      <div className="rise">
        <p style={{ color: "var(--danger)" }}>{error}</p>
        <Link href="/login">{t.login}</Link>
      </div>
    );
  }

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0, fontSize: "1.5rem" }}>{t.home.title}</h1>

      <Link className="btn btn-primary" href="/app/create" style={{ margin: "1rem 0" }}>
        {t.home.newOrder}
      </Link>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">{t.home.paidToday}</div>
          <div className="value tabular">{data?.today_paid_orders ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="label">{t.home.tomanVolume}</div>
          <div className="value tabular">{data ? data.today_toman_volume.toLocaleString() : "—"}</div>
        </div>
        <div className="stat">
          <div className="label">{t.home.usdtReceived}</div>
          <div className="value tabular">{data?.today_usdt_received ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="label">{t.home.pending}</div>
          <div className="value tabular">{data?.pending_payments ?? "—"}</div>
        </div>
        <div className="stat" style={{ gridColumn: "1 / -1" }}>
          <div className="label">{t.home.attention}</div>
          <div className="value tabular" style={{ color: attention > 0 ? "var(--warning)" : undefined }}>
            {data ? attention : "—"}
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: "1.5rem", fontSize: "1.1rem" }}>{t.home.recent}</h2>
      <div style={{ display: "grid", gap: "0.65rem" }}>
        {(data?.recent_orders || []).map((o) => (
          <Link key={o.id} href={`/app/orders/${o.id}`} className="card-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <strong>{o.title || o.slug}</strong>
              <span className="muted">{orderStatusLabel(o.status, t)}</span>
            </div>
            <div className="muted tabular">
              {o.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
            </div>
          </Link>
        ))}
        {!data?.recent_orders?.length && <p className="muted">{t.home.empty}</p>}
      </div>
    </div>
  );
}
