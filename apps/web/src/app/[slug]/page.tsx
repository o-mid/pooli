"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { formatTomanInput, isValidTomanAmount, parseTomanInput } from "@/lib/toman";

const RESERVED = new Set([
  "app", "p", "admin", "login", "register", "api", "m", "onboarding",
  "link", "links", "favicon.ico", "robots.txt", "manifest.webmanifest", "sw.js",
]);

type Store = {
  slug: string;
  store_name: string;
  description?: string;
  logo_url?: string;
  support_contact?: string;
  accepting_payments?: boolean;
};

export default function PublicStorePage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug || "");
  const t = useT();
  const router = useRouter();
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug || RESERVED.has(slug.toLowerCase())) {
      setError("not_found");
      return;
    }
    api<Store>(`/api/v1/public/stores/${encodeURIComponent(slug)}`)
      .then(setStore)
      .catch(() => setError("not_found"));
  }, [slug]);

  async function onPay(e: FormEvent) {
    e.preventDefault();
    if (!isValidTomanAmount(amount) || !store) return;
    setLoading(true);
    setError("");
    try {
      const res = await api<{ slug: string; checkout_url?: string }>(
        `/api/v1/public/stores/${encodeURIComponent(slug)}/pay`,
        {
          method: "POST",
          body: JSON.stringify({
            fiat_amount_toman: parseTomanInput(amount),
            reference: reference.trim(),
          }),
        },
      );
      router.push(`/p/${res.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  if (error === "not_found" && !store) {
    return (
      <main className="shell store-page">
        <p className="field-error">{t.common.error}</p>
      </main>
    );
  }

  if (!store) {
    return (
      <main className="shell store-page">
        <p className="muted">{t.common.loading}</p>
      </main>
    );
  }

  return (
    <main className="shell store-page rise">
      <div className="store-hero">
        {store.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logo_url} alt="" className="store-logo" />
        ) : (
          <BrandMark variant="mark" size={56} />
        )}
        <h1>{store.store_name}</h1>
        {store.description ? <p className="muted">{store.description}</p> : null}
        <p className="store-pay-label">{t.store.payThisBusiness}</p>
      </div>

      <form className="stack-form" onSubmit={onPay}>
        <label>
          {t.create.amount}
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatTomanInput(e.target.value))}
            placeholder="3,800,000"
            autoFocus
          />
        </label>
        <label>
          {t.store.optionalReference}
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t.store.referencePlaceholder} />
        </label>
        {error && error !== "not_found" ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn-primary" type="submit" disabled={loading || !isValidTomanAmount(amount)}>
          {t.store.continuePay}
        </button>
      </form>

      {store.support_contact ? <p className="muted support-line">{store.support_contact}</p> : null}
      <p className="powered muted">
        <BrandMark variant="mark" size={18} /> {t.brand}
      </p>
    </main>
  );
}
