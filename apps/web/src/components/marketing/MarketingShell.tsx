"use client";

import type { ReactNode } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function MarketingShell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="marketing-page">
      <a href="#main-content" className="skip-link">{t.marketing.skipToContent}</a>
      <SiteHeader />
      <main id="main-content" className="marketing-main">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
