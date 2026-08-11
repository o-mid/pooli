"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { PooliPaySheet } from "@/components/checkout/PooliPaySheet";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { track } from "@/lib/analytics";
import { api, openSSE } from "@/lib/api";
import {
  getPreferredNetwork,
  moneyDetected,
  setPreferredNetwork,
  type PaymentOption,
} from "@/lib/payment-handoff";
import { usePaymentStatusPoll } from "@/lib/usePaymentStatusPoll";

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
  fulfillment_status?: string;
  shipping_provider?: string;
  tracking_number?: string;
  receipt?: {
    usdt_amount?: string;
    received_usdt_amount?: string;
    network?: string;
    tx_hash?: string;
    explorer_url?: string;
    order_reference?: string;
    paid_at?: string;
  } | null;
  trust?: {
    email_verified?: boolean;
    phone_verified?: boolean;
    wallet_configured?: boolean;
  };
  enabled_networks?: string[];
};

type Step = "details" | "network" | "pay";

function activeOptions(intent?: PaymentIntent | null): PaymentOption[] {
  const opts = intent?.options || [];
  const active = opts.filter((o) => !o.status || o.status === "ACTIVE");
  return active.length ? active : opts;
}

/** Prefer an option the buyer can still reason about after reload / money detection. */
function hydrateOption(intent?: PaymentIntent | null): PaymentOption | null {
  const opts = intent?.options || [];
  if (!opts.length) return null;
  const usable = opts.filter((o) => o.status !== "SUPERSEDED");
  const pool = usable.length ? usable : opts;
  const pref = getPreferredNetwork();
  if (pref) {
    const byPref =
      pool.find((o) => o.network === pref && (o.status === "SETTLED" || o.status === "ACTIVE" || !o.status)) ||
      pool.find((o) => o.network === pref);
    if (byPref) return byPref;
  }
  return (
    pool.find((o) => o.status === "SETTLED") ||
    pool.find((o) => o.status === "ACTIVE" || !o.status) ||
    pool[0] ||
    null
  );
}

