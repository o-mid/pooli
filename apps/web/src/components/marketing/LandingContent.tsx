"use client";

import Link from "next/link";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { Section } from "@/components/marketing/Section";
import { LandingBenefits } from "@/components/marketing/landing/LandingBenefits";
import { LandingCtaBand } from "@/components/marketing/landing/LandingCtaBand";
import { LandingFeatureRows } from "@/components/marketing/landing/LandingFeatureRows";
import { LandingHero } from "@/components/marketing/landing/LandingHero";
import { LandingMarquee } from "@/components/marketing/landing/LandingMarquee";
import { LandingPrimaryCta } from "@/components/marketing/landing/LandingPrimaryCta";
import { StaggerItem, StaggerRoot } from "@/components/motion/Stagger";
import { SlideIn } from "@/components/motion/SlideIn";
import { TextReveal } from "@/components/motion/TextReveal";
import { useT } from "@/i18n/LocaleProvider";

export function LandingContent() {
  const m = useT().marketing;

  return (
    <div className="lp-page">
      <LandingHero />
      <LandingMarquee />

      <div className="lp-body">
        <SlideIn>
          <Section
            title={<TextReveal text={m.problem.title} />}
          >
            <StaggerRoot className="lp-pain-list">
              {[m.problem.p1, m.problem.p2, m.problem.p3].map((line) => (
                <StaggerItem key={line}>
                  <p className="lp-pain-line">{line}</p>
                </StaggerItem>
              ))}
            </StaggerRoot>
          </Section>
        </SlideIn>

        <LandingFeatureRows />
        <LandingBenefits />

        <SlideIn>
          <section className="marketing-section lp-draft" id="draft-reminders">
            <p className="lp-draft-badge">{m.draftReminders.status}</p>
            <h2 className="marketing-h2">{m.draftReminders.title}</h2>
            <p className="marketing-lead">{m.draftReminders.sub}</p>
            <p className="draft-safety">{m.draftReminders.safety}</p>
            <div className="lp-hero-actions">
              <LandingPrimaryCta href="/register">{m.draftReminders.cta}</LandingPrimaryCta>
              <Link className="btn btn-secondary lp-btn-pill" href="/claude">{m.draftReminders.more}</Link>
            </div>
          </section>
        </SlideIn>

        <SlideIn>
          <Section title={m.nonCustodial.title}>
            <p>{m.nonCustodial.body}</p>
            <p>
              <Link href="/security">{m.nonCustodial.link}</Link>
            </p>
          </Section>
        </SlideIn>

        <SlideIn>
          <Section title={m.faqLanding.title}>
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
