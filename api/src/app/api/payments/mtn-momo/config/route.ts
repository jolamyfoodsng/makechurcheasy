import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getMtnMomoPublicConfig } from "@/lib/mtnMomo";
import { getPlatformSettings } from "@/lib/platformSettings";
import { resolvePaymentPricing } from "@/lib/paymentPricing";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ enabled: false }, { status: 401 });
    }

    const pricingResolution = await resolvePaymentPricing(
      req,
      authUser.mongoUser.country,
      "mtn_momo",
    );
    const { countryCode, countryPricing: pricing } = pricingResolution;
    const platformSettings = await getPlatformSettings();
    const config = getMtnMomoPublicConfig(countryCode);
    const currencyMatches = pricing.currency.toUpperCase() === config.currency.toUpperCase();
    const sandboxCurrencyMatches = config.targetEnvironment !== "sandbox" || config.currency === "EUR";

    return NextResponse.json({
      ...config,
      enabled:
        config.enabled &&
        platformSettings.system.allowPayments &&
        currencyMatches &&
        sandboxCurrencyMatches,
      countryResolutionRequired: pricingResolution.requiresCountrySelection,
    });
  } catch (error) {
    console.error("[MTN MoMo Config] Error:", error);
    return NextResponse.json({ enabled: false });
  }
}
