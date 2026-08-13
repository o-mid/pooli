"use client";

import { useState } from "react";
import { WalletAddress } from "@/components/ui/WalletAddress";
import { useT } from "@/i18n/LocaleProvider";
import { assetSymbol, exactPayableAmount, networkLabel, type PaymentOption } from "@/lib/payment-handoff";

export function PaymentDetailsDisclosure({
  option,
  onCopyAddress,
  onCopyAmount,
  networkWarning,
}: {
  option: PaymentOption;
  onCopyAddress: () => void;
  onCopyAmount: () => void;
  networkWarning?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const asset = assetSymbol(option);

  return (
    <div className="pay-details">
      <button
        type="button"
        className="linkish"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t.checkout.paymentDetails}
      </button>
      {open ? (
        <dl className="pay-kv" style={{ marginTop: "var(--space-3)" }}>
          <div>
            <dt>{t.checkout.network}</dt>
            <dd>{networkLabel(option.network)}</dd>
          </div>
          <div>
            <dt>{t.checkout.token}</dt>
            <dd>{asset}</dd>
          </div>
          <div>
            <dt>{t.wallets.address}</dt>
            <dd>
              <WalletAddress address={option.destination_address} showCopy={false} />
              <button type="button" className="btn btn-secondary" style={{ marginTop: "var(--space-2)" }} onClick={onCopyAddress}>
                {t.common.copy}
              </button>
            </dd>
          </div>
          <div>
            <dt>{t.checkout.exactAmount}</dt>
            <dd className="mono-ltr tabular">
              {exactPayableAmount(option)} {asset}
              <button type="button" className="btn btn-secondary" onClick={onCopyAmount}>
                {t.checkout.copyAmount}
              </button>
            </dd>
          </div>
          {networkWarning ? <p className="field-hint">{networkWarning}</p> : null}
        </dl>
      ) : null}
    </div>
  );
}
