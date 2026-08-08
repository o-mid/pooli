"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useT } from "@/i18n/LocaleProvider";
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
    <div className="rise page-stack">
      <PageHeader title={t.orders.title} />

      {loading && <p className="muted">{t.common.loading}</p>}

      {!loading && orders.length > 0 && (
        <div className="list-group">
          {orders.map((o) => (
            <Link key={o.id} href={`/app/orders/${o.id}`} className="list-row">
              <div className="list-row-body">
                <div className="list-row-title">{o.title || o.slug}</div>
                <div className="list-row-meta tabular">
                  {o.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
                </div>
              </div>
              <div className="list-row-trailing">
                <StatusBadge status={o.payment_status} t={t} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && !orders.length && (
        <EmptyState
          action={
            <Link className="btn btn-secondary" href="/app/create">
              {t.home.newOrder}
            </Link>
          }
        >
          <p>{t.orders.empty}</p>
        </EmptyState>
      )}
    </div>
  );
}
