import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  estimateNetPayoutCents,
  estimateStripeFeeCents,
  normalizePricingForRelease,
  readStripeFeeEstimateConfigForCurrencyFromEnv,
  readMinimumPriceFloorCentsFromEnv,
  resolveMinimumPriceFloorMinorForCurrency,
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

  it("converts floor from base currency for zero-decimal currencies", async () => {
    const previousFloor = process.env.MINIMUM_PRICE_FLOOR_CENTS;
    const previousBase = process.env.MINIMUM_PRICE_FLOOR_BASE_CURRENCY;
    const originalFetch = global.fetch;

    try {
      process.env.MINIMUM_PRICE_FLOOR_CENTS = "50";
      process.env.MINIMUM_PRICE_FLOOR_BASE_CURRENCY = "USD";
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            rates: { JPY: 160 },
          }),
          { status: 200 },
        )) as typeof fetch;

      const floor = await resolveMinimumPriceFloorMinorForCurrency("JPY");
      assert.equal(floor, 80);
    } finally {
      global.fetch = originalFetch;
      if (previousFloor === undefined) {
        delete process.env.MINIMUM_PRICE_FLOOR_CENTS;
      } else {
        process.env.MINIMUM_PRICE_FLOOR_CENTS = previousFloor;
      }
      if (previousBase === undefined) {
        delete process.env.MINIMUM_PRICE_FLOOR_BASE_CURRENCY;
      } else {
        process.env.MINIMUM_PRICE_FLOOR_BASE_CURRENCY = previousBase;
      }
    }
  });

  it("supports per-currency stripe fee override with fallback", () => {
    const prevPercent = process.env.STRIPE_FEE_ESTIMATE_PERCENT_BPS;
    const prevFixed = process.env.STRIPE_FEE_ESTIMATE_FIXED_CENTS;
    const prevJpyPercent = process.env.STRIPE_FEE_ESTIMATE_PERCENT_BPS_JPY;
    const prevJpyFixedMinor = process.env.STRIPE_FEE_ESTIMATE_FIXED_MINOR_JPY;

    try {
      process.env.STRIPE_FEE_ESTIMATE_PERCENT_BPS = "290";
      process.env.STRIPE_FEE_ESTIMATE_FIXED_CENTS = "30";
      process.env.STRIPE_FEE_ESTIMATE_PERCENT_BPS_JPY = "360";
      process.env.STRIPE_FEE_ESTIMATE_FIXED_MINOR_JPY = "40";

      assert.deepEqual(readStripeFeeEstimateConfigForCurrencyFromEnv("JPY"), {
        percentBps: 360,
        fixedFeeCents: 40,
      });
      assert.deepEqual(readStripeFeeEstimateConfigForCurrencyFromEnv("USD"), {
        percentBps: 290,
        fixedFeeCents: 30,
      });
    } finally {
      if (prevPercent === undefined) {
        delete process.env.STRIPE_FEE_ESTIMATE_PERCENT_BPS;
      } else {
        process.env.STRIPE_FEE_ESTIMATE_PERCENT_BPS = prevPercent;
      }
      if (prevFixed === undefined) {
        delete process.env.STRIPE_FEE_ESTIMATE_FIXED_CENTS;
      } else {
        process.env.STRIPE_FEE_ESTIMATE_FIXED_CENTS = prevFixed;
      }
      if (prevJpyPercent === undefined) {
        delete process.env.STRIPE_FEE_ESTIMATE_PERCENT_BPS_JPY;
      } else {
        process.env.STRIPE_FEE_ESTIMATE_PERCENT_BPS_JPY = prevJpyPercent;
      }
      if (prevJpyFixedMinor === undefined) {
        delete process.env.STRIPE_FEE_ESTIMATE_FIXED_MINOR_JPY;
      } else {
        process.env.STRIPE_FEE_ESTIMATE_FIXED_MINOR_JPY = prevJpyFixedMinor;
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
      currency: "USD",
      pricingMode: "FIXED",
      fixedPriceCents: 49,
      minimumPriceCents: null,
      floorCents: 50,
    });
    assert.equal(fixed.ok, false);

    const pwyw = normalizePricingForRelease({
      currency: "USD",
      pricingMode: "PWYW",
      fixedPriceCents: null,
      minimumPriceCents: 75,
      allowFreeCheckout: false,
      floorCents: 50,
    });
    assert.equal(pwyw.ok, true);

    const free = normalizePricingForRelease({
      currency: "USD",
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
      currency: "USD",
      pricingMode: "PWYW",
      fixedPriceCents: null,
      minimumPriceCents: 0,
      allowFreeCheckout: false,
      floorCents: 50,
    });
    assert.equal(blocked.ok, false);

    const allowed = normalizePricingForRelease({
      currency: "USD",
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
