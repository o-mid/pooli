"use client";

import { BrandMark } from "@/components/BrandMark";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { useT } from "@/i18n/LocaleProvider";

export type ReceiptData = {
  merchant?: string;
  order_title?: string;
  order_reference?: string;
  fiat_amount_toman?: number;
  usdt_amount?: string;
  received_usdt_amount?: string;
  network?: string;
  tx_hash?: string;
  explorer_url?: string;
  success_message?: string;
};

function networkLabel(network: string): string {
  if (network === "bsc") return "BNB Chain";
  if (network === "tron") return "TRON";
  return network.toUpperCase();
}

type Props = {
  receipt: ReceiptData;
  storeName?: string;
  title?: string;
  fiatAmountToman?: number;
  showActions?: boolean;
};

export function ReceiptCard({ receipt, storeName, title, fiatAmountToman, showActions = true }: Props) {
  const t = useT();
  const merchant = receipt.merchant || storeName || t.brand;
  const amount = fiatAmountToman ?? receipt.fiat_amount_toman ?? 0;
  const usdt = receipt.received_usdt_amount || receipt.usdt_amount;
  const network = receipt.network || "";

  async function share() {
    const text = [
      `✓ ${t.receipt.title}`,
      merchant,
      `${amount.toLocaleString()} ${t.checkout.toman}`,
      receipt.order_reference ? `${t.checkout.orderRef} #${receipt.order_reference}` : "",
      usdt ? `${usdt} USDT · ${networkLabel(network)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: t.receipt.title, text });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard.writeText(text);
  }

  return (
    <section className="receipt-card success-pulse" data-receipt>
      <div className="alert alert-success" role="status" style={{ textAlign: "center" }}>
        ✓ {t.receipt.title}
      </div>
      <p className="receipt-store">{merchant}</p>
      {title || receipt.order_title ? <p className="muted">{title || receipt.order_title}</p> : null}
      <AmountDisplay primary={`${amount.toLocaleString()} ${t.checkout.toman}`} />
      {receipt.order_reference ? (
        <p className="muted mono-ltr" style={{ textAlign: "center" }}>
          {t.checkout.orderRef} #{receipt.order_reference}
        </p>
      ) : null}
      {receipt.success_message ? <p className="receipt-success-msg">{receipt.success_message}</p> : null}

      <details className="receipt-tech">
        <summary className="linkish">{t.checkout.paymentDetails}</summary>
        {usdt ? (
          <p className="muted">
            {usdt} USDT · {networkLabel(network)}
          </p>
        ) : null}
        {receipt.tx_hash ? (
          <p className="mono-ltr">
            {t.receipt.transaction}: {receipt.tx_hash.slice(0, 10)}…{receipt.tx_hash.slice(-6)}
          </p>
        ) : null}
        {receipt.explorer_url ? (
          <a className="btn btn-secondary" href={receipt.explorer_url} target="_blank" rel="noreferrer">
            {t.checkout.viewTx}
          </a>
        ) : null}
      </details>

      {showActions ? (
        <div className="receipt-actions">
          <button type="button" className="btn btn-secondary" onClick={() => share()}>
            {t.receipt.share}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
            {t.receipt.print}
          </button>
        </div>
      ) : null}

      <p className="powered muted">
        <BrandMark variant="mark" size={16} /> {t.brand}
      </p>
    </section>
  );
}
