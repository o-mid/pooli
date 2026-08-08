"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";

export default function CreateOrderPage() {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ checkout_url: string; id: string; slug: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const amount = Number(String(fd.get("amount")).replace(/,/g, ""));
    try {
      const res = await api<{ checkout_url: string; id: string; slug: string }>("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          fiat_amount_toman: amount,
          title: fd.get("title") || "",
          description: "",
          merchant_reference: fd.get("reference") || "",
          networks: ["tron", "bsc"],
        }),
      });
      const url = res.checkout_url || `${window.location.origin}/p/${res.slug}`;
      setResult({ ...res, checkout_url: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.checkout_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareLink() {
    if (!result || !navigator.share) return;
    try {
      await navigator.share({ url: result.checkout_url, title: t.brand });
    } catch {
      /* user cancelled */
    }
  }

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  if (result) {
    return (
      <div className="rise page-stack">
        <PageHeader title={t.create.created} />
        <div className="qr-card">
          <div className="qr-frame">
            <QRCodeSVG value={result.checkout_url} size={180} bgColor="#ffffff" fgColor="#0b1f1a" />
          </div>
          <p className="mono-ltr muted" style={{ marginTop: "var(--space-3)", fontSize: "var(--text-footnote)" }}>
            {result.checkout_url}
          </p>
          <div className="cta-stack" style={{ marginTop: "var(--space-4)" }}>
            {canShare ? (
              <>
                <button className="btn btn-primary" onClick={shareLink}>
                  {t.create.share}
                </button>
                <button className="btn btn-secondary" onClick={copyLink}>
                  {copied ? t.common.copied : t.create.copyLink}
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={copyLink}>
                {copied ? t.common.copied : t.create.copyLink}
              </button>
            )}
            <Link className="btn btn-secondary" href={`/p/${result.slug}`}>
              {t.create.openCheckout}
            </Link>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-tertiary btn-block"
          onClick={() => router.push(`/app/orders/${result.id}`)}
        >
          {t.common.back}
        </button>
      </div>
    );
  }

  return (
    <div className="rise page-stack">
      <PageHeader title={t.create.title} />
      <form className="card-panel" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="amount">{t.create.amount}</label>
          <input id="amount" name="amount" inputMode="numeric" placeholder="3800000" required className="tabular" />
        </div>
        <div className="field">
          <label htmlFor="title">{t.create.orderTitle}</label>
          <input id="title" name="title" />
        </div>
        <div className="field">
          <label htmlFor="reference">{t.create.reference}</label>
          <input id="reference" name="reference" />
        </div>
        <p className="field-hint" style={{ marginBottom: "var(--space-3)" }}>
          {t.create.networks}: TRON, BNB Chain
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? t.common.loading : t.create.create}
        </button>
      </form>
    </div>
  );
}
