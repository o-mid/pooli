"use client";

import { useT } from "@/i18n/LocaleProvider";
import { useToast } from "@/components/ui/Toast";

export function WalletAddress({
  address,
  showCopy = true,
}: {
  address: string;
  showCopy?: boolean;
}) {
  const t = useT();
  const { showToast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      showToast(t.common.copied);
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.65rem" }}>
      <code className="wallet-addr mono-ltr">{address}</code>
      {showCopy ? (
        <button type="button" className="btn btn-secondary" onClick={copy}>
          {t.common.copy}
        </button>
      ) : null}
    </div>
  );
}
