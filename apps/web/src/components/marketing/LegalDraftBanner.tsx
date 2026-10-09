"use client";

import { siteConfig } from "@/lib/site";

export function LegalDraftBanner({ text }: { text: string }) {
  if (siteConfig.legalReviewed) return null;
  return (
    <div className="legal-draft-banner" role="status">
      {text}
    </div>
  );
}
