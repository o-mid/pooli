/** Statuses that should keep polling the API for chain-driven updates. */
export const POLL_STATUSES = new Set([
  "CREATED",
  "AWAITING_PAYMENT",
  "SEEN",
  "CONFIRMING",
]);

/** Terminal / review statuses: stop aggressive polling. */
export const STOP_POLL_STATUSES = new Set([
  "PAID",
  "EXPIRED",
  "CANCELLED",
  "NEEDS_REVIEW",
  "UNDERPAID",
  "OVERPAID",
  "LATE_PAYMENT",
  "DUPLICATE_PAYMENT",
]);

export function shouldPollPaymentStatus(status: string | undefined | null): boolean {
  if (!status) return false;
  if (STOP_POLL_STATUSES.has(status)) return false;
  return POLL_STATUSES.has(status);
}

/** Interval grows from 2s toward 5s as attempts increase. */
export function pollIntervalMs(attempt: number): number {
  if (attempt <= 5) return 2000;
  if (attempt <= 20) return 3000;
  return 5000;
}

export type PollScheduler = {
  /** Start the loop. Safe to call once. */
  start: () => void;
  /** Stop timers and ignore in-flight reload completions. */
  stop: () => void;
  /** Notify visibility; when becoming visible, reload immediately if still polling. */
  setHidden: (hidden: boolean) => void;
};

/**
 * Framework-agnostic poll loop.
 * Next tick is always scheduled independently of reload completion so a hung
 * fetch / SSE-proxy stall cannot kill REST polling.
 */
export function createPaymentStatusPoller(opts: {
  getStatus: () => string | undefined | null;
  reload: () => void | Promise<void>;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear?: (id: ReturnType<typeof setTimeout>) => void;
}): PollScheduler {
  const schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const clear = opts.clear ?? ((id) => clearTimeout(id));
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;
  let hidden = false;
  let inFlight = false;

  const clearTimer = () => {
    if (timer !== undefined) {
      clear(timer);
      timer = undefined;
    }
  };

  const arm = (ms: number) => {
    clearTimer();
    if (stopped) return;
    timer = schedule(() => {
      timer = undefined;
      void tick();
    }, ms);
  };

  const tick = async () => {
    if (stopped) return;
    if (!shouldPollPaymentStatus(opts.getStatus())) {
      attempt = 0;
      return;
    }
    if (hidden) {
      arm(5000);
      return;
    }
    attempt += 1;
    const nextMs = pollIntervalMs(attempt);
    // Schedule first so a hung reload cannot prevent further polls.
    arm(nextMs);
    if (inFlight) return;
    inFlight = true;
    try {
      await opts.reload();
    } catch {
      // ignore transient errors; next armed tick retries
    } finally {
      inFlight = false;
    }
    if (stopped) return;
    if (!shouldPollPaymentStatus(opts.getStatus())) {
      attempt = 0;
      clearTimer();
    }
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      attempt = 0;
      if (!shouldPollPaymentStatus(opts.getStatus())) {
        stopped = true;
        return;
      }
      arm(pollIntervalMs(0));
    },
    stop() {
      stopped = true;
      attempt = 0;
      clearTimer();
    },
    setHidden(nextHidden: boolean) {
      const wasHidden = hidden;
      hidden = nextHidden;
      if (stopped) return;
      if (wasHidden && !hidden && shouldPollPaymentStatus(opts.getStatus())) {
        void opts.reload();
        // Ensure a timer exists after becoming visible.
        if (timer === undefined) {
          arm(pollIntervalMs(Math.max(attempt, 1)));
        }
      }
    },
  };
}
