import {
  companyAddressLine,
  organizationIdentifiers,
  organizationLogoUrl,
  sameAsUrls,
  siteConfig,
} from "@/lib/site";

const base = siteConfig.url.replace(/\/$/, "");

export function organizationNode() {
  const addr = siteConfig.company.address;
  const identifiers = organizationIdentifiers();
  const node: Record<string, unknown> = {
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: siteConfig.company.legalNameEn,
    alternateName: [siteConfig.name, siteConfig.company.legalNameEl],
    legalName: siteConfig.company.legalNameEn,
    url: base,
    logo: organizationLogoUrl(),
    email: siteConfig.contact.support,
    foundingDate: siteConfig.foundingYear ? String(siteConfig.foundingYear) : undefined,
    founder: {
      "@type": "Person",
      name: siteConfig.founder.name,
      jobTitle: siteConfig.founder.title,
      email: siteConfig.founder.email,
      url: `${base}/about`,
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: addr.street,
      addressLocality: addr.city,
      postalCode: addr.postalCode,
      addressCountry: addr.countryCode,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: siteConfig.contact.support,
      availableLanguage: ["en", "fa"],
    },
    sameAs: sameAsUrls(),
  };
  if (siteConfig.company.vatNumber) node.vatID = siteConfig.company.vatNumber;
  if (identifiers.length === 1) node.identifier = identifiers[0];
  else if (identifiers.length > 1) node.identifier = identifiers;
  return node;
}

export function founderNode() {
  return {
    "@type": "Person",
    "@id": `${base}/#founder`,
    name: siteConfig.founder.name,
    jobTitle: siteConfig.founder.title,
    email: siteConfig.founder.email,
    url: `${base}/about`,
    sameAs: [siteConfig.founder.linkedin, siteConfig.founder.github],
    worksFor: { "@id": `${base}/#organization` },
  };
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: siteConfig.name,
    url: base,
    inLanguage: ["en", "fa"],
    publisher: { "@id": `${base}/#organization` },
  };
}

export function softwareApplicationNode() {
  return {
    "@type": "WebApplication",
    "@id": `${base}/#application`,
    name: siteConfig.name,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web, iOS, Android (PWA)",
    url: base,
    publisher: { "@id": `${base}/#organization` },
  };
}

export function landingGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      founderNode(),
      websiteNode(),
      softwareApplicationNode(),
    ],
  };
}

export function verificationOrganizationGraph() {
  return {
    "@context": "https://schema.org",
    ...organizationNode(),
  };
}

export function claudePageGraph(description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      founderNode(),
      {
        "@type": "WebPage",
        "@id": `${base}/claude`,
        name: "Building with Claude",
        description,
        url: `${base}/claude`,
        isPartOf: { "@id": `${base}/#website` },
        about: { "@id": `${base}/#organization` },
      },
    ],
  };
}

export function faqPageGraph(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function breadcrumbGraph(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: new URL(item.path, siteConfig.url).toString(),
    })),
  };
}

export function aboutPageGraph(description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      founderNode(),
      {
        "@type": "AboutPage",
        "@id": `${base}/about`,
        name: `About ${siteConfig.name}`,
        description,
        url: `${base}/about`,
        isPartOf: { "@id": `${base}/#website` },
        about: { "@id": `${base}/#organization` },
      },
    ],
  };
}

export function contactPageGraph(description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      {
        "@type": "ContactPage",
        "@id": `${base}/contact`,
        name: `Contact ${siteConfig.name}`,
        description,
        url: `${base}/contact`,
        isPartOf: { "@id": `${base}/#website` },
      },
    ],
  };
}

/** Validate required Organization fields for tests */
export function assertOrganizationShape(node: Record<string, unknown>): void {
  const required = ["@type", "@id", "name", "legalName", "url", "email", "address"];
  for (const key of required) {
    if (node[key] === undefined || node[key] === null || node[key] === "") {
      throw new Error(`Organization missing ${key}`);
    }
  }
  if (node["@type"] !== "Organization") throw new Error("Not Organization");
  if (!node.foundingDate) throw new Error("Organization missing foundingDate");
}

export function imprintTextEn(): string {
  return companyAddressLine("en");
}
