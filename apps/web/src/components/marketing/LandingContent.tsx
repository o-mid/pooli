"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { CheckoutDemo } from "@/components/marketing/CheckoutDemo";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { Section } from "@/components/marketing/Section";
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

export function LandingContent() {
  const t = useT();
  const { locale } = useLocale();
  const m = t.marketing;
  const stepNumber = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en");

  return (
    <>
      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <p className="marketing-kicker">{m.hero.eyebrow}</p>
          <h1 className="marketing-h1">{m.hero.h1}</h1>
          <p className="marketing-hero-sub">{m.hero.sub}</p>
          <div className="marketing-hero-cta">
            <Link className="btn btn-primary" href="/register">{m.hero.ctaPrimary}</Link>
            <a className="marketing-quiet-link" href="#how-it-works" onClick={scrollToHowItWorks}>
              {m.hero.ctaSecondary}
            </a>
          </div>
          <p className="marketing-for">{m.builtFor.line1}</p>
          <p className="marketing-for muted">{m.builtFor.line2}</p>
        </div>
        <CheckoutDemo label={m.hero.demoLabel} className="marketing-hero-demo" />
      </section>

      <Section title={m.problem.title}>
        <ul className="marketing-pain-list">
          <li>{m.problem.p1}</li>
          <li>{m.problem.p2}</li>
          <li>{m.problem.p3}</li>
        </ul>
      </Section>

      <Section id="how-it-works" title={m.steps.title}>
        <ol className="marketing-timeline">
          <li>
            <span className="marketing-step-num" aria-hidden="true">{stepNumber.format(1)}</span>
            <div>
              <h3 className="marketing-h3">{m.steps.s1Title}</h3>
              <p>{m.steps.s1Body}</p>
            </div>
          </li>
          <li>
            <span className="marketing-step-num" aria-hidden="true">{stepNumber.format(2)}</span>
            <div>
              <h3 className="marketing-h3">{m.steps.s2Title}</h3>
              <p>{m.steps.s2Body}</p>
            </div>
          </li>
          <li>
            <span className="marketing-step-num" aria-hidden="true">{stepNumber.format(3)}</span>
            <div>
              <h3 className="marketing-h3">{m.steps.s3Title}</h3>
              <p>{m.steps.s3Body}</p>
            </div>
          </li>
        </ol>
      </Section>

      <Section title={m.benefits.title}>
        <div className="list-group marketing-feature-group">
          <ul className="marketing-feature-list">
            {benefitKeys.map((key) => {
              const title = m.benefits[`${key}Title` as keyof typeof m.benefits] as string;
              const body = m.benefits[`${key}Body` as keyof typeof m.benefits] as string;
              return (
                <li key={key} className="list-row marketing-feature-row">
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

      <section className="marketing-section draft-reminders" id="draft-reminders">
        <h2 className="marketing-h2">{m.draftReminders.title}</h2>
        <p className="marketing-lead">{m.draftReminders.sub}</p>
        <p className="draft-safety">{m.draftReminders.safety}</p>
        <div className="marketing-hero-cta">
          <Link className="btn btn-primary" href="/register">{m.draftReminders.cta}</Link>
          <Link className="marketing-quiet-link" href="/claude">{m.draftReminders.more}</Link>
        </div>
      </section>

      <Section title={m.nonCustodial.title}>
        <p>{m.nonCustodial.body}</p>
        <p>
          <Link href="/security">{m.nonCustodial.link}</Link>
        </p>
      </Section>

      <Section title={m.faqLanding.title}>
        <FaqAccordion items={m.faqLanding.items} />
        <p className="marketing-view-all">
          <Link href="/faq">{m.faqLanding.viewAll}</Link>
        </p>
      </Section>

      <section className="marketing-final-cta">
        <h2 className="marketing-h2">{m.finalCta.title}</h2>
        <p>{m.earlyAccess.body}</p>
        <Link className="btn btn-primary" href="/register">{m.finalCta.button}</Link>
        <p className="muted">{m.finalCta.sub}</p>
        <p className="muted">
          {m.earlyAccess.questions}{" "}
          <a className="mono-ltr" href={`mailto:${siteConfig.contact.support}`}>
            {siteConfig.contact.support}
          </a>
        </p>
      </section>
    </>
  );
}
