"use client";

import { LandingPrimaryCta } from "@/components/marketing/landing/LandingPrimaryCta";
import { SlideIn } from "@/components/motion/SlideIn";
import { useT } from "@/i18n/LocaleProvider";
import { siteConfig } from "@/lib/site";

export function LandingCtaBand() {
  const m = useT().marketing;

  return (
    <SlideIn>
      <section className="lp-cta-band" id="cta">
        <div className="lp-cta-band-bg" aria-hidden="true" />
        <div className="lp-cta-band-inner">
          <h2 className="lp-cta-title">{m.finalCta.title}</h2>
          <p className="lp-cta-sub">{m.earlyAccess.body}</p>
          <LandingPrimaryCta href="/register" className="lp-cta-btn">{m.finalCta.button}</LandingPrimaryCta>
          <p className="lp-cta-foot muted">{m.finalCta.sub}</p>
          <p className="lp-cta-foot muted">
            {m.earlyAccess.questions}{" "}
            <a className="mono-ltr" href={`mailto:${siteConfig.contact.support}`}>
              {siteConfig.contact.support}
            </a>
          </p>
        </div>
      </section>
    </SlideIn>
  );
}
