"use client";

import { useEffect, useRef, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";

type Me = {
  user?: { email?: string };
  merchant?: {
    telegram?: { connected?: boolean; username?: string };
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

export default function NotificationsSettingsPage() {
  const t = useT();
  const [me, setMe] = useState<Me | null>(null);
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
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const awaitingTgConnect = useRef(false);

  function applyTelegram(data: Me) {
    setTgConnected(Boolean(data.merchant?.telegram?.connected));
    setTgUsername(data.merchant?.telegram?.username || "");
  }

  useEffect(() => {
    api<Me>("/api/v1/me")
      .then((data) => {
        setMe(data);
        applyTelegram(data);
      })
      .catch(() => undefined);
    api<NotifyPrefs>("/api/v1/merchant/notification-prefs")
      .then((prefs) => {
        setEmailEnabled(Boolean(prefs.email_enabled));
        setEmailDestination(prefs.email_destination || "");
        setEmailPayment(prefs.email?.payment_received !== false);
        setEmailAttention(prefs.email?.needs_attention !== false);
        setEmailOrders(prefs.email?.order_updates !== false);
      })
      .catch(() => undefined);
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

  async function connectTelegram() {
    setTgBusy(true);
    setTgError("");
    setTgMsg("");
    setTgDeepLink("");
    try {
      const res = await api<{ url: string }>("/api/v1/telegram/connect-link", { method: "POST", body: "{}" });
      if (!res.url) throw new Error(t.common.error);
      setTgDeepLink(res.url);
      awaitingTgConnect.current = true;
      const popup = window.open(res.url, "_blank", "noopener,noreferrer");
      if (!popup) setTgError(t.settings.telegramOpenFailed);
      else setTgMsg(t.settings.telegramConnectWaiting);
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

  return (
    <div className="rise page-stack">
      <BackLink href="/app/settings" />
      <PageHeader title={t.settings.notifications} subtitle={t.settings.notificationsHint} />
      <div className="card-panel">
        <h2 style={{ margin: 0, fontSize: "var(--text-headline)" }}>{t.settings.telegram}</h2>
        {tgConnected ? (
          <>
            <p style={{ margin: "var(--space-2) 0 0", fontWeight: 650 }}>{t.settings.telegramConnected}</p>
            {tgUsername ? (
              <p className="muted mono-ltr" style={{ margin: "var(--space-1) 0 0" }}>
                @{tgUsername}
              </p>
            ) : null}
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
            <button type="button" className="btn btn-primary" style={{ marginTop: "var(--space-4)" }} disabled={tgBusy} onClick={connectTelegram}>
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

        <h2 style={{ margin: "var(--space-6) 0 0", fontSize: "var(--text-headline)" }}>{t.settings.email}</h2>
        {!emailEnabled ? (
          <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
            {t.settings.emailDisabledHint}
          </p>
        ) : (
          <>
            <p className="muted mono-ltr" style={{ margin: "var(--space-2) 0 0" }}>
              {emailDestination || me?.user?.email || "—"}
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
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {msg ? <p className="ok">{msg}</p> : null}
      </div>
    </div>
  );
}
