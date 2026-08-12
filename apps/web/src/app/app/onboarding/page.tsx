"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";

type Onboarding = {
  completed: boolean;
  steps: { can_complete: boolean; wallets: boolean };
  bsc_checkout_enabled: boolean;
  public_store_url_prefix: string;
  wallet_count: number;
  merchant: {
    display_name: string;
    slug: string;
  };
};

const TOTAL = 3;

function validateAddress(network: string, address: string): boolean {
  const trimmed = address.trim();
  if (network === "tron") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
  if (network === "bsc") return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  return false;
}

export default function OnboardingPage() {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Onboarding | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [slugStatus, setSlugStatus] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [walletNetwork, setWalletNetwork] = useState("tron");
  const [walletAddress, setWalletAddress] = useState("");

  const load = useCallback(async () => {
    const onb = await api<Onboarding>("/api/v1/merchant/onboarding");
    setData(onb);
    setDisplayName(onb.merchant.display_name || "");
    setSlug(onb.merchant.slug || "");
    if (onb.completed) {
      router.replace("/app");
    }
  }, [router]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : t.common.error));
  }, [load, t.common.error]);

  async function checkSlug(value: string) {
    if (!value.trim()) {
      setSlugStatus("");
      return;
    }
    try {
      const res = await api<{ available: boolean; reason?: string; suggestion?: string; slug: string }>(
        `/api/v1/merchant/slug/check?slug=${encodeURIComponent(value)}`,
      );
      if (!res.available) {
        setSlugStatus(res.reason === "reserved" ? t.onboarding.slugReserved : t.onboarding.slugTaken);
        if (res.suggestion) setSlug(res.suggestion);
      } else {
        setSlug(res.slug);
        setSlugStatus("");
      }
    } catch {
      setSlugStatus(t.onboarding.slugInvalid);
    }
  }

  async function suggestSlug(name: string) {
    const res = await api<{ slug: string }>(
      `/api/v1/merchant/slug/suggest?name=${encodeURIComponent(name || "store")}`,
    );
    setSlug(res.slug);
    setSlugStatus("");
  }

  async function saveBusiness() {
    await api("/api/v1/merchant", {
      method: "PATCH",
      body: JSON.stringify({
        display_name: displayName.trim(),
        name: displayName.trim(),
        slug: slug.trim(),
      }),
    });
  }

  async function addWallet(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!validateAddress(walletNetwork, walletAddress)) {
      setError(t.wallets.invalidAddress);
      return;
    }
    setLoading(true);
    try {
      await api("/api/v1/wallets", {
        method: "POST",
        body: JSON.stringify({
          network: walletNetwork,
          address: walletAddress.trim(),
          label: walletNetwork === "tron" ? t.onboarding.tronLabel : t.onboarding.bscLabel,
          is_default: true,
        }),
      });
      setWalletAddress("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function onNext() {
    setError("");
    setLoading(true);
    try {
      if (step === 0) {
        if (!displayName.trim()) {
          setError(t.common.error);
          setLoading(false);
          return;
        }
        if (!slug.trim()) await suggestSlug(displayName);
        await saveBusiness();
      } else if (step === 1) {
        if ((data?.wallet_count || 0) < 1) {
          setError(t.onboarding.walletsHint);
          setLoading(false);
          return;
        }
      } else if (step === 2) {
        await api("/api/v1/merchant/onboarding/complete", { method: "POST", body: "{}" });
        router.push("/app/create");
        return;
      }
      await load();
      setStep((s) => Math.min(s + 1, TOTAL - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return <p className="muted">{t.common.loading}</p>;
  }

  const stepLabel = t.onboarding.stepOf.replace("{n}", String(step + 1)).replace("{total}", String(TOTAL));

  return (
    <div className="rise page-stack onboarding">
      <header className="onboarding-head">
        <p className="eyebrow">{stepLabel}</p>
        <h1>{t.onboarding.title}</h1>
        <div className="onboarding-progress" aria-hidden>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span key={i} className={i <= step ? "on" : ""} />
          ))}
        </div>
      </header>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {step === 0 && (
        <section className="stack-form">
          <h2>{t.onboarding.business}</h2>
          <p className="muted">{t.onboarding.businessHint}</p>
          <label>
            {t.onboarding.storeName}
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={() => {
                if (displayName.trim() && !slug) void suggestSlug(displayName);
              }}
              autoComplete="organization"
            />
          </label>
          <label>
            {t.onboarding.storeSlug}
            <div className="slug-row">
              <span className="muted">{t.onboarding.storeSlugHint}</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                onBlur={() => checkSlug(slug)}
              />
            </div>
            {slugStatus && <span className="field-error">{slugStatus}</span>}
          </label>
        </section>
      )}

      {step === 1 && (
        <section className="stack-form">
          <h2>{t.onboarding.wallets}</h2>
          <p className="muted">{t.onboarding.walletsHint}</p>
          {data.wallet_count > 0 ? (
            <p className="ok">{t.trust.walletConfigured}</p>
          ) : (
            <form onSubmit={addWallet} className="stack-form">
              <label>
                {t.onboarding.walletNetwork}
                <select value={walletNetwork} onChange={(e) => setWalletNetwork(e.target.value)}>
                  <option value="tron">{t.onboarding.tronLabel}</option>
                  {data.bsc_checkout_enabled ? <option value="bsc">{t.onboarding.bscLabel}</option> : null}
                </select>
              </label>
              <label>
                {t.onboarding.walletAddress}
                <input className="mono-ltr" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} autoComplete="off" />
              </label>
              <button type="submit" className="btn btn-secondary" disabled={loading}>
                {t.onboarding.addWallet}
              </button>
            </form>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="stack-form ready-card">
          <h2>{t.onboarding.readyTitle}</h2>
          <p>{t.onboarding.readyBody}</p>
          {data.merchant.slug ? (
            <p className="muted">
              {data.public_store_url_prefix}
              {data.merchant.slug}
            </p>
          ) : null}
        </section>
      )}

      <div className="onboarding-actions">
        {step > 0 && step < 2 ? (
          <button type="button" className="btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={loading}>
            {t.onboarding.back}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn-primary" onClick={() => onNext()} disabled={loading}>
          {step === 2 ? t.onboarding.createPayment : t.onboarding.next}
        </button>
      </div>
    </div>
  );
}
