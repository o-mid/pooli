"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { useToast } from "@/components/ui/Toast";
import { detectBrowserEnv, openInExternalBrowser } from "@/lib/payment-handoff/env";

export function InstagramInAppBanner() {
  const t = useT();
  const { showToast } = useToast();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const env = detectBrowserEnv();
    setShow(env.inAppKind === "instagram" || /fban|fbav|fb_iab/i.test(navigator.userAgent));
  }, []);

  if (!show) return null;

  const href = typeof window !== "undefined" ? window.location.href : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      showToast(t.common.copied);
    } catch {
      showToast(t.common.error);
    }
  }

  return (
    <div className="ig-inapp-banner" role="alert">
      <p style={{ margin: 0, fontWeight: 650 }}>{t.checkout.igBannerTitle}</p>
      <div className="cta-stack" style={{ marginTop: "var(--space-3)" }}>
        <button type="button" className="btn btn-primary" onClick={() => openInExternalBrowser(href)}>
          {t.checkout.openInBrowser}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
          {t.checkout.igBannerCopy}
        </button>
      </div>
    </div>
  );
}
