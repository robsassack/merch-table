import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  estimateNetPayoutCents,
  estimateStripeFeeCents,
  normalizePricingForRelease,
  readMinimumPriceFloorCentsFromEnv,
} from "@/lib/pricing/pricing-rules";

describe("pricing rules", () => {
  it("reads minimum floor from env with fallback", () => {
    const previous = process.env.MINIMUM_PRICE_FLOOR_CENTS;

    try {
      delete process.env.MINIMUM_PRICE_FLOOR_CENTS;
      assert.equal(readMinimumPriceFloorCentsFromEnv(), 50);

      process.env.MINIMUM_PRICE_FLOOR_CENTS = "125";
      assert.equal(readMinimumPriceFloorCentsFromEnv(), 125);

      process.env.MINIMUM_PRICE_FLOOR_CENTS = "invalid";
      assert.equal(readMinimumPriceFloorCentsFromEnv(), 50);
    } finally {
      if (previous === undefined) {
        delete process.env.MINIMUM_PRICE_FLOOR_CENTS;
      } else {
        process.env.MINIMUM_PRICE_FLOOR_CENTS = previous;
      }
    }
  });

  it("estimates stripe fees and net payout", () => {
    const config = { percentBps: 290, fixedFeeCents: 30 };

    assert.equal(estimateStripeFeeCents(500, config), 45);
    assert.equal(estimateNetPayoutCents(500, config), 455);
  });

  it("enforces floor for fixed and pwyw pricing", () => {
    const fixed = normalizePricingForRelease({
      pricingMode: "FIXED",
      fixedPriceCents: 49,
      minimumPriceCents: null,
      floorCents: 50,
    });
    assert.equal(fixed.ok, false);

    const pwyw = normalizePricingForRelease({
      pricingMode: "PWYW",
      fixedPriceCents: null,
      minimumPriceCents: 75,
      allowFreeCheckout: false,
      floorCents: 50,
    });
    assert.equal(pwyw.ok, true);

    const free = normalizePricingForRelease({
      pricingMode: "FREE",
      fixedPriceCents: 500,
      minimumPriceCents: 300,
      floorCents: 50,
    });
    assert.deepEqual(free, {
      ok: true,
      value: {
        priceCents: 0,
        fixedPriceCents: null,
        minimumPriceCents: null,
      },
    });
  });

  it("allows PWYW minimum 0 only when free checkout is enabled", () => {
    const blocked = normalizePricingForRelease({
      pricingMode: "PWYW",
      fixedPriceCents: null,
      minimumPriceCents: 0,
      allowFreeCheckout: false,
      floorCents: 50,
    });
    assert.equal(blocked.ok, false);

    const allowed = normalizePricingForRelease({
      pricingMode: "PWYW",
      fixedPriceCents: null,
      minimumPriceCents: 0,
      allowFreeCheckout: true,
      floorCents: 50,
    });

    assert.deepEqual(allowed, {
      ok: true,
      value: {
        priceCents: 0,
        fixedPriceCents: null,
        minimumPriceCents: 0,
      },
    });
  });
});
