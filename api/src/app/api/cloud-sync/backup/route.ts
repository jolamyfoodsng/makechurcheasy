import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { insertSyncJob, updateSyncJob } from "@/lib/db";
import type { EffectivePlan } from "@/lib/trial";
import { getCloudStorageLimitBytes, getCloudUsage, resolveCloudAccess } from "@/lib/cloudStorage";

async function checkCloudEntitlement(_userId: string, mongoUser: any): Promise<{ allowed: boolean; error?: string; plan: EffectivePlan }> {
  const access = await resolveCloudAccess(mongoUser);
  if (!access.allowed) {
    return { allowed: false, error: "Cloud backup needs a Basic or Growth plan", plan: access.plan };
  }
  return { allowed: true, plan: access.plan };
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
      return NextResponse.json({ error: entCheck.error, requiredPlan: "basic" }, { status: 403 });
    }

    const body = (await req.json()) as { data?: unknown; categories?: unknown };
    const { data, categories } = body;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return NextResponse.json({ error: "data object is required" }, { status: 400 });
    }
    const backupData = data as Record<string, unknown>;
    const backupCategories = Array.isArray(categories)
      ? categories.filter((category): category is string => typeof category === "string")
      : Object.keys(backupData);

    const payload = JSON.stringify(backupData);
    const sizeBytes = Buffer.byteLength(payload, "utf-8");

    // The new backup replaces the old one, so only the growth counts against the limit.
    const usage = await getCloudUsage(userId);
    const limitBytes = getCloudStorageLimitBytes(entCheck.plan);
    if (usage.usedBytes - usage.backupBytes + sizeBytes > limitBytes) {
      return NextResponse.json(
        { error: "Your cloud storage is full.", code: "storage_full", usedBytes: usage.usedBytes, limitBytes },
        { status: 413 },
      );
    }
    const recordCount = Object.values(backupData).reduce(
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
      categories: backupCategories,
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
          data: backupData,
          sizeBytes,
          recordCount,
          categories: backupCategories,
          deviceId: (backupData.manifest as Record<string, unknown> | undefined)?.deviceId || null,
          deviceName: (backupData.manifest as Record<string, unknown> | undefined)?.deviceName || null,
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
      return NextResponse.json({ error: entCheck.error, requiredPlan: "basic" }, { status: 403 });
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
        deviceId: backup.deviceId || null,
        deviceName: backup.deviceName || null,
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
