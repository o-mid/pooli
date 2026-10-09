"use client";

import Link from "next/link";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { siteConfig } from "@/lib/site";

export function ClaudeUsageSection({ showMoreLink = true }: { showMoreLink?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const a = t.marketing.about;
  const c = siteConfig.claudeUsage;
  const summary = locale === "fa" ? c.summaryFa : c.summaryEn;
  const useCases = locale === "fa" ? c.useCasesFa : c.useCasesEn;
  const models = locale === "fa" ? c.modelsNoteFa : c.modelsNoteEn;

  return (
    <section className="marketing-section" id="claude">
      <h2 className="marketing-h2">{a.claudeTitle}</h2>
      <p>{a.claudeIntro}</p>
      <p className="muted">{summary}</p>
      <ul className="marketing-facts">
        {useCases.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="muted">{models}</p>
      <p>{a.claudeEvals}</p>
      {showMoreLink ? (
        <p>
          <Link href="/claude">{a.claudeMore}</Link>
        </p>
      ) : null}
    </section>
  );
}
