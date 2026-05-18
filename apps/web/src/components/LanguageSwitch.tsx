"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/config";

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t.settings.language}>
      {(["en", "fa"] as Locale[]).map((code) => (
        <button
          key={code}
          type="button"
          className={locale === code ? "active" : ""}
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
        >
          {code === "en" ? "EN" : "فا"}
        </button>
      ))}
    </div>
  );
}
