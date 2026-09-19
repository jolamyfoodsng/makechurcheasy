import type { ResolvedPricing } from "@/types/countryPricing";
import {
  FLUTTERWAVE_FALLBACK_CURRENCY,
  getFlutterwaveLocalMarket,
  normalizeFlutterwaveCountry,
} from "./flutterwaveMarkets";

export interface FlutterwaveResolvedPricing extends ResolvedPricing {
  checkoutCountryCode: string;
  checkoutCurrencySource: "local" | "usd_fallback";
}

function hasUsablePlanPrices(pricing: ResolvedPricing): boolean {
  return ["basic", "growth"].every((plan) => {
    const value = pricing.plans[plan as "basic" | "growth"];
    return Number.isFinite(value?.monthly) && value.monthly > 0
      && Number.isFinite(value?.yearly) && value.yearly > 0;
  });
}

function decoratePricing({
  checkoutCountryCode,
  checkoutCountryName,
  pricing,
  currency,
  currencySymbol,
  checkoutCurrencySource,
}: {
  checkoutCountryCode: string;
  checkoutCountryName: string;
  pricing: ResolvedPricing;
  currency: string;
  currencySymbol: string;
  checkoutCurrencySource: FlutterwaveResolvedPricing["checkoutCurrencySource"];
}): FlutterwaveResolvedPricing {
  return {
    ...pricing,
    countryCode: checkoutCountryCode,
    countryName: checkoutCountryName || pricing.countryName,
    currency,
    currencySymbol,
    source: checkoutCurrencySource === "local" ? "country" : "fallback",
    checkoutCountryCode,
    checkoutCurrencySource,
  };
}

/**
 * Resolve the Flutterwave checkout price from server-side pricing.
 *
 * Local currency is used only when the country is in the explicit market map
 * and its configured country pricing matches that market. Every other country
 * receives the configured USD plan values and can still attempt an
 * international card payment.
 */
export function selectFlutterwavePricing({
  countryCode,
  countryName,
  countryPricing,
  usdPricing,
}: {
  countryCode: string;
  countryName: string;
  countryPricing: ResolvedPricing;
  usdPricing: ResolvedPricing;
}): FlutterwaveResolvedPricing {
  const normalizedCountry = normalizeFlutterwaveCountry(countryCode);
  const market = getFlutterwaveLocalMarket(normalizedCountry);
  const localPricingIsConfigured = Boolean(
    market
      && countryPricing.countryCode === normalizedCountry
      && countryPricing.currency.toUpperCase() === market.currency
      && hasUsablePlanPrices(countryPricing),
  );

  if (market && localPricingIsConfigured) {
    return decoratePricing({
      checkoutCountryCode: normalizedCountry,
      checkoutCountryName: countryName,
      pricing: countryPricing,
      currency: market.currency,
      currencySymbol: market.currencySymbol,
      checkoutCurrencySource: "local",
    });
  }

  // A country may be intentionally configured to charge in USD with its own
  // plan amounts. Keep those amounts for Flutterwave instead of silently
  // replacing them with the US row. Only use the global USD row when the
  // country is priced in a different currency that Flutterwave cannot accept.
  const fallbackPricing = countryPricing.currency.toUpperCase() === "USD" && hasUsablePlanPrices(countryPricing)
    ? countryPricing
    : usdPricing;

  return decoratePricing({
    checkoutCountryCode: normalizedCountry,
    checkoutCountryName: countryName,
    pricing: fallbackPricing,
    currency: FLUTTERWAVE_FALLBACK_CURRENCY,
    currencySymbol: "$",
    checkoutCurrencySource: "usd_fallback",
  });
}

export async function resolveFlutterwavePricing(
  countryCode: string,
  detectedPricing?: ResolvedPricing,
): Promise<FlutterwaveResolvedPricing> {
  const { getCountryPricing } = await import("./countryPricing");
  const normalizedCountry = normalizeFlutterwaveCountry(countryCode) || "US";
  const countryPricing = detectedPricing || await getCountryPricing(normalizedCountry);
  const countryName = countryPricing.countryName || normalizedCountry;
  const usdPricing = normalizedCountry === "US"
    ? countryPricing
    : await getCountryPricing("US");

  return selectFlutterwavePricing({
    countryCode: normalizedCountry,
    countryName,
    countryPricing,
    usdPricing,
  });
}
