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

  /** False until a lawyer has reviewed privacy and terms. Every public surface reads this. */
  legalReviewed: false,

  /** Bump only when the privacy or terms text changes. Not a build date. */
  legalDocumentsUpdatedOn: "2026-10-09",

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
    title: "Founder & CEO",
    email: "omid@pooli.shop",
    linkedin: "https://www.linkedin.com/in/omid-mirzaei/",
    github: "https://github.com/o-mid",
  },

  /**
   * How Pooli uses Claude today: engineering and content workflows only.
   * Checkout matching and Paid ✓ are deterministic Go services — not LLM-driven.
   */
  claudeUsage: {
    anthropicStartupProgramUrl: "https://www.anthropic.com/startups",
    productUsesClaude: false,
    summaryEn:
      "Pooli’s payment engine is Go, PostgreSQL, and on-chain verification. We use Claude in engineering and content workflows to design, test, and ship faster — with human review on anything customer-facing.",
    summaryFa:
      "موتور پرداخت پولی Go، PostgreSQL و تأیید روی زنجیره است. Claude را در مهندسی و محتوا به‌کار می‌بریم — با بازبینی انسانی قبل از انتشار.",
    useCasesEn: [
      "API and chain-matching design reviews before we ship payment logic.",
      "Drafting EN/FA marketing and help copy, then checking every claim against our claims register.",
      "Exploring test scenarios for payment UI states and edge cases.",
      "Internal security, privacy, and runbook drafts (lawyer-reviewed before publication).",
    ],
    useCasesFa: [
      "بازبینی طراحی API و منطق تطبیق زنجیره قبل از انتشار.",
      "پیش‌نویس متن بازاریابی و راهنما (EN/FA) و تطبیق با ثبت ادعاها.",
      "سناریوهای تست برای وضعیت‌های UI پرداخت.",
      "پیش‌نویس داخلی امنیت و حریم خصوصی (بازبینی حقوقی قبل از انتشار).",
    ],
    modelsNoteEn:
      "Claude Sonnet and Opus via Anthropic API in development tooling (exact model IDs vary by release).",
    modelsNoteFa: "Claude Sonnet و Opus در ابزار توسعه (شناسه مدل با نسخه عوض می‌شود).",
    evalsEn:
      "Payment correctness is validated with Go tests, chain simulation, and server-side matching — not LLM judgment.",
    evalsFa:
      "درستی پرداخت با تست Go، شبیه‌ساز زنجیره و تطبیق سرور بررسی می‌شود — نه با قضاوت LLM.",
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

/** JSON-LD identifier entries — only real registry numbers (no fake placeholders). */
export function organizationIdentifiers(): { "@type": "PropertyValue"; name: string; value: string }[] {
  const out: { "@type": "PropertyValue"; name: string; value: string }[] = [];
  if (siteConfig.company.gemiNumber) {
    out.push({ "@type": "PropertyValue", name: "GEMI", value: siteConfig.company.gemiNumber });
  }
  if (siteConfig.company.vatNumber) {
    out.push({ "@type": "PropertyValue", name: "VAT", value: siteConfig.company.vatNumber });
  }
  return out;
}

export function organizationLogoUrl(): string {
  const base = siteConfig.url.replace(/\/$/, "");
  return `${base}/icons/icon-512.png`;
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

/** Appends a draft marker when legal review has not happened. */
export function withLegalStatus(label: string): string {
  if (siteConfig.legalReviewed) return label;
  return `${label} (draft)`;
}
