import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaymentStatusPoller,
  pollIntervalMs,
  shouldPollPaymentStatus,
} from "./paymentPoll.ts";

function lastTimer(timers) {
  for (let i = timers.length - 1; i >= 0; i -= 1) {
    if (timers[i]) return timers[i];
  }
  return undefined;
}

test("shouldPollPaymentStatus allows chain-settlement states", () => {
  for (const s of ["CREATED", "AWAITING_PAYMENT", "SEEN", "CONFIRMING"]) {
    assert.equal(shouldPollPaymentStatus(s), true);
  }
});

test("shouldPollPaymentStatus stops on terminal/review and unknown", () => {
  for (const s of ["PAID", "EXPIRED", "LATE_PAYMENT", "NEEDS_REVIEW", "OVERPAID", null, undefined, ""]) {
    assert.equal(shouldPollPaymentStatus(s), false);
  }
});

test("pollIntervalMs backoff", () => {
  assert.equal(pollIntervalMs(0), 2000);
  assert.equal(pollIntervalMs(5), 2000);
  assert.equal(pollIntervalMs(6), 3000);
  assert.equal(pollIntervalMs(21), 5000);
});

test("poller schedules next tick even when reload never resolves", async () => {
  const timers = [];
  let status = "AWAITING_PAYMENT";
  let reloads = 0;
  let releaseHang;
  const poller = createPaymentStatusPoller({
    getStatus: () => status,
    reload: () =>
      new Promise((resolve) => {
        reloads += 1;
        if (reloads === 1) {
          releaseHang = resolve; // hang first reload
          return;
        }
        resolve();
      }),
    schedule: (fn, ms) => {
      const id = timers.length;
      timers.push({ fn, ms, id });
      return id;
    },
    clear: (id) => {
      timers[id] = null;
    },
  });

  poller.start();
  assert.equal(lastTimer(timers).ms, 2000);

  // First tick: arms next interval before awaiting hung reload.
  await lastTimer(timers).fn();
  assert.equal(reloads, 1);
  assert.equal(lastTimer(timers).ms, 2000);

  // Second tick stays armed even while reload #1 is hung; skips stacking.
  await lastTimer(timers).fn();
  assert.equal(reloads, 1, "in-flight hung reload should not stack");
  assert.ok(lastTimer(timers), "next tick must still be armed");

  releaseHang();
  await Promise.resolve();
  await lastTimer(timers).fn();
  assert.equal(reloads, 2, "reload resumes after hang clears");

  const armedBeforePaid = timers.length;
  status = "PAID";
  await lastTimer(timers).fn();
  assert.equal(timers.length, armedBeforePaid, "PAID must not arm another tick");

  poller.stop();
});

test("poller pauses while hidden and resumes with reload", async () => {
  const timers = [];
  let reloads = 0;
  const poller = createPaymentStatusPoller({
    getStatus: () => "CONFIRMING",
    reload: async () => {
      reloads += 1;
    },
    schedule: (fn, ms) => {
      const id = timers.length;
      timers.push({ fn, ms, id });
      return id;
    },
    clear: (id) => {
      timers[id] = null;
    },
  });
  poller.start();
  poller.setHidden(true);
  await lastTimer(timers).fn();
  assert.equal(reloads, 0);
  assert.equal(lastTimer(timers).ms, 5000);

  const before = reloads;
  poller.setHidden(false);
  assert.equal(reloads, before + 1);
  poller.stop();
});

test("SSE-style failure path: REST poller keeps running after ignored errors", async () => {
  const timers = [];
  let reloads = 0;
  const poller = createPaymentStatusPoller({
    getStatus: () => "AWAITING_PAYMENT",
    reload: async () => {
      reloads += 1;
      throw new Error("sse proxy / network blip");
    },
    schedule: (fn, ms) => {
      const id = timers.length;
      timers.push({ fn, ms, id });
      return id;
    },
    clear: (id) => {
      timers[id] = null;
    },
  });
  poller.start();
  await lastTimer(timers).fn();
  assert.equal(reloads, 1);
  await lastTimer(timers).fn();
  assert.equal(reloads, 2);
  poller.stop();
});
