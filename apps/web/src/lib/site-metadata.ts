import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

type LocaleMeta = "en" | "fa";

export function defaultSiteTitle(locale: LocaleMeta = "en"): string {
  return locale === "fa"
    ? `${siteConfig.name} — ${siteConfig.tagline.fa}`
    : `${siteConfig.name} — ${siteConfig.tagline.en}`;
}

export function pageMetadata({
  title,
  description,
  path,
  locale = "en",
}: {
  title: string;
  description: string;
  path: string;
  locale?: LocaleMeta;
}): Metadata {
  const url = new URL(path, siteConfig.url).toString();
  const ogLocale = locale === "fa" ? "fa_IR" : "en_US";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: siteConfig.name,
      locale: ogLocale,
      images: [{ url: "/brand/og-default.png", width: 1200, height: 630, alt: siteConfig.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/brand/og-default.png"],
    },
    robots: { index: true, follow: true },
  };
}

export const privateRouteRobots: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
