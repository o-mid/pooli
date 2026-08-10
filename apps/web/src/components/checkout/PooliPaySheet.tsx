"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PaymentProgress } from "@/components/PaymentProgress";
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
import { PaymentDetailsDisclosure } from "./PaymentDetailsDisclosure";
import { PaymentException } from "./PaymentException";
import { WalletPickerSheet } from "./WalletPickerSheet";

export type PaySheetMatched = {
  tx_hash?: string;
  explorer_url?: string;
  confirmations?: number;
  required_confirmations?: number;
};

export type PaySheetReceipt = {
  usdt_amount?: string;
  received_usdt_amount?: string;
  network?: string;
  tx_hash?: string;
  explorer_url?: string;
  order_reference?: string;
  paid_at?: string;
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
    const ok = await copyText(buildPaymentDetailsText({ storeName, option }));
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
    if (resolvedPlan.primary.id === "walletconnect" || resolvedPlan.primary.id === "trust") {
      return t.checkout.payWithWallet;
    }
    return t.checkout.payWithWallet;
  }

  if (paid) {
    return (
      <section className="card-panel success-pulse">
        <div className="alert alert-success" role="status" style={{ marginBottom: "var(--space-4)", textAlign: "center" }}>
          {t.checkout.successTitle}
        </div>
        <p style={{ margin: 0, textAlign: "center" }}>{t.checkout.successReceivedBy}</p>
        <p style={{ margin: "var(--space-2) 0 0", fontWeight: 700, textAlign: "center", fontSize: "var(--text-title3)" }}>
          {storeName}
        </p>
        {title ? <p style={{ margin: "var(--space-2) 0 0", textAlign: "center" }}>{title}</p> : null}
        <AmountDisplay
          primary={`${fiatAmountToman.toLocaleString()} ${t.checkout.toman}`}
          secondary={
            receipt?.usdt_amount
              ? `${receipt.usdt_amount} ${asset} · ${networkLabel(receipt.network || option?.network || "")}`
              : undefined
          }
        />
        {receipt?.order_reference ? (
          <p className="muted mono-ltr" style={{ textAlign: "center", fontSize: "var(--text-footnote)" }}>
            {t.checkout.orderRef} #{receipt.order_reference}
          </p>
        ) : null}
        <p className="muted" style={{ textAlign: "center", marginTop: "var(--space-3)" }}>
          {t.checkout.successSellerNotify}
        </p>

        <details style={{ marginTop: "var(--space-4)" }}>
          <summary className="linkish">{t.checkout.paymentDetails}</summary>
          <p className="muted" style={{ marginTop: "var(--space-2)" }}>
            {asset} · {networkLabel(receipt?.network || option?.network || "")}
          </p>
          {(matched?.tx_hash || receipt?.tx_hash) && (
            <p className="mono-ltr" style={{ marginTop: "var(--space-2)" }}>
              {t.receipt.transaction}: {(matched?.tx_hash || receipt?.tx_hash || "").slice(0, 10)}…
              {(matched?.tx_hash || receipt?.tx_hash || "").slice(-6)}
            </p>
          )}
          {(matched?.explorer_url || receipt?.explorer_url) && (
            <a
              className="btn btn-secondary"
              style={{ marginTop: "var(--space-3)" }}
              href={matched?.explorer_url || receipt?.explorer_url}
              target="_blank"
              rel="noreferrer"
            >
              {t.checkout.viewTx}
            </a>
          )}
        </details>

        <div style={{ marginTop: "var(--space-4)" }}>
          <h2 className="section-title" style={{ paddingInline: 0 }}>
            {t.checkout.orderStatus}
          </h2>
          <ul className="order-status-list">
            <li>✓ {t.checkout.paymentReceived}</li>
            <li>✓ {t.checkout.orderConfirmed}</li>
            {fulfillmentStatus === "SHIPPED" || fulfillmentStatus === "DELIVERED" ? (
              <li>✓ {t.checkout.orderShipped}</li>
            ) : (
              <li className="muted">◷ {t.fulfillment.PROCESSING}</li>
            )}
          </ul>
          {trackingNumber ? (
            <div style={{ marginTop: "var(--space-3)" }}>
              <div className="muted">{t.checkout.trackingCode}</div>
              <div className="mono-ltr" style={{ fontWeight: 600 }}>
                {shippingProvider ? `${shippingProvider} · ` : ""}
                {trackingNumber}
              </div>
            </div>
          ) : null}
        </div>
      </section>
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
    return (
      <PaymentException
        kind="EXPIRED"
        onRefresh={onRefreshQuote}
        refreshing={refreshingQuote}
      />
    );
  }

  if (!option || !resolvedPlan) return null;

  const amountPrimary = `${exactPayableAmount(option)} ${asset}`;

  return (
    <section className="section">
      <div className="alert alert-warning" role="alert">
        {t.checkout.wrongNetwork}
      </div>

      <div className="card-panel">
        <p className="section-title" style={{ paddingInline: 0 }}>
          {t.checkout.exactAmount}
        </p>
        <AmountDisplay
          primary={amountPrimary}
          secondary={`${asset} · ${networkLabel(option.network)} · ${fiatAmountToman.toLocaleString()} ${t.checkout.toman}`}
        />
        <button
          type="button"
          className="linkish"
          style={{ marginTop: "var(--space-2)" }}
          onClick={() => setShowWhyExact((v) => !v)}
        >
          {t.checkout.whyExactAmount}
        </button>
        {showWhyExact ? (
          <p className="field-hint" style={{ marginTop: "var(--space-2)" }}>
            {t.checkout.exactHint}
          </p>
        ) : null}
        <p className="muted tabular pulse" style={{ margin: "var(--space-3) 0 0" }}>
          {t.checkout.quoteExpires}: {countdown}
        </p>

        {checkingPayment ? (
          <p className="alert alert-success" role="status" aria-live="polite" style={{ marginTop: "var(--space-3)" }}>
            {t.checkout.checkingPayment}
          </p>
        ) : null}

        {moneyDetected(intentStatus) && intentStatus !== "PAID" ? (
          <p className="muted" style={{ marginTop: "var(--space-3)" }} aria-live="polite">
            {t.checkout.canLeave}
          </p>
        ) : null}

        {(showQr || resolvedPlan.qrPrimary) && (
          <div className="qr-card" style={{ marginTop: "var(--space-4)" }}>
            {resolvedPlan.qrPrimary ? (
              <p className="section-title" style={{ paddingInline: 0, textAlign: "center" }}>
                {t.checkout.scanWithWallet}
              </p>
            ) : null}
            <div className="qr-frame">
              <QRCodeSVG
                value={resolvedPlan.qrPayload}
                size={170}
                bgColor="#ffffff"
                fgColor="#0b1f1a"
                level="H"
                marginSize={2}
              />
            </div>
            {resolvedPlan.qrPrimary ? (
              <p className="muted tabular" style={{ textAlign: "center", marginTop: "var(--space-3)" }}>
                {amountPrimary}
                <br />
                {networkLabel(option.network)}
                <br />
                {t.checkout.waitingPayment}
              </p>
            ) : null}
          </div>
        )}

        <div className="cta-stack" style={{ marginTop: "var(--space-4)" }}>
          {resolvedPlan.showPayWithWallet ? (
            <button type="button" className="btn btn-primary" disabled={busyPay} onClick={() => pay()}>
              {busyPay ? t.common.loading : primaryCtaLabel()}
            </button>
          ) : null}
          {resolvedPlan.showPayWithWallet ? (
            <button type="button" className="linkish" onClick={() => setPickerOpen(true)}>
              {t.checkout.changeWallet}
            </button>
          ) : null}
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
          <button type="button" className="btn btn-secondary" onClick={onCopyDetails}>
            {t.checkout.copyPaymentDetails}
          </button>
        </div>

        {handoffTrouble || env.isInAppBrowser ? (
          <div className="card-panel" style={{ marginTop: "var(--space-4)", padding: "var(--space-3)" }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{t.checkout.iabTitle}</p>
            <div className="cta-stack" style={{ marginTop: "var(--space-3)" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => openInExternalBrowser(typeof window !== "undefined" ? window.location.href : "")}
              >
                {t.checkout.openInBrowser}
              </button>
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
              <button type="button" className="btn btn-secondary" onClick={onCopyDetails}>
                {t.checkout.copyPaymentDetails}
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: "var(--space-4)" }}>
          <PaymentDetailsDisclosure option={option} onCopyAddress={onCopyAddress} onCopyAmount={onCopyAmount} />
        </div>

        <PaymentProgress
          status={intentStatus || "AWAITING_PAYMENT"}
          network={option.network}
          confirmations={matched?.confirmations}
          requiredConfirmations={matched?.required_confirmations}
          txHash={matched?.tx_hash}
          explorerUrl={matched?.explorer_url}
        />
      </div>

      {resolvedPlan.showPayWithWallet ? (
        <div className="sticky-cta">
          <button type="button" className="btn btn-primary" disabled={busyPay} onClick={() => pay()}>
            {busyPay ? t.common.loading : primaryCtaLabel()}
          </button>
        </div>
      ) : (
        <div className="sticky-cta">
          <button type="button" className="btn btn-secondary" onClick={onCopyDetails}>
            {t.checkout.copyPaymentDetails}
          </button>
        </div>
      )}

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
