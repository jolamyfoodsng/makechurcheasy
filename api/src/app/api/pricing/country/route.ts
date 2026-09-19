/**
 * GET /api/pricing/country
 *
 * Returns admin-managed country pricing for the user.
 *
 * Detection priority:
 * 1. User's stored country (authenticated)
 * 2. ?region= query override (legacy manual selection)
 * 3. x-mce-geo-country header from the dashboard proxy
 * 4. CF-IPCountry header (Cloudflare)
 * 5. x-vercel-ip-country header (Vercel)
 * 6. Fallback to Global
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getCountryPricing } from "@/lib/countryPricing";
import { resolveFlutterwavePricing } from "@/lib/flutterwavePricing";
import { resolveRequestCountry } from "@/lib/requestCountry";

// ── African country codes (ISO 3166-1 alpha-2, excluding Nigeria) ──
const AFRICAN_COUNTRIES = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG",
  "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN",
  "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "YT", "MA",
  "MZ", "NA", "NE", "RE", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS",
  "SD", "TZ", "TG", "TN", "UG", "EH", "ZM", "ZW",
]);

type PricingRegion = "nigeria" | "africa" | "global";

function getPricingRegion(countryCode: string): PricingRegion {
  const code = (countryCode || "").toUpperCase();
  if (code === "NG") return "nigeria";
  if (AFRICAN_COUNTRIES.has(code)) return "africa";
  return "global";
}

const REGION_COUNTRY_OVERRIDES: Record<PricingRegion, string> = {
  nigeria: "NG",
  africa: "GH",
  global: "US",
};

export async function GET(req: NextRequest) {
  try {
    // Check for legacy region override query param.
    const regionOverride = req.nextUrl.searchParams.get("region");
    if (regionOverride === "nigeria" || regionOverride === "africa" || regionOverride === "global") {
      const pricing = await getCountryPricing(REGION_COUNTRY_OVERRIDES[regionOverride]);
      const flutterwavePricing = await resolveFlutterwavePricing(pricing.countryCode, pricing);
      return NextResponse.json({
        ...pricing,
        flutterwave: { ...flutterwavePricing, region: regionOverride },
        region: regionOverride,
        source: "override",
      });
    }

    const authUser = await getAuthUserFromRequest(req);
    const countryResolution = await resolveRequestCountry(
      req,
      authUser?.mongoUser?._id ? authUser.mongoUser.country : undefined,
    );
    const { countryCode } = countryResolution;

    // 3. Resolve country through the admin-managed pricing table.
    const region = getPricingRegion(countryCode);
    const pricing = await getCountryPricing(countryCode);
    const flutterwavePricing = await resolveFlutterwavePricing(countryCode, pricing);

      return NextResponse.json({
        ...pricing,
        flutterwave: { ...flutterwavePricing, region },
        region,
        detectedCountry: countryCode,
        countrySource: countryResolution.source,
        countryResolutionRequired: !countryResolution.hasStoredCountry,
      });
  } catch (error) {
    console.error("[Pricing/Country] Error:", error);
    // Fallback to Global pricing on error.
    try {
      const pricing = await getCountryPricing("US");
      const flutterwavePricing = await resolveFlutterwavePricing("US", pricing);
      return NextResponse.json({
        ...pricing,
        flutterwave: flutterwavePricing,
        region: "global",
        source: "fallback",
      });
    } catch {
      return NextResponse.json({
        countryCode: "US",
        countryName: "United States",
        currency: "USD",
        currencySymbol: "$",
        region: "global",
        plans: {
          basic: { monthly: 7, yearly: 70 },
          growth: { monthly: 10, yearly: 100 },
        },
        pricingVersion: 1,
        source: "fallback",
        flutterwave: {
          countryCode: "US",
          countryName: "United States",
          currency: "USD",
          currencySymbol: "$",
          region: "global",
          plans: {
            basic: { monthly: 7, yearly: 70 },
            growth: { monthly: 10, yearly: 100 },
          },
          pricingVersion: 1,
          source: "fallback",
          checkoutCountryCode: "US",
          checkoutCurrencySource: "usd_fallback",
        },
      });
    }
  }
}
