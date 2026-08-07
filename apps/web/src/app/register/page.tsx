"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { isValidIranianPhone, normalizeIranianPhone } from "@/lib/phone";

type AuthMode = "email" | "phone";
type PhoneStep = "details" | "otp";

export default function RegisterPage() {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const [mode, setMode] = useState<AuthMode>("email");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("details");
  const [name, setName] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function onEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
          name: fd.get("name"),
          merchant_name: fd.get("merchant_name"),
        }),
      });
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function sendPhoneOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    const normalized = normalizeIranianPhone(phone);
    if (!normalized) {
      setError(t.auth.phoneInvalid);
      return;
    }
    if (!name.trim() || !merchantName.trim()) {
      setError(t.common.error);
      return;
    }
    setLoading(true);
    try {
      await api("/api/v1/auth/otp/send", {
        method: "POST",
        body: JSON.stringify({ phone: normalized, purpose: "register" }),
      });
      setInfo(t.auth.otpSent);
      setPhoneStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function verifyPhoneRegister(e: FormEvent) {
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
        body: JSON.stringify({ phone: normalized, code: otp.trim(), purpose: "register" }),
      });
      await api("/api/v1/auth/otp/register", {
        method: "POST",
        body: JSON.stringify({
          phone: normalized,
          code: otp.trim(),
          name: name.trim(),
          merchant_name: merchantName.trim(),
        }),
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

      <h1 style={{ marginTop: 0, fontSize: "1.5rem" }}>{t.register}</h1>

      <GoogleAuthButton mode="register" />

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
          {t.email}
        </button>
        <button
          type="button"
          role="tab"
          className={mode === "phone" ? "active" : ""}
          aria-selected={mode === "phone"}
          onClick={() => {
            setMode("phone");
            setPhoneStep("details");
            setError("");
            setInfo("");
          }}
          style={{ flex: 1 }}
        >
          {t.phone}
        </button>
      </div>

      {mode === "email" ? (
        <form className="card-panel" onSubmit={onEmailSubmit}>
          <div className="field">
            <label htmlFor="name">{t.name}</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="merchant_name">{t.settings.displayName}</label>
            <input id="merchant_name" name="merchant_name" required />
          </div>
          <div className="field">
            <label htmlFor="email">{t.email}</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">{t.password}</label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </div>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary" disabled={loading}>
            {loading ? t.common.loading : t.register}
          </button>
        </form>
      ) : phoneStep === "details" ? (
        <form className="card-panel" onSubmit={sendPhoneOtp}>
          <div className="field">
            <label htmlFor="phone-name">{t.name}</label>
            <input id="phone-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="phone-store">{t.settings.displayName}</label>
            <input id="phone-store" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="phone">{t.phone}</label>
            <input
              id="phone"
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
        <form className="card-panel" onSubmit={verifyPhoneRegister}>
          <div className="field">
            <label htmlFor="otp">{t.otpCode}</label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </div>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary" disabled={loading}>
            {loading ? t.common.loading : t.register}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: "0.5rem" }}
            disabled={loading}
            onClick={() => sendPhoneOtp({ preventDefault: () => undefined } as FormEvent)}
          >
            {t.resendOtp}
          </button>
        </form>
      )}

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link href="/login">{t.login}</Link>
      </p>
    </main>
  );
}
