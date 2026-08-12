"use client";

import { FormEvent, useEffect, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { formatTomanInput, isValidTomanAmount, parseTomanInput } from "@/lib/toman";

type PayLink = {
  id: string;
  slug: string;
  title: string;
  mode: string;
  fiat_amount_toman: number;
  active: boolean;
  public_url: string;
};

export default function PaymentLinksPage() {
  const t = useT();
  const { showToast } = useToast();
  const [links, setLinks] = useState<PayLink[]>([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("fixed");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const d = await api<{ payment_links: PayLink[] }>("/api/v1/payment-links");
    setLinks(d.payment_links || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        title: title.trim() || t.links.title,
        mode,
      };
      if (mode === "fixed") {
        if (!isValidTomanAmount(amount)) {
          setError(t.common.error);
          setLoading(false);
          return;
        }
        body.fiat_amount_toman = parseTomanInput(amount);
      } else {
        body.min_amount_toman = 10000;
      }
      await api("/api/v1/payment-links", { method: "POST", body: JSON.stringify(body) });
      setTitle("");
      setAmount("");
      await load();
      showToast(t.common.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rise page-stack">
      <BackLink href="/app/settings/getting-paid" />
      <PageHeader title={t.links.title} subtitle={t.links.hint} />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="card-panel" onSubmit={onCreate}>
        <div className="field">
          <label htmlFor="link-title">{t.create.orderTitle}</label>
          <input id="link-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <fieldset className="choice-set">
          <legend>{t.links.create}</legend>
          <label className="choice">
            <input type="radio" checked={mode === "fixed"} onChange={() => setMode("fixed")} />
            {t.links.fixed}
          </label>
          <label className="choice">
            <input type="radio" checked={mode === "custom_amount"} onChange={() => setMode("custom_amount")} />
            {t.links.custom}
          </label>
        </fieldset>
        {mode === "fixed" ? (
          <div className="field">
            <label htmlFor="link-amount">{t.create.amount}</label>
            <input
              id="link-amount"
              className="tabular"
              value={amount}
              onChange={(e) => setAmount(formatTomanInput(e.target.value))}
              inputMode="numeric"
            />
          </div>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {t.links.create}
        </button>
      </form>

      {links.length === 0 ? (
        <EmptyState title={t.links.empty}>{t.links.hint}</EmptyState>
      ) : (
        <div className="list-group">
          {links.map((l) => (
            <div key={l.id} className="list-row" style={{ cursor: "default" }}>
              <div className="list-row-body">
                <div className="list-row-title">{l.title || l.slug}</div>
                <div className="list-row-meta tabular">
                  {l.mode === "fixed" ? `${formatTomanInput(String(l.fiat_amount_toman))} ${t.checkout.toman}` : t.links.custom}
                  {" · "}
                  {l.active ? t.links.active : t.links.inactive}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-tertiary"
                style={{ width: "auto" }}
                onClick={async () => {
                  await navigator.clipboard.writeText(l.public_url);
                  showToast(t.common.copied);
                }}
              >
                {t.common.copy}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
