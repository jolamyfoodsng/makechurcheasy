/**
 * Flutterwave local checkout markets.
 *
 * Keep this list intentionally smaller than the general country-pricing
 * catalog. A country may have a displayed local price without being a market
 * where we have explicitly configured Flutterwave local checkout support.
 */

export interface FlutterwaveLocalMarket {
  currency: string;
  currencySymbol: string;
  pricingCountryCode: string;
}

export const SEPA_EURO_COUNTRIES = [
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
] as const;

export const FLUTTERWAVE_LOCAL_MARKETS: Readonly<Record<string, FlutterwaveLocalMarket>> = {
  // Africa (Supported for local collections / mobile money / local bank transfer)
  NG: { currency: "NGN", currencySymbol: "₦", pricingCountryCode: "NG" },
  GH: { currency: "GHS", currencySymbol: "GH₵", pricingCountryCode: "GH" },
  KE: { currency: "KES", currencySymbol: "KSh", pricingCountryCode: "KE" },
  ZA: { currency: "ZAR", currencySymbol: "R", pricingCountryCode: "ZA" },
  UG: { currency: "UGX", currencySymbol: "UGX", pricingCountryCode: "UG" },
  TZ: { currency: "TZS", currencySymbol: "TSh", pricingCountryCode: "TZ" },
  RW: { currency: "RWF", currencySymbol: "FRw", pricingCountryCode: "RW" },
  ZM: { currency: "ZMW", currencySymbol: "ZK", pricingCountryCode: "ZM" },
  CM: { currency: "XAF", currencySymbol: "FCFA", pricingCountryCode: "CM" },
  CI: { currency: "XOF", currencySymbol: "CFA", pricingCountryCode: "CI" },
  SN: { currency: "XOF", currencySymbol: "CFA", pricingCountryCode: "SN" },
  EG: { currency: "EGP", currencySymbol: "E£", pricingCountryCode: "EG" },
  ET: { currency: "ETB", currencySymbol: "Br", pricingCountryCode: "ET" },
  MW: { currency: "MWK", currencySymbol: "MK", pricingCountryCode: "MW" },
  SL: { currency: "SLL", currencySymbol: "Le", pricingCountryCode: "SL" },

  // International / Major
  GB: { currency: "GBP", currencySymbol: "£", pricingCountryCode: "GB" },
  US: { currency: "USD", currencySymbol: "$", pricingCountryCode: "US" },
  CA: { currency: "CAD", currencySymbol: "CA$", pricingCountryCode: "CA" },

  // SEPA Eurozone (EUR)
  ...Object.fromEntries(
    SEPA_EURO_COUNTRIES.map((code) => [
      code,
      { currency: "EUR", currencySymbol: "€", pricingCountryCode: "EUR" },
    ]),
  ),
};

export const FLUTTERWAVE_FALLBACK_CURRENCY = "USD";

export function normalizeFlutterwaveCountry(countryCode: string | null | undefined): string {
  return String(countryCode || "").trim().toUpperCase();
}

export function getFlutterwaveLocalMarket(countryCode: string | null | undefined) {
  return FLUTTERWAVE_LOCAL_MARKETS[normalizeFlutterwaveCountry(countryCode)];
}

export function getFlutterwaveSupportedCurrencies(): Set<string> {
  return new Set([
    FLUTTERWAVE_FALLBACK_CURRENCY,
    ...Object.values(FLUTTERWAVE_LOCAL_MARKETS).map((market) => market.currency),
  ]);
}
