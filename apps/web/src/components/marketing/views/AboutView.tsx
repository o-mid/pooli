"use client";

import Image from "next/image";
import Link from "next/link";
import { Imprint } from "@/components/marketing/Imprint";
import { Section } from "@/components/marketing/Section";
import { useT } from "@/i18n/LocaleProvider";
import { siteConfig } from "@/lib/site";

export function AboutView() {
  const t = useT();
  const a = t.marketing.about;

  return (
    <>
      <header className="marketing-page-header">
        <h1 className="marketing-h1">{a.metaTitle}</h1>
        <p className="marketing-lead">{a.hero}</p>
      </header>

      <Section title={a.whatTitle}>
        <p>{a.whatP1}</p>
        <p>{a.whatP2}</p>
        <p>{a.whatP3}</p>
      </Section>

      <Section title={a.companyTitle}>
        <p>{a.foundedLine}</p>
        <p className="muted">{a.fundingLine}</p>
      </Section>

      <Section title={a.founderTitle}>
        <div className="founder-card">
          <div className="founder-photo-wrap">
            <Image
              src="/brand/founder.jpg"
              alt={siteConfig.founder.name}
              width={160}
              height={160}
              className="founder-photo"
              priority
            />
          </div>
          <div>
            <h3 className="marketing-h3">{siteConfig.founder.name}</h3>
            <p className="muted">{siteConfig.founder.title}</p>
            <p>{a.founderBio}</p>
            <p className="founder-links">
              <a href={siteConfig.founder.linkedin} target="_blank" rel="noopener noreferrer me">
                LinkedIn
              </a>
              {" · "}
              <a href={siteConfig.founder.github} target="_blank" rel="noopener noreferrer me">
                GitHub
              </a>
              {" · "}
              <a className="mono-ltr" href={`mailto:${siteConfig.founder.email}`}>
                {siteConfig.founder.email}
              </a>
            </p>
          </div>
        </div>
      </Section>

      <Section title={a.principlesTitle}>
        <ul className="marketing-principles">
          {a.principles.map((p) => (
            <li key={p.title}>
              <strong>{p.title}</strong>
              <span>{p.body}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={a.imprintTitle}>
        <Imprint />
      </Section>

      <p>
        {a.contactCta}{" "}
        <Link href="/contact">{t.marketing.footer.contact}</Link>
      </p>
    </>
  );
}
