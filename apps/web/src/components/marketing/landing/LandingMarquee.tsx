"use client";

import { useT } from "@/i18n/LocaleProvider";

export function LandingMarquee() {
  const m = useT().marketing.marquee;
  const label = `${m.instagram} · ${m.telegram} · ${m.whatsapp} · ${m.tron} · ${m.bsc}`;

  return (
    <div className="lp-marquee">
      <p className="sr-only">{label}</p>
      <div className="lp-marquee-track" aria-hidden="true">
        <span>{label}</span>
        <span>{label}</span>
      </div>
    </div>
  );
}
