export const SUPPORTED_CURRENCY_CODES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "CHF",
  "SEK",
  "NOK",
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export const SUPPORTED_CURRENCIES: Array<{
  code: SupportedCurrencyCode;
  name: string;
  symbol: string;
  flag: string;
  minorUnit: 0 | 2;
}> = [
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸", minorUnit: 2 },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺", minorUnit: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧", minorUnit: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", flag: "🇨🇦", minorUnit: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", flag: "🇦🇺", minorUnit: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", flag: "🇳🇿", minorUnit: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵", minorUnit: 0 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭", minorUnit: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", flag: "🇸🇪", minorUnit: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", flag: "🇳🇴", minorUnit: 2 },
];
