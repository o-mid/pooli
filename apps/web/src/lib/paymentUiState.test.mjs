import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePaymentUiState } from "./paymentUiState.ts";

describe("resolvePaymentUiState", () => {
  it("maps backend statuses to commerce states", () => {
    assert.equal(resolvePaymentUiState({ intentStatus: "PAID" }), "PAID");
    assert.equal(resolvePaymentUiState({ intentStatus: "SEEN" }), "PAYMENT_DETECTED");
    assert.equal(resolvePaymentUiState({ intentStatus: "CONFIRMING" }), "CONFIRMING");
    assert.equal(resolvePaymentUiState({ intentStatus: "AWAITING_PAYMENT" }), "WAITING_FOR_PAYMENT");
    assert.equal(resolvePaymentUiState({ intentStatus: "EXPIRED" }), "EXPIRED");
    assert.equal(resolvePaymentUiState({ intentStatus: "UNDERPAID" }), "NEEDS_ATTENTION");
    assert.equal(resolvePaymentUiState({ openingWallet: true, intentStatus: "AWAITING_PAYMENT" }), "OPENING_WALLET");
    assert.equal(resolvePaymentUiState({ offline: true }), "OFFLINE");
  });

  it("does not treat exceptions as waiting", () => {
    assert.notEqual(resolvePaymentUiState({ intentStatus: "LATE_PAYMENT" }), "WAITING_FOR_PAYMENT");
    assert.equal(resolvePaymentUiState({ intentStatus: "LATE_PAYMENT" }), "NEEDS_ATTENTION");
  });
});
