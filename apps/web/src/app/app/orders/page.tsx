"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { fulfillmentLabel } from "@/lib/fulfillment";

type Order = {
  id: string;
  slug: string;
  title: string;
  fiat_amount_toman: number;
  payment_status: string;
  fulfillment_status?: string;
  customer_name?: string;
  checkout_url: string;
};

function OrdersContent() {
  const t = useT();
  const router = useRouter();
  const search = useSearchParams();
  const filter = search.get("filter") === "attention" ? "attention" : "all";
  const [q, setQ] = useState(search.get("q") || "");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter === "attention") params.set("filter", "attention");
      if (q.trim()) params.set("q", q.trim());
      const qs = params.toString();
      api<{ orders: Order[] }>(`/api/v1/orders${qs ? `?${qs}` : ""}`)
        .then((d) => setOrders(d.orders))
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [filter, q]);

  function setFilter(next: "all" | "attention") {
    const params = new URLSearchParams();
    if (next === "attention") params.set("filter", "attention");
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    router.replace(qs ? `/app/orders?${qs}` : "/app/orders");
  }

  return (
    <div className="rise page-stack">
      <PageHeader title={t.orders.title} />

      <div className="field" style={{ margin: 0 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.orders.searchPlaceholder}
          autoComplete="off"
        />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`filter-chip${filter === "all" ? " active" : ""}`}
          onClick={() => setFilter("all")}
        >
          {t.orders.filterAll}
        </button>
        <button
          type="button"
          className={`filter-chip${filter === "attention" ? " active" : ""}`}
          onClick={() => setFilter("attention")}
        >
          {t.orders.filterAttention}
        </button>
      </div>

      {loading && <SkeletonRows count={5} />}

      {!loading && orders.length > 0 && (
        <div className="list-group">
          {orders.map((o) => (
            <Link key={o.id} href={`/app/orders/${o.id}`} className="list-row">
              <div className="list-row-body">
                <div className="list-row-title">{o.customer_name || o.title || o.slug}</div>
                <div className="list-row-meta tabular">
                  {o.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
                </div>
                {o.fulfillment_status && o.fulfillment_status !== "UNFULFILLED" ? (
                  <div className="list-row-meta">{fulfillmentLabel(o.fulfillment_status, t)}</div>
                ) : null}
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
          title={filter === "attention" ? t.orders.filterAttention : t.orders.empty}
          action={
            filter === "attention" ? (
              <button type="button" className="btn btn-secondary" onClick={() => setFilter("all")}>
                {t.orders.filterAll}
              </button>
            ) : (
              <Link className="btn btn-secondary" href="/app/create">
                {t.home.newOrder}
              </Link>
            )
          }
        >
          {filter === "attention" ? t.orders.emptyAttention : t.home.empty}
        </EmptyState>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="rise page-stack">
          <SkeletonRows count={5} />
        </div>
      }
    >
      <OrdersContent />
    </Suspense>
  );
}
