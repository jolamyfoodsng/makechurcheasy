import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getCountryPricing } from "@/lib/countryPricing";
import { DiscountCodeError, resolveDiscountCode } from "@/lib/discounts";
import type { DiscountBillingCycle, PlanTier } from "@/types/schemas";
import { resolveRequestCountry } from "@/lib/requestCountry";

const VALID_PLANS: PlanTier[] = ["basic", "growth"];
const VALID_CYCLES: DiscountBillingCycle[] = ["monthly", "yearly", "lifetime"];

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      code?: string;
      plan?: string;
      billingCycle?: string;
    };
    const plan = String(body.plan || "").toLowerCase() as PlanTier;
    const billingCycle = String(body.billingCycle || "monthly").toLowerCase() as DiscountBillingCycle;

    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: "Choose a paid plan first." }, { status: 400 });
    }
    if (!VALID_CYCLES.includes(billingCycle)) {
      return NextResponse.json({ error: "Invalid billing cycle." }, { status: 400 });
    }

    const { countryCode } = await resolveRequestCountry(req, authUser.mongoUser.country);
    const countryPricing = await getCountryPricing(countryCode);
    const planPricing = countryPricing.plans[plan as keyof typeof countryPricing.plans];
    const originalAmount = billingCycle === "yearly" ? planPricing?.yearly : planPricing?.monthly;
    const discount = await resolveDiscountCode({
      code: body.code || "",
      user: authUser.mongoUser,
      plan,
      billingCycle,
      originalAmount: Number(originalAmount || 0),
    });

    return NextResponse.json({
      discount,
      currency: countryPricing.currency,
      currencySymbol: countryPricing.currencySymbol,
    });
  } catch (error) {
    if (error instanceof DiscountCodeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Discounts/Validate] Error:", error);
    return NextResponse.json({ error: "Failed to validate discount code" }, { status: 500 });
  }
}
