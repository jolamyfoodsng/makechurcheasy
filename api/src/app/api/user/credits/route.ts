import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { calculateUserCredits } from "@/lib/credits";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";

/**
 * GET /api/user/credits
 *
 * Returns the user's remaining credits calculated dynamically from:
 *   plan config allocation + admin grants − usage transactions
 *
 * Admin users return unlimited (-1).
 * Auth: fb-token cookie (web) OR X-Device-Id header (desktop app).
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();
    const mongoUser = await checkAndApplyScheduledDowngrade(
      userId,
      authUser.mongoUser,
    );

    const result = await calculateUserCredits(userId, mongoUser);

    return NextResponse.json({
      credits: result.credits,
      totalConsumed: result.totalConsumed,
      planAllocation: result.planAllocation,
      adminGranted: result.adminGranted,
      effectivePlan: result.effectivePlan,
      isAdmin: result.isAdmin,
      unlimited: result.unlimited,
    });
  } catch (error) {
    console.error("Get credits error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
