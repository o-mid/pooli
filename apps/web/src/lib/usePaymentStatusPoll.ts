"use client";

import { useEffect, useRef } from "react";
import { createPaymentStatusPoller, shouldPollPaymentStatus } from "./paymentPoll";

/**
 * REST poll while payment is awaiting chain confirmation.
 * SSE remains best-effort and must not gate this loop — chain transitions are
 * applied by the worker process, so the API SSE hub often never sees them.
 */
export function usePaymentStatusPoll(status: string | undefined, reload: () => void | Promise<void>) {
  const statusRef = useRef(status);
  const reloadRef = useRef(reload);
  statusRef.current = status;
  reloadRef.current = reload;

  // Stay on one poller across AWAITING_PAYMENT → SEEN → CONFIRMING; only
  // tear down when we leave the pollable set (e.g. PAID).
  const active = shouldPollPaymentStatus(status);

  useEffect(() => {
    if (!active) return;

    const poller = createPaymentStatusPoller({
      getStatus: () => statusRef.current,
      reload: () => reloadRef.current(),
    });
    poller.start();
    poller.setHidden(typeof document !== "undefined" ? document.hidden : false);

    const onVis = () => {
      poller.setHidden(document.hidden);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      poller.stop();
    };
  }, [active]);
}
