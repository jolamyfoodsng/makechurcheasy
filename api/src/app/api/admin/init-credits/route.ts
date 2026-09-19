import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { insertCreditTransaction } from "@/lib/db";
import { CreditTransactionType } from "@/types/schemas";

/**
 * POST /api/admin/init-credits
 *
 * One-time migration: converts the legacy user.credits field into
 * admin_grant transactions so the new dynamic credit system can
 * calculate balances from transaction history.
 *
 * After migration, users' balances are recalculated from:
 *   planConfig.plans[effectivePlan].credits + adminGranted − totalConsumed
 *
 * Safe to run multiple times — only processes users who have a credits
 * field and no existing admin_grant transaction.
 *
 * Auth: Admin only.
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const client = await clientPromise;
    const db = client.db();

    // Find users with legacy credits field
    const usersWithCredits = await db
      .collection("users")
      .find({ credits: { $exists: true, $ne: null } })
      .toArray();

    let migratedCount = 0;
    let skippedCount = 0;

    for (const user of usersWithCredits) {
      const userId = user._id.toString();
      const legacyCredits = user.credits;

      if (typeof legacyCredits !== "number" || legacyCredits <= 0) {
        skippedCount++;
        continue;
      }

      // Check if already migrated (has any admin_grant transaction)
      const existingGrant = await db
        .collection("credit_transactions")
        .findOne({ userId, type: CreditTransactionType.ADMIN_GRANT });

      if (existingGrant) {
        skippedCount++;
        continue;
      }

      // Insert admin_grant transaction to preserve legacy balance
      await insertCreditTransaction({
        userId,
        type: CreditTransactionType.ADMIN_GRANT,
        source: "admin_adjustment",
        amount: legacyCredits,
        description: `Migration: converted ${legacyCredits} legacy credits`,
        metadata: {
          createdBy: "migration",
          reason: `Legacy credits migration from user.credits field`,
        },
        createdAt: new Date().toISOString(),
      });

      migratedCount++;
    }

    return NextResponse.json({
      message: `Migration complete: ${migratedCount} users migrated, ${skippedCount} skipped`,
      migratedCount,
      skippedCount,
    });
  } catch (error) {
    console.error("Init credits migration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
