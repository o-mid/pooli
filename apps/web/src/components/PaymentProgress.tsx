"use client";

import { exceptionKind } from "@/lib/payment-handoff/exceptions";
import { PaymentState } from "@/components/payments/PaymentState";
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
  const ex = exceptionKind(status);
  if (ex) {
    return (
      <PaymentState
        intentStatus={status}
        confirmations={confirmations}
        requiredConfirmations={requiredConfirmations}
      />
    );
  }
  const active = stageIndex(status);
  const labels = {
    requested: t.checkout.progress.requested,
    detected: t.checkout.progress.detected,
    confirming: t.checkout.progress.confirming,
    complete: t.checkout.progress.complete,
  };

  const confText =
    typeof confirmations === "number" && typeof requiredConfirmations === "number"
      ? t.checkout.progress.confirmations
          .replace("{current}", String(confirmations))
          .replace("{required}", String(requiredConfirmations))
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
    </section>
  );
}
