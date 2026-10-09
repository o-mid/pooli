import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { ClaudeView } from "@/components/marketing/views/ClaudeView";
import { breadcrumbGraph, claudePageGraph } from "@/lib/json-ld";
import { pageMetadata } from "@/lib/site-metadata";
import { marketingEn } from "@/i18n/messages/marketing-content";

export const metadata: Metadata = pageMetadata({
  title: marketingEn.claude.metaTitle,
  description: marketingEn.claude.metaDescription,
  path: "/claude",
});

export default function ClaudePage() {
  const description = marketingEn.claude.metaDescription;
  return (
    <>
      <JsonLd data={claudePageGraph(description)} />
      <JsonLd data={breadcrumbGraph([
        { name: "Home", path: "/" },
        { name: "Claude", path: "/claude" },
      ])} />
      <ClaudeView />
    </>
  );
}
