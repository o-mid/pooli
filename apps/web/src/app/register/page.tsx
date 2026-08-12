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
  const [phoneEnabled, setPhoneEnabled] = useState(false);

  useEffect(() => {
    api<{ phone?: boolean }>("/api/v1/auth/providers")
      .then((p) => {
        setPhoneEnabled(Boolean(p.phone));
        if (!p.phone) setMode("email");
      })
      .catch(() => setPhoneEnabled(false));
  }, []);

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
      router.push("/app/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function sendPhoneOtp(e?: FormEvent) {
    e?.preventDefault();
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
      router.push("/app/onboarding");
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

      <PageHeader title={t.register} />

      <GoogleAuthButton mode="register" />

      {phoneEnabled ? (
        <SegmentedControl
          ariaLabel={t.register}
          value={mode}
          onChange={(v) => {
            setMode(v);
            setPhoneStep("details");
            setError("");
            setInfo("");
          }}
          options={[
            { value: "email", label: t.email },
            { value: "phone", label: t.phone },
          ]}
        />
      ) : null}

      {mode === "email" ? (
        <form className="card-panel" method="post" onSubmit={onEmailSubmit}>
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
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
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
            <input
              id="phone-store"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              required
            />
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
              {loading ? t.common.loading : t.register}
            </button>
            <button
              type="button"
              className="btn btn-tertiary btn-block"
              disabled={loading}
              onClick={() => sendPhoneOtp()}
            >
              {t.resendOtp}
            </button>
          </div>
        </form>
      )}

      <p className="muted">
        <Link href="/login">{t.login}</Link>
      </p>
    </main>
  );
}
