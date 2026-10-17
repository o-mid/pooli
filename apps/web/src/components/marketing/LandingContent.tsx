"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { CheckoutDemo } from "@/components/marketing/CheckoutDemo";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { FlowDiagramCard } from "@/components/marketing/FlowDiagramCard";
import { Section } from "@/components/marketing/Section";
import { Icons8Icon, type Icons8Name } from "@/components/icons/Icons8Icon";
import { Reveal } from "@/components/motion/Reveal";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { siteConfig } from "@/lib/site";

function scrollToHowItWorks(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  const el = document.getElementById("how-it-works");
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

const benefitKeys = ["b1", "b2", "b3", "b4", "b5", "b6"] as const;
const benefitIcons: Record<typeof benefitKeys[number], Icons8Name> = {
  b1: "verified",
  b2: "wallet",
  b3: "orders",
  b4: "notification",
  b5: "globe",
  b6: "share",
};

const stepIcons: Icons8Name[] = ["add-link", "share", "verified"];

export function LandingContent() {
  const t = useT();
  const { locale } = useLocale();
  const m = t.marketing;
  const stepNumber = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en");

  return (
    <>
      <section className="marketing-hero marketing-hero-ai">
        <div className="marketing-hero-aurora" aria-hidden="true" />
        <div className="marketing-hero-copy">
          <p className="marketing-kicker marketing-kicker-ai">
            <Icons8Icon name="sparkles" size="sm" className="marketing-kicker-icon" />
            {m.hero.eyebrow}
          </p>
          <h1 className="marketing-h1">{m.hero.h1}</h1>
          <p className="marketing-hero-sub">{m.hero.sub}</p>
          <div className="marketing-hero-cta">
            <Link className="btn btn-primary btn-ai-glow" href="/register">{m.hero.ctaPrimary}</Link>
            <a className="marketing-quiet-link" href="#how-it-works" onClick={scrollToHowItWorks}>
              {m.hero.ctaSecondary}
            </a>
          </div>
          <p className="marketing-for">{m.builtFor.line1}</p>
          <p className="marketing-for muted">{m.builtFor.line2}</p>
        </div>
        <CheckoutDemo label={m.hero.demoLabel} className="marketing-hero-demo" />
      </section>

      <Reveal>
        <Section title={m.problem.title}>
          <ul className="marketing-pain-list">
            <li>{m.problem.p1}</li>
            <li>{m.problem.p2}</li>
            <li>{m.problem.p3}</li>
          </ul>
        </Section>
      </Reveal>

      <Reveal delay={0.05}>
        <FlowDiagramCard title={m.flowDiagram.title} caption={m.flowDiagram.caption} labels={m.flowDiagram.labels} />
      </Reveal>

      <Reveal delay={0.06}>
        <Section id="how-it-works" title={m.steps.title}>
          <ol className="marketing-timeline marketing-timeline-ai">
            {[1, 2, 3].map((n, idx) => {
              const title = m.steps[`s${n}Title` as keyof typeof m.steps] as string;
              const body = m.steps[`s${n}Body` as keyof typeof m.steps] as string;
              return (
                <li key={n}>
                  <span className="marketing-step-icon" aria-hidden="true">
                    <Icons8Icon name={stepIcons[idx]} size="md" />
                  </span>
                  <div>
                    <h3 className="marketing-h3">
                      <span className="marketing-step-num-inline">{stepNumber.format(n)}.</span> {title}
                    </h3>
                    <p>{body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>
      </Reveal>

      <Reveal delay={0.08}>
        <Section title={m.benefits.title}>
          <div className="list-group marketing-feature-group">
            <ul className="marketing-feature-list">
              {benefitKeys.map((key) => {
                const title = m.benefits[`${key}Title` as keyof typeof m.benefits] as string;
                const body = m.benefits[`${key}Body` as keyof typeof m.benefits] as string;
                return (
                  <li key={key} className="list-row marketing-feature-row">
                    <span className="marketing-feature-icon" aria-hidden="true">
                      <Icons8Icon name={benefitIcons[key]} size="lg" />
                    </span>
                    <div className="marketing-feature-text">
                      <strong>{title}</strong>
                      <span className="muted">{body}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>
      </Reveal>

      <Reveal>
        <section className="marketing-section draft-reminders draft-reminders-ai" id="draft-reminders">
          <div className="draft-reminders-head">
            <Icons8Icon name="bot" size="lg" />
            <h2 className="marketing-h2">{m.draftReminders.title}</h2>
          </div>
          <p className="marketing-lead">{m.draftReminders.sub}</p>
          <p className="draft-safety">{m.draftReminders.safety}</p>
          <div className="marketing-hero-cta">
            <Link className="btn btn-primary btn-ai-glow" href="/register">{m.draftReminders.cta}</Link>
            <Link className="marketing-quiet-link" href="/claude">{m.draftReminders.more}</Link>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <Section title={m.nonCustodial.title}>
          <p>{m.nonCustodial.body}</p>
          <p>
            <Link href="/security">{m.nonCustodial.link}</Link>
          </p>
        </Section>
      </Reveal>

      <Reveal>
        <Section title={m.faqLanding.title}>
          <FaqAccordion items={m.faqLanding.items} />
          <p className="marketing-view-all">
            <Link href="/faq">{m.faqLanding.viewAll}</Link>
          </p>
        </Section>
      </Reveal>

      <Reveal>
        <section className="marketing-final-cta marketing-final-cta-ai">
          <h2 className="marketing-h2">{m.finalCta.title}</h2>
          <p>{m.earlyAccess.body}</p>
          <Link className="btn btn-primary btn-ai-glow" href="/register">{m.finalCta.button}</Link>
          <p className="muted">{m.finalCta.sub}</p>
          <p className="muted">
            {m.earlyAccess.questions}{" "}
            <a className="mono-ltr" href={`mailto:${siteConfig.contact.support}`}>
              {siteConfig.contact.support}
            </a>
          </p>
        </section>
      </Reveal>
    </>
  );
}
