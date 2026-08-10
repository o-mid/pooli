import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pooliBaseToOnChainAmount, encodeErc20Transfer } from "./amount.ts";
import {
  exactPayableAmount,
  fullDestinationAddress,
  buildPaymentDetailsText,
} from "./copy.ts";
import { buildHandoffPlan } from "./registry.ts";
import { canRefreshQuote, exceptionKind, moneyDetected } from "./exceptions.ts";

const mobileEnv = {
  isMobile: true,
  isDesktop: false,
  isInAppBrowser: false,
  inAppKind: null,
  isIOS: true,
  isAndroid: false,
};

const desktopEnv = {
  isMobile: false,
  isDesktop: true,
  isInAppBrowser: false,
  inAppKind: null,
  isIOS: false,
  isAndroid: false,
};

describe("exact copy amount", () => {
  it("copies exact numeric string without rounding or symbol", () => {
    assert.equal(exactPayableAmount({ pay_usdt_amount: "29.841723", destination_address: "T", network: "tron" }), "29.841723");
  });
});

describe("full address copy", () => {
  it("returns full address not shortened display", () => {
    const addr = "TA8abcdefghijklmnopqrstuvwxyz012345X92";
    assert.equal(fullDestinationAddress({ pay_usdt_amount: "1", destination_address: addr, network: "tron" }), addr);
  });
});

describe("payment details text", () => {
  it("includes merchant amount network address without PII fields", () => {
    const text = buildPaymentDetailsText({
      storeName: "Tehran Sneakers",
      option: {
        network: "tron",
        pay_usdt_amount: "29.841723",
        destination_address: "TABC",
        asset: "USDT",
      },
    });
    assert.match(text, /Pooli Payment/);
    assert.match(text, /29\.841723 USDT/);
    assert.match(text, /TRON/);
    assert.match(text, /TABC/);
    assert.doesNotMatch(text, /phone|email|customer/i);
  });
});

describe("amount scaling", () => {
  it("scales 6dp pooli base to 18dp on-chain", () => {
    assert.equal(pooliBaseToOnChainAmount(29841723, 18), "29841723000000000000");
  });
  it("encodes erc20 transfer calldata", () => {
    const data = encodeErc20Transfer("0xB49D720DE2630fA4C813d5B4c025706E25cF74fe", "1000");
    assert.equal(data.startsWith("0xa9059cbb"), true);
    assert.equal(data.length, 2 + 8 + 64 + 64);
  });
});

describe("handoff selection", () => {
  it("mobile TRON prefers TronLink and shows pay with wallet", () => {
    const plan = buildHandoffPlan({
      option: {
        network: "tron",
        destination_address: "TABC",
        pay_usdt_amount: "1.0",
        payment_uri: "tron:TABC?amount=1000000&token=TR7",
      },
      env: mobileEnv,
    });
    assert.equal(plan.primary.id, "tronlink");
    assert.equal(plan.showPayWithWallet, true);
    assert.equal(plan.wallets.some((w) => w.id === "walletconnect"), false);
  });

  it("never lists TronLink for EVM", () => {
    const plan = buildHandoffPlan({
      option: {
        network: "bsc",
        chain_id: 56,
        destination_address: "0xabc",
        pay_usdt_amount: "1.0",
        payment_uri: "ethereum:0xtoken@56/transfer?address=0xabc&uint256=1",
        token_contract: "0xtoken",
      },
      env: mobileEnv,
      walletConnectProjectId: "pid",
    });
    assert.equal(plan.wallets.some((w) => w.id === "tronlink"), false);
    assert.equal(plan.primary.id, "walletconnect");
  });

  it("desktop uses QR primary", () => {
    const plan = buildHandoffPlan({
      option: {
        network: "tron",
        destination_address: "TABC",
        pay_usdt_amount: "1.0",
        payment_uri: "tron:TABC?amount=1&token=x",
      },
      env: desktopEnv,
    });
    assert.equal(plan.qrPrimary, true);
  });

  it("falls back without WC project id on EVM", () => {
    const plan = buildHandoffPlan({
      option: {
        network: "bsc",
        destination_address: "0xabc",
        pay_usdt_amount: "1.0",
        payment_uri: "ethereum:x",
      },
      env: mobileEnv,
    });
    assert.equal(plan.wallets.some((w) => w.id === "walletconnect"), false);
    assert.equal(plan.primary.id, "other");
  });
});

describe("exception / refresh mapping", () => {
  it("maps statuses", () => {
    assert.equal(exceptionKind("UNDERPAID"), "UNDERPAID");
    assert.equal(exceptionKind("AWAITING_PAYMENT"), null);
    assert.equal(moneyDetected("SEEN"), true);
    assert.equal(moneyDetected("EXPIRED"), false);
  });
  it("allows refresh only for expired unpaid quotes", () => {
    assert.equal(canRefreshQuote("EXPIRED"), true);
    assert.equal(canRefreshQuote("UNDERPAID"), false);
    assert.equal(canRefreshQuote("SEEN"), false);
    assert.equal(canRefreshQuote("AWAITING_PAYMENT", "2000-01-01T00:00:00Z"), true);
    assert.equal(canRefreshQuote("AWAITING_PAYMENT", "2099-01-01T00:00:00Z"), false);
  });
});
