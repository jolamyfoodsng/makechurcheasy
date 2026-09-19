import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { getPlanConfig, insertCreditTransaction } from "@/lib/db";
import { getEffectivePlan } from "@/lib/trial";
import { CreditTransactionType } from "@/types/schemas";

/**
 * POST /api/admin/fix-free-credits
 *
 * Finds users whose effective plan is "free" (including trial-expired)
 * and whose totalAvailable exceeds the free plan allocation. Offsets the
 * excess by recording a negative admin_grant transaction so calculated
 * credits match the free plan cap.
 *
 * Safe to run multiple times — skips users already within bounds.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const client = await clientPromise;
    const db = client.db();
    const planConfig = await getPlanConfig();
    const freeAllocation = planConfig.plans.free?.credits;
    if (freeAllocation === undefined || freeAllocation === null) {
      return NextResponse.json({ error: "Free plan not configured" }, { status: 500 });
    }

    const allUsers = await db
      .collection("users")
      .find({}, { projection: { _id: 1, role: 1, plan: 1, trial: 1, ambassador: 1, adminTemporaryPlan: 1, adminManagedSubscription: 1, subscriptionExpiresAt: 1 } })
      .toArray();

    let fixed = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const user of allUsers) {
      try {
        const userId = user._id.toString();
        const effectivePlan = getEffectivePlan(user as any);

        if (effectivePlan !== "free") {
          skipped++;
          continue;
        }

        // Calculate totalAvailable for this user
        const agg = await db
          .collection("credit_transactions")
          .aggregate([
            { $match: { userId } },
            { $group: { _id: "$type", total: { $sum: "$amount" } } },
          ])
          .toArray();

        let adminGranted = 0;
        let totalConsumed = 0;
        for (const doc of agg) {
          if (doc._id === CreditTransactionType.USAGE) {
            totalConsumed = Math.abs(doc.total);
          } else if (doc._id === CreditTransactionType.ADMIN_GRANT) {
            adminGranted += doc.total;
          } else if (doc._id === CreditTransactionType.REFUND) {
            adminGranted += Math.abs(doc.total);
          }
        }

        const totalAvailable = freeAllocation + adminGranted;
        const excess = totalAvailable - freeAllocation;

        if (excess <= 0) {
          skipped++;
          continue;
        }

        // Offset the excess with a negative admin_grant transaction
        await insertCreditTransaction({
          userId,
          type: CreditTransactionType.ADMIN_GRANT,
          source: "admin_adjustment",
          amount: -excess,
          description: `Free plan cap: offset ${excess} excess credits`,
          metadata: {
            createdBy: auth.adminUserId,
            reason: `Batch fix: free plan user had ${totalAvailable} available, capped at ${freeAllocation}`,
          },
          createdAt: new Date().toISOString(),
        });

        fixed++;
      } catch (err) {
        errors.push(`${user._id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      message: `Fixed ${fixed} users, skipped ${skipped}, ${errors.length} errors`,
      fixed,
      skipped,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error("Fix free credits error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
