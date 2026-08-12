"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultLocale,
  detectInitialLocale,
  dirFor,
  isLocale,
  localeCookie,
  persistLocale,
  type Locale,
} from "./config";
import { en, type Messages } from "./messages/en";
import { fa } from "./messages/fa";

const catalogs: Record<Locale, Messages> = { en, fa };

type Ctx = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Messages;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<Ctx | null>(null);

function bootLocale(): Locale {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(localeCookie);
    if (isLocale(stored)) return stored;
  }
  if (typeof document !== "undefined") {
    const fromDom = document.documentElement.dataset.locale;
    if (isLocale(fromDom)) return fromDom;
  }
  return detectInitialLocale();
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = bootLocale();
    setLocaleState(initial);
    persistLocale(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = dirFor(locale);
    document.documentElement.dataset.locale = locale;
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      locale,
      dir: dirFor(locale),
      t: catalogs[locale],
      setLocale,
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale requires LocaleProvider");
  return ctx;
}

export function useT() {
  return useLocale().t;
}
