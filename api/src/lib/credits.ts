/**
 * credits.ts — Central credit calculation module
 *
 * DYNAMIC PLAN ENTITLEMENTS
 *
 * Plan credit allocations are dynamic. Changing a plan's credit value
 * in plan_config immediately affects ALL users on that plan.
 *
 * Example: Basic plan credits changed from 50 → 1000
 *   - All Basic users instantly gain +950 remaining credits
 *   - No migration jobs needed
 *   - No redeployment needed
 *
 * This is intentional: plan_config is the single source of truth.
 *
 * Formula:
 *   remainingCredits = planAllocation + adminGranted − totalConsumed
 *
 * Where:
 *   planAllocation = planConfig.plans[effectivePlan].credits
 *   adminGranted   = SUM(amount) WHERE type = "admin_grant"
 *   totalConsumed  = SUM(ABS(amount)) WHERE type = "usage"
 *   -1             = unlimited (skip all calculations)
 *
 * Admin bypass:
 *   Admins (role === "admin") immediately return unlimited.
 *   They never enter the credit system — no plan lookup, no aggregation.
 */

import clientPromise from "./mongodb";
import { getPlanConfig, insertCreditTransaction } from "./db";
import { getEffectivePlan, type EffectivePlan } from "./trial";
import { CreditTransactionType } from "@/types/schemas";
import type { ClientSession } from "mongodb";
import { getLocalDevPlanOverride } from "@/lib/localDevPlanOverride";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreditCalculationResult {
  /** Remaining credits. -1 = unlimited. */
  credits: number;
  /** Plan allocation from plan config. */
  planAllocation: number;
  /** Additional credits granted by admins or legacy migration. */
  adminGranted: number;
  /** Total credits consumed via usage transactions. */
  totalConsumed: number;
  /** Total available credits = planAllocation + adminGranted. */
  totalAvailable: number;
  /** The resolved effective plan tier. */
  effectivePlan: string;
  /** Whether the user is an admin. */
  isAdmin: boolean;
  /** Whether credits are unlimited (admin or plan with -1). */
  unlimited: boolean;
}