export default function CheckoutClient() {
  const params = useParams<{ slug: string }>();
  const t = useT();
  const { locale } = useLocale();
  const [pay, setPay] = useState<Pay | null>(null);
  const [step, setStep] = useState<Step>("details");
  const [selected, setSelected] = useState<PaymentOption | null>(null);
  const [error, setError] = useState("");
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [refreshingQuote, setRefreshingQuote] = useState(false);
  const selectedRef = useRef<PaymentOption | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const prevStatus = useRef<string | undefined>();
  selectedRef.current = selected;

  function resolveStep(data: Pay): Step {
    const hasFields = data.fields.length > 0 && !data.customer_submitted;
    if (hasFields) return "details";
    const st = data.payment_intent?.status;
    if (st === "PAID" || moneyDetected(st)) return "pay";
    if (selectedRef.current) return "pay";
    return "network";
  }

  async function load() {
    const d = await api<Pay>(`/api/v1/public/pay/${params.slug}`);
    setPay(d);
    const st = d.payment_intent?.status;
    if (selectedRef.current) {
      const opts = d.payment_intent?.options || [];
      const match =
        opts.find((o) => o.id === selectedRef.current?.id) ||
        opts.find((o) => o.network === selectedRef.current?.network && o.status !== "SUPERSEDED") ||
        opts.find((o) => o.network === selectedRef.current?.network);
      if (match) {
        selectedRef.current = match;
        setSelected(match);
      }
    } else if (st === "PAID" || moneyDetected(st)) {
      const hydrated = hydrateOption(d.payment_intent);
      if (hydrated) {
        selectedRef.current = hydrated;
        setSelected(hydrated);
      }
    }
    setStep((prev) => (prev === "pay" && selectedRef.current ? "pay" : resolveStep(d)));
    if (st === "PAID" || moneyDetected(st)) setStep("pay");
    return d;
  }

  useEffect(() => {
    load()
      .then((d) => {
        track("checkout_opened", { status: d.payment_intent?.status || d.status });
        // Prefill network from local preference when still on network step.
        const pref = getPreferredNetwork();
        if (pref && !selectedRef.current) {
          const opt = activeOptions(d.payment_intent).find((o) => o.network === pref);
          if (opt && d.payment_intent?.status !== "PAID" && (d.fields.length === 0 || d.customer_submitted)) {
            // Soft hint only — user still sees network step with "Previously used".
          }
        }
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug]);

  function connectSSE() {
    if (!pay?.payment_intent?.id) return;
    sseRef.current?.close();
    const es = openSSE(`/api/v1/public/pay/${params.slug}/events`, () => {
      load().catch(() => undefined);
    });
    es.onerror = () => {
      // REST polling remains authoritative.
    };
    sseRef.current = es;
  }

  useEffect(() => {
    connectSSE();
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay?.payment_intent?.id, params.slug]);

  const countdown = useCountdown(selected?.expires_at || pay?.payment_intent?.expires_at);
  const intentStatus = pay?.payment_intent?.status || pay?.status;
  const matched = pay?.payment_intent?.matched_tx;

  usePaymentStatusPoll(intentStatus, async () => {
    await load().catch(() => undefined);
  });

  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = intentStatus;
    if (intentStatus === "SEEN" && prev && prev !== "SEEN") {
      track("payment_detected", { network: selected?.network });
    }
    if (intentStatus === "PAID" && prev && prev !== "PAID") {
      track("payment_confirmed", { network: selected?.network });
    }
    if (
      intentStatus &&
      ["EXPIRED", "UNDERPAID", "OVERPAID", "LATE_PAYMENT", "NEEDS_REVIEW", "DUPLICATE_PAYMENT"].includes(intentStatus) &&
      prev !== intentStatus
    ) {
      track("payment_exception", { status: intentStatus });
    }
  }, [intentStatus, selected?.network]);

  // Return-from-wallet: pageshow / leaving background → reconnect SSE + refetch.
  // Focus alone is too noisy (keyboard, tab chrome); cooldown avoids stacked refetches.
  useEffect(() => {
    let pending = false;
    let lastAt = 0;
    async function onReturn(showChecking: boolean) {
      if (pending) return;
      if (!pay?.payment_intent?.id) return;
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastAt < 2000) return;
      lastAt = now;
      pending = true;
      if (showChecking) setCheckingPayment(true);
      try {
        connectSSE();
        await load();
      } catch {
        // ignore
      } finally {
        window.setTimeout(() => {
          if (showChecking) setCheckingPayment(false);
          pending = false;
        }, 1200);
      }
    }
    const onVis = () => {
      if (!document.hidden) void onReturn(true);
    };
    const onPageShow = () => void onReturn(true);
    const onFocus = () => void onReturn(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay?.payment_intent?.id, params.slug]);

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
      setPreferredNetwork(n);
      setStep("pay");
      track("network_selected", { network: n });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function refreshQuote() {
    setRefreshingQuote(true);
    setError("");
    try {
      const d = await api<Pay>(`/api/v1/public/pay/${params.slug}/refresh-quote`, { method: "POST", body: "{}" });
      setPay(d);
      const opts = activeOptions(d.payment_intent);
      const net = selected?.network || getPreferredNetwork() || opts[0]?.network;
      const next = opts.find((o) => o.network === net) || opts[0] || null;
      setSelected(next);
      if (next) setStep("pay");
      track("quote_refreshed", { network: next?.network });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setRefreshingQuote(false);
    }
  }

  if (!pay) {
    return (
      <main className="shell rise page-stack">
        <Skeleton height="2.5rem" width="60%" />
        <Skeleton height="1rem" width="40%" />
        <Skeleton height="4.5rem" width="100%" />
        <Skeleton height="8rem" width="100%" />
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  const storeInitial = (pay.store_name || "S").slice(0, 1).toUpperCase();
  const needsDetails = pay.fields.length > 0;
  const onPayStep = step === "pay" || intentStatus === "PAID" || moneyDetected(intentStatus);
  const preferredNet = getPreferredNetwork();
  const journeySteps: Array<{ key: Step; label: string }> = [
    ...(needsDetails ? [{ key: "details" as const, label: t.checkout.customerInfo }] : []),
    { key: "network", label: t.checkout.selectNetwork },
    { key: "pay", label: t.checkout.exactAmount },
  ];
  const activeJourney =
    intentStatus === "PAID"
      ? journeySteps.length - 1
      : Math.max(
          0,
          journeySteps.findIndex((s) => s.key === step),
        );

  return (
    <main className={`shell rise page-stack${step === "pay" && intentStatus !== "PAID" ? " checkout-pay" : ""}`}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
          <div className="merchant-avatar">
            {pay.store_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pay.store_logo_url} alt="" />
            ) : (
              storeInitial
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: "var(--text-headline)" }}>{pay.store_name}</strong>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-footnote)" }}>
              {t.checkout.poweredBy}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          <LanguageSwitch />
          <BrandMark variant="mark" size={24} localeHint={locale} />
        </div>
      </header>

      {pay.trust ? (
        <div className="trust-row" aria-label="trust">
          {pay.trust.email_verified ? <span>✓ {t.trust.emailVerified}</span> : null}
          {pay.trust.phone_verified ? <span>✓ {t.trust.phoneVerified}</span> : null}
          {pay.trust.wallet_configured ? <span>✓ {t.trust.walletConfigured}</span> : null}
        </div>
      ) : null}

      <div>
        <h1 className="page-title" style={{ fontSize: "var(--text-title2)" }}>
          {pay.title || t.checkout.orderRef}
        </h1>
        {pay.description ? <p className="page-subtitle">{pay.description}</p> : null}
      </div>

      <div>
        <p className="section-title" style={{ paddingInline: 0 }}>
          {t.checkout.amount}
        </p>
        <AmountDisplay primary={`${pay.fiat_amount_toman.toLocaleString()} ${t.checkout.toman}`} />
      </div>

      {!onPayStep && (
        <ol className="progress-steps" aria-label={t.checkout.continue}>
          {journeySteps.map((s, i) => {
            const done = i < activeJourney;
            const current = i === activeJourney;
            return (
              <li
                key={s.key}
                className={`${done ? "done" : ""} ${current ? "current" : ""} ${!done && !current ? "upcoming" : ""}`}
              >
                <span className="dot" aria-hidden />
                <span className="label">{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {step === "details" && (
        <form className="card-panel" onSubmit={submitDetails}>
          <h2 style={{ margin: 0, fontSize: "var(--text-title3)" }}>{t.checkout.customerInfo}</h2>
          {pay.fields.map((f) => (
            <div className="field" key={f.key} style={{ marginTop: "var(--space-3)" }}>
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
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary">{t.checkout.continue}</button>
        </form>
      )}

      {step === "network" && intentStatus !== "PAID" && (
        <section className="section">
          <h2 className="section-title">{t.checkout.selectNetwork}</h2>
          <div className="network-choice">
            {(pay?.enabled_networks || ["tron"]).includes("tron") ? (
              <button type="button" className="recommended" onClick={() => chooseNetwork("tron")}>
                <span>
                  <strong>USDT · TRON</strong>
                  <span className="network-hint">
                    {preferredNet === "tron" ? t.checkout.previouslyUsed : t.checkout.networkTronHint}
                  </span>
                </span>
                <span className="badge">{preferredNet === "tron" ? t.checkout.previouslyUsed : t.checkout.recommend}</span>
              </button>
            ) : null}
            {(pay?.enabled_networks || []).includes("bsc") ? (
              <button type="button" onClick={() => chooseNetwork("bsc")}>
                <span>
                  <strong>USDT · BNB Chain</strong>
                  <span className="network-hint">
                    {preferredNet === "bsc" ? t.checkout.previouslyUsed : t.checkout.networkBscHint}
                  </span>
                </span>
                {preferredNet === "bsc" ? <span className="badge">{t.checkout.previouslyUsed}</span> : null}
              </button>
            ) : null}
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {(step === "pay" || intentStatus === "PAID" || moneyDetected(intentStatus)) && (
        <>
          {checkingPayment && intentStatus === "SEEN" ? (
            <p className="alert alert-success" role="status" aria-live="polite">
              {t.checkout.paymentDetected}
            </p>
          ) : null}
          <PooliPaySheet
            storeName={pay.store_name}
            title={pay.title}
            fiatAmountToman={pay.fiat_amount_toman}
            option={selected}
            intentStatus={intentStatus}
            matched={matched}
            receipt={pay.receipt}
            fulfillmentStatus={pay.fulfillment_status}
            shippingProvider={pay.shipping_provider}
            trackingNumber={pay.tracking_number}
            countdown={countdown}
            onRefreshQuote={refreshQuote}
            refreshingQuote={refreshingQuote}
            checkingPayment={checkingPayment}
          />
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
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
