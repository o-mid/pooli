"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/LocaleProvider";
import { api, apiMultipart } from "@/lib/api";

type Steps = {
  business: boolean;
  defaults: boolean;
  wallets: boolean;
  rail: boolean;
  checkout: boolean;
  notifications: boolean;
  ready: boolean;
  can_complete: boolean;
};

type Onboarding = {
  completed: boolean;
  steps: Steps;
  bsc_checkout_enabled: boolean;
  checkout_networks: string[];
  public_store_url_prefix: string;
  wallet_count: number;
  merchant: {
    display_name: string;
    slug: string;
    description: string;
    logo_url?: string;
    support_email: string;
    support_phone: string;
    preferred_locale: string;
  };
  checkout_defaults: {
    customer_fields: Record<string, string>;
    enabled_networks: string[];
    default_network: string;
    default_expiry_minutes: number;
    fulfillment_required: boolean;
    success_message: string;
    checkout_accent: string;
  };
};

const TOTAL = 7;

function validateAddress(network: string, address: string): boolean {
  const trimmed = address.trim();
  if (network === "tron") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
  if (network === "bsc") return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  return false;
}

function fieldMode(fields: Record<string, string>, key: string): string {
  return fields[key] || "disabled";
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
  const [description, setDescription] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [locale, setLocale] = useState("fa");
  const [walletNetwork, setWalletNetwork] = useState("tron");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLabel, setWalletLabel] = useState("");
  const [defaultNetwork, setDefaultNetwork] = useState("tron");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [expiry, setExpiry] = useState(60);
  const [fulfillment, setFulfillment] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");
  const [emailPaid, setEmailPaid] = useState(true);
  const [emailAttn, setEmailAttn] = useState(true);
  const [emailOrders, setEmailOrders] = useState(true);

  const load = useCallback(async () => {
    const onb = await api<Onboarding>("/api/v1/merchant/onboarding");
    setData(onb);
    setDisplayName(onb.merchant.display_name || "");
    setSlug(onb.merchant.slug || "");
    setDescription(onb.merchant.description || "");
    setSupportEmail(onb.merchant.support_email || "");
    setSupportPhone(onb.merchant.support_phone || "");
    setLocale(onb.merchant.preferred_locale || "fa");
    setDefaultNetwork(onb.checkout_defaults.default_network || "tron");
    setFields(onb.checkout_defaults.customer_fields || {});
    setExpiry(onb.checkout_defaults.default_expiry_minutes || 60);
    setFulfillment(onb.checkout_defaults.fulfillment_required);
    setSuccessMessage(onb.checkout_defaults.success_message || "");
    if (onb.completed) {
      setStep(6);
    }
  }, []);

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

  async function suggestSlug() {
    const res = await api<{ slug: string }>(
      `/api/v1/merchant/slug/suggest?name=${encodeURIComponent(displayName || "store")}`,
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
        description: description.trim(),
        support_email: supportEmail.trim(),
        support_phone: supportPhone.trim(),
        support_contact: supportEmail.trim() || supportPhone.trim(),
      }),
    });
  }

  async function saveDefaults() {
    await api("/api/v1/merchant/notification-prefs", {
      method: "PATCH",
      body: JSON.stringify({ preferred_locale: locale }),
    });
  }

  async function addWallet(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!validateAddress(walletNetwork, walletAddress)) {
      setError(t.common.error);
      return;
    }
    setLoading(true);
    try {
      await api("/api/v1/wallets", {
        method: "POST",
        body: JSON.stringify({
          network: walletNetwork,
          address: walletAddress.trim(),
          label: walletLabel.trim() || (walletNetwork === "tron" ? t.onboarding.tronLabel : t.onboarding.bscLabel),
          is_default: true,
        }),
      });
      setWalletAddress("");
      setWalletLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function saveRail() {
    const enabled = data?.bsc_checkout_enabled
      ? ["tron", "bsc"]
      : ["tron"];
    await api("/api/v1/merchant/checkout-defaults", {
      method: "PATCH",
      body: JSON.stringify({
        enabled_networks: enabled,
        default_network: defaultNetwork === "bsc" && data?.bsc_checkout_enabled ? "bsc" : "tron",
      }),
    });
  }

  async function saveCheckout() {
    await api("/api/v1/merchant/checkout-defaults", {
      method: "PATCH",
      body: JSON.stringify({
        customer_fields: fields,
        default_expiry_minutes: expiry,
        fulfillment_required: fulfillment,
        success_message: successMessage,
      }),
    });
  }

  async function saveNotify() {
    await api("/api/v1/merchant/notification-prefs", {
      method: "PATCH",
      body: JSON.stringify({
        email: {
          payment_received: emailPaid,
          needs_attention: emailAttn,
          order_updates: emailOrders,
        },
      }),
    });
  }

  async function onNext() {
    setError("");
    setLoading(true);
    try {
      if (step === 0) {
        if (!displayName.trim() || !slug.trim()) {
          setError(t.common.error);
          setLoading(false);
          return;
        }
        await saveBusiness();
      } else if (step === 1) {
        await saveDefaults();
      } else if (step === 2) {
        if ((data?.wallet_count || 0) < 1) {
          setError(t.onboarding.walletsHint);
          setLoading(false);
          return;
        }
      } else if (step === 3) {
        await saveRail();
      } else if (step === 4) {
        await saveCheckout();
      } else if (step === 5) {
        await saveNotify();
      } else if (step === 6) {
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

  async function onLogo(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.append("logo", file);
    try {
      await apiMultipart("/api/v1/merchant/logo", fd);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  function setField(key: string, mode: string) {
    setFields((prev) => ({ ...prev, [key]: mode }));
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
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="organization" />
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
            <button type="button" className="btn-ghost" onClick={() => suggestSlug().catch(() => undefined)}>
              {t.onboarding.suggestSlug}
            </button>
          </label>
          <label>
            {t.onboarding.description}
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </label>
          <label>
            {t.settings.logo}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onLogo(e.target.files?.[0] || null)} />
          </label>
          {data.merchant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.merchant.logo_url} alt="" className="onboarding-logo" />
          ) : null}
          <label>
            {t.onboarding.supportEmail}
            <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
          </label>
          <label>
            {t.onboarding.supportPhone}
            <input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} />
          </label>
        </section>
      )}

      {step === 1 && (
        <section className="stack-form">
          <h2>{t.onboarding.defaults}</h2>
          <p className="muted">{t.onboarding.defaultsHint}</p>
          <fieldset className="choice-set">
            <legend>{t.onboarding.locale}</legend>
            <label className="choice">
              <input type="radio" checked={locale === "fa"} onChange={() => setLocale("fa")} />
              {t.onboarding.localeFa}
            </label>
            <label className="choice">
              <input type="radio" checked={locale === "en"} onChange={() => setLocale("en")} />
              {t.onboarding.localeEn}
            </label>
          </fieldset>
        </section>
      )}

      {step === 2 && (
        <section className="stack-form">
          <h2>{t.onboarding.wallets}</h2>
          <p className="muted">{t.onboarding.walletsHint}</p>
          <p className="stat-chip">
            {data.wallet_count > 0 ? `${data.wallet_count}` : "0"} wallet(s)
          </p>
          <form onSubmit={addWallet} className="stack-form">
            <label>
              {t.onboarding.walletNetwork}
              <select value={walletNetwork} onChange={(e) => setWalletNetwork(e.target.value)}>
                <option value="tron">{t.onboarding.tronLabel}</option>
                {data.bsc_checkout_enabled ? (
                  <option value="bsc">{t.onboarding.bscLabel}</option>
                ) : null}
              </select>
            </label>
            {!data.bsc_checkout_enabled && <p className="muted">{t.onboarding.bscUnavailable}</p>}
            <label>
              {t.onboarding.walletAddress}
              <input value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} autoComplete="off" />
            </label>
            <label>
              {t.onboarding.walletLabel}
              <input value={walletLabel} onChange={(e) => setWalletLabel(e.target.value)} />
            </label>
            <button type="submit" className="btn-secondary" disabled={loading}>
              {t.onboarding.addWallet}
            </button>
          </form>
        </section>
      )}

      {step === 3 && (
        <section className="stack-form">
          <h2>{t.onboarding.rail}</h2>
          <p className="muted">{t.onboarding.railHint}</p>
          <label className="choice">
            <input type="radio" checked={defaultNetwork === "tron"} onChange={() => setDefaultNetwork("tron")} />
            {t.onboarding.railTron}
          </label>
          {data.bsc_checkout_enabled ? (
            <label className="choice">
              <input type="radio" checked={defaultNetwork === "bsc"} onChange={() => setDefaultNetwork("bsc")} />
              {t.onboarding.railBsc}
            </label>
          ) : (
            <p className="muted">{t.onboarding.bscUnavailable}</p>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="stack-form">
          <h2>{t.onboarding.checkout}</h2>
          <p className="muted">{t.onboarding.checkoutHint}</p>
          {(
            [
              ["full_name", t.onboarding.requireName],
              ["phone", t.onboarding.requirePhone],
              ["email", t.onboarding.requireEmail],
              ["shipping_address", t.onboarding.requireAddress],
              ["postal_code", t.onboarding.requirePostal],
              ["customer_note", t.onboarding.allowNote],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <select value={fieldMode(fields, key)} onChange={(e) => setField(key, e.target.value)}>
                <option value="required">{t.settings.fieldRequired}</option>
                <option value="optional">{t.settings.fieldOptional}</option>
                <option value="disabled">{t.settings.fieldDisabled}</option>
              </select>
            </label>
          ))}
          <label className="choice">
            <input type="checkbox" checked={fulfillment} onChange={(e) => setFulfillment(e.target.checked)} />
            {t.onboarding.shippingRequired}
          </label>
          <label>
            {t.onboarding.expiry}
            <input type="number" min={5} max={10080} value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} />
          </label>
          <label>
            {t.onboarding.successMessage}
            <input value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} />
          </label>
        </section>
      )}

      {step === 5 && (
        <section className="stack-form">
          <h2>{t.onboarding.notifications}</h2>
          <p className="muted">{t.onboarding.notificationsHint}</p>
          <label className="choice">
            <input type="checkbox" checked={emailPaid} onChange={(e) => setEmailPaid(e.target.checked)} />
            {t.onboarding.emailPayments}
          </label>
          <label className="choice">
            <input type="checkbox" checked={emailAttn} onChange={(e) => setEmailAttn(e.target.checked)} />
            {t.onboarding.emailAttention}
          </label>
          <label className="choice">
            <input type="checkbox" checked={emailOrders} onChange={(e) => setEmailOrders(e.target.checked)} />
            {t.onboarding.emailOrders}
          </label>
          <p className="muted">{t.onboarding.telegramLater}</p>
        </section>
      )}

      {step === 6 && (
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
        {step > 0 && step < 6 ? (
          <button type="button" className="btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={loading}>
            {t.onboarding.back}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn-primary" onClick={() => onNext()} disabled={loading}>
          {step === 6 ? t.onboarding.createPayment : step === 5 ? t.onboarding.finish : t.onboarding.next}
        </button>
      </div>
    </div>
  );
}
