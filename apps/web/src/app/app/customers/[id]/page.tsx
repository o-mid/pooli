"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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
  lifetime_paid_toman: number;
  last_order_at?: string;
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

  useEffect(() => {
    api<Customer>(`/api/v1/customers/${params.id}`)
      .then(setCustomer)
      .catch(() => undefined);
  }, [params.id]);

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
          {customer.order_count} {t.customers.orders} · {customer.lifetime_paid_toman.toLocaleString()}{" "}
          {t.checkout.toman}
        </p>
        <Link className="btn btn-primary" href={newOrderHref} style={{ marginTop: "var(--space-4)" }}>
          + {t.customers.newOrder}
        </Link>
      </div>

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