export interface CreditCheckResult {
  /** Whether the user has sufficient credits. */
  allowed: boolean;
  /** Remaining credits after this deduction. -1 = unlimited. */
  remaining: number;
  /** Whether credits are unlimited (admin or plan with -1). */
  unlimited: boolean;
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Calculate remaining credits for a user.
 *
 * Priority:
 *   1. Admin → unlimited (never enters credit system)
 *   2. Unlimited plan (-1) → unlimited (no aggregation needed)
 *   3. Normal → planAllocation + adminGranted − totalConsumed
 */
export async function calculateUserCredits(
  userId: string,
  mongoUser: any,
): Promise<CreditCalculationResult> {
  // 1. Admin bypass — immediate return, no system interaction
  // A local plan simulation intentionally bypasses the admin shortcut so the
  // selected Free/Basic/Growth allocation is visible during testing.
  const localDevPlan = getLocalDevPlanOverride(mongoUser?._id || userId);
  if (mongoUser?.role === "admin" && !localDevPlan) {
    return {
      credits: -1,
      planAllocation: -1,
      adminGranted: 0,
      totalConsumed: 0,
      totalAvailable: -1,
      effectivePlan: "admin",
      isAdmin: true,
      unlimited: true,
    };
  }

  // 2. Resolve effective plan
  const effectivePlan: EffectivePlan = getEffectivePlan(mongoUser);

  // 3. Get plan allocation from plan config
  const planConfig = await getPlanConfig();
  const tierConfig = planConfig.plans[effectivePlan] || planConfig.plans.free;
  const planAllocation = tierConfig.credits;

  // 4. Unlimited plan — skip aggregation
  if (planAllocation === -1) {
    return {
      credits: -1,
      planAllocation: -1,
      adminGranted: 0,
      totalConsumed: 0,
      totalAvailable: -1,
      effectivePlan,
      isAdmin: false,
      unlimited: true,
    };
  }

  // 5. Aggregate consumption and admin grants from transaction history (single pipeline)
  const client = await clientPromise;
  const db = client.db();

  const aggResults = await db
    .collection("credit_transactions")
    .aggregate([
      { $match: { userId } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ])
    .toArray();

  let totalConsumed = 0;
  let adminGranted = 0;
  let totalRevoked = 0;
  for (const doc of aggResults) {
    if (doc._id === CreditTransactionType.USAGE) {
      totalConsumed = Math.abs(doc.total);
    } else if (doc._id === CreditTransactionType.ADMIN_GRANT) {
      adminGranted += doc.total;
    } else if (doc._id === CreditTransactionType.REFUND) {
      // Refunds restore credits — count as additional grants
      adminGranted += Math.abs(doc.total);
    } else if (doc._id === CreditTransactionType.REVOCATION) {
      totalRevoked += Math.abs(doc.total);
    }
  }

  // 6. Calculate remaining credits
  const totalAvailable = planAllocation + adminGranted - totalRevoked;
  const remaining = Math.max(0, totalAvailable - totalConsumed);

  return {
    credits: remaining,
    planAllocation,
    adminGranted,
    totalConsumed,
    totalAvailable,
    effectivePlan,
    isAdmin: false,
    unlimited: false,
  };
}

/**
 * Check if a user has sufficient credits for a given amount.
 * Skips check entirely for admins and unlimited plans.
 */
export async function checkCredits(
  userId: string,
  mongoUser: any,
  required: number,
): Promise<CreditCheckResult> {
  const result = await calculateUserCredits(userId, mongoUser);

  // Admin or unlimited — always allowed
  if (result.unlimited || result.isAdmin) {
    return { allowed: true, remaining: -1, unlimited: true };
  }

  return {
    allowed: result.credits >= required,
    remaining: result.credits,
    unlimited: false,
  };
}

// ── Bulk Calculation ─────────────────────────────────────────────────────────

/**
 * Calculate credits for multiple users in one pass (2 queries total).
 * Returns a Map<userId, credits> where credits = -1 means unlimited.
 *
 * Used by the admin users list to avoid N+1 queries.
 */
export async function calculateBulkCredits(
  users: Array<{
    id: string;
    role?: string;
    plan?: string;
    trial?: any;
    ambassador?: any;
    adminTemporaryPlan?: any;
    adminManagedSubscription?: any;
    subscriptionExpiresAt?: string | null;
  }>,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // 1. Get plan config once
  const planConfig = await getPlanConfig();

  // 2. Bulk-aggregate all credit transactions in one pipeline
  const client = await clientPromise;
  const db = client.db();

  const aggResults = await db
    .collection("credit_transactions")
    .aggregate([
      {
        $group: {
          _id: { userId: "$userId", type: "$type" },
          total: { $sum: "$amount" },
        },
      },
    ])
    .toArray();

  // Index by userId → credit transaction rollups.
  const txMap = new Map<string, { consumed: number; granted: number; refunded: number; revoked: number }>();
  for (const doc of aggResults) {
    const uid = doc._id.userId;
    if (!txMap.has(uid)) txMap.set(uid, { consumed: 0, granted: 0, refunded: 0, revoked: 0 });
    const entry = txMap.get(uid)!;
    if (doc._id.type === CreditTransactionType.USAGE) {
      entry.consumed = Math.abs(doc.total);
    } else if (doc._id.type === CreditTransactionType.ADMIN_GRANT) {
      entry.granted = doc.total;
    } else if (doc._id.type === CreditTransactionType.REFUND) {
      entry.refunded = Math.abs(doc.total);
    } else if (doc._id.type === CreditTransactionType.REVOCATION) {
      entry.revoked = Math.abs(doc.total);
    }
  }

  // 3. Calculate per-user credits
  for (const user of users) {
    // Admin bypass
    if (user.role === "admin") {
      result.set(user.id, -1);
      continue;
    }

    // Resolve effective plan
    const effectivePlan = getEffectivePlan(user);
    const tierConfig = planConfig.plans[effectivePlan] || planConfig.plans.free;
    const planAllocation = tierConfig.credits;

    // Unlimited plan
    if (planAllocation === -1) {
      result.set(user.id, -1);
      continue;
    }

    const tx = txMap.get(user.id) || { consumed: 0, granted: 0, refunded: 0, revoked: 0 };
    const remaining = Math.max(0, planAllocation + tx.granted + tx.refunded - tx.revoked - tx.consumed);
    result.set(user.id, remaining);
  }

  return result;
}

// ── Aggregation Helpers ──────────────────────────────────────────────────────

/**
 * Sum of ABS(amount) for all "usage" type transactions.
 * This represents total credits consumed by the user.
 */
export async function getTotalCreditsConsumed(
  userId: string,
  session?: ClientSession,
): Promise<number> {
  const client = await clientPromise;
  const db = client.db();

  const pipeline = [
    { $match: { userId, type: CreditTransactionType.USAGE } },
    { $group: { _id: null, total: { $sum: { $abs: "$amount" } } } },
  ];

  const opts: any = {};
  if (session) opts.session = session;

  const results = await db
    .collection("credit_transactions")
    .aggregate(pipeline, opts)
    .toArray();

  return results[0]?.total ?? 0;
}

/**
 * Sum of amount for all "admin_grant" type transactions.
 * This represents additional credits granted to the user by admins.
 */
export async function getTotalAdminGranted(
  userId: string,
  session?: ClientSession,
): Promise<number> {
  const client = await clientPromise;
  const db = client.db();

  const pipeline = [
    { $match: { userId, type: CreditTransactionType.ADMIN_GRANT } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ];

  const opts: any = {};
  if (session) opts.session = session;

  const results = await db
    .collection("credit_transactions")
    .aggregate(pipeline, opts)
    .toArray();

  return results[0]?.total ?? 0;
}

// ── Lazy Migration ──────────────────────────────────────────────────────────

/**
 * Migrate a user's legacy `credits` field into an admin_grant transaction.
 *
 * Called lazily on first API call after deployment. Safe to run multiple times —
 * short-circuits if:
 *   - user has no `credits` field (already migrated or new user)
 *   - user already has an admin_grant transaction (already migrated)
 *
 * After migration, removes the `credits` field from the user document.
 * This ensures the dynamic formula (plan + grants − usage) produces the
 * correct balance going forward.
 */
export async function migrateLegacyCredits(mongoUser: any): Promise<void> {
  try {
    const userId = mongoUser?._id?.toString();
    if (!userId) return;

    // Skip if no legacy credits field
    if (typeof mongoUser.credits !== "number") return;

    const client = await clientPromise;
    const db = client.db();

    // Skip if already migrated (has any admin_grant transaction)
    const existingGrant = await db
      .collection("credit_transactions")
      .findOne({ userId, type: CreditTransactionType.ADMIN_GRANT });

    if (existingGrant) return;

    const legacyCredits = mongoUser.credits;

    // Insert admin_grant transaction to preserve the legacy balance
    if (legacyCredits > 0) {
      await insertCreditTransaction({
        userId,
        type: CreditTransactionType.ADMIN_GRANT,
        source: "admin_adjustment",
        amount: legacyCredits,
        description: `Migration: converted ${legacyCredits} legacy credits`,
        metadata: {
          createdBy: "migration",
          reason: "Legacy credits field migration to transaction-based system",
        },
        createdAt: new Date().toISOString(),
      });
    }

    // Remove the legacy field so this check short-circuits on future calls
    await db.collection("users").updateOne(
      { _id: mongoUser._id },
      { $unset: { credits: "" } }
    );
  } catch (error) {
    // Non-fatal — migration will retry on next request
    console.error("Legacy credits migration error:", error);
  }
}
