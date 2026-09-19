/**
 * POST /api/admin/country-pricing/version
 *
 * Admin-only endpoint to increment the pricing version.
 * Existing subscriptions keep their old version.
 * New purchases use the new version.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { bumpPricingVersion } from "@/lib/countryPricing";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser || authUser.mongoUser.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const newVersion = await bumpPricingVersion();

    return NextResponse.json({
      success: true,
      version: newVersion,
      message: `Pricing version bumped to ${newVersion}. Existing subscriptions retain their original pricing.`,
    });
  } catch (error) {
    console.error("[Admin/CountryPricing/Version] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
