"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { isValidIranianPhone, normalizeIranianPhone } from "@/lib/phone";

type AuthMode = "email" | "phone";
type PhoneStep = "phone" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const [mode, setMode] = useState<AuthMode>("email");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")?.startsWith("google")) {
      setError(t.googleAuthError);
    }
  }, [t.googleAuthError]);

  async function onEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    const normalized = normalizeIranianPhone(phone);
    if (!normalized) {
      setError(t.auth.phoneInvalid);
      return;
    }
    setLoading(true);
    try {
      await api("/api/v1/auth/otp/send", {
        method: "POST",
        body: JSON.stringify({ phone: normalized, purpose: "login" }),
      });
      setInfo(t.auth.otpSent);
      setPhoneStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    const normalized = normalizeIranianPhone(phone);
    if (!normalized || !otp.trim()) {
      setError(t.auth.otpInvalid);
      return;
    }
    setLoading(true);
    try {
      await api("/api/v1/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone: normalized, code: otp.trim(), purpose: "login" }),
      });
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.otpInvalid);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell rise">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <BrandMark localeHint={locale} size={28} />
        <LanguageSwitch />
      </header>

      <h1 style={{ marginTop: 0, fontSize: "1.5rem" }}>{t.login}</h1>

      <GoogleAuthButton mode="login" />

      <div className="lang-switch" style={{ marginBottom: "1rem", width: "100%" }} role="tablist">
        <button
          type="button"
          role="tab"
          className={mode === "email" ? "active" : ""}
          aria-selected={mode === "email"}
          onClick={() => {
            setMode("email");
            setError("");
            setInfo("");
          }}
          style={{ flex: 1 }}
        >
          {t.loginWithEmail}
        </button>
        <button
          type="button"
          role="tab"
          className={mode === "phone" ? "active" : ""}
          aria-selected={mode === "phone"}
          onClick={() => {
            setMode("phone");
            setPhoneStep("phone");
            setError("");
            setInfo("");
          }}
          style={{ flex: 1 }}
        >
          {t.loginWithPhone}
        </button>
      </div>

      {mode === "email" ? (
        <form className="card-panel" onSubmit={onEmailSubmit}>
          <div className="field">
            <label htmlFor="email">{t.email}</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">{t.password}</label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="current-password" />
          </div>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary" disabled={loading}>
            {loading ? t.common.loading : t.login}
          </button>
        </form>
      ) : phoneStep === "phone" ? (
        <form className="card-panel" onSubmit={sendOtp}>
          <div className="field">
            <label htmlFor="phone">{t.phone}</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09121234567"
              required
            />
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {t.phoneHint}
            </span>
          </div>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          {info && <p className="ok">{info}</p>}
          <button className="btn btn-primary" disabled={loading || !isValidIranianPhone(phone)}>
            {loading ? t.common.loading : t.sendOtp}
          </button>
        </form>
      ) : (
        <form className="card-panel" onSubmit={verifyOtp}>
          <div className="field">
            <label htmlFor="otp">{t.otpCode}</label>
            <input
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </div>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary" disabled={loading}>
            {loading ? t.common.loading : t.verifyOtp}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: "0.5rem" }}
            disabled={loading}
            onClick={() => sendOtp({ preventDefault: () => undefined } as FormEvent)}
          >
            {t.resendOtp}
          </button>
        </form>
      )}

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link href="/register">{t.createAccount}</Link>
      </p>
    </main>
  );
}
