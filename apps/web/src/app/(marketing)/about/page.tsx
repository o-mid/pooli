import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { AboutView } from "@/components/marketing/views/AboutView";
import { aboutPageGraph, breadcrumbGraph } from "@/lib/json-ld";
import { pageMetadata } from "@/lib/site-metadata";
import { marketingEn } from "@/i18n/messages/marketing-content";

export const metadata: Metadata = pageMetadata({
  title: "About Pooli",
  description: marketingEn.about.metaDescription,
  path: "/about",
});

export default function AboutPage() {
  const description = marketingEn.about.metaDescription;
  return (
    <>
      <JsonLd data={aboutPageGraph(description)} />
      <JsonLd
        data={breadcrumbGraph([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ])}
      />
      <AboutView />
    </>
  );
}
