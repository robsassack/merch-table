import { getCurrencyScale } from "@/lib/money";

const DEFAULT_EXCHANGE_RATE_API_BASE_URL = "https://api.frankfurter.app";

export function resolveExchangeRateApiBaseUrl() {
  return (
    process.env.EXCHANGE_RATE_API_BASE_URL?.trim() || DEFAULT_EXCHANGE_RATE_API_BASE_URL
  ).replace(/\/+$/, "");
}

export async function fetchExchangeRate(input: {
  from: string;
  to: string;
  timeoutMs?: number;
}) {
  const from = input.from.trim().toUpperCase();
  const to = input.to.trim().toUpperCase();
  if (from === to) {
    return 1;
  }

  const url = `${resolveExchangeRateApiBaseUrl()}/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(input.timeoutMs ?? 6_000),
  });

  if (!response.ok) {
    throw new Error("Currency conversion rates are unavailable.");
  }

  const body = (await response.json().catch(() => null)) as
    | { rates?: Record<string, number> }
    | null;
  const rate = body?.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("Currency conversion rate is invalid.");
  }

  return rate;
}

export function convertMinorAmount(input: {
  amountMinor: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rounding?: "nearest" | "ceil";
}) {
  if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
    return 0;
  }

  const sourceScale = getCurrencyScale(input.fromCurrency);
  const targetScale = getCurrencyScale(input.toCurrency);
  const amountTargetMinorRaw = (input.amountMinor / sourceScale) * input.rate * targetScale;
  const round =
    input.rounding === "ceil"
      ? Math.ceil
      : Math.round;

  return Math.max(0, round(amountTargetMinorRaw));
}

