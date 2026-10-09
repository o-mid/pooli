import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { PrivacyView } from "@/components/marketing/views/PrivacyView";
import { breadcrumbGraph } from "@/lib/json-ld";
import { pageMetadata } from "@/lib/site-metadata";
import { marketingEn } from "@/i18n/messages/marketing-content";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description: marketingEn.privacy.metaDescription,
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbGraph([
          { name: "Home", path: "/" },
          { name: "Privacy", path: "/privacy" },
        ])}
      />
      <PrivacyView />
    </>
  );
}
