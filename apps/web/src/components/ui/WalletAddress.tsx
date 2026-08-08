"use client";

import { useState } from "react";
import { useT } from "@/i18n/LocaleProvider";

export function WalletAddress({
  address,
  showCopy = true,
}: {
  address: string;
  showCopy?: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.65rem" }}>
      <code className="wallet-addr mono-ltr">{address}</code>
      {showCopy ? (
        <button type="button" className="btn btn-secondary" onClick={copy}>
          {copied ? t.common.copied : t.common.copy}
        </button>
      ) : null}
    </div>
  );
}
