import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
  getNowPaymentsIpnCallbackUrl,
  hasExplicitNowPaymentsCallbackUrl,
  isNowPaymentsConfigured,
  isNowPaymentsPriceCurrencySupported,
} from "@/lib/nowPayments";
import { getPlatformSettings } from "@/lib/platformSettings";
import { resolvePaymentPricing } from "@/lib/paymentPricing";

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
      "nowpayments",
    );
    const { countryPricing: pricing } = pricingResolution;
    const callbackUrl = getNowPaymentsIpnCallbackUrl();
    const callbackConfigured =
      /^https?:\/\//i.test(callbackUrl) &&
      (process.env.NODE_ENV !== "production" || hasExplicitNowPaymentsCallbackUrl());

    return NextResponse.json({
      enabled:
        platformSettings.system.allowPayments &&
        isNowPaymentsConfigured() &&
        callbackConfigured &&
        isNowPaymentsPriceCurrencySupported("USD"),
      paymentMethod: "nowpayments",
      // Crypto invoices are always denominated in USD. The local currency is
      // converted server-side before the invoice is created.
      currency: "USD",
      localCurrency: pricing.currency,
      countryResolutionRequired: pricingResolution.requiresCountrySelection,
    });
  } catch (error) {
    console.error("[NOWPayments Config] Error:", error);
    return NextResponse.json({ enabled: false });
  }
}
