"use client";

import { LegalDraftBanner } from "@/components/marketing/LegalDraftBanner";
import { Section } from "@/components/marketing/Section";
import { useT } from "@/i18n/LocaleProvider";
import { siteBuildDate } from "@/lib/site";

export function TermsView() {
  const t = useT();
  const p = t.marketing.terms;
  const s = p.sections;

  return (
    <>
      <LegalDraftBanner text={p.draftBanner} />
      <header className="marketing-page-header">
        <h1 className="marketing-h1">{p.title}</h1>
        <p className="muted">
          {p.lastUpdated}: {siteBuildDate()}
        </p>
      </header>
      <Section title={s.agreement}><p>{s.agreementBody}</p></Section>
      <Section title={s.service}><p>{s.serviceBody}</p></Section>
      <Section title={s.payments}><p>{s.paymentsBody}</p></Section>
      <Section title={s.acceptable}><p>{s.acceptableBody}</p></Section>
      <Section title={s.liability}><p>{s.liabilityBody}</p></Section>
      <Section title={s.law}><p>{s.lawBody}</p></Section>
      <Section title={s.contact}><p>{s.contactBody}</p></Section>
    </>
  );
}
