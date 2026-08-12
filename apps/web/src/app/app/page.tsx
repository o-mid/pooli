"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NewPaymentButton } from "@/components/NewPaymentButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { OrderListRow } from "@/components/ui/OrderListRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useT } from "@/i18n/LocaleProvider";
import { api, openSSE } from "@/lib/api";
import { fulfillmentLabel } from "@/lib/fulfillment";

type Home = {
  today_paid_orders: number;
  today_toman_volume: number;
  pending_payments: number;
  needs_attention: number;
  attention_items?: Array<{
    id: string;
    title: string;
    fiat_amount_toman: number;
    payment_status: string;
    fulfillment_status: string;
    reason: string;
  }>;
  recent_orders: Array<{
    id: string;
    slug: string;
    title: string;
    fiat_amount_toman: number;
    status: string;
    payment_status?: string;
    fulfillment_status?: string;
    customer_name?: string;
  }>;
};

function greeting(t: ReturnType<typeof useT>): string {
  const h = new Date().getHours();
  if (h < 12) return t.home.greetingMorning;
  if (h < 18) return t.home.greetingAfternoon;
  return t.home.greetingEvening;
}

export default function HomePage() {
  const t = useT();
  const router = useRouter();
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState("");
  const [gate, setGate] = useState(true);

  async function load() {
    try {
      const home = await api<Home>("/api/v1/home");
      setData(home);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    (async () => {
      try {
        const me = await api<{
          merchant: { onboarding_completed?: boolean; display_name?: string; name?: string };
        }>("/api/v1/me");
        if (cancelled) return;
        if (!me.merchant?.onboarding_completed) {
          router.replace("/app/onboarding");
          return;
        }
        setGate(false);
        await load();
        if (cancelled) return;
        es = openSSE("/api/v1/merchant/events", () => {
          load();
        });
      } catch (err) {
        if (cancelled) return;
        setGate(false);
        setError(err instanceof Error ? err.message : t.common.error);
      }
    })();
    return () => {
      cancelled = true;
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gate) {
    return <p className="muted">{t.common.loading}</p>;
  }

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
  const attention = data?.needs_attention || 0;
  const attentionItems = data?.attention_items || [];
  const loading = !data;
  const title = greeting(t);

  return (
    <div className="rise page-stack">
      <PageHeader title={title} />

      {loading ? (
        <SkeletonRows count={2} />
      ) : (
        <div className="home-today">
          <div className="home-today-amount tabular">
            {data.today_toman_volume.toLocaleString()} {t.checkout.toman}
          </div>
          <div className="home-today-meta">
            {data.today_paid_orders === 0
              ? t.home.paidTodayNone
              : `${data.today_paid_orders} ${t.home.paidToday}`}
          </div>
        </div>
      )}

      <NewPaymentButton />

      {!loading && attention > 0 && attentionItems.length > 0 ? (
        <section className="section">
          <h2 className="section-title">{t.home.attention}</h2>
          <div className="list-group">
            {attentionItems.slice(0, 5).map((o) => (
              <OrderListRow
                key={o.id}
                href={`/app/orders/${o.id}`}
                title={o.title}
                amountToman={o.fiat_amount_toman}
                tomanLabel={t.checkout.toman}
                status={o.payment_status}
                t={t}
                meta={o.reason === "PAID_UNFULFILLED" ? t.home.awaitingFulfillment : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2 className="section-title">{t.home.recent}</h2>
        {loading ? (
          <SkeletonRows count={4} />
        ) : recent.length > 0 ? (
          <div className="list-group">
            {recent.map((o) => (
              <OrderListRow
                key={o.id}
                href={`/app/orders/${o.id}`}
                title={o.customer_name || o.title || o.slug}
                amountToman={o.fiat_amount_toman}
                tomanLabel={t.checkout.toman}
                status={o.payment_status || o.status}
                t={t}
                meta={
                  o.fulfillment_status && o.fulfillment_status !== "UNFULFILLED"
                    ? fulfillmentLabel(o.fulfillment_status, t)
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={t.orders.empty}
            action={
              <Link className="btn btn-secondary" href="/app/create">
                {t.home.newOrder}
              </Link>
            }
          >
            {t.home.empty}
          </EmptyState>
        )}
      </section>
    </div>
  );
}
