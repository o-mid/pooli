"use client";

import { useEffect, useRef } from "react";
import { pollIntervalMs, shouldPollPaymentStatus } from "./paymentPoll";

/**
 * REST poll while payment is awaiting chain confirmation.
 * SSE remains best-effort; this covers worker→DB→UI across process boundaries.
 */
export function usePaymentStatusPoll(status: string | undefined, reload: () => void | Promise<void>) {
  const attempt = useRef(0);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!shouldPollPaymentStatus(status)) {
      attempt.current = 0;
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, 5000);
        return;
      }
      attempt.current += 1;
      try {
        await reloadRef.current();
      } catch {
        // ignore transient errors; next tick retries
      }
      if (cancelled) return;
      timer = setTimeout(tick, pollIntervalMs(attempt.current));
    };

    timer = setTimeout(tick, pollIntervalMs(0));

    const onVis = () => {
      if (!document.hidden && shouldPollPaymentStatus(status)) {
        void reloadRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status]);
}
