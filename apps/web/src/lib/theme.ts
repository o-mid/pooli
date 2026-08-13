export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const themeCookie = "pooli_theme";

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

export function resolvedTheme(theme: Theme): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved = resolvedTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function persistTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(themeCookie, theme);
  document.cookie = `${themeCookie}=${theme};path=/;max-age=31536000;samesite=lax`;
  applyTheme(theme);
}

export function detectInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(themeCookie);
  if (isTheme(stored)) return stored;
  const cookie = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${themeCookie}=`));
  const fromCookie = cookie?.split("=")[1];
  if (isTheme(fromCookie)) return fromCookie;
  return "system";
}
