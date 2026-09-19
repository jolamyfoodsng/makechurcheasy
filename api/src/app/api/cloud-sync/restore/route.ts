import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getPlanConfig, insertSyncJob, updateSyncJob } from "@/lib/db";
import { resolveEffectivePlan } from "@/lib/trial";

async function checkCloudEntitlement(userId: string, mongoUser: any): Promise<{ allowed: boolean; error?: string }> {
  const planConfig = await getPlanConfig();
  const effectivePlan = resolveEffectivePlan(mongoUser);
  const planTier = planConfig.plans[effectivePlan];
  if (!planTier?.entitlements?.cloudSync) {
    return { allowed: false, error: "Cloud sync requires Growth plan or higher" };
  }
  return { allowed: true };
}

// POST /api/cloud-sync/restore — Restore data from cloud backup
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const entCheck = await checkCloudEntitlement(userId, authUser.mongoUser);
    if (!entCheck.allowed) {
      return NextResponse.json({ error: entCheck.error, requiredPlan: "growth" }, { status: 403 });
    }

    const body = await req.json();
    const { categories } = body;

    const client = await (await import("@/lib/mongodb")).default;
    const db = (await client).db();
    const backup = await db.collection("cloud_backups").findOne({ userId });

    if (!backup) {
      return NextResponse.json({ error: "No backup found" }, { status: 404 });
    }

    // Filter categories if specified
    let restoreData = backup.data;
    if (Array.isArray(categories) && categories.length > 0) {
      restoreData = {};
      for (const cat of categories) {
        if (backup.data[cat]) {
          restoreData[cat] = backup.data[cat];
        }
      }
    }

    const recordCount = Object.values(restoreData).reduce(
      (sum: number, val: any) => sum + (Array.isArray(val) ? val.length : 0),
      0
    );

    // Create a restore job record
    const job = await insertSyncJob({
      userId,
      type: "restore",
      status: "completed",
      sizeBytes: Buffer.byteLength(JSON.stringify(restoreData), "utf-8"),
      recordCount,
      categories: Object.keys(restoreData),
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: restoreData,
      job: {
        _id: job._id?.toString(),
        recordCount,
        categories: Object.keys(restoreData),
      },
    });
  } catch (error) {
    console.error("[cloud-sync/restore] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
