import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatMinorAmount,
  getCurrencyMinorUnit,
  inputModeForCurrency,
  majorInputToMinor,
  minorToMajorInput,
  stepForCurrency,
} from "@/lib/money";

describe("money helpers", () => {
  it("supports expected minor units", () => {
    assert.equal(getCurrencyMinorUnit("USD"), 2);
    assert.equal(getCurrencyMinorUnit("JPY"), 0);
  });

  it("parses major input to minor units with currency precision", () => {
    assert.equal(majorInputToMinor("12.34", "USD"), 1234);
    assert.equal(majorInputToMinor("12", "JPY"), 12);
    assert.equal(majorInputToMinor("12.5", "JPY"), null);
    assert.equal(majorInputToMinor("12,34", "EUR"), null);
  });

  it("formats and round-trips minor amounts", () => {
    assert.equal(minorToMajorInput(1234, "USD"), "12.34");
    assert.equal(minorToMajorInput(1234, "JPY"), "1234");
    assert.match(formatMinorAmount(1234, "USD"), /\$12\.34/);
    assert.match(formatMinorAmount(1234, "JPY"), /¥1,234|¥1234/);
  });

  it("returns currency-aware input mode and step", () => {
    assert.equal(inputModeForCurrency("USD"), "decimal");
    assert.equal(stepForCurrency("USD"), "0.01");
    assert.equal(inputModeForCurrency("JPY"), "numeric");
    assert.equal(stepForCurrency("JPY"), "1");
  });
});

