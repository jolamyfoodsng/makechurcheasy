import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getPlanConfig, insertSyncJob, updateSyncJob, getSyncJobs } from "@/lib/db";
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

// POST /api/cloud-sync/backup — Upload a backup from desktop
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
    const { data, categories } = body;
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "data object is required" }, { status: 400 });
    }

    const payload = JSON.stringify(data);
    const sizeBytes = Buffer.byteLength(payload, "utf-8");
    const recordCount = Object.values(data).reduce(
      (sum: number, val: any) => sum + (Array.isArray(val) ? val.length : 0),
      0
    );

    // Create sync job
    const job = await insertSyncJob({
      userId,
      type: "backup",
      status: "uploading",
      sizeBytes,
      recordCount,
      categories: categories || Object.keys(data),
      createdAt: new Date().toISOString(),
    });

    // Store the backup data in MongoDB
    const client = await (await import("@/lib/mongodb")).default;
    const db = (await client).db();
    await db.collection("cloud_backups").updateOne(
      { userId },
      {
        $set: {
          userId,
          data,
          sizeBytes,
          recordCount,
          categories: categories || Object.keys(data),
          jobId: job._id?.toString(),
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: { createdAt: new Date().toISOString() },
      },
      { upsert: true }
    );

    // Mark job completed
    await updateSyncJob(userId, job._id!.toString(), {
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      job: {
        _id: job._id?.toString(),
        sizeBytes,
        recordCount,
        categories: categories || Object.keys(data),
      },
    });
  } catch (error) {
    console.error("[cloud-sync/backup] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/cloud-sync/backup — Retrieve the latest backup
export async function GET(req: NextRequest) {
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

    const client = await (await import("@/lib/mongodb")).default;
    const db = (await client).db();
    const backup = await db.collection("cloud_backups").findOne({ userId });

    if (!backup) {
      return NextResponse.json({ backup: null });
    }

    return NextResponse.json({
      backup: {
        data: backup.data,
        sizeBytes: backup.sizeBytes,
        recordCount: backup.recordCount,
        categories: backup.categories,
        updatedAt: backup.updatedAt,
      },
    });
  } catch (error) {
    console.error("[cloud-sync/backup] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
