import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getPlanConfig, getSyncJobs } from "@/lib/db";
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

// GET /api/cloud-sync/status — Get sync job history and backup status
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

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Get latest backup info
    const client = await (await import("@/lib/mongodb")).default;
    const db = (await client).db();
    const backup = await db.collection("cloud_backups").findOne(
      { userId },
      { projection: { data: 0 } }
    );

    // Get recent sync jobs
    const jobs = await getSyncJobs(userId, { limit });

    return NextResponse.json({
      backup: backup
        ? {
          exists: true,
          sizeBytes: backup.sizeBytes,
          recordCount: backup.recordCount,
          categories: backup.categories,
          updatedAt: backup.updatedAt,
        }
        : { exists: false },
      jobs: jobs.map((j) => ({
        _id: j._id?.toString(),
        type: j.type,
        status: j.status,
        sizeBytes: j.sizeBytes,
        recordCount: j.recordCount,
        categories: j.categories,
        error: j.error,
        createdAt: j.createdAt,
        completedAt: j.completedAt,
      })),
    });
  } catch (error) {
    console.error("[cloud-sync/status] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
