"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PaymentState } from "@/components/payments/PaymentState";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/LocaleProvider";
import { track } from "@/lib/analytics";
import {
  assetSymbol,
  buildHandoffPlan,
  buildPaymentDetailsText,
  canRefreshQuote,
  copyText,
  detectBrowserEnv,
  exactPayableAmount,
  exceptionKind,
  fullDestinationAddress,
  getPreferredWallet,
  launchWalletHandoff,
  moneyDetected,
  networkLabel,
  openInExternalBrowser,
  setPreferredWallet,
  type PaymentOption,
  type WalletId,
} from "@/lib/payment-handoff";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { PaymentDetailsDisclosure } from "./PaymentDetailsDisclosure";
import { PaymentException } from "./PaymentException";
import { WalletPickerSheet } from "./WalletPickerSheet";

export type PaySheetMatched = {
  tx_hash?: string;
  explorer_url?: string;
  confirmations?: number | null;
  required_confirmations?: number | null;
};

export type PaySheetReceipt = {
  usdt_amount?: string;
  received_usdt_amount?: string;
  network?: string;
  tx_hash?: string;
  explorer_url?: string;
  order_reference?: string;
  paid_at?: string;
  success_message?: string;
} | null;

export function PooliPaySheet({
  storeName,
  title,
  fiatAmountToman,
  option,
  intentStatus,
  matched,
  receipt,
  fulfillmentStatus,
  shippingProvider,
  trackingNumber,
  countdown,
  onRefreshQuote,
  refreshingQuote,
  checkingPayment,
}: {
  storeName: string;
  title?: string;
  fiatAmountToman: number;
  option: PaymentOption | null;
  intentStatus?: string;
  matched?: PaySheetMatched | null;
  receipt?: PaySheetReceipt;
  fulfillmentStatus?: string;
  shippingProvider?: string;
  trackingNumber?: string;
  countdown: string;
  onRefreshQuote?: () => void;
  refreshingQuote?: boolean;
  checkingPayment?: boolean;
}) {
  const t = useT();
  const { showToast } = useToast();
  const env = useMemo(() => detectBrowserEnv(), []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showWhyExact, setShowWhyExact] = useState(false);
  const [handoffTrouble, setHandoffTrouble] = useState(false);
  const [busyPay, setBusyPay] = useState(false);

  const wcProjectId =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "" : "";

  const [preferred, setPreferred] = useState<WalletId | null>(null);
  useEffect(() => {
    if (!option) return;
    setPreferred(getPreferredWallet(option.network));
  }, [option]);

  const resolvedPlan = useMemo(() => {
    if (!option) return null;
    return buildHandoffPlan({
      option,
      env,
      preferredWalletId: preferred,
      walletConnectProjectId: wcProjectId,
      storeName,
    });
  }, [option, env, preferred, wcProjectId, storeName]);

  useEffect(() => {
    if (resolvedPlan?.qrPrimary) setShowQr(true);
  }, [resolvedPlan?.qrPrimary]);

  const ex = exceptionKind(intentStatus);
  const canRefresh = canRefreshQuote(intentStatus, option?.expires_at);
  const asset = option ? assetSymbol(option) : "USDT";
  const paid = intentStatus === "PAID";

  async function onCopyAmount() {
    if (!option) return;
    const ok = await copyText(exactPayableAmount(option));
    if (ok) {
      showToast(t.checkout.amountCopied);
      track("amount_copied", { network: option.network });
    }
  }

  async function onCopyAddress() {
    if (!option) return;
    const ok = await copyText(fullDestinationAddress(option));
    if (ok) {
      showToast(t.checkout.addressCopied);
      track("address_copied", { network: option.network });
    }
  }

  async function onCopyDetails() {
    if (!option) return;
    const ok = await copyText(
      buildPaymentDetailsText({
        storeName,
        option,
        labels: {
          heading: t.checkout.copyHeading,
          merchant: t.checkout.copyMerchant,
          amount: t.checkout.copyAmountLine,
          network: t.checkout.copyNetworkLine,
          address: t.checkout.copyAddressLine,
        },
      }),
    );
    if (ok) {
      showToast(t.checkout.detailsCopied);
      track("payment_details_copied", { network: option.network });
    }
  }

  async function pay(walletId?: WalletId) {
    if (!option || !resolvedPlan) return;
    const id = walletId || resolvedPlan.primary.id;
    if (id === "qr") {
      setShowQr(true);
      track("qr_opened", { network: option.network });
      return;
    }
    setBusyPay(true);
    setHandoffTrouble(false);
    track("pay_with_wallet_clicked", { network: option.network, wallet: id });
    track("wallet_handoff_attempted", { network: option.network, wallet: id });
    try {
      const result = await launchWalletHandoff(
        {
          option,
          env,
          preferredWalletId: id,
          walletConnectProjectId: wcProjectId,
          storeName,
          checkoutUrl: typeof window !== "undefined" ? window.location.href : undefined,
        },
        id,
      );
      setPreferredWallet(option.network, id);
      setPreferred(id);
      if (!result.ok) {
        track("wallet_handoff_failed", { network: option.network, wallet: id, reason: result.reason });
        if (env.isInAppBrowser || result.reason === "failed" || result.reason === "unsupported") {
          setHandoffTrouble(true);
        }
        if (result.reason === "missing_project_id") {
          setShowQr(true);
        }
      }
    } finally {
      setBusyPay(false);
      setPickerOpen(false);
    }
  }

  function primaryCtaLabel(): string {
    if (!resolvedPlan) return t.checkout.payWithWallet;
    if (resolvedPlan.primary.id === "tronlink") return t.checkout.payWithTronlink;
    return t.checkout.payWithWallet;
  }

  if (paid) {
    return (
      <div className="page-stack">
        <PaymentState intentStatus="PAID" />
        <ReceiptCard
          storeName={storeName}
          title={title}
          fiatAmountToman={fiatAmountToman}
          receipt={{
            merchant: storeName,
            order_title: title,
            order_reference: receipt?.order_reference,
            fiat_amount_toman: fiatAmountToman,
            usdt_amount: receipt?.usdt_amount,
            received_usdt_amount: receipt?.received_usdt_amount,
            network: receipt?.network || option?.network,
            tx_hash: matched?.tx_hash || receipt?.tx_hash,
            explorer_url: matched?.explorer_url || receipt?.explorer_url,
            success_message: receipt?.success_message,
          }}
        />
        <p className="muted" style={{ textAlign: "center", margin: 0 }}>
          {t.checkout.closePage}
        </p>
        {trackingNumber ? (
          <div>
            <div className="muted">{t.checkout.trackingCode}</div>
            <div className="mono-ltr" style={{ fontWeight: 600 }}>
              {shippingProvider ? `${shippingProvider} · ` : ""}
              {trackingNumber}
            </div>
          </div>
        ) : null}
        {fulfillmentStatus === "SHIPPED" || fulfillmentStatus === "DELIVERED" ? (
          <p className="muted">✓ {t.checkout.orderShipped}</p>
        ) : null}
      </div>
    );
  }

  if (ex && ex !== "EXPIRED") {
    return (
      <PaymentException
        kind={ex}
        expectedAmount={option ? exactPayableAmount(option) : undefined}
        receivedAmount={receipt?.received_usdt_amount}
        asset={asset}
      />
    );
  }

  if (ex === "EXPIRED" || canRefresh) {
    return <PaymentException kind="EXPIRED" onRefresh={onRefreshQuote} refreshing={refreshingQuote} />;
  }

  if (!option || !resolvedPlan) return null;

  const amountPrimary = `${exactPayableAmount(option)} ${asset}`;
  const awaiting = !moneyDetected(intentStatus);

  return (
    <section className="section">
      <AmountDisplay
        primary={amountPrimary}
        secondary={`${asset} · ${networkLabel(option.network)} · ${fiatAmountToman.toLocaleString()} ${t.checkout.toman}`}
      />
      <button type="button" className="linkish" onClick={() => setShowWhyExact((v) => !v)}>
        {t.checkout.whyExactAmount}
      </button>
      {showWhyExact ? <p className="field-hint">{t.checkout.exactHint}</p> : null}
      {awaiting && countdown && countdown !== "—" ? (
        <p className="muted tabular" style={{ margin: 0 }}>
          {t.checkout.quoteExpires}: {countdown}
        </p>
      ) : null}

      <PaymentState
        intentStatus={intentStatus}
        openingWallet={busyPay}
        confirmations={matched?.confirmations}
        requiredConfirmations={matched?.required_confirmations}
      />

      {checkingPayment && !moneyDetected(intentStatus) ? (
        <p className="muted" role="status" aria-live="polite">
          {t.checkout.checkingPayment}
        </p>
      ) : null}

      {(showQr || resolvedPlan.qrPrimary) && (
        <div className="qr-card">
          <p className="section-title" style={{ paddingInline: 0, textAlign: "center" }}>
            {t.checkout.scanWithWallet}
          </p>
          <div className="qr-frame">
            <QRCodeSVG
              value={resolvedPlan.qrPayload}
              size={200}
              bgColor="#ffffff"
              fgColor="#0b1f1a"
              level="M"
              marginSize={4}
            />
          </div>
        </div>
      )}

      {handoffTrouble || env.isInAppBrowser ? (
        <div className="cta-stack">
          <p style={{ margin: 0, fontWeight: 600 }}>{t.checkout.iabTitle}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => openInExternalBrowser(typeof window !== "undefined" ? window.location.href : "")}
          >
            {t.checkout.openInBrowser}
          </button>
        </div>
      ) : null}

      <PaymentDetailsDisclosure
        option={option}
        onCopyAddress={onCopyAddress}
        onCopyAmount={onCopyAmount}
        networkWarning={t.checkout.wrongNetwork}
      />

      <div className="sticky-cta">
        {resolvedPlan.showPayWithWallet ? (
          <div className="cta-stack">
            <button type="button" className="btn btn-primary" disabled={busyPay} onClick={() => pay()}>
              {busyPay ? t.checkout.openingWallet : primaryCtaLabel()}
            </button>
            <button type="button" className="linkish" onClick={() => setPickerOpen(true)}>
              {t.checkout.changeWallet}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onCopyDetails}>
            {t.checkout.copyPaymentDetails}
          </button>
        )}
        <div className="cta-stack" style={{ marginTop: "var(--space-2)" }}>
          {!showQr ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowQr(true);
                track("qr_opened", { network: option.network });
              }}
            >
              {t.checkout.showQr}
            </button>
          ) : null}
          {resolvedPlan.showPayWithWallet ? (
            <button type="button" className="btn btn-secondary" onClick={onCopyDetails}>
              {t.checkout.copyPaymentDetails}
            </button>
          ) : null}
        </div>
      </div>

      <WalletPickerSheet
        open={pickerOpen}
        wallets={resolvedPlan.wallets}
        onClose={() => setPickerOpen(false)}
        onShowQr={() => {
          setShowQr(true);
          setPickerOpen(false);
          track("qr_opened", { network: option.network });
        }}
        onSelect={(id) => {
          track("wallet_selected", { network: option.network, wallet: id });
          void pay(id);
        }}
      />
    </section>
  );
}
