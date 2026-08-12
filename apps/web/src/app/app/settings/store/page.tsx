"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT } from "@/i18n/LocaleProvider";
import { api, apiMultipart } from "@/lib/api";

type Me = {
  user?: { email?: string };
  merchant?: {
    display_name?: string;
    name?: string;
    description?: string;
    logo_url?: string;
    support_contact?: string;
  };
};

export default function StoreSettingsPage() {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [support, setSupport] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Me>("/api/v1/me")
      .then((data) => {
        setMe(data);
        setDisplayName(data.merchant?.display_name || data.merchant?.name || "");
        setDescription(data.merchant?.description || "");
        setSupport(data.merchant?.support_contact || "");
      })
      .catch(() => undefined);
  }, []);

  async function saveStore(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMsg("");
    try {
      await api("/api/v1/merchant", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: displayName.trim(),
          description: description.trim(),
          support_contact: support.trim(),
        }),
      });
      setMsg(t.common.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function uploadLogo(file: File) {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await apiMultipart<{ logo_url?: string }>("/api/v1/merchant/logo", fd);
      setMe((prev) =>
        prev
          ? { ...prev, merchant: { ...prev.merchant, logo_url: res.logo_url || prev.merchant?.logo_url } }
          : prev,
      );
      setMsg(t.common.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rise page-stack">
      <BackLink href="/app/settings" />
      <PageHeader title={t.settings.store} subtitle={t.settings.storeHint} />
      <form className="card-panel" onSubmit={saveStore}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <div className="merchant-avatar">
            {me?.merchant?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.merchant.logo_url} alt="" />
            ) : (
              (displayName || me?.merchant?.name || "P").slice(0, 1).toUpperCase()
            )}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => fileRef.current?.click()}>
              {t.settings.uploadLogo}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="display_name">{t.settings.displayName}</label>
          <input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="description">{t.settings.description}</label>
          <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="support">{t.settings.support}</label>
          <input id="support" value={support} onChange={(e) => setSupport(e.target.value)} placeholder="@store" />
        </div>
        {me?.user?.email && <p className="muted">{me.user.email}</p>}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {msg && <p className="ok">{msg}</p>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? t.common.loading : t.settings.save}
        </button>
      </form>
    </div>
  );
}
