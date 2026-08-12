"use client";

import { FormEvent, useEffect, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";

type FieldMode = "required" | "optional" | "disabled";

type Defaults = {
  customer_fields: Record<string, FieldMode>;
  enabled_networks: string[];
  default_network: string;
  default_expiry_minutes: number;
  fulfillment_required: boolean;
};

const FIELD_KEYS = ["full_name", "phone", "shipping_address", "postal_code", "email", "customer_note"] as const;

export default function BuyerQuestionsPage() {
  const t = useT();
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const labels: Record<(typeof FIELD_KEYS)[number], string> = {
    full_name: t.settings.fieldFullName,
    phone: t.settings.fieldPhone,
    shipping_address: t.settings.fieldShipping,
    postal_code: t.settings.fieldPostal,
    email: t.settings.fieldEmail,
    customer_note: t.settings.fieldNote,
  };

  useEffect(() => {
    api<Defaults>("/api/v1/merchant/checkout-defaults")
      .then(setDefaults)
      .catch(() => undefined);
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!defaults) return;
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const saved = await api<Defaults>("/api/v1/merchant/checkout-defaults", {
        method: "PATCH",
        body: JSON.stringify(defaults),
      });
      setDefaults(saved);
      setMsg(t.common.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  if (!defaults) {
    return <p className="muted">{t.common.loading}</p>;
  }

  return (
    <div className="rise page-stack">
      <BackLink href="/app/settings/getting-paid" />
      <PageHeader title={t.settings.buyerQuestions} subtitle={t.settings.defaultsHint} />
      <form className="card-panel" onSubmit={save}>
        {FIELD_KEYS.map((key) => (
          <div className="field" key={key}>
            <label htmlFor={`field-${key}`}>{labels[key]}</label>
            <select
              id={`field-${key}`}
              value={defaults.customer_fields[key] || "optional"}
              onChange={(e) =>
                setDefaults({
                  ...defaults,
                  customer_fields: { ...defaults.customer_fields, [key]: e.target.value as FieldMode },
                })
              }
            >
              <option value="required">{t.settings.fieldRequired}</option>
              <option value="optional">{t.settings.fieldOptional}</option>
              <option value="disabled">{t.settings.fieldDisabled}</option>
            </select>
          </div>
        ))}
        <details className="details-block">
          <summary>{t.settings.paymentDefaults}</summary>
          <div className="field" style={{ marginTop: "var(--space-3)" }}>
            <label htmlFor="default_network">{t.settings.defaultNetwork}</label>
            <select
              id="default_network"
              value={defaults.default_network}
              onChange={(e) => setDefaults({ ...defaults, default_network: e.target.value })}
            >
              <option value="tron">{t.wallets.tron}</option>
              <option value="bsc">{t.wallets.bsc}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="expiry">{t.settings.defaultExpiry}</label>
            <input
              id="expiry"
              type="number"
              min={5}
              max={10080}
              className="tabular"
              value={defaults.default_expiry_minutes}
              onChange={(e) => setDefaults({ ...defaults, default_expiry_minutes: Number(e.target.value) || 60 })}
            />
          </div>
        </details>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {msg && <p className="ok">{msg}</p>}
        <button className="btn btn-primary" disabled={loading} style={{ marginTop: "var(--space-4)" }}>
          {loading ? t.common.loading : t.settings.save}
        </button>
      </form>
    </div>
  );
}
