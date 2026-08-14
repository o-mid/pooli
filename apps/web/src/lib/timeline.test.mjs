import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { timelineLabel } from "./timeline.ts";

const t = {
  timeline: {
    events: {
      "order.created": "سفارش ساخته شد",
      "payment.paid": "پرداخت شد ✓",
    },
  },
};

describe("timelineLabel", () => {
  it("prefers catalog over English stored titles", () => {
    assert.equal(timelineLabel("order.created", t, "Order created"), "سفارش ساخته شد");
    assert.equal(timelineLabel("payment.paid", t, "Payment confirmed"), "پرداخت شد ✓");
  });

  it("does not leak English system titles for unknown codes", () => {
    assert.equal(timelineLabel("merchant.note", t, "Order created"), "merchant.note");
  });

  it("keeps merchant-authored titles", () => {
    assert.equal(timelineLabel("merchant.note", t, "ارسال با پست"), "ارسال با پست");
  });
});
