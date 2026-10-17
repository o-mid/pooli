"use client";

import type { MouseEvent } from "react";
import { CheckoutDemo } from "@/components/marketing/CheckoutDemo";
import { LandingPrimaryCta } from "@/components/marketing/landing/LandingPrimaryCta";
import { BlurText } from "@/components/motion/BlurText";
import { SlideIn } from "@/components/motion/SlideIn";
import { useT } from "@/i18n/LocaleProvider";

function scrollToHowItWorks(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  const el = document.getElementById("how-it-works");
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

export function LandingHero() {
  const t = useT();
  const m = t.marketing;

  return (
    <section className="lp-hero" id="top">
      <div className="lp-hero-grid" aria-hidden="true" />
      <div className="lp-hero-fade" aria-hidden="true" />

      <div className="lp-hero-inner">
        <p className="lp-hero-badge lp-hero-badge-in">{m.hero.eyebrow}</p>
        <h1 className="lp-hero-title lp-hero-title-gradient">
          <BlurText text={m.hero.h1} />
        </h1>
        <div className="lp-hero-sub-wrap">
          <SlideIn>
            <p className="lp-hero-sub">{m.hero.sub}</p>
          </SlideIn>
        </div>
        <SlideIn delay={0.08} className="lp-hero-actions">
          <LandingPrimaryCta href="/register">{m.hero.ctaPrimary}</LandingPrimaryCta>
          <a className="btn btn-secondary lp-btn-pill" href="#how-it-works" onClick={scrollToHowItWorks}>
            {m.hero.ctaSecondary}
          </a>
        </SlideIn>
        <SlideIn delay={0.12}>
          <p className="lp-hero-meta">{m.builtFor.line1}</p>
          <p className="lp-hero-meta muted">{m.builtFor.line2}</p>
        </SlideIn>
        <SlideIn delay={0.15} spring={false} duration={1.1} className="lp-hero-visual">
          <CheckoutDemo label={m.hero.demoLabel} />
        </SlideIn>
      </div>
    </section>
  );
}
