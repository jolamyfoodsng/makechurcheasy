import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getPlanConfig, getUserStorage, upsertUserStorage } from "@/lib/db";
import { resolveEffectivePlan } from "@/lib/trial";

const GB = 1024 * 1024 * 1024;

// GET /api/user/storage — Get current storage usage and quota
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    // Get storage record
    const storage = await getUserStorage(userId);

    // Get quota from plan config
    const planConfig = await getPlanConfig();
    const effectivePlan = resolveEffectivePlan(authUser.mongoUser);
    const planTier = planConfig.plans[effectivePlan];
    const quotaBytes = ((planTier?.entitlements?.cloudStorageGB as number) || 0) * GB;

    return NextResponse.json({
      storage: {
        usedBytes: storage?.usedBytes || 0,
        quotaBytes,
        usedGB: Number(((storage?.usedBytes || 0) / GB).toFixed(2)),
        quotaGB: (planTier?.entitlements?.cloudStorageGB as number) || 0,
        percentUsed: quotaBytes > 0
          ? Math.min(100, Math.round(((storage?.usedBytes || 0) / quotaBytes) * 100))
          : 0,
      },
    });
  } catch (error) {
    console.error("[user/storage] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/user/storage — Update storage usage (called from desktop sync)
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const body = await req.json();
    const { usedBytes } = body;
    if (typeof usedBytes !== "number" || usedBytes < 0) {
      return NextResponse.json({ error: "usedBytes must be a non-negative number" }, { status: 400 });
    }

    // Get quota from plan config
    const planConfig = await getPlanConfig();
    const effectivePlan = resolveEffectivePlan(authUser.mongoUser);
    const planTier = planConfig.plans[effectivePlan];
    const quotaBytes = ((planTier?.entitlements?.cloudStorageGB as number) || 0) * GB;

    // Enforce quota
    if (quotaBytes > 0 && usedBytes > quotaBytes) {
      return NextResponse.json(
        {
          error: "Storage quota exceeded",
          usedBytes,
          quotaBytes,
          overBy: usedBytes - quotaBytes,
        },
        { status: 402 }
      );
    }

    const storage = await upsertUserStorage(userId, { usedBytes, quotaBytes });

    return NextResponse.json({
      success: true,
      storage: {
        usedBytes: storage.usedBytes,
        quotaBytes: storage.quotaBytes,
        usedGB: Number((storage.usedBytes / GB).toFixed(2)),
        quotaGB: (planTier?.entitlements?.cloudStorageGB as number) || 0,
        percentUsed: quotaBytes > 0
          ? Math.min(100, Math.round((storage.usedBytes / quotaBytes) * 100))
          : 0,
      },
    });
  } catch (error) {
    console.error("[user/storage] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
