export const locales = ["en", "fa"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const localeCookie = "pooli_locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "fa";
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "fa" ? "rtl" : "ltr";
}

export function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale;
  const stored = window.localStorage.getItem(localeCookie);
  if (isLocale(stored)) return stored;
  const cookie = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${localeCookie}=`));
  const fromCookie = cookie?.split("=")[1];
  if (isLocale(fromCookie)) return fromCookie;
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("fa") || nav.startsWith("per")) return "fa";
  return defaultLocale;
}

export function persistLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localeCookie, locale);
  document.cookie = `${localeCookie}=${locale};path=/;max-age=31536000;samesite=lax`;
}
