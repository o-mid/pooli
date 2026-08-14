"use client";

import { FormEvent, useEffect, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";

export default function AdminPage() {
  const t = useT();
  const { showToast } = useToast();
  const [intents, setIntents] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [ops, setOps] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const [i, ex, d, o] = await Promise.all([
      api<{ payment_intents: any[] }>("/api/v1/admin/payment-intents"),
      api<{ exceptions: any[] }>("/api/v1/admin/exceptions"),
      api<{ deliveries: any[] }>("/api/v1/admin/notification-deliveries"),
      api<any>("/api/v1/ops/status").catch(() => null),
    ]);
    setIntents(i.payment_intents || []);
    setExceptions(ex.exceptions || []);
    setDeliveries(d.deliveries || []);
    setOps(o);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function resolve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/v1/admin/resolve", {
        method: "POST",
        body: JSON.stringify({
          payment_intent_id: fd.get("payment_intent_id"),
          action: fd.get("action"),
          reason: fd.get("reason"),
          event_id: fd.get("event_id") || "",
        }),
      });
      showToast(t.admin.resolved);
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    if (search.trim().length < 2) return;
    const res = await api<any>(`/api/v1/admin/search?q=${encodeURIComponent(search.trim())}`);
    setSearchResult(res);
  }

  async function loadTimeline(id: string) {
    const res = await api<any>(`/api/v1/admin/payment-intents/${id}/timeline`);
    setTimeline(res);
  }

  return (
    <main className="shell rise page-stack shell-wide">
      <BackLink href="/app/settings" />
      <PageHeader title={t.admin.title} />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {ops ? (
        <section className="section card-panel">
          <h2 className="section-title">{t.admin.ops}</h2>
          <p className="muted mono-ltr">
            ok={String(ops.ok)} worker={String(ops.worker?.ok)} sha={ops.git_sha || "—"}
          </p>
          <p className="muted">
            alerts={(ops.alerts || []).join(", ") || "—"} · stuck={ops.payments?.stuck_confirming ?? 0} · review=
            {ops.payments?.needs_review ?? 0} · notify_fail_24h={ops.notifications?.failed_24h ?? 0}
          </p>
        </section>
      ) : null}

      <form className="card-panel stack-form" onSubmit={runSearch}>
        <h2 style={{ margin: 0, fontSize: "var(--text-title3)" }}>{t.admin.search}</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.admin.searchPlaceholder} />
        <button className="btn btn-secondary" type="submit">
          {t.admin.search}
        </button>
      </form>
      {searchResult ? (
        <>
          <RecordList title={t.admin.search} rows={searchResult.merchants || []} primary="name" secondary="slug" />
          <RecordList title={t.admin.intents} rows={searchResult.payment_intents || []} primary="status" secondary="id" />
          <RecordList title={t.nav.orders} rows={searchResult.orders || []} primary="title" secondary="slug" />
        </>
      ) : null}

      <form className="card-panel" onSubmit={resolve}>
        <h2 style={{ margin: 0, fontSize: "var(--text-title3)" }}>{t.admin.resolve}</h2>
        <p className="muted">{t.admin.resolveHint}</p>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="payment_intent_id">{t.admin.intentId}</label>
          <input id="payment_intent_id" name="payment_intent_id" required className="mono-ltr" />
        </div>
        <div className="field">
          <label htmlFor="action">{t.admin.action}</label>
          <select id="action" name="action" defaultValue="needs_review">
            <option value="needs_review">{t.admin.actionNeedsReview}</option>
            <option value="acknowledge_exception">{t.admin.actionAcknowledge}</option>
            <option value="note">{t.admin.actionNote}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="reason">{t.admin.reason}</label>
          <input id="reason" name="reason" required />
        </div>
        <div className="field">
          <label htmlFor="event_id">{t.admin.eventId}</label>
          <input id="event_id" name="event_id" className="mono-ltr" />
        </div>
        <button className="btn btn-primary" disabled={loading}>
          {loading ? t.common.loading : t.admin.submit}
        </button>
      </form>

      <section className="section">
        <h2 className="section-title">{t.admin.exceptions}</h2>
        <div className="list-group">
          {exceptions.slice(0, 40).map((ex) => (
            <button key={ex.id} type="button" className="list-row" onClick={() => loadTimeline(ex.id)}>
              <div className="list-row-body">
                <div className="list-row-title">{ex.exception_label}</div>
                <div className="list-row-meta mono-ltr">{ex.id}</div>
                <div className="list-row-meta tabular">
                  {ex.fiat_amount_toman?.toLocaleString?.()} · {ex.order_slug}
                </div>
              </div>
            </button>
          ))}
          {!exceptions.length && <p className="muted">—</p>}
        </div>
      </section>

      {timeline ? (
        <section className="section">
          <h2 className="section-title">{t.admin.timeline}</h2>
          <div className="list-group">
            {(timeline.timeline || []).map((ev: any, i: number) => (
              <div key={ev.id || i} className="list-row">
                <div className="list-row-body">
                  <div className="list-row-title">{ev.event_type || ev.kind || "event"}</div>
                  <div className="list-row-meta">{ev.title || ev.status || ev.channel || ""}</div>
                  <div className="list-row-meta muted">{ev.created_at || ev.at || ""}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <RecordList title={t.admin.intents} rows={intents} primary="status" secondary="id" />
      <section className="section">
        <h2 className="section-title">{t.admin.deliveries}</h2>
        <div className="list-group">
          {deliveries.slice(0, 30).map((row) => (
            <div key={row.id} className="list-row">
              <div className="list-row-body">
                <div className="list-row-title">
                  {row.status} · {row.channel}
                </div>
                <div className="list-row-meta mono-ltr">{row.event_key || row.id}</div>
              </div>
              {row.status === "failed" || row.status === "pending" ? (
                <button
                  type="button"
                  className="btn btn-tertiary"
                  onClick={async () => {
                    try {
                      await api(`/api/v1/admin/notification-deliveries/${row.id}/retry`, { method: "POST" });
                      showToast(t.admin.resolved);
                      await load();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : t.common.error);
                    }
                  }}
                >
                  {t.admin.retry}
                </button>
              ) : null}
            </div>
          ))}
          {!deliveries.length && <p className="muted">—</p>}
        </div>
      </section>
    </main>
  );
}

function RecordList({
  title,
  rows,
  primary,
  secondary,
}: {
  title: string;
  rows: any[];
  primary: string;
  secondary: string;
}) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <div className="list-group">
        {rows.slice(0, 30).map((row, idx) => (
          <div key={row.id || idx} className="list-row">
            <div className="list-row-body">
              <div className="list-row-title">{row[primary] || row.status || row.exception_label || "—"}</div>
              <div className="list-row-meta mono-ltr">{row[secondary] || row.id || ""}</div>
              {row.event_key ? <div className="list-row-meta mono-ltr">{row.event_key}</div> : null}
            </div>
          </div>
        ))}
        {!rows.length && <p className="muted">—</p>}
      </div>
    </section>
  );
}
