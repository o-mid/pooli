"use client";

import Link from "next/link";
import { ClaudeUsageSection } from "@/components/marketing/ClaudeUsageSection";
import { Section } from "@/components/marketing/Section";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { siteConfig } from "@/lib/site";

export function ClaudeView() {
  const t = useT();
  const { locale } = useLocale();
  const p = t.marketing.claude;
  const c = siteConfig.claudeUsage;

  return (
    <>
      <header className="marketing-page-header">
        <h1 className="marketing-h1">{p.title}</h1>
        <p className="marketing-lead">{p.lead}</p>
      </header>

      <ClaudeUsageSection showMoreLink={false} />

      <Section title={p.notInProductTitle}>
        <p>{p.notInProductBody}</p>
      </Section>

      <p>
        <a href={c.anthropicStartupProgramUrl} target="_blank" rel="noopener noreferrer">
          {p.moreLink}
        </a>
        {" · "}
        <Link href="/about">{p.aboutLink}</Link>
      </p>
      <p className="muted mono-ltr">
        {locale === "fa" ? c.evalsFa : c.evalsEn}
      </p>
    </>
  );
}
