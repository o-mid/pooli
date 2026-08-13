"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { NewPaymentButton } from "@/components/NewPaymentButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { OrderListRow } from "@/components/ui/OrderListRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useT } from "@/i18n/LocaleProvider";
import { api, openSSE } from "@/lib/api";
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
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter === "attention") params.set("filter", "attention");
      if (q.trim()) params.set("q", q.trim());
      const qs = params.toString();
      api<{ orders: Order[] }>(`/api/v1/orders${qs ? `?${qs}` : ""}`)
        .then((d) => {
          setOrders(d.orders);
          setError("");
        })
        .catch((err) => setError(err instanceof Error ? err.message : t.common.error))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [filter, q, t.common.error]);

  useEffect(() => {
    const es = openSSE("/api/v1/merchant/events", () => {
      const params = new URLSearchParams();
      if (filter === "attention") params.set("filter", "attention");
      if (q.trim()) params.set("q", q.trim());
      const qs = params.toString();
      api<{ orders: Order[] }>(`/api/v1/orders${qs ? `?${qs}` : ""}`)
        .then((d) => setOrders(d.orders))
        .catch(() => undefined);
    });
    return () => es.close();
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
      <PageHeader title={t.orders.title} trailing={<NewPaymentButton compact />} />

      {(!loading && orders.length >= 5) || q.trim() ? (
        <div className="field" style={{ margin: 0 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.orders.searchPlaceholder}
            autoComplete="off"
          />
        </div>
      ) : null}

      {filter === "attention" || (!loading && orders.some((o) => o.payment_status !== "AWAITING_PAYMENT" && o.payment_status !== "CREATED")) ? (
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
      ) : null}

      {error ? (
        <div className="page-stack">
          <p className="field-error" role="alert">
            {error}
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
            {t.common.retry}
          </button>
        </div>
      ) : null}

      {loading && <SkeletonRows count={5} />}

      {!loading && orders.length > 0 && (
        <div className="list-group">
          {orders.map((o) => (
            <OrderListRow
              key={o.id}
              href={`/app/orders/${o.id}`}
              title={o.customer_name || o.title || o.slug}
              amountToman={o.fiat_amount_toman}
              tomanLabel={t.checkout.toman}
              status={o.payment_status}
              t={t}
              meta={
                o.fulfillment_status && o.fulfillment_status !== "UNFULFILLED"
                  ? fulfillmentLabel(o.fulfillment_status, t)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {!loading && !orders.length && !error && (
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
