"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useLocale, useT } from "@/i18n/LocaleProvider";

export default function LandingPage() {
  const t = useT();
  const { locale } = useLocale();
  const brand = locale === "fa" ? t.brandFa : t.brand;

  return (
    <main className="hero-landing rise">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <BrandMark localeHint={locale} size={36} />
        <LanguageSwitch />
      </header>

      <section style={{ marginTop: "auto", marginBottom: "auto", paddingBlock: "2rem" }}>
        <h1 className="hero-brand">{brand}</h1>
        <p className="hero-tagline">{t.tagline}</p>
        <p className="hero-sub">{t.taglineSub}</p>
      </section>

      <div className="cta-stack">
        <Link className="btn btn-primary" href="/login">
          {t.openSeller}
        </Link>
        <Link className="btn btn-secondary" href="/register">
          {t.createAccount}
        </Link>
      </div>
    </main>
  );
}
