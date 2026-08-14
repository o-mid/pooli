"use client";

import { FormEvent, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { useToast } from "@/components/ui/Toast";
import { formatTomanInput, isValidTomanAmount, parseTomanInput } from "@/lib/toman";

type Created = {
  slug: string;
  checkout_url: string;
  telegram_checkout_url: string;
};

export default function TelegramCreatePage() {
  const t = useT();
  const { showToast } = useToast();
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Created | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidTomanAmount(amount)) return;
    setLoading(true);
    setError("");
    try {
      const initData = window.Telegram?.WebApp?.initData || "";
      const res = await fetch("/api/v1/integrations/telegram/miniapp/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
        },
        body: JSON.stringify({
          fiat_amount_toman: parseTomanInput(amount),
          title: title.trim(),
        }),
      });
      const data = (await res.json()) as Created & { error?: string };
      if (!res.ok) {
        setError(data.error || t.common.error);
        return;
      }
      setResult(data);
    } catch {
      setError(t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    showToast(t.common.copied);
  }

  function shareTelegram() {
    if (!result) return;
    const tw = window.Telegram?.WebApp;
    if (tw?.switchInlineQuery) {
      tw.switchInlineQuery(result.telegram_checkout_url, ["users", "groups"]);
      return;
    }
    void copy(result.telegram_checkout_url);
  }

  if (result) {
    return (
      <main className="shell rise page-stack">
        <h1 className="page-title">{t.create.created}</h1>
        <div className="cta-stack">
          <button type="button" className="btn btn-primary" onClick={shareTelegram}>
            {t.miniapp.shareBuyer}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void copy(result.telegram_checkout_url)}>
            {t.miniapp.copyTelegram}
          </button>
          <button type="button" className="btn btn-tertiary" onClick={() => void copy(result.checkout_url)}>
            {t.miniapp.copyWeb}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell rise page-stack">
      <h1 className="page-title">{t.miniapp.create}</h1>
      <p className="muted">{t.miniapp.connectHint}</p>
      <form className="form-stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="amount">{t.create.howMuch}</label>
          <input
            id="amount"
            className="tabular amount-input"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatTomanInput(e.target.value))}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="title">{t.create.description}</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" disabled={loading || !isValidTomanAmount(amount)}>
          {loading ? t.create.creating : t.create.create}
        </button>
      </form>
    </main>
  );
}
