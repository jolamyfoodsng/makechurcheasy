import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getCountryPricing } from "@/lib/countryPricing";
import { getPlanConfig } from "@/lib/db";
import { resolveEligibleSpecialOffers } from "@/lib/specialOffers";
import { resolveRequestCountry } from "@/lib/requestCountry";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = authUser.mongoUser;
    const { countryCode } = await resolveRequestCountry(req, user.country);
    const countryPricing = await getCountryPricing(countryCode);
    const planConfig = await getPlanConfig();
    const offers = resolveEligibleSpecialOffers({
      planConfig,
      user,
      countryPricing,
    });

    return NextResponse.json({
      offers,
      count: offers.length,
      currency: countryPricing.currency,
      currencySymbol: countryPricing.currencySymbol,
      pricingVersion: countryPricing.pricingVersion,
    });
  } catch (error) {
    console.error("[SpecialOffers] eligible error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
