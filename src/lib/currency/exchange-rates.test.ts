import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { convertMinorAmount } from "@/lib/currency/exchange-rates";

describe("exchange-rates helpers", () => {
  it("converts through major-value semantics", () => {
    const usdCents = 500; // $5.00
    const jpyMinor = convertMinorAmount({
      amountMinor: usdCents,
      fromCurrency: "USD",
      toCurrency: "JPY",
      rate: 150,
    });
    assert.equal(jpyMinor, 750);
  });

  it("supports ceil rounding for floor conversion", () => {
    const result = convertMinorAmount({
      amountMinor: 50,
      fromCurrency: "USD",
      toCurrency: "JPY",
      rate: 2.1,
      rounding: "ceil",
    });
    assert.equal(result, 2);
  });
});

