/**
 * GET /api/v1/usage
 *
 * Returns the authenticated user's usage stats.
 *
 * Auth: Bearer API key (mce_live_...)
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, logApiRequest } from "@/lib/apiKeyAuth";
import { getUserUsage, getPlanConfig } from "@/lib/db";
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

    const usage = await getUserUsage(userId);
    const creditResult = await calculateUserCredits(userId, mongoUser);
    const planTier = creditResult.effectivePlan;
    const planConfig = await getPlanConfig();
    const tierConfig = planConfig.plans[planTier] || planConfig.plans.free;
    const entitlements = tierConfig.entitlements;

    // Build remaining counts
    const resourceKeys = [
      "songs", "images", "videos", "themes", "lowerThirds",
      "devices", "bibleVersions", "cloudStorageGB",
    ] as const;

    const remaining: Record<string, number | null> = {};
    for (const key of resourceKeys) {
      const limit = (entitlements as any)[key];
      if (typeof limit !== "number") {
        remaining[key] = null;
      } else if (limit === -1) {
        remaining[key] = -1; // unlimited
      } else {
        const used = (usage as any)?.[key] ?? 0;
        remaining[key] = Math.max(0, limit - used);
      }
    }

    return NextResponse.json({
      plan: planTier,
      usage: usage || {
        songs: 0,
        images: 0,
        videos: 0,
        themes: 0,
        lowerThirds: 0,
        devices: 0,
        bibleVersions: 0,
      },
      remaining,
      lastSyncedAt: usage?.lastSyncedAt || null,
    });
  } catch (error) {
    console.error("GET /api/v1/usage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    logApiRequest(ctx, req, 200).catch(() => {});
  }
}
