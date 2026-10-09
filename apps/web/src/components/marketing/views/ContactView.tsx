"use client";

import { useT } from "@/i18n/LocaleProvider";
import { companyAddressLine, definedSocialLinks, siteConfig } from "@/lib/site";

export function ContactView() {
  const t = useT();
  const c = t.marketing.contact;
  const social = definedSocialLinks();

  return (
    <>
      <header className="marketing-page-header">
        <h1 className="marketing-h1">{c.title}</h1>
        <p className="marketing-lead">{c.intro}</p>
      </header>
      <dl className="contact-dl">
        <div>
          <dt>{c.supportLabel}</dt>
          <dd>
            <a className="mono-ltr" href={`mailto:${siteConfig.contact.support}`}>
              {siteConfig.contact.support}
            </a>
          </dd>
        </div>
        <div>
          <dt>{c.founderLabel}</dt>
          <dd>
            <a className="mono-ltr" href={`mailto:${siteConfig.contact.founder}`}>
              {siteConfig.contact.founder}
            </a>
          </dd>
        </div>
        <div>
          <dt>{c.addressLabel}</dt>
          <dd className="mono-ltr">{companyAddressLine()}</dd>
        </div>
        <div>
          <dt>{c.socialLabel}</dt>
          <dd>
            <ul className="marketing-footer-links">
              {social.map((link) => (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel={link.rel}>{link.label}</a>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </>
  );
}
