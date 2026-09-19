/**
 * Ambassador expiration check.
 *
 * Called during user profile fetch and by the daily cron to auto-expire
 * ambassador access when the expiration date has passed. Reverts the user
 * to their previous plan, revokes ambassador credits, and disables the
 * ambassador badge.
 */

import clientPromise from "./mongodb";
import { logAuditEvent } from "./auditLog";
import { insertCreditTransaction, getPlanConfig, upsertSubscription } from "./db";
import { getPlatformSettings } from "./platformSettings";
import type { PlanTier } from "@/types/schemas";

/**
 * Check if a user's ambassador access has expired and handle expiration.
 * Returns the (potentially updated) user document.
 *
 * This is idempotent — calling it multiple times is safe.
 */
export async function checkAndExpireAmbassador(
  userId: string,
  user: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const ambassador = user.ambassador as Record<string, unknown> | null | undefined;

  // No ambassador access or already inactive — nothing to do
  if (!ambassador || !ambassador.active) return user;

  const expiresAt = ambassador.expiresAt;
  if (!expiresAt) return user;

  const expiryDate = new Date(String(expiresAt));
  if (isNaN(expiryDate.getTime()) || expiryDate.getTime() > Date.now()) {
    return user; // Not yet expired
  }

  // Ambassador has expired — full cleanup
  const previousPlan = (ambassador.previousPlan as PlanTier) || "free";
  const creditsGranted = (ambassador.creditsGranted as number) || 0;

  try {
    const { ObjectId } = await import("mongodb");
    const client = await clientPromise;
    const db = client.db();

    // Get free plan credits from platform settings
    const platformSettings = await getPlatformSettings();
    const freeCredits = platformSettings.credits.freePlanCredits;

    // Get current credits to calculate what to revoke
    const currentUser = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    const currentCredits = (currentUser?.credits as number) ?? freeCredits;

    // Revoke: remove ambassador credits, restore to free plan level
    // Cap at freeCredits so we don't go below the free tier allocation
    const newCredits = Math.max(freeCredits, currentCredits - creditsGranted);

    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          plan: previousPlan,
          credits: newCredits,
          "ambassador.active": false,
        },
      },
    );

    // Sync subscription collection to keep plan consistent
    const expirationStatus = previousPlan === "free" ? "cancelled" : "active";
    await upsertSubscription(userId, { plan: previousPlan, status: expirationStatus });

    // Record credit transaction for revoked ambassador credits
    if (creditsGranted > 0) {
      await insertCreditTransaction({
        userId,
        type: "revocation",
        source: "ambassador_expired",
        amount: -creditsGranted,
        balanceAfter: newCredits,
        description: "Ambassador Access Expired — Credits Revoked",
        metadata: {
          previousCredits: currentCredits,
          creditsGranted,
          previousPlan,
          restoredPlan: previousPlan,
        },
        createdAt: new Date().toISOString(),
      }).catch(() => { });
    }

    // Log the automatic expiration
    await logAuditEvent({
      adminId: "system",
      action: "ambassador_expired",
      targetUserId: userId,
      details: {
        previousPlan,
        restoredPlan: previousPlan,
        expiresAt: String(expiresAt),
        creditsGranted,
        creditsRevoked: creditsGranted,
        creditsBefore: currentCredits,
        creditsAfter: newCredits,
      },
      timestamp: new Date(),
    });

    // Return updated user object
    return {
      ...user,
      plan: previousPlan,
      credits: newCredits,
      ambassador: {
        ...ambassador,
        active: false,
      },
    };
  } catch (err) {
    console.error("[AmbassadorExpiration] Failed to expire ambassador:", err);
    return user;
  }
}

/**
 * Find and expire ALL ambassadors whose access has passed the expiry date.
 * Intended for the daily cron job. Returns a summary of processed users.
 */
export async function checkAllExpiredAmbassadors(): Promise<{
  processed: number;
  expired: number;
  errors: number;
}> {
  const client = await clientPromise;
  const db = client.db();

  const now = new Date().toISOString();
  const expiredUsers = await db
    .collection("users")
    .find({
      "ambassador.active": true,
      "ambassador.expiresAt": { $lte: now },
    })
    .toArray();

  let expired = 0;
  let errors = 0;

  for (const user of expiredUsers) {
    try {
      const result = await checkAndExpireAmbassador(
        user._id.toString(),
        user as unknown as Record<string, unknown>,
      );
      if (!(result.ambassador as Record<string, unknown>)?.active) {
        expired++;
      }
    } catch {
      errors++;
    }
  }

  return { processed: expiredUsers.length, expired, errors };
}
