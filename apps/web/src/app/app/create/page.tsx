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
  const fromIg = search.get("from") === "ig";
  const t = useT();
  const { showToast } = useToast();
  const [gate, setGate] = useState(true);
  const amountRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showMoreShare, setShowMoreShare] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [reference, setReference] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expiry, setExpiry] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api<{ merchant?: { onboarding_completed?: boolean } }>("/api/v1/me");
        if (cancelled) return;
        if (!me.merchant?.onboarding_completed) {
          router.replace("/app/onboarding");
          return;
        }
        setGate(false);
      } catch {
        if (cancelled) return;
        router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!gate) amountRef.current?.focus();
  }, [gate]);

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
      if (showMore) {
        if (reference.trim()) body.merchant_reference = reference.trim();
        const qty = Number(quantity);
        if (qty > 1) body.item_quantity = qty;
        const exp = Number(expiry);
        if (exp > 0) body.expires_in_minutes = exp;
        if (successMessage.trim()) body.success_message = successMessage.trim();
      }
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
      try {
        await navigator.clipboard.writeText(url);
        showToast(t.common.copied);
      } catch {
        // clipboard may be blocked
      }
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
        <div>
          {result.fiat_amount_toman ? (
            <p className="tabular home-today-amount" style={{ margin: 0 }}>
              {result.fiat_amount_toman.toLocaleString()} {t.checkout.toman}
            </p>
          ) : null}
          {result.title ? (
            <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-headline)" }}>{result.title}</p>
          ) : null}
          <p className="muted" style={{ marginTop: "var(--space-3)" }}>
            {t.create.shareHint}
          </p>
          <div className="cta-stack" style={{ marginTop: "var(--space-4)" }}>
            <button className="btn btn-primary" onClick={copyLink}>
              {t.create.pasteInChat}
            </button>
            <button className="btn btn-secondary" onClick={shareLink}>
              {canShare ? t.create.share : t.create.copyLink}
            </button>
          </div>
          <button
            type="button"
            className="quiet-link"
            style={{ marginTop: "var(--space-4)", background: "none", border: 0, width: "100%" }}
            onClick={() => setShowMoreShare((v) => !v)}
          >
            {t.create.moreShare}
          </button>
          {showMoreShare ? (
            <div className="cta-stack" style={{ marginTop: "var(--space-3)" }}>
              <button className="btn btn-secondary" type="button" onClick={() => setShowQR((v) => !v)}>
                {t.create.qr}
              </button>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <a className="btn btn-tertiary" style={{ flex: 1 }} href={telegramShareURL(shareText, result.checkout_url)} target="_blank" rel="noreferrer">
                  {t.create.shareTelegram}
                </a>
                <a className="btn btn-tertiary" style={{ flex: 1 }} href={whatsappShareURL(shareText)} target="_blank" rel="noreferrer">
                  {t.create.shareWhatsApp}
                </a>
              </div>
              <button className="btn btn-tertiary" type="button" onClick={copyLink}>
                {t.create.shareInstagram}
              </button>
              {showQR ? (
                <div className="qr-card">
                  <div className="qr-frame">
                    <QRCodeSVG value={result.checkout_url} size={180} bgColor="#ffffff" fgColor="#0b1f1a" />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <button type="button" className="btn btn-tertiary btn-block" onClick={() => router.push(`/app/orders/${result.id}`)}>
          {t.create.viewOrder}
        </button>
      </div>
    );
  }

  if (gate) {
    return <div className="rise page-stack muted">…</div>;
  }

  return (
    <div className="rise page-stack">
      <PageHeader title={t.create.title} />
      {fromIg ? <p className="muted">{t.create.fromIgHint}</p> : null}
      {customerName ? (
        <p className="muted" style={{ margin: 0 }}>
          {t.create.forCustomer} <strong>{customerName}</strong>
        </p>
      ) : null}
      <form className="form-stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="amount">{t.create.howMuch}</label>
          <div className="row-split">
            <input
              ref={amountRef}
              id="amount"
              name="amount"
              inputMode="numeric"
              placeholder="3,800,000"
              required
              className="tabular amount-input"
              value={amount}
              onChange={(e) => setAmount(formatTomanInput(e.target.value))}
              autoComplete="off"
            />
            <span className="muted">{t.checkout.toman}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="title">{t.create.description}</label>
          <input
            id="title"
            name="title"
            placeholder="Nike Air Max 90"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="quiet-link"
          style={{ background: "none", border: 0, marginBottom: "var(--space-3)" }}
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? t.create.hideOptions : t.create.moreOptions}
        </button>
        {showMore ? (
          <>
            <div className="field">
              <label htmlFor="quantity">{t.create.quantity}</label>
              <input
                id="quantity"
                className="tabular"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
            <div className="field">
              <label htmlFor="reference">{t.create.reference}</label>
              <input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="expiry">{t.create.expiry}</label>
              <input
                id="expiry"
                className="tabular"
                inputMode="numeric"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
            <div className="field">
              <label htmlFor="success">{t.create.successMessage}</label>
              <input id="success" value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} />
            </div>
          </>
        ) : null}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={loading || !amountValid}>
          {loading ? t.create.creating : customerId ? t.create.createShare : t.create.create}
        </button>
      </form>
      <Link className="quiet-link" href="/app/links">
        {t.create.reusableInstead}
      </Link>
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
