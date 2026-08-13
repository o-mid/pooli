"use client";

import { useT } from "@/i18n/LocaleProvider";
import { Sheet } from "@/components/ui/Sheet";
import type { WalletCandidate, WalletId } from "@/lib/payment-handoff";

function walletLabel(id: WalletId, t: ReturnType<typeof useT>): string {
  switch (id) {
    case "tronlink":
      return t.checkout.wallets.tronlink;
    case "walletconnect":
      return t.checkout.wallets.walletconnect;
    case "trust":
      return t.checkout.wallets.trust;
    case "other":
      return t.checkout.wallets.other;
    case "qr":
      return t.checkout.showQr;
    default:
      return id;
  }
}

function walletHint(c: WalletCandidate, t: ReturnType<typeof useT>): string | null {
  if (c.id === "tronlink") return t.checkout.wallets.tronlinkHint;
  if (c.id === "walletconnect") return t.checkout.wallets.walletconnectHint;
  if (c.id === "trust") return t.checkout.wallets.trustHint;
  if (c.recommended) return t.checkout.recommend;
  return null;
}

export function WalletPickerSheet({
  open,
  wallets,
  onSelect,
  onShowQr,
  onClose,
}: {
  open: boolean;
  wallets: WalletCandidate[];
  onSelect: (id: WalletId) => void;
  onShowQr: () => void;
  onClose: () => void;
}) {
  const t = useT();

  return (
    <Sheet open={open} onClose={onClose} title={t.checkout.chooseWallet} labelledBy="wallet-picker-title">
      <ul className="wallet-pick-list">
        {wallets
          .filter((w) => w.id !== "qr")
          .map((w) => {
            const hint = walletHint(w, t);
            return (
              <li key={w.id}>
                <button type="button" className="wallet-pick-item" onClick={() => onSelect(w.id)}>
                  <span>
                    <strong>{walletLabel(w.id, t)}</strong>
                    {hint ? <span className="network-hint">{hint}</span> : null}
                  </span>
                  {w.recommended ? <span className="badge">{t.checkout.recommend}</span> : null}
                </button>
              </li>
            );
          })}
      </ul>
      <button type="button" className="btn btn-secondary" style={{ marginTop: "var(--space-3)" }} onClick={onShowQr}>
        {t.checkout.showQr}
      </button>
    </Sheet>
  );
}
