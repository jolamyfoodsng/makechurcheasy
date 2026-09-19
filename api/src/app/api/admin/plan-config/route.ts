import { NextRequest, NextResponse } from "next/server";
import { getPlanConfig, upsertPlanConfig } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { sanitizeSpecialOffers } from "@/lib/specialOffers";

/**
 * GET /api/admin/plan-config
 *
 * Admin-only endpoint to read the current plan configuration.
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser || authUser.mongoUser.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const planConfig = await getPlanConfig();
    return NextResponse.json(planConfig);
  } catch (error) {
    console.error("Get plan config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/plan-config
 *
 * Admin-only endpoint to update plan configuration.
 * Merges provided fields into the existing plan_config document.
 */
export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser || authUser.mongoUser.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, any>;

    // Validate plans structure if provided
    if (body.plans && typeof body.plans === "object") {
      for (const [tier, cfg] of Object.entries(body.plans)) {
        const plan = cfg as Record<string, unknown>;
        // v2 format: label, pricing, paystack, credits, entitlements
        if (typeof plan.credits !== "number" || typeof plan.label !== "string") {
          return NextResponse.json(
            { error: `Invalid plan config for tier "${tier}": credits (number) and label (string) are required` },
            { status: 400 }
          );
        }
      }
    }

    // Validate creditCosts if provided
    if (body.creditCosts && Array.isArray(body.creditCosts)) {
      for (const cost of body.creditCosts) {
        if (typeof cost.name !== "string" || typeof cost.cost !== "number" || typeof cost.unit !== "string") {
          return NextResponse.json(
            { error: "Each creditCost must have name (string), cost (number), unit (string)" },
            { status: 400 }
          );
        }
      }
    }

    if (body.specialOffers !== undefined) {
      if (!Array.isArray(body.specialOffers)) {
        return NextResponse.json(
          { error: "specialOffers must be an array" },
          { status: 400 },
        );
      }
      const sanitized = sanitizeSpecialOffers(body.specialOffers);
      for (const offer of sanitized) {
        if (!offer.id || !offer.name) {
          return NextResponse.json(
            { error: "Each special offer needs an id and name" },
            { status: 400 },
          );
        }
        if (!["basic", "growth"].includes(offer.plan)) {
          return NextResponse.json(
            { error: `Special offer "${offer.name}" must target Basic or Growth` },
            { status: 400 },
          );
        }
      }
      body.specialOffers = sanitized;
    }

    const updated = await upsertPlanConfig(body);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update plan config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
