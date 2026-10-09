"use client";

import { Section } from "@/components/marketing/Section";
import { useT } from "@/i18n/LocaleProvider";
import { siteConfig } from "@/lib/site";

export function SecurityView() {
  const t = useT();
  const s = t.marketing.security;

  return (
    <>
      <header className="marketing-page-header">
        <h1 className="marketing-h1">{s.title}</h1>
        <p className="marketing-lead">{s.intro}</p>
      </header>
      <Section title={s.title}>
        <ul className="marketing-facts">
          {s.facts.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>
      <Section title={s.disclosureTitle}>
        <p>{s.disclosureBody}</p>
        <p>
          <a className="mono-ltr" href={`mailto:${siteConfig.contact.support}`}>
            {siteConfig.contact.support}
          </a>
        </p>
      </Section>
    </>
  );
}
