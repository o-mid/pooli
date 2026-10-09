"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Sheet } from "@/components/ui/Sheet";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const t = useT();
  const { locale } = useLocale();
  const m = t.marketing.nav;
  const [menuOpen, setMenuOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ user?: { id?: string } }>("/api/v1/me")
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  const navLinks = (
    <>
      <Link href="/#how-it-works" onClick={() => setMenuOpen(false)}>{m.howItWorks}</Link>
      <Link href="/faq" onClick={() => setMenuOpen(false)}>{m.faq}</Link>
      <Link href="/about" onClick={() => setMenuOpen(false)}>{m.about}</Link>
    </>
  );

  return (
    <header className="marketing-header">
      <Link href="/" className="marketing-logo">
        <BrandMark localeHint={locale} size={32} />
      </Link>
      <nav className="marketing-nav desktop-only" aria-label="Primary">
        {navLinks}
      </nav>
      <div className="marketing-header-actions">
        <LanguageSwitch />
        <ThemeToggle />
        <Link className="btn btn-ghost desktop-only" href={authed ? "/app" : "/login"}>
          {authed ? t.openPooli : m.signIn}
        </Link>
        <Link className="btn btn-primary desktop-only" href="/register">
          {m.createAccount}
        </Link>
        <button
          type="button"
          className="btn btn-secondary mobile-only marketing-menu-btn"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          {m.menu}
        </button>
      </div>
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={m.menu} labelledBy="marketing-menu-title">
        <h2 id="marketing-menu-title" className="sr-only">{m.menu}</h2>
        <nav className="marketing-mobile-nav" aria-label="Mobile">
          {navLinks}
          <Link className="btn btn-secondary" href={authed ? "/app" : "/login"} onClick={() => setMenuOpen(false)}>
            {authed ? t.openPooli : m.signIn}
          </Link>
          <Link className="btn btn-primary" href="/register" onClick={() => setMenuOpen(false)}>
            {m.createAccount}
          </Link>
        </nav>
      </Sheet>
    </header>
  );
}
