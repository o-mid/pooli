"use client";

import { LegalDraftBanner } from "@/components/marketing/LegalDraftBanner";
import { Section } from "@/components/marketing/Section";
import { useT } from "@/i18n/LocaleProvider";
import { siteConfig } from "@/lib/site";

export function PrivacyView() {
  const t = useT();
  const p = t.marketing.privacy;
  const s = p.sections;

  return (
    <>
      <LegalDraftBanner text={p.draftBanner} />
      <header className="marketing-page-header">
        <h1 className="marketing-h1">{p.title}</h1>
        <p className="muted">
          {p.lastUpdated}: {siteConfig.legalDocumentsUpdatedOn}
        </p>
      </header>
      <Section title={s.controller}><p>{s.controllerBody}</p></Section>
      <Section title={s.collect}><p>{s.collectBody}</p></Section>
      <Section title={s.analytics}><p>{s.analyticsBody}</p></Section>
      <Section title={s.cookies}><p>{s.cookiesBody}</p></Section>
      <Section title={s.sharing}><p>{s.sharingBody}</p></Section>
      <Section title={s.retention}><p>{s.retentionBody}</p></Section>
      <Section title={s.rights}><p>{s.rightsBody}</p></Section>
      <Section title={s.transfers}><p>{s.transfersBody}</p></Section>
      <Section title={s.contact}><p>{s.contactBody}</p></Section>
    </>
  );
}
