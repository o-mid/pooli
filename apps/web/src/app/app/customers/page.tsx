"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";

type Customer = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  order_count: number;
  lifetime_paid_toman: number;
  last_order_at?: string;
};

function relativeDay(iso: string | undefined, t: ReturnType<typeof useT>): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return t.customers.today;
  if (days === 1) return t.customers.yesterday;
  return t.customers.daysAgo.replace("{n}", String(days));
}

export default function CustomersPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Customer[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => {
      const path = q.trim() ? `/api/v1/customers?q=${encodeURIComponent(q.trim())}` : "/api/v1/customers";
      api<{ customers: Customer[] }>(path)
        .then((d) => {
          setItems(d.customers || []);
          setError("");
        })
        .catch((err) => setError(err instanceof Error ? err.message : t.common.error));
    }, 200);
    return () => clearTimeout(handle);
  }, [q, t.common.error]);

  return (
    <div className="rise page-stack">
      <PageHeader title={t.customers.title} />
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="customer-search" className="sr-only">
          {t.customers.searchPlaceholder}
        </label>
        <input
          id="customer-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.customers.searchPlaceholder}
          autoComplete="off"
        />
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <SkeletonRows count={4} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t.customers.title}
          action={
            <Link className="btn btn-secondary" href="/app/create">
              {t.home.newOrder}
            </Link>
          }
        >
          {t.customers.empty}
        </EmptyState>
      ) : (
        <div className="list-group">
          {items.map((c) => (
            <Link key={c.id} href={`/app/customers/${c.id}`} className="list-row">
              <div className="list-row-body">
                <div className="list-row-title">{c.full_name || c.phone || c.email}</div>
                <div className="list-row-meta mono-ltr">{c.phone || c.email}</div>
                <div className="list-row-meta tabular">
                  {c.order_count} {t.customers.orders} · {c.lifetime_paid_toman.toLocaleString()} {t.checkout.toman}
                </div>
                <div className="list-row-meta">
                  {t.customers.lastOrder}: {relativeDay(c.last_order_at, t)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
