"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { formatTomanInput, isValidTomanAmount, parseTomanInput } from "@/lib/toman";

type LinkInfo = {
  slug: string;
  title: string;
  description?: string;
  mode: string;
  fiat_amount_toman: number;
  min_amount_toman: number;
  max_amount_toman: number;
  store_name: string;
  logo_url?: string;
};

export default function PublicPaymentLinkPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug || "");
  const t = useT();
  const router = useRouter();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<LinkInfo>(`/api/v1/public/links/${encodeURIComponent(slug)}`)
      .then((d) => {
        setInfo(d);
        if (d.mode === "fixed" && d.fiat_amount_toman > 0) {
          setAmount(formatTomanInput(String(d.fiat_amount_toman)));
        }
      })
      .catch(() => setError("not_found"));
  }, [slug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!info) return;
    const value = info.mode === "fixed" ? info.fiat_amount_toman : parseTomanInput(amount);
    if (value <= 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await api<{ slug: string }>(`/api/v1/public/links/${encodeURIComponent(slug)}/start`, {
        method: "POST",
        body: JSON.stringify({ fiat_amount_toman: value }),
      });
      router.push(`/p/${res.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  if (!info && error === "not_found") {
    return (
      <main className="shell store-page">
        <p className="field-error">{t.common.error}</p>
      </main>
    );
  }
  if (!info) {
    return (
      <main className="shell store-page">
        <p className="muted">{t.common.loading}</p>
      </main>
    );
  }

  return (
    <main className="shell store-page rise">
      <div className="store-hero">
        {info.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.logo_url} alt="" className="store-logo" />
        ) : (
          <BrandMark variant="mark" size={56} />
        )}
        <p className="muted">{info.store_name}</p>
        <h1>{info.title || t.links.title}</h1>
        {info.description ? <p className="muted">{info.description}</p> : null}
      </div>
      <form className="stack-form" onSubmit={onSubmit}>
        {info.mode === "custom_amount" ? (
          <label>
            {t.create.amount}
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatTomanInput(e.target.value))}
              autoFocus
            />
          </label>
        ) : (
          <p className="amount-display">{formatTomanInput(String(info.fiat_amount_toman))} {t.checkout.toman}</p>
        )}
        {error && error !== "not_found" ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="btn-primary"
          type="submit"
          disabled={loading || (info.mode === "custom_amount" && !isValidTomanAmount(amount))}
        >
          {t.store.continuePay}
        </button>
      </form>
    </main>
  );
}
