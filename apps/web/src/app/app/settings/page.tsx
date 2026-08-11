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
  email_notifications?: {
    enabled?: boolean;
    destination?: string;
    payment_received?: boolean;
    needs_attention?: boolean;
    order_updates?: boolean;
  };
};

type NotifyPrefs = {
  email_enabled?: boolean;
  email_destination?: string;
  email?: {
    payment_received?: boolean;
    needs_attention?: boolean;
    order_updates?: boolean;
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
  const [tgMsg, setTgMsg] = useState("");
  const [tgError, setTgError] = useState("");
  const [tgBusy, setTgBusy] = useState(false);
  const [tgDeepLink, setTgDeepLink] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailDestination, setEmailDestination] = useState("");
  const [emailPayment, setEmailPayment] = useState(true);
  const [emailAttention, setEmailAttention] = useState(true);
  const [emailOrders, setEmailOrders] = useState(true);
  const [emailBusy, setEmailBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const awaitingTgConnect = useRef(false);

  function applyTelegram(data: Me) {
    setTgConnected(Boolean(data.merchant?.telegram?.connected));
    setTgUsername(data.merchant?.telegram?.username || "");
  }

  async function refreshMe() {
    const data = await api<Me>("/api/v1/me");
    setMe(data);
    setDisplayName(data.merchant?.display_name || data.merchant?.name || "");
    setDescription(data.merchant?.description || "");
    setSupport(data.merchant?.support_contact || "");
    applyTelegram(data);
    return data;
  }

  async function refreshTelegramStatus() {
    const data = await api<Me>("/api/v1/me");
    applyTelegram(data);
    return Boolean(data.merchant?.telegram?.connected);
  }

  async function refreshEmailPrefs() {
    const prefs = await api<NotifyPrefs>("/api/v1/merchant/notification-prefs");
    setEmailEnabled(Boolean(prefs.email_enabled));
    setEmailDestination(prefs.email_destination || "");
    setEmailPayment(prefs.email?.payment_received !== false);
    setEmailAttention(prefs.email?.needs_attention !== false);
    setEmailOrders(prefs.email?.order_updates !== false);
  }

  async function patchEmailPref(next: {
    payment_received?: boolean;
    needs_attention?: boolean;
    order_updates?: boolean;
  }) {
    setEmailBusy(true);
    setError("");
    try {
      const prefs = await api<NotifyPrefs>("/api/v1/merchant/notification-prefs", {
        method: "PATCH",
        body: JSON.stringify({ email: next }),
      });
      setEmailPayment(prefs.email?.payment_received !== false);
      setEmailAttention(prefs.email?.needs_attention !== false);
      setEmailOrders(prefs.email?.order_updates !== false);
      setMsg(t.common.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setEmailBusy(false);
    }
  }

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    refreshMe()
      .then(() => refreshEmailPrefs().catch(() => undefined))
      .catch(() => undefined);
    api<Defaults>("/api/v1/merchant/checkout-defaults")
      .then(setDefaults)
      .catch(() => undefined);
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onFocus() {
      if (!awaitingTgConnect.current) return;
      api<Me>("/api/v1/me")
        .then((data) => {
          applyTelegram(data);
          if (data.merchant?.telegram?.connected) {
            awaitingTgConnect.current = false;
            setTgDeepLink("");
            setTgMsg(t.settings.telegramConnected);
            setTgError("");
          }
        })
        .catch(() => undefined);
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [t.settings.telegramConnected]);

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
    setTgBusy(true);
    setTgError("");
    setTgMsg("");
    setTgDeepLink("");
    try {
      const res = await api<{ url: string }>("/api/v1/telegram/connect-link", {
        method: "POST",
        body: "{}",
      });
      if (!res.url) {
        throw new Error(t.common.error);
      }
      setTgDeepLink(res.url);
      awaitingTgConnect.current = true;
      const popup = window.open(res.url, "_blank", "noopener,noreferrer");
      if (!popup) {
        setTgError(t.settings.telegramOpenFailed);
      } else {
        setTgMsg(t.settings.telegramConnectWaiting);
      }
      // Status is picked up on focus/visibility via refreshTelegramStatus — no busy-wait.
    } catch (err) {
      setTgError(err instanceof Error ? err.message : t.common.error);
      awaitingTgConnect.current = false;
    } finally {
      setTgBusy(false);
    }
  }

  async function disconnectTelegram() {
    setTgBusy(true);
    setTgError("");
    setTgMsg("");
    try {
      await api("/api/v1/telegram/disconnect", { method: "POST", body: "{}" });
      setTgConnected(false);
      setTgUsername("");
      awaitingTgConnect.current = false;
      setTgDeepLink("");
      setTgMsg(t.settings.telegramDisconnected);
    } catch (err) {
      setTgError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setTgBusy(false);
    }
  }

  async function sendTelegramTest() {
    setTgBusy(true);
    setTgError("");
    setTgMsg("");
    try {
      await api("/api/v1/telegram/test", { method: "POST", body: "{}" });
      setTgMsg(t.settings.telegramTestSent);
    } catch (err) {
      setTgError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setTgBusy(false);
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
                    <button type="button" className="btn btn-secondary" disabled={tgBusy} onClick={sendTelegramTest}>
                      {tgBusy ? t.common.loading : t.settings.sendTelegramTest}
                    </button>
                    <button type="button" className="btn btn-tertiary" disabled={tgBusy} onClick={disconnectTelegram}>
                      {t.settings.disconnectTelegram}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
                    {t.settings.telegramHint}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: "var(--space-4)" }}
                    disabled={tgBusy}
                    onClick={connectTelegram}
                  >
                    {tgBusy ? t.common.loading : t.settings.connectTelegram}
                  </button>
                  {tgDeepLink ? (
                    <p className="muted" style={{ margin: "var(--space-3) 0 0" }}>
                      <a className="mono-ltr" href={tgDeepLink} target="_blank" rel="noopener noreferrer">
                        {tgDeepLink}
                      </a>
                    </p>
                  ) : null}
                </>
              )}
              {tgError ? (
                <p className="field-error" role="alert" style={{ marginTop: "var(--space-3)" }}>
                  {tgError}
                </p>
              ) : null}
              {tgMsg ? <p className="ok" style={{ marginTop: "var(--space-3)" }}>{tgMsg}</p> : null}

              <h3 style={{ margin: "var(--space-6) 0 0", fontSize: "var(--text-headline)" }}>{t.settings.email}</h3>
              {!emailEnabled ? (
                <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
                  {t.settings.emailDisabledHint}
                </p>
              ) : (
                <>
                  <p className="muted mono-ltr" style={{ margin: "var(--space-2) 0 0" }}>
                    {emailDestination || me?.user?.email || "—"}
                  </p>
                  <p className="muted" style={{ margin: "var(--space-1) 0 0" }}>
                    {t.settings.emailDestinationHint}
                  </p>
                  <div style={{ marginTop: "var(--space-4)", display: "grid", gap: "var(--space-3)" }}>
                    <label className="list-row" style={{ cursor: emailBusy ? "wait" : "pointer" }}>
                      <div className="list-row-body">
                        <div className="list-row-title">{t.settings.emailPaymentReceived}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailPayment}
                        disabled={emailBusy}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setEmailPayment(v);
                          void patchEmailPref({ payment_received: v });
                        }}
                      />
                    </label>
                    <label className="list-row" style={{ cursor: emailBusy ? "wait" : "pointer" }}>
                      <div className="list-row-body">
                        <div className="list-row-title">{t.settings.emailNeedsAttention}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailAttention}
                        disabled={emailBusy}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setEmailAttention(v);
                          void patchEmailPref({ needs_attention: v });
                        }}
                      />
                    </label>
                    <label className="list-row" style={{ cursor: emailBusy ? "wait" : "pointer" }}>
                      <div className="list-row-body">
                        <div className="list-row-title">{t.settings.emailOrderUpdates}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailOrders}
                        disabled={emailBusy}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setEmailOrders(v);
                          void patchEmailPref({ order_updates: v });
                        }}
                      />
                    </label>
                  </div>
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
        <Link className="btn btn-secondary" href="/app/links" style={{ marginInlineStart: "0.5rem" }}>
          {t.links.title}
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
