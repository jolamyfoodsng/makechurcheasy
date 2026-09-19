/**
 * PUT /api/admin/country-pricing
 *
 * Admin-only endpoint to update a country's pricing.
 *
 * Body: {
 *   countryCode: "GH",
 *   updates: {
 *     currency: "GHS",
 *     currencySymbol: "GH₵",
 *     enabled: true,
 *     plans: {
 *       basic: { monthly: 50, yearly: 600 },
 *       ...
 *     }
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  updateCountryPricing,
  addCountryPricing,
  invalidateCountryPricingCache,
} from "@/lib/countryPricing";
import type { CountryPricingEntry } from "@/types/countryPricing";

type CountryPricingRequestBody = {
  countryCode?: string;
  updates?: Partial<CountryPricingEntry> & { country?: string };
  isNew?: boolean;
};

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser || authUser.mongoUser.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = (await req.json()) as CountryPricingRequestBody;
    const { countryCode, updates, isNew } = body;

    if (!countryCode || typeof countryCode !== "string") {
      return NextResponse.json(
        { error: "countryCode is required" },
        { status: 400 }
      );
    }

    const code = countryCode.toUpperCase();

    if (isNew) {
      // Add new country
      if (!updates?.currency || !updates.currencySymbol || !updates.plans) {
        return NextResponse.json(
          { error: "currency, currencySymbol, and plans are required for new countries" },
          { status: 400 }
        );
      }

      const entry: CountryPricingEntry = {
        country: updates.country || code,
        currency: updates.currency,
        currencySymbol: updates.currencySymbol,
        enabled: updates.enabled !== false,
        plans: updates.plans,
        regionalFallback: updates.regionalFallback,
      };

      const result = await addCountryPricing(code, entry);
      return NextResponse.json({ success: true, country: code, entry: result });
    }

    // Update existing country
    if (!updates) {
      return NextResponse.json(
        { error: "updates is required" },
        { status: 400 }
      );
    }
    const result = await updateCountryPricing(code, updates);
    if (!result) {
      return NextResponse.json(
        { error: `Country "${code}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, country: code, entry: result });
  } catch (error) {
    console.error("[Admin/CountryPricing] PUT Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/country-pricing
 *
 * Admin-only endpoint to remove a country's pricing entry.
 *
 * Body: { countryCode: "GH" }
 */
export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser || authUser.mongoUser.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = (await req.json()) as Pick<CountryPricingRequestBody, "countryCode">;
    const { countryCode } = body;

    if (!countryCode || typeof countryCode !== "string") {
      return NextResponse.json(
        { error: "countryCode is required" },
        { status: 400 }
      );
    }

    const col = await (await import("@/lib/mongodb")).default;
    const client = await col;
    const db = client.db();

    const result = await db
      .collection("country_pricing")
      .updateOne(
        { _id: "default" as any },
        {
          $unset: { [`countries.${countryCode.toUpperCase()}`]: "" },
          $set: { updatedAt: new Date().toISOString() },
        }
      );

    invalidateCountryPricingCache();

    return NextResponse.json({
      success: true,
      deleted: result.modifiedCount > 0,
    });
  } catch (error) {
    console.error("[Admin/CountryPricing] DELETE Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
