"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestInstallSheet } from "@/components/InstallSheet";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT } from "@/i18n/LocaleProvider";
import { api, apiMultipart } from "@/lib/api";
import { isStandaloneDisplay } from "@/lib/pwa";

type Merchant = {
  id?: string;
  name?: string;
  display_name?: string;
  description?: string;
  logo_url?: string;
  support_contact?: string;
  slug?: string;
  telegram?: {
    connected?: boolean;
    username?: string;
    bot?: string;
  };
};

type Me = {
  user?: { email?: string; is_admin?: boolean; IsAdmin?: boolean };
  merchant?: Merchant;
};

type FieldMode = "required" | "optional" | "disabled";

type Defaults = {
  customer_fields: Record<string, FieldMode>;
  enabled_networks: string[];
  default_network: string;
  default_expiry_minutes: number;
  fulfillment_required: boolean;
};

const FIELD_KEYS = ["full_name", "phone", "shipping_address", "postal_code", "email", "customer_note"] as const;

export default function SettingsPage() {
  const router = useRouter();
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [support, setSupport] = useState("");
  const [tgConnected, setTgConnected] = useState(false);
  const [tgUsername, setTgUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [defaults, setDefaults] = useState<Defaults | null>(null);

  async function refreshMe() {
    const data = await api<Me>("/api/v1/me");
    setMe(data);
    setDisplayName(data.merchant?.display_name || data.merchant?.name || "");
    setDescription(data.merchant?.description || "");
    setSupport(data.merchant?.support_contact || "");
    setTgConnected(Boolean(data.merchant?.telegram?.connected));
    setTgUsername(data.merchant?.telegram?.username || "");
    return data;
  }

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    refreshMe().catch(() => undefined);
    api<Defaults>("/api/v1/merchant/checkout-defaults")
      .then(setDefaults)
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
          ? {
              ...prev,
              merchant: { ...prev.merchant, logo_url: res.logo_url || prev.merchant?.logo_url },
            }
          : prev,
      );
      setMsg(t.common.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function connectTelegram() {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const res = await api<{ url: string }>("/api/v1/telegram/connect-link", {
        method: "POST",
        body: "{}",
      });
      if (res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      }
      // Poll briefly for webhook bind completion.
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const me = await refreshMe();
        if (me.merchant?.telegram?.connected) {
          setMsg(t.settings.telegramConnected);
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function disconnectTelegram() {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      await api("/api/v1/telegram/disconnect", { method: "POST", body: "{}" });
      setTgConnected(false);
      setTgUsername("");
      setMsg(t.common.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function sendTelegramTest() {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      await api("/api/v1/telegram/test", { method: "POST", body: "{}" });
      setMsg(t.settings.telegramTestSent);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    if (!window.confirm(t.logout)) return;
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const isAdmin = me?.user?.is_admin || me?.user?.IsAdmin;

  return (
    <div className="rise page-stack">
      <PageHeader title={t.settings.title} />

      <div className="desktop-split">
        <section className="section" style={{ margin: 0 }}>
          <h2 className="section-title">{t.settings.store}</h2>
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
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loading}
                  onClick={() => fileRef.current?.click()}
                >
                  {t.settings.uploadLogo}
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="display_name">{t.settings.displayName}</label>
              <input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="description">{t.settings.description}</label>
              <textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="support">{t.settings.support}</label>
              <input
                id="support"
                value={support}
                onChange={(e) => setSupport(e.target.value)}
                placeholder="@store or t.me/…"
              />
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
        </section>

        <div className="page-stack" style={{ gap: "var(--space-4)" }}>
          <section className="section" style={{ margin: 0 }}>
            <h2 className="section-title">{t.settings.language}</h2>
            <div className="list-group">
              <div className="list-row" style={{ cursor: "default" }}>
                <div className="list-row-body">
                  <div className="list-row-title">{t.settings.language}</div>
                </div>
                <div className="list-row-trailing">
                  <LanguageSwitch />
                </div>
              </div>
              {!standalone && (
                <button type="button" className="list-row" onClick={() => requestInstallSheet()}>
                  <div className="list-row-body">
                    <div className="list-row-title">{t.settings.addToHome}</div>
                    <div className="list-row-meta">{t.install.subtitle}</div>
                  </div>
                </button>
              )}
            </div>
          </section>

          <section className="section" style={{ margin: 0 }}>
            <h2 className="section-title">{t.settings.notifications}</h2>
            <div className="card-panel">
              <h3 style={{ margin: 0, fontSize: "var(--text-headline)" }}>{t.settings.telegram}</h3>
              {tgConnected ? (
                <>
                  <p style={{ margin: "var(--space-2) 0 0", fontWeight: 650 }}>{t.settings.telegramConnected}</p>
                  {tgUsername ? (
                    <p className="muted mono-ltr" style={{ margin: "var(--space-1) 0 0" }}>
                      @{tgUsername}
                    </p>
                  ) : null}
                  <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
                    {t.settings.telegramConnectedHint}
                  </p>
                  <div className="cta-stack" style={{ marginTop: "var(--space-4)" }}>
                    <button type="button" className="btn btn-secondary" disabled={loading} onClick={sendTelegramTest}>
                      {t.settings.sendTelegramTest}
                    </button>
                    <button type="button" className="btn btn-tertiary" disabled={loading} onClick={disconnectTelegram}>
                      {t.settings.disconnectTelegram}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
                    {t.settings.telegramHint}
                  </p>
                  <p className="muted" style={{ margin: "var(--space-1) 0 0" }}>
                    {t.settings.telegramNotConnected}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: "var(--space-4)" }}
                    disabled={loading}
                    onClick={connectTelegram}
                  >
                    {t.settings.connectTelegram}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">{t.nav.wallets}</h2>
        <Link className="btn btn-secondary" href="/app/wallets">
          {t.wallets.title}
        </Link>
      </section>

      {defaults ? (
        <section className="section">
          <h2 className="section-title">{t.settings.checkoutDefaults}</h2>
          <p className="field-hint" style={{ marginTop: 0 }}>
            {t.settings.defaultsHint}
          </p>
          <form
            className="card-panel"
            onSubmit={async (e) => {
              e.preventDefault();
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
            }}
          >
            <h3 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-headline)" }}>
              {t.settings.customerFields}
            </h3>
            {FIELD_KEYS.map((key) => (
              <div className="field" key={key}>
                <label htmlFor={`field-${key}`}>{key}</label>
                <select
                  id={`field-${key}`}
                  value={defaults.customer_fields[key] || "optional"}
                  onChange={(e) =>
                    setDefaults({
                      ...defaults,
                      customer_fields: {
                        ...defaults.customer_fields,
                        [key]: e.target.value as FieldMode,
                      },
                    })
                  }
                >
                  <option value="required">{t.settings.fieldRequired}</option>
                  <option value="optional">{t.settings.fieldOptional}</option>
                  <option value="disabled">{t.settings.fieldDisabled}</option>
                </select>
              </div>
            ))}

            <h3 style={{ margin: "var(--space-4) 0 var(--space-3)", fontSize: "var(--text-headline)" }}>
              {t.settings.paymentDefaults}
            </h3>
            <div className="field">
              <label htmlFor="default_network">{t.settings.defaultNetwork}</label>
              <select
                id="default_network"
                value={defaults.default_network}
                onChange={(e) => setDefaults({ ...defaults, default_network: e.target.value })}
              >
                <option value="tron">TRON</option>
                <option value="bsc">BNB Chain</option>
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
                onChange={(e) =>
                  setDefaults({ ...defaults, default_expiry_minutes: Number(e.target.value) || 60 })
                }
              />
            </div>
            <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-3)" }}>
              <input
                type="checkbox"
                checked={defaults.enabled_networks.includes("tron")}
                onChange={(e) => {
                  const set = new Set(defaults.enabled_networks);
                  if (e.target.checked) set.add("tron");
                  else set.delete("tron");
                  setDefaults({ ...defaults, enabled_networks: Array.from(set) });
                }}
              />
              <span>TRON</span>
            </label>
            <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-3)" }}>
              <input
                type="checkbox"
                checked={defaults.enabled_networks.includes("bsc")}
                onChange={(e) => {
                  const set = new Set(defaults.enabled_networks);
                  if (e.target.checked) set.add("bsc");
                  else set.delete("bsc");
                  setDefaults({ ...defaults, enabled_networks: Array.from(set) });
                }}
              />
              <span>BNB Chain</span>
            </label>
            <button className="btn btn-primary" disabled={loading}>
              {loading ? t.common.loading : t.settings.save}
            </button>
          </form>
        </section>
      ) : null}

      {isAdmin && (
        <a className="btn btn-secondary" href="/admin">
          {t.admin.title}
        </a>
      )}

      <button type="button" className="btn btn-destructive" onClick={logout}>
        {t.logout}
      </button>
    </div>
  );
}
