"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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

  async function sendOtp(e?: FormEvent) {
    e?.preventDefault();
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
    <main className="shell rise page-stack">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <BrandMark localeHint={locale} size={28} />
        <LanguageSwitch />
      </header>

      <PageHeader title={t.login} />

      <GoogleAuthButton mode="login" />

      <SegmentedControl
        ariaLabel={t.login}
        value={mode}
        onChange={(v) => {
          setMode(v);
          setPhoneStep("phone");
          setError("");
          setInfo("");
        }}
        options={[
          { value: "email", label: t.loginWithEmail },
          { value: "phone", label: t.loginWithPhone },
        ]}
      />

      {mode === "email" ? (
        <form className="card-panel" onSubmit={onEmailSubmit}>
          <div className="field">
            <label htmlFor="email">{t.email}</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">{t.password}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
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
              className="mono-ltr"
            />
            <span className="field-hint">{t.phoneHint}</span>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
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
              className="mono-ltr"
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="cta-stack">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? t.common.loading : t.verifyOtp}
            </button>
            <button type="button" className="btn btn-tertiary btn-block" disabled={loading} onClick={() => sendOtp()}>
              {t.resendOtp}
            </button>
          </div>
        </form>
      )}

      <p className="muted">
        <Link href="/register">{t.createAccount}</Link>
      </p>
    </main>
  );
}
