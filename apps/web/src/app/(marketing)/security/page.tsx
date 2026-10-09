import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { SecurityView } from "@/components/marketing/views/SecurityView";
import { breadcrumbGraph } from "@/lib/json-ld";
import { pageMetadata } from "@/lib/site-metadata";
import { marketingEn } from "@/i18n/messages/marketing-content";

export const metadata: Metadata = pageMetadata({
  title: "Security",
  description: marketingEn.security.metaDescription,
  path: "/security",
});

export default function SecurityPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbGraph([
          { name: "Home", path: "/" },
          { name: "Security", path: "/security" },
        ])}
      />
      <SecurityView />
    </>
  );
}
