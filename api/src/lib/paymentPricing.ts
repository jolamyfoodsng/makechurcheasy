import { getCountryPricing } from "./countryPricing";
import { resolveFlutterwavePricing, type FlutterwaveResolvedPricing } from "./flutterwavePricing";
import { resolveRequestCountry, type RequestCountryResolution } from "./requestCountry";
import type { ResolvedPricing } from "@/types/countryPricing";

export type PaymentMethod = "paystack" | "mtn_momo" | "nowpayments" | "flutterwave";

export interface PaymentPricingResolution extends RequestCountryResolution {
  countryPricing: ResolvedPricing;
  checkoutPricing: ResolvedPricing | FlutterwaveResolvedPricing;
  /** True when the account has no verified stored country to charge against. */
  requiresCountrySelection: boolean;
}

/**
 * Resolve the country and the exact server-side pricing used by a payment
 * flow. Every payment endpoint should use this helper so display and charge
 * currencies cannot drift apart.
 */
export async function resolvePaymentPricing(
  req: { headers: Headers },
  storedCountry: unknown,
  paymentMethod: PaymentMethod,
): Promise<PaymentPricingResolution> {
  const country = await resolveRequestCountry(req, storedCountry);
  const countryPricing = await getCountryPricing(country.countryCode);
  const checkoutPricing = paymentMethod === "flutterwave"
    ? await resolveFlutterwavePricing(country.countryCode, countryPricing)
    : countryPricing;

  return {
    ...country,
    countryPricing,
    checkoutPricing,
    requiresCountrySelection: !country.hasStoredCountry,
  };
}
