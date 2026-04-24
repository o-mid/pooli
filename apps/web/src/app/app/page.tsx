"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, openSSE } from "@/lib/api";

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

export default function HomePage() {
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setData(await api<Home>("/api/v1/home"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    }
  }

  useEffect(() => {
    load();
    const es = openSSE("/api/v1/merchant/events", () => {
      load();
    });
    return () => es.close();
  }, []);

  if (error) {
    return (
      <div className="rise">
        <p style={{ color: "var(--danger)" }}>{error}</p>
        <Link href="/login">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="rise">
      <p className="brand" style={{ fontSize: "1.6rem", marginBottom: 0 }}>
        Pooli
      </p>
      <p className="muted" style={{ marginTop: "0.25rem" }}>
        Today’s desk
      </p>
      <Link className="btn btn-primary" href="/app/create" style={{ margin: "1rem 0" }}>
        New Order / Request Payment
      </Link>
      <div className="card-panel" style={{ display: "grid", gap: "0.75rem" }}>
        <Stat label="Paid today" value={String(data?.today_paid_orders ?? "—")} />
        <Stat label="Toman volume" value={data ? data.today_toman_volume.toLocaleString() : "—"} />
        <Stat label="USDT received" value={data?.today_usdt_received ?? "—"} />
        <Stat label="Pending" value={String(data?.pending_payments ?? "—")} />
      </div>
      <h2 style={{ marginTop: "1.5rem", fontSize: "1.1rem" }}>Recent orders</h2>
      <div style={{ display: "grid", gap: "0.65rem" }}>
        {(data?.recent_orders || []).map((o) => (
          <Link key={o.id} href={`/app/orders/${o.id}`} className="card-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <strong>{o.title || "Payment request"}</strong>
              <span className="muted">{o.status}</span>
            </div>
            <div className="muted">{o.fiat_amount_toman.toLocaleString()} TMN</div>
          </Link>
        ))}
        {!data?.recent_orders?.length && <p className="muted">No orders yet.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
