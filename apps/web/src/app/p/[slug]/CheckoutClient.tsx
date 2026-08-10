"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { PaymentProgress } from "@/components/PaymentProgress";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { WalletAddress } from "@/components/ui/WalletAddress";
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
};

type Step = "details" | "network" | "pay";

export default function CheckoutClient() {
  const params = useParams<{ slug: string }>();
  const t = useT();
  const { locale } = useLocale();
  const { showToast } = useToast();
  const [pay, setPay] = useState<Pay | null>(null);
  const [step, setStep] = useState<Step>("details");
  const [selected, setSelected] = useState<PaymentOption | null>(null);
  const [error, setError] = useState("");
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

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    showToast(t.common.copied);
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
  const onPayStep = step === "pay" || intentStatus === "PAID";
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
            <button type="button" className="recommended" onClick={() => chooseNetwork("tron")}>
              <span>
                <strong>USDT · TRON</strong>
                <span className="network-hint">{t.checkout.networkTronHint}</span>
              </span>
              <span className="badge">{t.checkout.recommend}</span>
            </button>
            <button type="button" onClick={() => chooseNetwork("bsc")}>
              <span>
                <strong>USDT · BNB Chain</strong>
                <span className="network-hint">{t.checkout.networkBscHint}</span>
              </span>
            </button>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {step === "pay" && selected && intentStatus !== "PAID" && (
        <section className="section">
          <div className="alert alert-warning" role="alert">
            {t.checkout.wrongNetwork}
          </div>

          <div className="card-panel">
            <p className="section-title" style={{ paddingInline: 0 }}>
              {t.checkout.exactAmount}
            </p>
            <AmountDisplay
              primary={`${selected.pay_usdt_amount} USDT`}
              secondary={`${selected.network.toUpperCase()} · ${pay.fiat_amount_toman.toLocaleString()} ${t.checkout.toman}`}
            />
            <p className="field-hint" style={{ marginTop: "var(--space-2)" }}>
              {t.checkout.exactHint}
            </p>
            <p className="muted tabular pulse" style={{ margin: "var(--space-3) 0 0" }}>
              {t.checkout.quoteExpires}: {countdown}
            </p>

            <div className="qr-card" style={{ marginTop: "var(--space-4)" }}>
              <div className="qr-frame">
                <QRCodeSVG value={qrPayload} size={170} bgColor="#ffffff" fgColor="#0b1f1a" />
              </div>
            </div>

            <div style={{ marginTop: "var(--space-4)" }}>
              <p className="section-title" style={{ paddingInline: 0, marginBottom: "var(--space-2)" }}>
                {t.wallets.address}
              </p>
              <WalletAddress address={selected.destination_address} showCopy={false} />
            </div>

            <div className="cta-stack" style={{ marginTop: "var(--space-4)" }}>
              {selected.payment_uri && (
                <a className="btn btn-secondary" href={selected.payment_uri}>
                  {t.checkout.openWallet}
                </a>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => copy(selected.pay_usdt_amount)}>
                {t.checkout.copyAmount}
              </button>
            </div>

            <PaymentProgress
              status={intentStatus || "AWAITING_PAYMENT"}
              network={selected.network}
              confirmations={matched?.confirmations}
              requiredConfirmations={matched?.required_confirmations}
              txHash={matched?.tx_hash}
              explorerUrl={matched?.explorer_url}
            />
          </div>

          <div className="sticky-cta">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => copy(selected.destination_address)}
            >
              {t.checkout.copyAddress}
            </button>
          </div>
        </section>
      )}

      {intentStatus === "PAID" && (
        <section className="card-panel success-pulse">
          <div className="alert alert-success" role="status" style={{ marginBottom: "var(--space-4)", textAlign: "center" }}>
            {t.receipt.title}
          </div>
          <p style={{ margin: 0, fontWeight: 600, textAlign: "center" }}>{pay.store_name}</p>
          <p style={{ margin: "var(--space-2) 0 0", textAlign: "center" }}>{pay.title || t.checkout.orderRef}</p>
          <AmountDisplay
            primary={`${pay.fiat_amount_toman.toLocaleString()} ${t.checkout.toman}`}
            secondary={
              pay.receipt?.usdt_amount
                ? `${pay.receipt.usdt_amount} USDT · ${(pay.receipt.network || selected?.network || "").toUpperCase()}`
                : undefined
            }
          />
          {pay.receipt?.order_reference ? (
            <p className="muted mono-ltr" style={{ textAlign: "center", fontSize: "var(--text-footnote)" }}>
              {t.checkout.orderRef} #{pay.receipt.order_reference}
            </p>
          ) : null}
          <PaymentProgress
            status="PAID"
            network={selected?.network || pay.receipt?.network}
            confirmations={matched?.confirmations}
            requiredConfirmations={matched?.required_confirmations}
            txHash={matched?.tx_hash || pay.receipt?.tx_hash}
            explorerUrl={matched?.explorer_url || pay.receipt?.explorer_url}
          />

          <div style={{ marginTop: "var(--space-4)" }}>
            <h2 className="section-title" style={{ paddingInline: 0 }}>
              {t.checkout.orderStatus}
            </h2>
            <ul className="order-status-list">
              <li>✓ {t.checkout.paymentReceived}</li>
              <li>✓ {t.checkout.orderConfirmed}</li>
              {pay.fulfillment_status === "SHIPPED" || pay.fulfillment_status === "DELIVERED" ? (
                <li>✓ {t.checkout.orderShipped}</li>
              ) : (
                <li className="muted">◷ {t.fulfillment.PROCESSING}</li>
              )}
            </ul>
            {pay.tracking_number ? (
              <div style={{ marginTop: "var(--space-3)" }}>
                <div className="muted">{t.checkout.trackingCode}</div>
                <div className="mono-ltr" style={{ fontWeight: 600 }}>
                  {pay.shipping_provider ? `${pay.shipping_provider} · ` : ""}
                  {pay.tracking_number}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: "var(--space-2)" }}
                  onClick={() => copy(pay.tracking_number || "")}
                >
                  {t.common.copy}
                </button>
              </div>
            ) : null}
          </div>

          {(matched?.explorer_url || pay.receipt?.explorer_url) && (
            <a
              className="btn btn-secondary"
              style={{ marginTop: "var(--space-4)" }}
              href={matched?.explorer_url || pay.receipt?.explorer_url}
              target="_blank"
              rel="noreferrer"
            >
              {t.checkout.viewTx}
            </a>
          )}
        </section>
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
