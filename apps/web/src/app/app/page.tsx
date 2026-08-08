"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useT } from "@/i18n/LocaleProvider";
import { api, openSSE } from "@/lib/api";
import { needsAttention } from "@/lib/orderStatus";

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
      <div className="rise page-stack">
        <p className="field-error" role="alert">
          {error}
        </p>
        <Link href="/login">{t.login}</Link>
      </div>
    );
  }

  const recent = data?.recent_orders || [];

  return (
    <div className="rise page-stack">
      <PageHeader title={t.home.title} />

      <Link className="btn btn-primary" href="/app/create">
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
        <div className={`stat wide${attention > 0 ? " attention" : ""}`}>
          <div className="label">{t.home.attention}</div>
          <div className="value tabular">{data ? attention : "—"}</div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">{t.home.recent}</h2>
        {recent.length > 0 ? (
          <div className="list-group">
            {recent.map((o) => (
              <Link key={o.id} href={`/app/orders/${o.id}`} className="list-row">
                <div className="list-row-body">
                  <div className="list-row-title">{o.title || o.slug}</div>
                  <div className="list-row-meta tabular">
                    {o.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
                  </div>
                </div>
                <div className="list-row-trailing">
                  <StatusBadge status={o.status} t={t} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <Link className="btn btn-secondary" href="/app/create">
                {t.home.newOrder}
              </Link>
            }
          >
            <p>{t.home.empty}</p>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
