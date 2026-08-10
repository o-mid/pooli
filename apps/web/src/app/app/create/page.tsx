"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { buildShareText, sharePaymentLink, telegramShareURL, whatsappShareURL } from "@/lib/share";
import { formatTomanInput, isValidTomanAmount, parseTomanInput } from "@/lib/toman";

type Result = {
  checkout_url: string;
  id: string;
  slug: string;
  title?: string;
  fiat_amount_toman?: number;
};

function CreateOrderForm() {
  const router = useRouter();
  const search = useSearchParams();
  const customerId = search.get("customer_id") || "";
  const customerName = search.get("customer_name") || "";
  const t = useT();
  const { showToast } = useToast();
  const amountRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValidTomanAmount(amount)) return;
    setLoading(true);
    setError("");
    const value = parseTomanInput(amount);
    try {
      const body: Record<string, unknown> = {
        fiat_amount_toman: value,
        title: title.trim(),
        description: "",
      };
      if (customerId) body.customer_id = customerId;
      const res = await api<Result>("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const url = res.checkout_url || `${window.location.origin}/p/${res.slug}`;
      setResult({
        ...res,
        checkout_url: url,
        title: title.trim() || res.title,
        fiat_amount_toman: value,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.checkout_url);
    showToast(t.common.copied);
  }

  async function shareLink() {
    if (!result) return;
    const text = buildShareText({
      title: result.title,
      amountToman: result.fiat_amount_toman,
      tomanLabel: t.checkout.toman,
      completeLabel: t.create.completeOrder,
      url: result.checkout_url,
    });
    const outcome = await sharePaymentLink({
      title: result.title || t.brand,
      text,
      url: result.checkout_url,
    });
    if (outcome === "copied") showToast(t.common.copied);
  }

  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const amountValid = isValidTomanAmount(amount);

  if (result) {
    const shareText = buildShareText({
      title: result.title,
      amountToman: result.fiat_amount_toman,
      tomanLabel: t.checkout.toman,
      completeLabel: t.create.completeOrder,
      url: result.checkout_url,
    });
    return (
      <div className="rise page-stack">
        <PageHeader title={t.create.created} />
        <div className="card-panel" style={{ textAlign: "center" }}>
          <p className="ok" style={{ margin: 0, fontWeight: 600 }}>
            ✓ {t.create.created}
          </p>
          {result.fiat_amount_toman ? (
            <p className="tabular" style={{ fontSize: "var(--text-title2)", margin: "var(--space-3) 0 0", fontWeight: 700 }}>
              {result.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
            </p>
          ) : null}
          {result.title ? (
            <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-headline)" }}>{result.title}</p>
          ) : null}
          <p className="mono-ltr muted" style={{ marginTop: "var(--space-3)", fontSize: "var(--text-footnote)" }}>
            {result.checkout_url.replace(/^https?:\/\//, "")}
          </p>

          {showQR ? (
            <div className="qr-card" style={{ marginTop: "var(--space-4)" }}>
              <div className="qr-frame">
                <QRCodeSVG value={result.checkout_url} size={180} bgColor="#ffffff" fgColor="#0b1f1a" />
              </div>
            </div>
          ) : null}

          <div className="cta-stack" style={{ marginTop: "var(--space-4)" }}>
            <button className="btn btn-primary" onClick={shareLink}>
              {canShare ? t.create.share : t.create.copyLink}
            </button>
            <button className="btn btn-secondary" onClick={copyLink}>
              {t.create.copyLink}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowQR((v) => !v)}>
              {t.create.qr}
            </button>
            <Link className="btn btn-secondary" href={`/p/${result.slug}`}>
              {t.create.openCheckout}
            </Link>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <a className="btn btn-tertiary" style={{ flex: 1 }} href={telegramShareURL(shareText, result.checkout_url)} target="_blank" rel="noreferrer">
                {t.create.shareTelegram}
              </a>
              <a className="btn btn-tertiary" style={{ flex: 1 }} href={whatsappShareURL(shareText)} target="_blank" rel="noreferrer">
                {t.create.shareWhatsApp}
              </a>
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-tertiary btn-block" onClick={() => router.push(`/app/orders/${result.id}`)}>
          {t.common.back}
        </button>
      </div>
    );
  }

  return (
    <div className="rise page-stack">
      <PageHeader title={t.create.title} />
      {customerName ? (
        <p className="muted" style={{ margin: 0 }}>
          {t.create.forCustomer} <strong>{customerName}</strong>
        </p>
      ) : null}
      <form className="card-panel" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="amount">{t.create.howMuch}</label>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <input
              ref={amountRef}
              id="amount"
              name="amount"
              inputMode="numeric"
              placeholder="3,800,000"
              required
              className="tabular"
              value={amount}
              onChange={(e) => setAmount(formatTomanInput(e.target.value))}
              autoComplete="off"
              style={{ flex: 1, fontSize: "var(--text-title2)", fontWeight: 700 }}
            />
            <span className="muted" style={{ flexShrink: 0 }}>
              {t.checkout.toman}
            </span>
          </div>
          <p className="field-hint">{t.create.amountHint}</p>
        </div>
        <div className="field">
          <label htmlFor="title">{t.create.description}</label>
          <input
            id="title"
            name="title"
            placeholder="Nike Air Max"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={loading || !amountValid}>
          {loading ? t.common.loading : customerId ? t.create.createShare : t.create.create}
        </button>
      </form>
    </div>
  );
}

export default function CreateOrderPage() {
  return (
    <Suspense fallback={<div className="rise page-stack muted">…</div>}>
      <CreateOrderForm />
    </Suspense>
  );
}
