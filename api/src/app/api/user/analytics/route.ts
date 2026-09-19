import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getPlanConfig, insertAnalyticsEvent, getAnalyticsEvents, getAnalyticsAggregation } from "@/lib/db";
import { resolveEffectivePlan } from "@/lib/trial";

async function checkAnalyticsEntitlement(userId: string, mongoUser: any): Promise<{ allowed: boolean; error?: string }> {
  const planConfig = await getPlanConfig();
  const effectivePlan = resolveEffectivePlan(mongoUser);
  const planTier = planConfig.plans[effectivePlan];
  if (!planTier?.entitlements?.advancedAnalytics) {
    return { allowed: false, error: "Advanced analytics requires Growth plan or higher" };
  }
  return { allowed: true };
}

// POST /api/user/analytics — Log an analytics event
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const entCheck = await checkAnalyticsEntitlement(userId, authUser.mongoUser);
    if (!entCheck.allowed) {
      return NextResponse.json({ error: entCheck.error, requiredPlan: "growth" }, { status: 403 });
    }

    const body = await req.json();
    const { event, metadata } = body;
    if (!event || typeof event !== "string") {
      return NextResponse.json({ error: "event is required" }, { status: 400 });
    }

    const analyticsEvent = await insertAnalyticsEvent({
      userId,
      event: event.slice(0, 100),
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      eventId: analyticsEvent._id?.toString(),
    });
  } catch (error) {
    console.error("[user/analytics] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/user/analytics — Get events or aggregated dashboard data
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const entCheck = await checkAnalyticsEntitlement(userId, authUser.mongoUser);
    if (!entCheck.allowed) {
      return NextResponse.json({ error: entCheck.error, requiredPlan: "growth" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "events";
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const event = searchParams.get("event") || undefined;
    const since = searchParams.get("since") || undefined;
    const days = parseInt(searchParams.get("days") || "30", 10);

    if (mode === "dashboard") {
      const aggregation = await getAnalyticsAggregation(userId, days);
      return NextResponse.json({ aggregation, days });
    }

    const events = await getAnalyticsEvents(userId, { limit, event, since });
    return NextResponse.json({ events });
  } catch (error) {
    console.error("[user/analytics] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
