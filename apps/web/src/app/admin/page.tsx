"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function AdminPage() {
  const [intents, setIntents] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

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
    load().catch((err) => setMsg(err.message));
  }, []);

  async function resolve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/api/v1/admin/resolve", {
      method: "POST",
      body: JSON.stringify({
        payment_intent_id: fd.get("payment_intent_id"),
        action: fd.get("action"),
        reason: fd.get("reason"),
        event_id: fd.get("event_id") || "",
      }),
    });
    setMsg("Resolved");
    await load();
  }

  return (
    <main className="shell rise" style={{ maxWidth: 720 }}>
      <h1>Admin / Reconciliation</h1>
      {msg && <p className="muted">{msg}</p>}
      <form className="card-panel" onSubmit={resolve}>
        <h3 style={{ marginTop: 0 }}>Manual resolve</h3>
        <div className="field">
          <label>Payment intent ID</label>
          <input name="payment_intent_id" required />
        </div>
        <div className="field">
          <label>Action</label>
          <select name="action" defaultValue="needs_review">
            <option value="needs_review">Needs review</option>
            <option value="mark_paid">Mark paid</option>
          </select>
        </div>
        <div className="field">
          <label>Reason</label>
          <input name="reason" required />
        </div>
        <div className="field">
          <label>Chain event id (optional)</label>
          <input name="event_id" />
        </div>
        <button className="btn btn-primary">Resolve</button>
      </form>

      <Section title="Payment intents" rows={intents} />
      <Section title="Unmatched transfers" rows={unmatched} />
      <Section title="Chain events" rows={events} />
    </main>
  );
}

function Section({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div style={{ marginTop: "1.25rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>{title}</h2>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {rows.slice(0, 30).map((row, idx) => (
          <pre key={idx} className="card-panel" style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.75rem" }}>
            {JSON.stringify(row, null, 2)}
          </pre>
        ))}
        {!rows.length && <p className="muted">None</p>}
      </div>
    </div>
  );
}
