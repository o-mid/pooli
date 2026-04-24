"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, openSSE } from "@/lib/api";

type Pay = {
  store_name: string;
  title: string;
  description: string;
  fiat_amount_toman: number;
  status: string;
  customer_submitted: boolean;
  fields: Array<{ key: string; label: string; type: string; required: boolean; options?: string[] }>;
  payment_intent?: {
    id: string;
    status: string;
    expires_at: string;
    options: Array<{
      id: string;
      network: string;
      destination_address: string;
      pay_usdt_amount: string;
      pay_usdt_amount_base_units: number;
      payment_uri: string;
      expires_at: string;
    }>;
  };
};

export default function PublicCheckoutPage() {
  const params = useParams<{ slug: string }>();
  const [pay, setPay] = useState<Pay | null>(null);
  const [step, setStep] = useState<"details" | "pay" | "live">("details");
  const [network, setNetwork] = useState<"tron" | "bsc" | "">("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Waiting for payment");

  async function load() {
    const d = await api<Pay>(`/api/v1/public/pay/${params.slug}`);
    setPay(d);
    setStatus(labelFor(d.payment_intent?.status || d.status));
    if (d.customer_submitted) setStep(d.payment_intent?.status === "PAID" ? "live" : "pay");
    if (d.payment_intent?.status === "PAID") setStep("live");
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug]);

  useEffect(() => {
    if (!pay?.payment_intent?.id) return;
    const es = openSSE(`/api/v1/public/pay/${params.slug}/events`, (type) => {
      if (type === "payment.seen") setStatus("Payment detected");
      if (type === "payment.confirming") setStatus("Confirming");
      if (type === "payment.paid") {
        setStatus("Payment complete ✓");
        setStep("live");
      }
      if (type === "payment.needs_review") setStatus("Needs review");
      load().catch(() => undefined);
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay?.payment_intent?.id, params.slug]);

  const selected = useMemo(
    () => pay?.payment_intent?.options?.find((o) => o.network === network),
    [pay, network],
  );

  const countdown = useCountdown(selected?.expires_at || pay?.payment_intent?.expires_at);

  async function submitDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const values: Record<string, string> = {};
    pay?.fields.forEach((f) => {
      values[f.key] = String(fd.get(f.key) || "");
    });
    try {
      await api(`/api/v1/public/pay/${params.slug}/customer-details`, {
        method: "POST",
        body: JSON.stringify({ values }),
      });
      await load();
      setStep("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    }
  }

  async function chooseNetwork(n: "tron" | "bsc") {
    setNetwork(n);
    await api(`/api/v1/public/pay/${params.slug}/select-network`, {
      method: "POST",
      body: JSON.stringify({ network: n }),
    });
    setStep("live");
  }

  if (!pay) {
    return (
      <main className="shell">
        <p className="muted">{error || "Loading checkout…"}</p>
      </main>
    );
  }

  return (
    <main className="shell rise">
      <p className="brand" style={{ fontSize: "1.5rem", marginBottom: 0 }}>
        Pooli
      </p>
      <p className="muted" style={{ marginTop: "0.2rem" }}>
        {pay.store_name}
      </p>
      <h1 style={{ fontSize: "1.35rem" }}>{pay.title || "Payment request"}</h1>
      {pay.description && <p className="muted">{pay.description}</p>}
      <div className="card-panel" style={{ marginBottom: "1rem" }}>
        <div className="muted">Amount</div>
        <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{pay.fiat_amount_toman.toLocaleString()} Toman</div>
      </div>

      {step === "details" && (
        <form className="card-panel" onSubmit={submitDetails}>
          {pay.fields.map((f) => (
            <div className="field" key={f.key}>
              <label>
                {f.label}
                {f.required ? " *" : ""}
              </label>
              {f.type === "textarea" ? (
                <textarea name={f.key} required={f.required} rows={3} />
              ) : f.type === "select" ? (
                <select name={f.key} required={f.required} defaultValue="">
                  <option value="" disabled>
                    Select
                  </option>
                  {(f.options || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input name={f.key} type={f.type === "email" ? "email" : "text"} required={f.required} />
              )}
            </div>
          ))}
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary">Continue to payment</button>
        </form>
      )}

      {(step === "pay" || step === "live") && (
        <div className="card-panel">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <button className="btn btn-secondary" onClick={() => chooseNetwork("tron")}>
              Pay USDT on TRON
            </button>
            <button className="btn btn-secondary" onClick={() => chooseNetwork("bsc")}>
              Pay USDT on BNB Chain
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div className="card-panel" style={{ marginTop: "1rem" }}>
          <p className="warn">
            Send only USDT on <strong>{selected.network.toUpperCase()}</strong>. Wrong network cannot be recovered by Pooli.
          </p>
          <div className="muted">Exact USDT amount</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{selected.pay_usdt_amount}</div>
          <div className="muted pulse">Quote expires in {countdown}</div>
          <div style={{ display: "flex", justifyContent: "center", margin: "1rem 0" }}>
            <QRCodeSVG value={selected.destination_address} size={170} bgColor="transparent" fgColor="#f3f7f4" />
          </div>
          <p style={{ wordBreak: "break-all" }}>{selected.destination_address}</p>
          <button className="btn btn-primary" style={{ marginBottom: "0.5rem" }} onClick={() => navigator.clipboard.writeText(selected.destination_address)}>
            Copy address
          </button>
          <button className="btn btn-secondary" style={{ marginBottom: "0.5rem" }} onClick={() => navigator.clipboard.writeText(selected.pay_usdt_amount)}>
            Copy amount
          </button>
          {selected.payment_uri && (
            <a className="btn btn-secondary" href={selected.payment_uri}>
              Open Wallet
            </a>
          )}
          <div style={{ marginTop: "1.25rem" }}>
            <strong className={status.includes("complete") ? "ok" : "pulse"}>{status}</strong>
          </div>
        </div>
      )}

      {pay.payment_intent?.status === "PAID" && (
        <div className="card-panel" style={{ marginTop: "1rem" }}>
          <h2 className="ok" style={{ marginTop: 0 }}>
            Payment complete ✓
          </h2>
          <p>Your order is confirmed. No screenshot needed.</p>
        </div>
      )}
    </main>
  );
}

function labelFor(status: string) {
  switch (status) {
    case "SEEN":
      return "Payment detected";
    case "CONFIRMING":
      return "Confirming";
    case "PAID":
      return "Payment complete ✓";
    case "NEEDS_REVIEW":
      return "Needs review";
    default:
      return "Waiting for payment";
  }
}

function useCountdown(iso?: string) {
  const [left, setLeft] = useState("--:--");
  useEffect(() => {
    if (!iso) return;
    const tick = () => {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms <= 0) {
        setLeft("expired");
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return left;
}
