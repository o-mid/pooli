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

export function LandingContent() {
  const t = useT();
  const { locale } = useLocale();
  const m = t.marketing;
  const stepNumber = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en");

  return (
    <>
      <section className="marketing-hero">
        <div>
          <h1 className="marketing-h1">{m.hero.h1}</h1>
          <p className="marketing-hero-sub">{m.hero.sub}</p>
          <div className="marketing-hero-cta">
            <Link className="btn btn-primary" href="/register">{m.hero.ctaPrimary}</Link>
            <a className="btn btn-secondary" href="#how-it-works" onClick={scrollToHowItWorks}>
              {m.hero.ctaSecondary}
            </a>
          </div>
        </div>
        <CheckoutDemo label={m.hero.demoLabel} />
      </section>

      <section className="marketing-built-for" aria-label="Built for">
        <p>{m.builtFor.line1}</p>
        <p className="muted">{m.builtFor.line2}</p>
      </section>

      <Section title={m.problem.title}>
        <ul className="marketing-pain-list">
          <li>{m.problem.p1}</li>
          <li>{m.problem.p2}</li>
          <li>{m.problem.p3}</li>
        </ul>
      </Section>

      <Section id="how-it-works" title={m.steps.title}>
        <ol className="marketing-steps">
          <li>
            <span className="marketing-step-icon" aria-hidden />
            <div>
              <h3 className="marketing-h3">{m.steps.s1Title}</h3>
              <p>{m.steps.s1Body}</p>
            </div>
          </li>
          <li>
            <span className="marketing-step-icon marketing-step-icon-share" aria-hidden />
            <div>
              <h3 className="marketing-h3">{m.steps.s2Title}</h3>
              <p>{m.steps.s2Body}</p>
            </div>
          </li>
          <li>
            <span className="marketing-step-icon marketing-step-icon-paid" aria-hidden />
            <div>
              <h3 className="marketing-h3">{m.steps.s3Title}</h3>
              <p>{m.steps.s3Body}</p>
            </div>
          </li>
        </ol>
      </Section>

      <section className="marketing-section draft-reminders" id="draft-reminders">
        <p className="draft-status">{m.draftReminders.status}</p>
        <h2 className="marketing-h2">{m.draftReminders.title}</h2>
        <p className="marketing-lead">{m.draftReminders.sub}</p>
        <ol className="draft-steps">
          {m.draftReminders.steps.map((step, i) => (
            <li key={step}>
              <span className="draft-step-num">{stepNumber.format(i + 1)}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
        <p className="draft-safety">{m.draftReminders.safety}</p>
        <div className="marketing-hero-cta">
          <Link className="btn btn-primary" href="/register">{m.draftReminders.cta}</Link>
          <Link className="btn btn-secondary" href="/claude">{m.draftReminders.more}</Link>
        </div>
      </section>

      <Section title={m.benefits.title}>
        <ul className="marketing-benefits">
          <li><strong>{m.benefits.b1Title}</strong><span>{m.benefits.b1Body}</span></li>
          <li><strong>{m.benefits.b2Title}</strong><span>{m.benefits.b2Body}</span></li>
          <li><strong>{m.benefits.b3Title}</strong><span>{m.benefits.b3Body}</span></li>
          <li><strong>{m.benefits.b4Title}</strong><span>{m.benefits.b4Body}</span></li>
          <li><strong>{m.benefits.b5Title}</strong><span>{m.benefits.b5Body}</span></li>
          <li><strong>{m.benefits.b6Title}</strong><span>{m.benefits.b6Body}</span></li>
        </ul>
      </Section>

      <Section title={m.nonCustodial.title}>
        <p>{m.nonCustodial.body}</p>
        <p>
          <Link href="/security">{m.nonCustodial.link}</Link>
        </p>
      </Section>

      <Section title={m.earlyAccess.title}>
        <p>{m.earlyAccess.body}</p>
        <div className="marketing-hero-cta">
          <Link className="btn btn-primary" href="/register">{m.earlyAccess.cta}</Link>
        </div>
        <p className="muted">
          {m.earlyAccess.questions}{" "}
          <a className="mono-ltr" href={`mailto:${siteConfig.contact.support}`}>
            {siteConfig.contact.support}
          </a>
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
        <Link className="btn btn-primary" href="/register">{m.finalCta.button}</Link>
        <p className="muted">{m.finalCta.sub}</p>
      </section>
    </>
  );
}
