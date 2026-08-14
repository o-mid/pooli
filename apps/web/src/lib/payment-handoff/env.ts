import type { BrowserEnv } from "./types";

export function detectBrowserEnv(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): BrowserEnv {
  const lower = ua.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(lower);
  const isAndroid = /android/.test(lower);
  const isMobile = isIOS || isAndroid || /mobile/.test(lower);
  const isTelegram = /telegram/i.test(ua);
  const isInstagram = /instagram/i.test(ua);
  const isFB = /fbav|fban|fb_iab/i.test(ua);
  const isInAppBrowser = isTelegram || isInstagram || isFB;
  let inAppKind: BrowserEnv["inAppKind"] = null;
  if (isTelegram) inAppKind = "telegram";
  else if (isInstagram) inAppKind = "instagram";
  else if (isInAppBrowser) inAppKind = "other";

  return {
    isMobile,
    isDesktop: !isMobile,
    isInAppBrowser,
    inAppKind,
    isIOS,
    isAndroid,
  };
}

/**
 * Best-effort "open in external browser" for known in-app browsers.
 * Uses only documented / commonly supported patterns; callers must still offer QR/copy.
 */
export function openInExternalBrowser(url: string): boolean {
  if (typeof window === "undefined") return false;
  const target = url || window.location.href;
  const ua = navigator.userAgent || "";
  const env = detectBrowserEnv(ua);

  try {
    if (env.isAndroid) {
      // Chrome Intent — widely used escape hatch from Android WebViews.
      const withoutScheme = target.replace(/^https?:\/\//i, "");
      window.location.href = `intent://${withoutScheme}#Intent;scheme=https;action=android.intent.action.VIEW;end`;
      return true;
    }
    if (env.isIOS) {
      if (env.inAppKind === "instagram" || /fban|fbav|fb_iab/i.test(ua)) {
        const safari = target.replace(/^https:\/\//i, "x-safari-https://");
        window.location.href = safari;
        return true;
      }
      window.open(target, "_blank", "noopener,noreferrer");
      return true;
    }
    window.open(target, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}
