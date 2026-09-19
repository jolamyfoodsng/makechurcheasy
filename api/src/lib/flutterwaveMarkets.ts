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

export const FLUTTERWAVE_LOCAL_MARKETS: Readonly<Record<string, FlutterwaveLocalMarket>> = {
  NG: { currency: "NGN", currencySymbol: "₦", pricingCountryCode: "NG" },
  GH: { currency: "GHS", currencySymbol: "GH₵", pricingCountryCode: "GH" },
  KE: { currency: "KES", currencySymbol: "KSh", pricingCountryCode: "KE" },
  ZA: { currency: "ZAR", currencySymbol: "R", pricingCountryCode: "ZA" },
  UG: { currency: "UGX", currencySymbol: "UGX", pricingCountryCode: "UG" },
  TZ: { currency: "TZS", currencySymbol: "TSh", pricingCountryCode: "TZ" },
  RW: { currency: "RWF", currencySymbol: "FRw", pricingCountryCode: "RW" },
  ZM: { currency: "ZMW", currencySymbol: "ZK", pricingCountryCode: "ZM" },
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
