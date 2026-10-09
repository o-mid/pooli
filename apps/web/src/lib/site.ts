/**
 * Public site identity — single source for marketing pages, JSON-LD, and footprint files.
 */

const foundingYearRaw = process.env.NEXT_PUBLIC_FOUNDING_YEAR ?? "2024";
const foundingYear =
  foundingYearRaw && /^\d{4}$/.test(foundingYearRaw) ? Number(foundingYearRaw) : 2024;

export const siteConfig = {
  name: "Pooli",
  tagline: {
    en: "Send a link. Know when they paid.",
    fa: "لینک رو بفرست. وقتی پرداخت شد، خودت می‌فهمی.",
  },
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://pooli.shop",
  foundingYear,

  legalReviewed: true,

  /** Friends & family pre-seed (stated by founder; not a volume/traction claim). */
  funding: {
    friendsAndFamilyUsd: 20_000,
    labelEn: "Friends and family",
    labelFa: "دوستان و خانواده",
  },

  company: {
    legalNameEn: "POOLI SINGLE MEMBER P.C.",
    legalNameEnFull: "POOLI SINGLE MEMBER PRIVATE COMPANY",
    legalNameEl: 'Μονοπρόσωπη Ι.Κ.Ε. "POOLI"',
    legalNameElFull: 'Μονοπρόσωπη Ιδιωτική Κεφαλαιουχική Εταιρεία "POOLI"',
    gemiNumber: process.env.NEXT_PUBLIC_GEMI_NUMBER || undefined,
    vatNumber: process.env.NEXT_PUBLIC_VAT_NUMBER || undefined,
    address: {
      street: "Porou 31",
      area: "Kentrikos Tomeas Athinon",
      city: "Athens",
      postalCode: "112 56",
      country: "Greece",
      countryCode: "GR",
    },
  },

  founder: {
    name: "Omid Mirzaei",
    title: "Founder",
    email: "omid@pooli.shop",
    linkedin: "https://www.linkedin.com/in/omid-mirzaei/",
    github: "https://github.com/o-mid",
  },

  contact: {
    support: "support@pooli.shop",
    founder: "omid@pooli.shop",
  },

  social: {
    linkedinCompany: "https://www.linkedin.com/company/poolishop",
    linkedinFounder: "https://www.linkedin.com/in/omid-mirzaei/",
    github: "https://github.com/o-mid/pooli",
    telegramBot: "https://t.me/PooliShopbot",
  },
} as const;

export type SiteConfig = typeof siteConfig;

export function companyAddressLine(locale: "en" | "fa" = "en"): string {
  const { street, area, postalCode, city, country } = siteConfig.company.address;
  if (locale === "fa") {
    return `${street}، ${area}، ${postalCode} ${city}، ${country}`;
  }
  return `${street}, ${area}, ${postalCode} ${city}, ${country}`;
}

export function definedSocialLinks(): { label: string; href: string; rel?: string }[] {
  const s = siteConfig.social;
  const out: { label: string; href: string; rel?: string }[] = [];
  if (s.linkedinCompany) out.push({ label: "LinkedIn", href: s.linkedinCompany, rel: "noopener noreferrer" });
  if (s.linkedinFounder)
    out.push({ label: "Omid on LinkedIn", href: s.linkedinFounder, rel: "noopener noreferrer me" });
  if (s.github) out.push({ label: "GitHub", href: s.github, rel: "noopener noreferrer me" });
  if (s.telegramBot) out.push({ label: "Telegram", href: s.telegramBot, rel: "noopener noreferrer" });
  return out;
}

export function sameAsUrls(): string[] {
  const s = siteConfig.social;
  return [s.linkedinCompany, s.linkedinFounder, s.github, s.telegramBot].filter(Boolean) as string[];
}

/** Stable sitemap / policy dates — set at build via NEXT_PUBLIC_SITE_BUILD_DATE (YYYY-MM-DD). */
export function siteBuildDate(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_BUILD_DATE;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "2026-10-09";
}

export function siteBuildIso(): string {
  return `${siteBuildDate()}T00:00:00.000Z`;
}

export function securityTxtExpires(): string {
  const d = new Date(siteBuildIso());
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
