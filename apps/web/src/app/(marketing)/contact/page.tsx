import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { ContactView } from "@/components/marketing/views/ContactView";
import { breadcrumbGraph, contactPageGraph } from "@/lib/json-ld";
import { pageMetadata } from "@/lib/site-metadata";
import { marketingEn } from "@/i18n/messages/marketing-content";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description: marketingEn.contact.metaDescription,
  path: "/contact",
});

export default function ContactPage() {
  const description = marketingEn.contact.metaDescription;
  return (
    <>
      <JsonLd data={contactPageGraph(description)} />
      <JsonLd
        data={breadcrumbGraph([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
      <ContactView />
    </>
  );
}
