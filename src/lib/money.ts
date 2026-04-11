import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrencyCode,
} from "@/lib/setup/currencies";

export type CurrencyMeta = {
  code: SupportedCurrencyCode;
  minorUnit: 0 | 2;
  symbol: string;
};

const DEFAULT_CURRENCY: SupportedCurrencyCode = "USD";

const CURRENCY_META_BY_CODE: Record<SupportedCurrencyCode, CurrencyMeta> =
  SUPPORTED_CURRENCIES.reduce(
    (accumulator, currency) => {
      accumulator[currency.code] = {
        code: currency.code,
        minorUnit: currency.minorUnit,
        symbol: currency.symbol,
      };
      return accumulator;
    },
    {} as Record<SupportedCurrencyCode, CurrencyMeta>,
  );

const MINOR_UNIT_LABELS: Record<
  SupportedCurrencyCode,
  { singular: string; plural: string }
> = {
  USD: { singular: "cent", plural: "cents" },
  EUR: { singular: "cent", plural: "cents" },
  GBP: { singular: "penny", plural: "pence" },
  CAD: { singular: "cent", plural: "cents" },
  AUD: { singular: "cent", plural: "cents" },
  NZD: { singular: "cent", plural: "cents" },
  JPY: { singular: "yen", plural: "yen" },
  CHF: { singular: "rappen", plural: "rappen" },
  SEK: { singular: "ore", plural: "ore" },
  NOK: { singular: "ore", plural: "ore" },
};

function normalizeCurrencyCode(value: string | null | undefined): SupportedCurrencyCode {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) {
    return DEFAULT_CURRENCY;
  }

  const found = SUPPORTED_CURRENCIES.find((currency) => currency.code === normalized);
  return found?.code ?? DEFAULT_CURRENCY;
}

export function getCurrencyMeta(value: string | null | undefined): CurrencyMeta {
  return CURRENCY_META_BY_CODE[normalizeCurrencyCode(value)];
}

export function getCurrencyMinorUnit(value: string | null | undefined) {
  return getCurrencyMeta(value).minorUnit;
}

export function getCurrencyScale(value: string | null | undefined) {
  return 10 ** getCurrencyMinorUnit(value);
}

export function minorToMajor(amountMinor: number, currency: string | null | undefined) {
  if (!Number.isFinite(amountMinor)) {
    return 0;
  }

  return amountMinor / getCurrencyScale(currency);
}

export function minorToMajorInput(amountMinor: number, currency: string | null | undefined) {
  if (!Number.isFinite(amountMinor)) {
    return "";
  }

  const precision = getCurrencyMinorUnit(currency);
  return minorToMajor(amountMinor, currency).toFixed(precision);
}

export function majorInputToMinor(input: string, currency: string | null | undefined) {
  const precision = getCurrencyMinorUnit(currency);
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }

  const [wholePart, fractionPartRaw = ""] = trimmed.split(".");
  if (fractionPartRaw.length > precision) {
    return null;
  }

  const whole = Number.parseInt(wholePart, 10);
  if (!Number.isInteger(whole) || whole < 0) {
    return null;
  }

  const paddedFraction = fractionPartRaw.padEnd(precision, "0");
  const fraction = paddedFraction.length > 0 ? Number.parseInt(paddedFraction, 10) : 0;
  if (!Number.isInteger(fraction) || fraction < 0) {
    return null;
  }

  const scale = getCurrencyScale(currency);
  return whole * scale + fraction;
}

export function formatMinorAmount(
  amountMinor: number,
  currency: string | null | undefined,
  locale = "en-US",
) {
  const meta = getCurrencyMeta(currency);
  const precision = meta.minorUnit;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: meta.code,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(minorToMajor(amountMinor, meta.code));
  } catch {
    return `${minorToMajor(amountMinor, meta.code).toFixed(precision)} ${meta.code}`;
  }
}

export function resolveCurrencyPrefix(currency: string | null | undefined, locale = "en-US") {
  const meta = getCurrencyMeta(currency);
  const precision = meta.minorUnit;
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).formatToParts(0);

  const currencyPart = parts.find((part) => part.type === "currency")?.value?.trim();
  return currencyPart && currencyPart.length > 0 ? currencyPart : meta.code;
}

export function stepForCurrency(currency: string | null | undefined) {
  return getCurrencyMinorUnit(currency) === 0 ? "1" : "0.01";
}

export function inputModeForCurrency(currency: string | null | undefined): "numeric" | "decimal" {
  return getCurrencyMinorUnit(currency) === 0 ? "numeric" : "decimal";
}

export function minInputForCurrency(amountMinor: number, currency: string | null | undefined) {
  return minorToMajorInput(Math.max(0, amountMinor), currency);
}

export function formatMinorUnitCount(amountMinor: number, currency: string | null | undefined) {
  const code = getCurrencyMeta(currency).code;
  const labels = MINOR_UNIT_LABELS[code];
  const abs = Math.abs(amountMinor);
  const noun = abs === 1 ? labels.singular : labels.plural;
  return `${amountMinor} ${noun}`;
}

export function resolveMinorUnitLabel(
  currency: string | null | undefined,
  count: number,
) {
  const code = getCurrencyMeta(currency).code;
  const labels = MINOR_UNIT_LABELS[code];
  const abs = Math.abs(count);
  return abs === 1 ? labels.singular : labels.plural;
}
