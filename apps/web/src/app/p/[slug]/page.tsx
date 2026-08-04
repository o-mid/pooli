"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BrandMark } from "@/components/BrandMark";
import { PaymentProgress } from "@/components/PaymentProgress";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { api, openSSE } from "@/lib/api";
import { usePaymentStatusPoll } from "@/lib/usePaymentStatusPoll";

type PaymentOption = {
  id: string;
  network: string;
  destination_address: string;
  pay_usdt_amount: string;
  payment_uri?: string;
  expires_at?: string;
  explorer_base?: string;
};

type PaymentIntent = {
  id: string;
  status: string;
  expires_at?: string;
  options?: PaymentOption[];
  matched_tx?: {
    tx_hash?: string;
    explorer_url?: string;
    confirmations?: number;
    required_confirmations?: number;
  };
};

type Pay = {
  store_name: string;
  store_logo_url?: string;
  title: string;
  description: string;
  fiat_amount_toman: number;
  status: string;
  customer_submitted: boolean;
  fields: Array<{ key: string; label: string; type: string; required: boolean; options?: string[] }>;
  payment_intent?: PaymentIntent;
};

type Step = "details" | "network" | "pay";

export default function PublicCheckoutPage() {
  const params = useParams<{ slug: string }>();
  const t = useT();
  const { locale } = useLocale();
  const [pay, setPay] = useState<Pay | null>(null);
  const [step, setStep] = useState<Step>("details");
  const [selected, setSelected] = useState<PaymentOption | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"addr" | "amt" | null>(null);
  const selectedRef = useRef<PaymentOption | null>(null);
  selectedRef.current = selected;

  function resolveStep(data: Pay): Step {
    const hasFields = data.fields.length > 0 && !data.customer_submitted;
    if (hasFields) return "details";
    if (data.payment_intent?.status === "PAID") return "pay";
    return "network";
  }

  async function load() {
    const d = await api<Pay>(`/api/v1/public/pay/${params.slug}`);
    setPay(d);
    // Use ref so poll/SSE reloads do not clobber an in-progress pay step when
    // `selected` is still null in a stale closure after chooseNetwork.
    setStep((prev) => (prev === "pay" && selectedRef.current ? "pay" : resolveStep(d)));
    if (d.payment_intent?.status === "PAID") setStep("pay");
    // Keep selected option in sync when intent options refresh (e.g. after PAID).
    if (selectedRef.current) {
      const match = d.payment_intent?.options?.find((o) => o.id === selectedRef.current?.id);
      if (match) setSelected(match);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug]);

  useEffect(() => {
    if (!pay?.payment_intent?.id) return;
    // SSE is best-effort only (worker transitions do not publish into the API hub).
    const es = openSSE(`/api/v1/public/pay/${params.slug}/events`, () => {
      load().catch(() => undefined);
    });
    es.onerror = () => {
      // Keep REST polling authoritative; do not tear down the page on SSE errors.
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay?.payment_intent?.id, params.slug]);

  const countdown = useCountdown(selected?.expires_at || pay?.payment_intent?.expires_at);
  // Prefer payment_intent.status — top-level status is the order snapshot.
  // Do not invent AWAITING_PAYMENT before the first load; that would start
  // polling against a missing/stale payload.
  const intentStatus = pay?.payment_intent?.status || pay?.status;
  const matched = pay?.payment_intent?.matched_tx;

  usePaymentStatusPoll(intentStatus, () => load().catch(() => undefined));

  const qrPayload = useMemo(() => {
    if (!selected) return "";
    return selected.payment_uri || selected.destination_address;
  }, [selected]);

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
      setStep("network");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function chooseNetwork(n: "tron" | "bsc") {
    setError("");
    try {
      const res = await api<{ selected_option: PaymentOption }>(`/api/v1/public/pay/${params.slug}/select-network`, {
        method: "POST",
        body: JSON.stringify({ network: n }),
      });
      setSelected(res.selected_option);
      setStep("pay");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function copy(text: string, kind: "addr" | "amt") {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!pay) {
    return (
      <main className="shell">
        <p className="muted">{error || t.common.loading}</p>
      </main>
    );
  }

  const storeInitial = (pay.store_name || "S").slice(0, 1).toUpperCase();

  return (
    <main className="shell rise">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div className="merchant-avatar">
            {pay.store_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pay.store_logo_url} alt="" />
            ) : (
              storeInitial
            )}
          </div>
          <div>
            <strong>{pay.store_name}</strong>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {t.checkout.poweredBy}
            </p>
          </div>
        </div>
        <BrandMark variant="mark" size={24} localeHint={locale} />
      </header>

      <h1 style={{ fontSize: "1.35rem", marginTop: 0 }}>{pay.title || t.checkout.orderRef}</h1>
      {pay.description && <p className="muted">{pay.description}</p>}

      <div className="card-panel" style={{ marginBottom: "1rem" }}>
        <div className="muted">{t.checkout.amount}</div>
        <div className="tabular" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
          {pay.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
        </div>
      </div>

      {step === "details" && (
        <form className="card-panel" onSubmit={submitDetails}>
          <h3 style={{ marginTop: 0 }}>{t.checkout.customerInfo}</h3>
          {pay.fields.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={f.key}>
                {f.label}
                {f.required ? " *" : ""}
              </label>
              {f.type === "textarea" ? (
                <textarea id={f.key} name={f.key} required={f.required} rows={3} />
              ) : f.type === "select" ? (
                <select id={f.key} name={f.key} required={f.required} defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {(f.options || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input id={f.key} name={f.key} type={f.type === "email" ? "email" : "text"} required={f.required} />
              )}
            </div>
          ))}
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary">{t.checkout.continue}</button>
        </form>
      )}

      {step === "network" && intentStatus !== "PAID" && (
        <div className="card-panel">
          <h3 style={{ marginTop: 0 }}>{t.checkout.selectNetwork}</h3>
          <div className="network-choice">
            <button type="button" className="recommended" onClick={() => chooseNetwork("tron")}>
              <strong>USDT · TRON</strong>
              <span className="badge" style={{ marginInlineStart: "0.5rem" }}>
                {t.checkout.recommend}
              </span>
            </button>
            <button type="button" onClick={() => chooseNetwork("bsc")}>
              <strong>USDT · BNB Chain</strong>
            </button>
          </div>
          {error && <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{error}</p>}
        </div>
      )}

      {step === "pay" && selected && intentStatus !== "PAID" && (
        <div className="card-panel">
          <p className="warn">{t.checkout.wrongNetwork}</p>

          <div className="muted">{t.checkout.exactAmount}</div>
          <div className="tabular mono-ltr" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            {selected.pay_usdt_amount} USDT
          </div>
          <p className="muted" style={{ fontSize: "0.85rem", lineHeight: 1.45 }}>
            {t.checkout.exactHint}
          </p>
          <p className="muted tabular pulse">
            {t.checkout.quoteExpires}: {countdown}
          </p>

          <div className="qr-card" style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div className="merchant-avatar" style={{ width: 36, height: 36, fontSize: "0.85rem" }}>
                {pay.store_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pay.store_logo_url} alt="" />
                ) : (
                  storeInitial
                )}
              </div>
              <BrandMark variant="mark" size={22} localeHint={locale} />
            </div>
            <div className="qr-frame">
              <QRCodeSVG value={qrPayload} size={170} bgColor="#ffffff" fgColor="#0b1f1a" />
            </div>
            <p className="mono-ltr wallet-addr muted" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
              {selected.destination_address}
            </p>
          </div>

          <button className="btn btn-primary" style={{ marginTop: "0.75rem" }} onClick={() => copy(selected.destination_address, "addr")}>
            {copied === "addr" ? t.common.copied : t.checkout.copyAddress}
          </button>
          <button className="btn btn-secondary" style={{ marginTop: "0.5rem" }} onClick={() => copy(selected.pay_usdt_amount, "amt")}>
            {copied === "amt" ? t.common.copied : t.checkout.copyAmount}
          </button>
          {selected.payment_uri && (
            <a className="btn btn-secondary" href={selected.payment_uri} style={{ marginTop: "0.5rem" }}>
              {t.checkout.openWallet}
            </a>
          )}

          <PaymentProgress
            status={intentStatus || "AWAITING_PAYMENT"}
            network={selected.network}
            confirmations={matched?.confirmations}
            requiredConfirmations={matched?.required_confirmations}
            txHash={matched?.tx_hash}
            explorerUrl={matched?.explorer_url}
          />
        </div>
      )}

      {intentStatus === "PAID" && (
        <div className="card-panel">
          <h2 className="ok" style={{ marginTop: 0 }}>
            {t.checkout.paymentReceived}
          </h2>
          <PaymentProgress
            status="PAID"
            network={selected?.network}
            confirmations={matched?.confirmations}
            requiredConfirmations={matched?.required_confirmations}
            txHash={matched?.tx_hash}
            explorerUrl={matched?.explorer_url}
          />
        </div>
      )}
    </main>
  );
}

function useCountdown(iso?: string) {
  const [left, setLeft] = useState("--:--");
  useEffect(() => {
    if (!iso) return;
    const tick = () => {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms <= 0) {
        setLeft("—");
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
