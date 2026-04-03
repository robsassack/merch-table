import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCheckoutAmountCents } from "@/lib/checkout/session-pricing";

describe("checkout session pricing", () => {
  it("returns fixed release amount when valid", () => {
    const result = resolveCheckoutAmountCents({
      pricingMode: "FIXED",
      floorCents: 50,
      priceCents: 400,
      fixedPriceCents: 400,
      minimumPriceCents: null,
    });

    assert.deepEqual(result, { ok: true, amountCents: 400 });
  });

  it("rejects fixed price below system floor", () => {
    const result = resolveCheckoutAmountCents({
      pricingMode: "FIXED",
      floorCents: 50,
      priceCents: 40,
      fixedPriceCents: 40,
      minimumPriceCents: null,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "Fixed price must be at least 50 cents.");
  });

  it("rejects PWYW amount below release minimum", () => {
    const result = resolveCheckoutAmountCents({
      pricingMode: "PWYW",
      floorCents: 50,
      priceCents: 200,
      fixedPriceCents: null,
      minimumPriceCents: 200,
      pwywAmountCents: 150,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "PWYW amount must be at least 200 cents.");
  });

  it("rejects PWYW amount below system floor", () => {
    const result = resolveCheckoutAmountCents({
      pricingMode: "PWYW",
      floorCents: 50,
      priceCents: 0,
      fixedPriceCents: null,
      minimumPriceCents: 0,
      pwywAmountCents: 25,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "PWYW amount must be at least 50 cents.");
  });

  it("defaults PWYW amount to release minimum when omitted", () => {
    const result = resolveCheckoutAmountCents({
      pricingMode: "PWYW",
      floorCents: 50,
      priceCents: 200,
      fixedPriceCents: null,
      minimumPriceCents: 200,
    });

    assert.deepEqual(result, { ok: true, amountCents: 200 });
  });
});
