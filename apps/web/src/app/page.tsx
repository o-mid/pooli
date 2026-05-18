"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useLocale, useT } from "@/i18n/LocaleProvider";

export default function LandingPage() {
  const t = useT();
  const { locale } = useLocale();

  return (
    <main className="shell rise">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <BrandMark localeHint={locale} size={32} />
        <LanguageSwitch />
      </header>

      <h1 style={{ fontSize: "1.75rem", margin: "0 0 0.75rem", maxWidth: "16ch", lineHeight: 1.2 }}>
        {t.tagline}
      </h1>
      <p className="muted" style={{ marginBottom: "2rem", lineHeight: 1.55, maxWidth: "34ch" }}>
        {t.taglineSub}
      </p>

      <Link className="btn btn-primary" href="/login" style={{ marginBottom: "0.75rem" }}>
        {t.openSeller}
      </Link>
      <Link className="btn btn-secondary" href="/register">
        {t.createAccount}
      </Link>
    </main>
  );
}
