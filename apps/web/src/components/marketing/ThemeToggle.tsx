"use client";

import { useTheme } from "@/components/ThemeProvider";
import { useT } from "@/i18n/LocaleProvider";
import type { Theme } from "@/lib/theme";

const cycle: Theme[] = ["light", "dark", "system"];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useT();
  const label =
    theme === "light"
      ? t.marketing.nav.themeLight
      : theme === "dark"
        ? t.marketing.nav.themeDark
        : t.marketing.nav.themeSystem;

  const next = () => {
    const i = cycle.indexOf(theme);
    setTheme(cycle[(i + 1) % cycle.length]);
  };

  return (
    <button
      type="button"
      className="btn btn-ghost marketing-theme-btn"
      onClick={next}
      aria-label={`${t.marketing.nav.theme}: ${label}`}
      title={label}
    >
      {label}
    </button>
  );
}
