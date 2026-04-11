import type { PricingMode } from "@/generated/prisma/enums";
import { fetchExchangeRate } from "@/lib/currency/exchange-rates";
import { convertMinorAmount } from "@/lib/currency/exchange-rates";
import { getCurrencyMeta } from "@/lib/money";
import { type SupportedCurrencyCode } from "@/lib/setup/currencies";

export const DEFAULT_MINIMUM_PRICE_FLOOR_CENTS = 50;
export const DEFAULT_MINIMUM_PRICE_FLOOR_BASE_CURRENCY = "USD";

export const DEFAULT_STRIPE_FEE_ESTIMATE_PERCENT_BPS = 290;
export const DEFAULT_STRIPE_FEE_ESTIMATE_FIXED_CENTS = 30;

export type StripeFeeEstimateConfig = {
  percentBps: number;
  fixedFeeCents: number;
};

export type PricingValidationResult =
  | {
      ok: true;
      value: {
        priceCents: number;
        fixedPriceCents: number | null;
        minimumPriceCents: number | null;
      };
    }
  | {
      ok: false;
      error: string;
    };

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readCurrencyCodeEnv(name: string, fallback: SupportedCurrencyCode) {
  const raw = process.env[name]?.trim().toUpperCase();
  if (!raw || raw.length !== 3) {
    return fallback;
  }

  return getCurrencyMeta(raw).code;
}

export function readMinimumPriceFloorCentsFromEnv() {
  return readPositiveIntegerEnv(
    "MINIMUM_PRICE_FLOOR_CENTS",
    DEFAULT_MINIMUM_PRICE_FLOOR_CENTS,
  );
}

export function readMinimumPriceFloorBaseCurrencyFromEnv() {
  return readCurrencyCodeEnv(
    "MINIMUM_PRICE_FLOOR_BASE_CURRENCY",
    DEFAULT_MINIMUM_PRICE_FLOOR_BASE_CURRENCY,
  );
}

export async function resolveMinimumPriceFloorMinorForCurrency(currency: string) {
  const normalizedCurrency = getCurrencyMeta(currency).code;
  const baseFloorMinor = readMinimumPriceFloorCentsFromEnv();
  const baseCurrency = readMinimumPriceFloorBaseCurrencyFromEnv();

  if (normalizedCurrency === baseCurrency) {
    return baseFloorMinor;
  }

  const rate = await fetchExchangeRate({
    from: baseCurrency,
    to: normalizedCurrency,
  });

  return Math.max(
    1,
    convertMinorAmount({
      amountMinor: baseFloorMinor,
      fromCurrency: baseCurrency,
      toCurrency: normalizedCurrency,
      rate,
      rounding: "ceil",
    }),
  );
}

function readCurrencyFeeOverride(input: {
  currency: string;
  suffix: "PERCENT_BPS" | "FIXED_MINOR";
}) {
  const normalizedCurrency = getCurrencyMeta(input.currency).code;
  const key = `STRIPE_FEE_ESTIMATE_${input.suffix}_${normalizedCurrency}`;
  const raw = process.env[key]?.trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function readStripeFeeEstimateConfigFromEnv(): StripeFeeEstimateConfig {
  return {
    percentBps: readPositiveIntegerEnv(
      "STRIPE_FEE_ESTIMATE_PERCENT_BPS",
      DEFAULT_STRIPE_FEE_ESTIMATE_PERCENT_BPS,
    ),
    fixedFeeCents: readPositiveIntegerEnv(
      "STRIPE_FEE_ESTIMATE_FIXED_CENTS",
      DEFAULT_STRIPE_FEE_ESTIMATE_FIXED_CENTS,
    ),
  };
}

export function readStripeFeeEstimateConfigForCurrencyFromEnv(
  currency: string,
): StripeFeeEstimateConfig {
  const defaultConfig = readStripeFeeEstimateConfigFromEnv();
  const fixedMinorOverride = readCurrencyFeeOverride({
    currency,
    suffix: "FIXED_MINOR",
  });
  const percentOverride = readCurrencyFeeOverride({
    currency,
    suffix: "PERCENT_BPS",
  });

  return {
    percentBps: percentOverride ?? defaultConfig.percentBps,
    fixedFeeCents: fixedMinorOverride ?? defaultConfig.fixedFeeCents,
  };
}

export function estimateStripeFeeCents(
  grossCents: number,
  config: StripeFeeEstimateConfig,
) {
  if (!Number.isFinite(grossCents) || grossCents <= 0) {
    return 0;
  }

  const percentageFee = Math.round((grossCents * config.percentBps) / 10_000);
  return Math.max(0, percentageFee + config.fixedFeeCents);
}

export function estimateNetPayoutCents(
  grossCents: number,
  config: StripeFeeEstimateConfig,
) {
  if (!Number.isFinite(grossCents) || grossCents <= 0) {
    return 0;
  }

  return Math.max(0, grossCents - estimateStripeFeeCents(grossCents, config));
}

export function resolveMinimumChargeCentsForPositiveNet(
  config: StripeFeeEstimateConfig,
) {
  const start = Math.max(1, config.fixedFeeCents + 1);
  const cap = 1_000_000;

  for (let gross = start; gross <= cap; gross += 1) {
    if (estimateNetPayoutCents(gross, config) >= 1) {
      return gross;
    }
  }

  return start;
}

export function normalizePricingForRelease(input: {
  currency: string;
  pricingMode: PricingMode;
  fixedPriceCents: number | null | undefined;
  minimumPriceCents: number | null | undefined;
  allowFreeCheckout?: boolean | null | undefined;
  floorCents: number;
}): PricingValidationResult {
  if (input.pricingMode === "FREE") {
    return {
      ok: true,
      value: {
        priceCents: 0,
        fixedPriceCents: null,
        minimumPriceCents: null,
      },
    };
  }

  if (input.pricingMode === "FIXED") {
    const fixed = input.fixedPriceCents;
    if (typeof fixed !== "number" || !Number.isInteger(fixed) || fixed <= 0) {
      return {
        ok: false,
        error: "Set a valid fixed price in cents.",
      };
    }
    const fixedCents = fixed;

    if (fixedCents < input.floorCents) {
      return {
        ok: false,
        error: `Fixed price must be at least ${input.floorCents} cents.`,
      };
    }

    return {
      ok: true,
      value: {
        priceCents: fixedCents,
        fixedPriceCents: fixedCents,
        minimumPriceCents: null,
      },
    };
  }

  const minimum = input.minimumPriceCents;
  if (
    typeof minimum !== "number" ||
    !Number.isInteger(minimum) ||
    minimum < 0
  ) {
    return {
      ok: false,
      error: "Set a valid PWYW minimum price in cents.",
    };
  }
  const minimumCents = minimum;
  const allowFreeCheckout = input.allowFreeCheckout === true;

  if (minimumCents === 0) {
    if (!allowFreeCheckout) {
      return {
        ok: false,
        error:
          "PWYW minimum must be at least the system floor unless free checkout is enabled.",
      };
    }

    return {
      ok: true,
      value: {
        priceCents: 0,
        fixedPriceCents: null,
        minimumPriceCents: 0,
      },
    };
  }

  if (minimumCents < input.floorCents) {
    return {
      ok: false,
      error: `PWYW minimum must be at least ${input.floorCents} cents.`,
    };
  }

  return {
    ok: true,
    value: {
      priceCents: minimumCents,
      fixedPriceCents: null,
      minimumPriceCents: minimumCents,
    },
  };
}
