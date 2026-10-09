"use client";

import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { useT } from "@/i18n/LocaleProvider";

export function FaqView() {
  const t = useT();
  const landing = t.marketing.faqLanding.items;
  const extra = t.marketing.faqPage.extra;
  const all = [...landing, ...extra];

  return (
    <>
      <header className="marketing-page-header">
        <h1 className="marketing-h1">{t.marketing.faqPage.title}</h1>
      </header>
      <FaqAccordion items={all} />
    </>
  );
}
