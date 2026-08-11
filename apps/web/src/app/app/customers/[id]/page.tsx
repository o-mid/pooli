"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { fulfillmentLabel } from "@/lib/fulfillment";

type Customer = {
  id: string;
  full_name: string;
  phone_e164: string;
  email: string;
  order_count: number;
  paid_orders?: number;
  lifetime_paid_toman: number;
  last_order_at?: string;
  first_purchase_at?: string;
  notes?: Array<{ id: string; body: string }>;
  tags?: string[];
  addresses?: Array<{
    id: string;
    label: string;
    address_line: string;
    postal_code: string;
    city: string;
    is_default: boolean;
  }>;
  recent_orders?: Array<{
    id: string;
    title: string;
    slug: string;
    fiat_amount_toman: number;
    payment_status: string;
    fulfillment_status: string;
  }>;
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const t = useT();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");

  async function load() {
    const c = await api<Customer>(`/api/v1/customers/${params.id}`);
    setCustomer(c);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [params.id]);

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await api(`/api/v1/customers/${params.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: note.trim() }),
    });
    setNote("");
    await load();
  }

  async function addTag(e: FormEvent) {
    e.preventDefault();
    if (!tag.trim()) return;
    await api(`/api/v1/customers/${params.id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tag: tag.trim() }),
    });
    setTag("");
    await load();
  }

  if (!customer) {
    return (
      <div className="rise page-stack">
        <Skeleton height="1.75rem" width="40%" />
        <Skeleton height="8rem" width="100%" />
      </div>
    );
  }

  const newOrderHref = `/app/create?customer_id=${encodeURIComponent(customer.id)}&customer_name=${encodeURIComponent(customer.full_name || "")}`;

  return (
    <div className="rise page-stack">
      <BackLink href="/app/customers" />
      <PageHeader title={customer.full_name || t.customers.title} />

      <div className="card-panel">
        {customer.phone_e164 ? (
          <p className="mono-ltr" style={{ margin: 0 }}>
            {customer.phone_e164}
          </p>
        ) : null}
        {customer.email ? <p className="muted">{customer.email}</p> : null}
        <p className="tabular" style={{ margin: "var(--space-3) 0 0", fontWeight: 600 }}>
          {customer.order_count} {t.customers.orders}
          {typeof customer.paid_orders === "number" ? ` · ${customer.paid_orders} ${t.customers.paidOrders}` : ""}
          {" · "}
          {customer.lifetime_paid_toman.toLocaleString()} {t.checkout.toman}
        </p>
        {(customer.tags || []).length > 0 ? (
          <p className="tag-row">
            {customer.tags!.map((tg) => (
              <button
                key={tg}
                type="button"
                className="tag-chip"
                onClick={async () => {
                  await api(`/api/v1/customers/${params.id}/tags/${encodeURIComponent(tg)}`, { method: "DELETE" });
                  await load();
                }}
              >
                {tg} ×
              </button>
            ))}
          </p>
        ) : null}
        <Link className="btn btn-primary" href={newOrderHref} style={{ marginTop: "var(--space-4)" }}>
          + {t.customers.newOrder}
        </Link>
      </div>

      <section className="section">
        <h2 className="section-title">{t.customers.notes}</h2>
        <form className="stack-form" onSubmit={addNote}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.customers.notePlaceholder} />
          <button className="btn-secondary" type="submit">
            {t.customers.addNote}
          </button>
        </form>
        <div className="list-group">
          {(customer.notes || []).map((n) => (
            <div key={n.id} className="list-row" style={{ cursor: "default" }}>
              <div className="list-row-body">
                <div className="list-row-meta">{n.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{t.customers.tags}</h2>
        <form className="stack-form" onSubmit={addTag}>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t.customers.tagPlaceholder} />
          <button className="btn-secondary" type="submit">
            {t.customers.addTag}
          </button>
        </form>
      </section>

      {customer.addresses && customer.addresses.length > 0 ? (
        <section className="section">
          <h2 className="section-title">{t.customers.addresses}</h2>
          <div className="list-group">
            {customer.addresses.map((a) => (
              <div key={a.id} className="list-row" style={{ cursor: "default" }}>
                <div className="list-row-body">
                  <div className="list-row-title">
                    {a.label}
                    {a.is_default ? " · ★" : ""}
                  </div>
                  <div className="list-row-meta">{a.address_line}</div>
                  {a.postal_code ? <div className="list-row-meta mono-ltr">{a.postal_code}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2 className="section-title">{t.customers.recentOrders}</h2>
        <div className="list-group">
          {(customer.recent_orders || []).map((o) => (
            <Link key={o.id} href={`/app/orders/${o.id}`} className="list-row">
              <div className="list-row-body">
                <div className="list-row-title">{o.title || o.slug}</div>
                <div className="list-row-meta tabular">
                  {o.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
                </div>
                <div className="list-row-meta">{fulfillmentLabel(o.fulfillment_status, t)}</div>
              </div>
              <div className="list-row-trailing">
                <StatusBadge status={o.payment_status} t={t} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
