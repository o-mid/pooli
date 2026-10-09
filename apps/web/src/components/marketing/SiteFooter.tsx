"use client";

import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";
import { definedSocialLinks, siteConfig } from "@/lib/site";
import { Imprint } from "./Imprint";

export function SiteFooter() {
  const t = useT();
  const f = t.marketing.footer;
  const year = new Date().getFullYear();
  const social = definedSocialLinks();

  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-grid">
        <div>
          <p className="marketing-footer-heading">{f.product}</p>
          <ul className="marketing-footer-links">
            <li><Link href="/#how-it-works">{f.howItWorks}</Link></li>
            <li><Link href="/faq">{t.marketing.nav.faq}</Link></li>
            <li><Link href="/security">{f.security}</Link></li>
          </ul>
        </div>
        <div>
          <p className="marketing-footer-heading">{f.company}</p>
          <ul className="marketing-footer-links">
            <li><Link href="/about">{f.about}</Link></li>
            <li><Link href="/contact">{f.contact}</Link></li>
          </ul>
        </div>
        <div>
          <p className="marketing-footer-heading">{f.legal}</p>
          <ul className="marketing-footer-links">
            <li><Link href="/privacy">{f.privacy}</Link></li>
            <li><Link href="/terms">{f.terms}</Link></li>
          </ul>
        </div>
        <div>
          <p className="marketing-footer-heading">{f.connect}</p>
          <ul className="marketing-footer-links">
            {social.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel={link.rel}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="marketing-footer-legal mono-ltr">{siteConfig.company.legalNameEn}</p>
      <Imprint compact />
      {!siteConfig.legalReviewed ? <p className="marketing-footer-meta">{f.legalDraft}</p> : null}
      <p className="marketing-footer-meta">
        © {year} {siteConfig.company.legalNameEn}. {f.rights}
        <br />
        {f.builtIn}
      </p>
    </footer>
  );
}
