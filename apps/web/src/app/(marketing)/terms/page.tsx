import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { TermsView } from "@/components/marketing/views/TermsView";
import { breadcrumbGraph } from "@/lib/json-ld";
import { marketingEn } from "@/i18n/messages/marketing-content";
import { pageMetadata } from "@/lib/site-metadata";
import { withLegalStatus } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Terms of service",
  description: withLegalStatus(marketingEn.terms.metaDescription),
  path: "/terms",
});

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbGraph([
          { name: "Home", path: "/" },
          { name: "Terms", path: "/terms" },
        ])}
      />
      <TermsView />
    </>
  );
}
