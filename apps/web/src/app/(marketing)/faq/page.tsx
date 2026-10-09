import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { FaqView } from "@/components/marketing/views/FaqView";
import { breadcrumbGraph, faqPageGraph } from "@/lib/json-ld";
import { pageMetadata } from "@/lib/site-metadata";
import { marketingEn } from "@/i18n/messages/marketing-content";

const allFaq = [...marketingEn.faqLanding.items, ...marketingEn.faqPage.extra];

export const metadata: Metadata = pageMetadata({
  title: "FAQ",
  description: marketingEn.faqPage.metaDescription,
  path: "/faq",
});

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqPageGraph(allFaq)} />
      <JsonLd
        data={breadcrumbGraph([
          { name: "Home", path: "/" },
          { name: "FAQ", path: "/faq" },
        ])}
      />
      <FaqView />
    </>
  );
}
