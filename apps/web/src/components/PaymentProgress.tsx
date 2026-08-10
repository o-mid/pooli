"use client";

import { useT } from "@/i18n/LocaleProvider";

export type ProgressStatus =
  | "CREATED"
  | "AWAITING_PAYMENT"
  | "SEEN"
  | "CONFIRMING"
  | "PAID"
  | "EXPIRED"
  | "NEEDS_REVIEW"
  | "UNDERPAID"
  | "OVERPAID"
  | string;

const stageOrder = ["requested", "detected", "confirming", "complete"] as const;

function stageIndex(status: ProgressStatus): number {
  switch (status) {
    case "PAID":
      return 3;
    case "CONFIRMING":
      return 2;
    case "SEEN":
      return 1;
    case "AWAITING_PAYMENT":
    case "CREATED":
      return 0;
    default:
      return 0;
  }
}

export function PaymentProgress({
  status,
  confirmations,
  requiredConfirmations,
  network,
  txHash,
  explorerUrl,
  compact = false,
}: {
  status: ProgressStatus;
  confirmations?: number | null;
  requiredConfirmations?: number | null;
  network?: string;
  txHash?: string | null;
  explorerUrl?: string | null;
  compact?: boolean;
}) {
  const t = useT();
  const active = stageIndex(status);
  const labels = {
    requested: t.checkout.progress.requested,
    detected: t.checkout.progress.detected,
    confirming: t.checkout.progress.confirming,
    complete: t.checkout.progress.complete,
  };

  const confText =
    typeof confirmations === "number" && typeof requiredConfirmations === "number"
      ? `${network ? `${t.checkout.progress.confirming} · ${network.toUpperCase()} · ` : ""}${t.checkout.progress.confirmations
          .replace("{current}", String(confirmations))
          .replace("{required}", String(requiredConfirmations))}`
      : null;

  return (
    <section
      className={`payment-progress ${compact ? "compact" : ""}`}
      aria-live="polite"
      aria-atomic="true"
      aria-label={labels[stageOrder[Math.min(active, 3)]]}
    >
      <ol className="progress-steps">
        {stageOrder.map((key, i) => {
          const done = i < active || status === "PAID";
          const current = i === active && status !== "PAID";
          const upcoming = !done && !current;
          return (
            <li
              key={key}
              className={`${done ? "done" : ""} ${current ? "current" : ""} ${upcoming ? "upcoming" : ""}`.trim()}
            >
              <span className="dot" aria-hidden />
              <span className="label">{labels[key]}</span>
            </li>
          );
        })}
      </ol>
      {confText && (status === "SEEN" || status === "CONFIRMING") && (
        <p className="progress-meta tabular">{confText}</p>
      )}
      {txHash && (
        <p className="progress-meta mono-ltr">
          {explorerUrl ? (
            <a href={explorerUrl} target="_blank" rel="noreferrer">
              {t.checkout.viewTx}
            </a>
          ) : (
            <span>{txHash.slice(0, 10)}…{txHash.slice(-6)}</span>
          )}
        </p>
      )}
      {(status === "NEEDS_REVIEW" || status === "UNDERPAID" || status === "OVERPAID") && (
        <p className="progress-warn">{t.orders.status[status as keyof typeof t.orders.status] || status}</p>
      )}
    </section>
  );
}
