/**
 * GET /api/v1/profile
 *
 * Returns the authenticated user's profile.
 *
 * Auth: Bearer API key (mce_live_...)
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, logApiRequest } from "@/lib/apiKeyAuth";
import { calculateUserCredits } from "@/lib/credits";

export async function GET(req: NextRequest) {
  let ctx = null;
  try {
    const auth = await authenticateApiKey(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }
    ctx = auth.ctx;

    const { userId, mongoUser } = ctx;
    const creditResult = await calculateUserCredits(userId, mongoUser);

    return NextResponse.json({
      id: mongoUser._id?.toString(),
      name: mongoUser.name,
      email: mongoUser.email,
      churchName: mongoUser.churchName,
      plan: creditResult.effectivePlan,
      storedPlan: mongoUser.plan || "free",
      appId: mongoUser.appId,
      createdAt: mongoUser.createdAt,
    });
  } catch (error) {
    console.error("GET /api/v1/profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    // Audit log (fire-and-forget)
    logApiRequest(ctx, req, 200).catch(() => {});
  }
}
