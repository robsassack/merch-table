import type { PricingMode } from "@/generated/prisma/enums";

type ResolveCheckoutAmountInput = {
  pricingMode: PricingMode;
  floorCents: number;
  priceCents: number;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
  pwywAmountCents?: number;
};

type ResolveCheckoutAmountResult =
  | {
      ok: true;
      amountCents: number;
    }
  | {
      ok: false;
      error: string;
    };

function parseInteger(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value;
}

export function resolveCheckoutAmountCents(
  input: ResolveCheckoutAmountInput,
): ResolveCheckoutAmountResult {
  if (input.pricingMode === "FREE") {
    return {
      ok: false,
      error: "Free releases must use /api/checkout/free.",
    };
  }

  if (input.pricingMode === "FIXED") {
    const fixedCents =
      parseInteger(input.fixedPriceCents) ?? parseInteger(input.priceCents);
    if (fixedCents === null || fixedCents <= 0) {
      return {
        ok: false,
        error: "Fixed-price release is missing a valid fixed price.",
      };
    }

    if (fixedCents < input.floorCents) {
      return {
        ok: false,
        error: `Fixed price must be at least ${input.floorCents} cents.`,
      };
    }

    return {
      ok: true,
      amountCents: fixedCents,
    };
  }

  const configuredMinimum =
    parseInteger(input.minimumPriceCents) ?? parseInteger(input.priceCents);

  if (configuredMinimum === null || configuredMinimum < 0) {
    return {
      ok: false,
      error: "PWYW release is missing a valid minimum price.",
    };
  }

  const selectedAmount =
    input.pwywAmountCents === undefined
      ? configuredMinimum
      : input.pwywAmountCents;

  if (parseInteger(selectedAmount) === null || selectedAmount < 0) {
    return {
      ok: false,
      error: "Provide a valid PWYW amount in cents.",
    };
  }

  if (selectedAmount < configuredMinimum) {
    return {
      ok: false,
      error: `PWYW amount must be at least ${configuredMinimum} cents.`,
    };
  }

  if (selectedAmount < input.floorCents) {
    return {
      ok: false,
      error: `PWYW amount must be at least ${input.floorCents} cents.`,
    };
  }

  return {
    ok: true,
    amountCents: selectedAmount,
  };
}
