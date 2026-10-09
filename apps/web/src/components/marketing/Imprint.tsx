"use client";

import { useLocale, useT } from "@/i18n/LocaleProvider";
import { companyAddressLine, siteConfig } from "@/lib/site";

export function Imprint({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const m = t.marketing.imprint;
  const addr = companyAddressLine(locale === "fa" ? "fa" : "en");

  return (
    <div className={`imprint-block${compact ? " imprint-block-compact" : ""}`}>
      <dl className="imprint-dl">
        <div>
          <dt>{m.legalName}</dt>
          <dd>
            {siteConfig.company.legalNameEn}
            <br />
            <span lang="el">{siteConfig.company.legalNameEl}</span>
          </dd>
        </div>
        <div>
          <dt>{m.address}</dt>
          <dd className="mono-ltr">{addr}</dd>
        </div>
        <div>
          <dt>{m.contact}</dt>
          <dd>
            <a className="mono-ltr" href={`mailto:${siteConfig.contact.support}`}>
              {siteConfig.contact.support}
            </a>
            <br />
            <a className="mono-ltr" href={`mailto:${siteConfig.contact.founder}`}>
              {siteConfig.contact.founder}
            </a>
          </dd>
        </div>
        <div>
          <dt>{m.gemi}</dt>
          <dd className="mono-ltr">
            {siteConfig.company.gemiNumber ?? m.gemiPending}
          </dd>
        </div>
        <div>
          <dt>{m.vat}</dt>
          <dd className="mono-ltr">
            {siteConfig.company.vatNumber ?? m.vatPending}
          </dd>
        </div>
        {siteConfig.foundingYear ? (
          <div>
            <dt>{m.founded}</dt>
            <dd>{siteConfig.foundingYear}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
