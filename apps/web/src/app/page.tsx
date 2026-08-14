"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";

export default function LandingPage() {
  const t = useT();
  const { locale } = useLocale();
  const brand = locale === "fa" ? t.brandFa : t.brand;
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ user?: { id?: string } }>("/api/v1/me")
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  const primaryHref = authed ? "/app" : "/login";
  const primaryLabel = authed ? t.openPooli : t.openSeller;

  return (
    <main className="hero-landing rise">
      <header className="auth-topbar">
        <BrandMark localeHint={locale} size={36} />
        <LanguageSwitch />
      </header>

      <section style={{ marginTop: "auto", marginBottom: "auto", paddingBlock: "2rem" }}>
        <h1 className="hero-brand">{brand}</h1>
        <p className="hero-tagline">{t.tagline}</p>
        <p className="hero-sub">{t.taglineSub}</p>
      </section>

      <div className="cta-stack">
        <Link className="btn btn-primary" href={primaryHref}>
          {authed === null ? t.openPooli : primaryLabel}
        </Link>
        {authed !== true && (
          <Link className="btn btn-secondary" href="/register">
            {t.createAccount}
          </Link>
        )}
      </div>
    </main>
  );
}
