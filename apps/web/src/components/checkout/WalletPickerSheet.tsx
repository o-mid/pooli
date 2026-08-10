"use client";

import { useT } from "@/i18n/LocaleProvider";
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
  if (!open) return null;

  return (
    <div className="install-sheet-root" role="dialog" aria-modal="true" aria-label={t.checkout.chooseWallet}>
      <button type="button" className="install-sheet-backdrop" aria-label={t.common.back} onClick={onClose} />
      <div className="install-sheet">
        <div className="install-sheet-handle" aria-hidden />
        <h2 className="install-sheet-title">{t.checkout.chooseWallet}</h2>
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
      </div>
    </div>
  );
}
