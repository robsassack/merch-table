import { isReleaseOwnedInStorage } from "@/app/(public)/release/owned-release-storage";

export type PricingMode = "FREE" | "FIXED" | "PWYW";

export function formatMoney(currency: string, cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function resolveCurrencyPrefix(currency: string) {
  const normalizedCurrency = currency || "USD";
  const parts = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(0);

  const currencyPart = parts.find((part) => part.type === "currency")?.value?.trim();
  return currencyPart && currencyPart.length > 0 ? currencyPart : normalizedCurrency;
}

export function resolveBuyLabel(input: {
  pricingMode: PricingMode;
  currency: string;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
}) {
  if (input.pricingMode === "FREE") {
    return "Get for Free";
  }

  if (input.pricingMode === "FIXED") {
    return `Buy ${formatMoney(input.currency, input.fixedPriceCents ?? 0)}`;
  }

  const minimum = input.minimumPriceCents ?? 0;
  if (minimum <= 0) {
    return "Pay What You Want";
  }
  return `Buy from ${formatMoney(input.currency, minimum)}`;
}

export function resolveMayAlreadyOwnRelease(input: {
  initialMayOwnRelease: boolean;
  releaseId: string;
}) {
  if (input.initialMayOwnRelease) {
    return true;
  }

  if (typeof window === "undefined") {
    return input.initialMayOwnRelease;
  }

  try {
    return isReleaseOwnedInStorage(window.localStorage, input.releaseId);
  } catch {
    return input.initialMayOwnRelease;
  }
}
