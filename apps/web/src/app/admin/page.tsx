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
  const [events, setEvents] = useState<any[]>([]);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const [i, e, u] = await Promise.all([
      api<{ payment_intents: any[] }>("/api/v1/admin/payment-intents"),
      api<{ chain_events: any[] }>("/api/v1/admin/chain-events"),
      api<{ unmatched: any[] }>("/api/v1/admin/unmatched"),
    ]);
    setIntents(i.payment_intents);
    setEvents(e.chain_events);
    setUnmatched(u.unmatched);
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

  return (
    <main className="shell rise page-stack shell-wide">
      <BackLink href="/app/settings" />
      <PageHeader title={t.admin.title} />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <form className="card-panel" onSubmit={resolve}>
        <h2 style={{ margin: 0, fontSize: "var(--text-title3)" }}>{t.admin.resolve}</h2>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="payment_intent_id">{t.admin.intentId}</label>
          <input id="payment_intent_id" name="payment_intent_id" required className="mono-ltr" />
        </div>
        <div className="field">
          <label htmlFor="action">{t.admin.action}</label>
          <select id="action" name="action" defaultValue="needs_review">
            <option value="needs_review">Needs review</option>
            <option value="mark_paid">Mark paid</option>
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

      <Section title={t.admin.intents} rows={intents} />
      <Section title={t.admin.unmatched} rows={unmatched} />
      <Section title={t.admin.events} rows={events} />
    </main>
  );
}

function Section({ title, rows }: { title: string; rows: any[] }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {rows.slice(0, 30).map((row, idx) => (
          <pre key={idx} className="card-panel mono-ltr" style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.75rem" }}>
            {JSON.stringify(row, null, 2)}
          </pre>
        ))}
        {!rows.length && <p className="muted">—</p>}
      </div>
    </section>
  );
}
