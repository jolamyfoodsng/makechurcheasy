import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { resolvePaymentPricing } from "@/lib/paymentPricing";
import { getPlatformSettings } from "@/lib/platformSettings";
import {
  isFlutterwaveConfigured,
  isFlutterwaveCurrencySupported,
} from "@/lib/flutterwave";
import type { FlutterwaveResolvedPricing } from "@/lib/flutterwavePricing";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ enabled: false }, { status: 401 });
    }

    const platformSettings = await getPlatformSettings();
    const pricingResolution = await resolvePaymentPricing(
      req,
      authUser.mongoUser.country,
      "flutterwave",
    );
    const { countryCode } = pricingResolution;
    const flutterwavePricing = pricingResolution.checkoutPricing as FlutterwaveResolvedPricing;

    return NextResponse.json({
      enabled:
        platformSettings.system.allowPayments &&
        isFlutterwaveConfigured() &&
        isFlutterwaveCurrencySupported(flutterwavePricing.currency),
      paymentMethod: "flutterwave",
      country: countryCode,
      currency: flutterwavePricing.currency,
      currencySource: flutterwavePricing.checkoutCurrencySource,
      countryResolutionRequired: pricingResolution.requiresCountrySelection,
    });
  } catch (error) {
    console.error("[Flutterwave Config] Error:", error);
    return NextResponse.json({ enabled: false });
  }
}
