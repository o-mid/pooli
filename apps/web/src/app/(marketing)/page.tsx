import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { LandingContent } from "@/components/marketing/LandingContent";
import { faqPageGraph, landingGraph } from "@/lib/json-ld";
import { defaultSiteTitle, pageMetadata } from "@/lib/site-metadata";
import { marketingEn } from "@/i18n/messages/marketing-content";

export const metadata: Metadata = pageMetadata({
  title: defaultSiteTitle("en"),
  description:
    "Turn a DM order into a checkout link. Your buyer pays USDT to your wallet. Pooli confirms on-chain — no screenshots.",
  path: "/",
});

export default function HomePage() {
  const faqItems = marketingEn.faqLanding.items;
  const faqLd = faqPageGraph(faqItems);

  return (
    <>
      <JsonLd data={landingGraph()} />
      <JsonLd data={faqLd} />
      <LandingContent />
    </>
  );
}
