"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { Section } from "@/components/marketing/Section";
import { Icons8Icon } from "@/components/icons/Icons8Icon";
import { LandingBenefits } from "@/components/marketing/landing/LandingBenefits";
import { LandingCtaBand } from "@/components/marketing/landing/LandingCtaBand";
import { LandingFeatureRows } from "@/components/marketing/landing/LandingFeatureRows";
import { LandingHero } from "@/components/marketing/landing/LandingHero";
import { LandingMarquee } from "@/components/marketing/landing/LandingMarquee";
import { LandingPrimaryCta } from "@/components/marketing/landing/LandingPrimaryCta";
import { SlideIn } from "@/components/motion/SlideIn";
import { TextReveal } from "@/components/motion/TextReveal";
import { useT } from "@/i18n/LocaleProvider";

export function LandingContent() {
  const m = useT().marketing;
  const painLines = [m.problem.p1, m.problem.p2, m.problem.p3];

  return (
    <div className="lp-page">
      <LandingHero />
      <LandingMarquee />

      <div className="lp-body">
        <SlideIn>
          <Section className="lp-problem" title={<TextReveal text={m.problem.title} />}>
            <ul className="lp-pain-list">
              {painLines.map((line, i) => (
                <li key={line} className="lp-pain-line" style={{ "--lp-stagger": i } as CSSProperties}>
                  {line}
                </li>
              ))}
            </ul>
          </Section>
        </SlideIn>

        <LandingFeatureRows />
        <LandingBenefits />

        <SlideIn>
          <section className="marketing-section lp-draft" id="draft-reminders">
            <h2 className="lp-section-title lp-section-title-start">
              <TextReveal text={m.draftReminders.title} />
            </h2>
            <p className="marketing-lead">{m.draftReminders.sub}</p>
            <p className="draft-safety">{m.draftReminders.safety}</p>
            <div className="lp-hero-actions lp-hero-actions-start">
              <LandingPrimaryCta href="/register">{m.draftReminders.cta}</LandingPrimaryCta>
              <Link className="btn btn-secondary lp-btn-pill" href="/claude">{m.draftReminders.more}</Link>
            </div>
          </section>
        </SlideIn>

        <SlideIn>
          <section className="marketing-section lp-trust" id="security">
            <div className="lp-trust-icon" aria-hidden="true">
              <Icons8Icon name="verified" size="lg" />
            </div>
            <h2 className="lp-section-title lp-section-title-start">
              <TextReveal text={m.nonCustodial.title} />
            </h2>
            <p className="lp-trust-body">{m.nonCustodial.body}</p>
            <p>
              <Link className="lp-trust-link" href="/security">{m.nonCustodial.link}</Link>
            </p>
          </section>
        </SlideIn>

        <SlideIn>
          <Section className="lp-faq-section" title={<TextReveal text={m.faqLanding.title} />}>
            <FaqAccordion items={m.faqLanding.items} />
            <p className="marketing-view-all">
              <Link href="/faq">{m.faqLanding.viewAll}</Link>
            </p>
          </Section>
        </SlideIn>

        <LandingCtaBand />
      </div>
    </div>
  );
}
