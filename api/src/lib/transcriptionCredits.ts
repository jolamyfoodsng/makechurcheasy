import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import { getSubscription } from "./db";
import { getEffectivePlan, type EffectivePlan } from "./trial";
import { getLocalDevPlanOverride } from "./localDevPlanOverride";
import { getUsdExchangeRate } from "./exchangeRates";

// ── Constants & Conversions ──────────────────────────────────────────────────

export const SECONDS_PER_CREDIT = 60;
export const CREDITS_PER_HOUR = 60;
export const SECONDS_PER_HOUR = 3600;

/** Default monthly included allowances in seconds */
export const PLAN_INCLUDED_SECONDS: Record<string, number> = {
  basic: 12 * SECONDS_PER_HOUR,   // 12 hours = 720 credits = 43,200 seconds
  growth: 30 * SECONDS_PER_HOUR,  // 30 hours = 1,800 credits = 108,000 seconds
  ambassador: 30 * SECONDS_PER_HOUR, // 30 hours = 1,800 credits = 108,000 seconds
  trial: 5 * SECONDS_PER_HOUR,    // 5 hours = 300 credits = 18,000 seconds
  free: 0,                        // Free tier has 0 included monthly hours
};

/** Default provider and profit configuration */
export const DEFAULT_PROVIDER_COST_USD_PER_HOUR = 0.027; // DeepInfra cost
export const DEFAULT_PROFIT_NGN_PER_HOUR = 40;            // Configurable profit margin per hour

export async function getProviderCostUsdPerHour(): Promise<number> {
  try {
    const { getPlatformSettings } = await import("./platformSettings");
    const settings = await getPlatformSettings();
    if (
      typeof settings?.transcriptionPricing?.providerCostPerHourUSD === "number" &&
      settings.transcriptionPricing.providerCostPerHourUSD > 0
    ) {
      return settings.transcriptionPricing.providerCostPerHourUSD;
    }
  } catch {
    // fallback
  }
  const envVal = Number(process.env.TRANSCRIPTION_PROVIDER_COST_USD_PER_HOUR);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : DEFAULT_PROVIDER_COST_USD_PER_HOUR;
}

export async function getProfitNgnPerHour(): Promise<number> {
  try {
    const { getPlatformSettings } = await import("./platformSettings");
    const settings = await getPlatformSettings();
    if (
      typeof settings?.transcriptionPricing?.profitPerHourNGN === "number" &&
      settings.transcriptionPricing.profitPerHourNGN >= 0
    ) {
      return settings.transcriptionPricing.profitPerHourNGN;
    }
  } catch {
    // fallback
  }
  const envVal = Number(process.env.TRANSCRIPTION_PROFIT_NGN_PER_HOUR);
  return Number.isFinite(envVal) && envVal >= 0 ? envVal : DEFAULT_PROFIT_NGN_PER_HOUR;
}

export async function getPlanIncludedSeconds(plan = "free"): Promise<number> {
  const normPlan = (plan || "free").toLowerCase().trim();
  try {
    const { getPlatformSettings } = await import("./platformSettings");
    const settings = await getPlatformSettings();
    const planHours = settings?.transcriptionPricing?.planIncludedHours as Record<string, number> | undefined;
    if (planHours && typeof planHours[normPlan] === "number" && planHours[normPlan] >= 0) {
      return Math.round(planHours[normPlan] * SECONDS_PER_HOUR);
    }
  } catch {
    // fallback
  }
  return PLAN_INCLUDED_SECONDS[normPlan] ?? 0;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TranscriptionBalance {
  _id?: ObjectId;
  userId: string;
  includedSeconds: number;
  purchasedSeconds: number;
  lastResetAt: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptionBalanceSummary {
  userId: string;
  includedSeconds: number;
  purchasedSeconds: number;
  totalAvailableSeconds: number;
  includedCredits: number;
  purchasedCredits: number;
  totalAvailableCredits: number;
  includedHours: number;
  purchasedHours: number;
  totalAvailableHours: number;
  effectivePlan: string;
  isAdmin: boolean;
  unlimited: boolean;
  lastResetAt: string;
  nextResetAt?: string | null;
  formattedRemaining: string;
}

export interface TranscriptionTransaction {
  _id?: ObjectId;
  userId: string;
  type: "plan_allocation" | "credit_purchase" | "transcription_usage" | "refund" | "adjustment";
  source: "included" | "purchased" | "split" | "admin";
  seconds: number; // negative for usage, positive for topups/allocations
  credits: number;
  includedSecondsDeducted: number;
  purchasedSecondsDeducted: number;
  balanceAfter: {
    includedSeconds: number;
    purchasedSeconds: number;
    totalAvailableSeconds: number;
    totalAvailableCredits: number;
  };
  requestId?: string;
  amountPaid?: number;
  currency?: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface TopupPackage {
  id: string;
  hours: number;
  credits: number;
  seconds: number;
  price: number;
  currency: string;
  pricePerHour: number;
  pricePerCredit: number;
  badge?: string;
  description: string;
}

export interface TopupPricingResult {
  currency: string;
  usdRate: number;
  providerCostPerHourUSD: number;
  profitPerHourNGN: number;
  sellingPricePerHour: number;
  packages: TopupPackage[];
}

export interface TranscriptionAccessCheckResult {
  allowed: boolean;
  reason?: "TRANSCRIPTION_CREDITS_EXHAUSTED" | "SUBSCRIPTION_REQUIRED" | "ACCOUNT_SUSPENDED";
  unlimited: boolean;
  isAdmin: boolean;
  balance: TranscriptionBalanceSummary;
}

export interface TranscriptionDeductionResult {
  success: boolean;
  duplicate?: boolean;
  deductedSeconds: number;
  deductedCredits: number;
  source: "included" | "purchased" | "split" | "admin";
  balance: TranscriptionBalanceSummary;
  requestId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function secondsToCredits(seconds: number): number {
  return Math.round((seconds / SECONDS_PER_CREDIT) * 1000) / 1000;
}

export function creditsToSeconds(credits: number): number {
  return Math.round(credits * SECONDS_PER_CREDIT);
}

export function secondsToHours(seconds: number): number {
  return Math.round((seconds / SECONDS_PER_HOUR) * 100) / 100;
}

export function formatDurationSummary(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0 min";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

// ── Core Service Functions ───────────────────────────────────────────────────

/**
 * Calculates next monthly reset date (30 days from last reset or end of subscription period).
 */
function calculateNextReset(lastResetIso: string, subscription?: any): string {
  if (subscription?.currentPeriodEnd) {
    const end = new Date(subscription.currentPeriodEnd);
    if (!isNaN(end.getTime()) && end.getTime() > Date.now()) {
      return end.toISOString();
    }
  }
  const last = new Date(lastResetIso);
  const next = new Date(last);
  next.setDate(next.getDate() + 30);
  return next.toISOString();
}

/**
 * Fetches or initializes a user's transcription balance.
 * Automatically checks for monthly billing renewal and resets includedSeconds
 * while preserving purchasedSeconds.
 */
export async function getOrCreateTranscriptionBalance(
  userId: string,
  mongoUser?: any,
): Promise<TranscriptionBalance> {
  const client = await clientPromise;
  const db = client.db();

  let user = mongoUser;
  if (!user) {
    try {
      user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    } catch {
      user = await db.collection("users").findOne({ _id: userId as any });
    }
  }

  const isAmbassador = Boolean(user?.ambassador?.active);
  const effectivePlan: EffectivePlan = getEffectivePlan(user);
  const planKey = isAmbassador ? "ambassador" : effectivePlan;
  const allowedIncluded = await getPlanIncludedSeconds(planKey);
  const now = new Date();
  const nowIso = now.toISOString();

  let balanceDoc = await db.collection<TranscriptionBalance>("transcription_balances").findOne({ userId });

  if (!balanceDoc) {
    // Initialize new balance
    const newDoc: TranscriptionBalance = {
      userId,
      includedSeconds: allowedIncluded,
      purchasedSeconds: 0,
      lastResetAt: nowIso,
      plan: planKey,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await db.collection("transcription_balances").insertOne(newDoc as any);

    if (allowedIncluded > 0) {
      await db.collection("transcription_transactions").insertOne({
        userId,
        type: "plan_allocation",
        source: "included",
        seconds: allowedIncluded,
        credits: secondsToCredits(allowedIncluded),
        includedSecondsDeducted: 0,
        purchasedSecondsDeducted: 0,
        balanceAfter: {
          includedSeconds: allowedIncluded,
          purchasedSeconds: 0,
          totalAvailableSeconds: allowedIncluded,
          totalAvailableCredits: secondsToCredits(allowedIncluded),
        },
        description: `Initial ${planKey} plan allowance: ${secondsToHours(allowedIncluded)}h (${secondsToCredits(allowedIncluded)} credits)`,
        createdAt: nowIso,
      });
    }

    return newDoc;
  }

  // Check if monthly cycle reset is due:
  // 1) Plan changed, or
  // 2) Last reset was > 30 days ago and subscription is active, or
  // 3) Subscription currentPeriodStart is more recent than lastResetAt
  const subscription = await getSubscription(userId);
  let shouldResetIncluded = false;
  let resetReason = "";

  if (balanceDoc.plan !== planKey) {
    shouldResetIncluded = true;
    resetReason = `Plan changed from ${balanceDoc.plan} to ${planKey}`;
  } else if (subscription?.status === "active" && subscription.currentPeriodStart) {
    const periodStart = new Date(subscription.currentPeriodStart).getTime();
    const lastReset = new Date(balanceDoc.lastResetAt).getTime();
    if (periodStart > lastReset) {
      shouldResetIncluded = true;
      resetReason = `Monthly subscription renewal (${planKey})`;
    }
  } else {
    const lastReset = new Date(balanceDoc.lastResetAt).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (now.getTime() - lastReset >= thirtyDaysMs && allowedIncluded > 0) {
      shouldResetIncluded = true;
      resetReason = `Monthly allowance cycle renewal (${planKey})`;
    }
  }

  if (shouldResetIncluded) {
    const updatedIncluded = allowedIncluded;
    await db.collection("transcription_balances").updateOne(
      { userId },
      {
        $set: {
          includedSeconds: updatedIncluded,
          plan: planKey,
          lastResetAt: nowIso,
          updatedAt: nowIso,
        },
      }
    );

    const totalSeconds = updatedIncluded + balanceDoc.purchasedSeconds;

    await db.collection("transcription_transactions").insertOne({
      userId,
      type: "plan_allocation",
      source: "included",
      seconds: updatedIncluded,
      credits: secondsToCredits(updatedIncluded),
      includedSecondsDeducted: 0,
      purchasedSecondsDeducted: 0,
      balanceAfter: {
        includedSeconds: updatedIncluded,
        purchasedSeconds: balanceDoc.purchasedSeconds,
        totalAvailableSeconds: totalSeconds,
        totalAvailableCredits: secondsToCredits(totalSeconds),
      },
      description: `Reset monthly plan allowance: ${secondsToHours(updatedIncluded)}h (${resetReason})`,
      createdAt: nowIso,
    });

    balanceDoc.includedSeconds = updatedIncluded;
    balanceDoc.plan = effectivePlan;
    balanceDoc.lastResetAt = nowIso;
    balanceDoc.updatedAt = nowIso;
  }

  return balanceDoc;
}

/**
 * Returns a human-friendly summary of the user's balances.
 */
export async function getTranscriptionBalanceSummary(
  userId: string,
  mongoUser?: any,
): Promise<TranscriptionBalanceSummary> {
  const client = await clientPromise;
  const db = client.db();

  let user = mongoUser;
  if (!user) {
    try {
      user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    } catch {
      user = await db.collection("users").findOne({ _id: userId as any });
    }
  }

  const localDevPlan = getLocalDevPlanOverride(user?._id || userId);
  const isAdmin = user?.role === "admin" && !localDevPlan;
  const effectivePlan: EffectivePlan = getEffectivePlan(user);
  const isAmbassador = Boolean(user?.ambassador?.active);
  const displayPlan = isAmbassador ? "ambassador" : effectivePlan;

  const balanceDoc = await getOrCreateTranscriptionBalance(userId, user);
  const subscription = await getSubscription(userId);

  const includedSeconds = Math.max(0, balanceDoc.includedSeconds || 0);
  const purchasedSeconds = Math.max(0, balanceDoc.purchasedSeconds || 0);
  const totalAvailableSeconds = isAdmin ? -1 : includedSeconds + purchasedSeconds;
  const totalAvailableCredits = isAdmin ? -1 : secondsToCredits(totalAvailableSeconds);

  const nextResetAt = calculateNextReset(balanceDoc.lastResetAt, subscription);

  return {
    userId,
    includedSeconds,
    purchasedSeconds,
    totalAvailableSeconds,
    includedCredits: secondsToCredits(includedSeconds),
    purchasedCredits: secondsToCredits(purchasedSeconds),
    totalAvailableCredits,
    includedHours: secondsToHours(includedSeconds),
    purchasedHours: secondsToHours(purchasedSeconds),
    totalAvailableHours: isAdmin ? -1 : secondsToHours(totalAvailableSeconds),
    effectivePlan: displayPlan,
    isAdmin,
    unlimited: isAdmin,
    lastResetAt: balanceDoc.lastResetAt,
    nextResetAt,
    formattedRemaining: isAdmin ? "Unlimited" : formatDurationSummary(totalAvailableSeconds),
  };
}

/**
 * Pre-check to verify if the user has available transcription time (> 0).
 */
export async function checkTranscriptionAccess(
  userId: string,
  mongoUser?: any,
): Promise<TranscriptionAccessCheckResult> {
  const summary = await getTranscriptionBalanceSummary(userId, mongoUser);

  if (summary.unlimited || summary.isAdmin) {
    return {
      allowed: true,
      unlimited: true,
      isAdmin: summary.isAdmin,
      balance: summary,
    };
  }

  if (summary.totalAvailableSeconds <= 0) {
    return {
      allowed: false,
      reason: "TRANSCRIPTION_CREDITS_EXHAUSTED",
      unlimited: false,
      isAdmin: false,
      balance: summary,
    };
  }

  return {
    allowed: true,
    unlimited: false,
    isAdmin: false,
    balance: summary,
  };
}

/**
 * Deducts audio usage in exact seconds with strict priority and idempotency:
 * Priority:
 *   1. Deduct from includedSeconds first.
 *   2. Once includedSeconds is exhausted, deduct from purchasedSeconds.
 * Idempotency:
 *   If requestId is provided and has already been processed, returns the previous result.
 */
export async function deductTranscriptionSeconds(params: {
  userId: string;
  seconds: number;
  requestId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  mongoUser?: any;
}): Promise<TranscriptionDeductionResult> {
  const { userId, seconds: rawSeconds, requestId, description, metadata, mongoUser } = params;
  const secondsToDeduct = Math.max(0, Math.round(rawSeconds));

  if (secondsToDeduct <= 0) {
    const currentBalance = await getTranscriptionBalanceSummary(userId, mongoUser);
    return {
      success: true,
      deductedSeconds: 0,
      deductedCredits: 0,
      source: "included",
      balance: currentBalance,
      requestId,
    };
  }

  const client = await clientPromise;
  const db = client.db();

  // 1. Check idempotency if requestId provided
  if (requestId) {
    const existingTx = await db.collection<TranscriptionTransaction>("transcription_transactions").findOne({
      userId,
      requestId,
      type: "transcription_usage",
    });

    if (existingTx) {
      const currentBalance = await getTranscriptionBalanceSummary(userId, mongoUser);
      return {
        success: true,
        duplicate: true,
        deductedSeconds: Math.abs(existingTx.seconds),
        deductedCredits: Math.abs(existingTx.credits),
        source: existingTx.source,
        balance: currentBalance,
        requestId,
      };
    }
  }

  // 2. Check admin bypass
  let user = mongoUser;
  if (!user) {
    try {
      user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    } catch {
      user = await db.collection("users").findOne({ _id: userId as any });
    }
  }
  const localDevPlan = getLocalDevPlanOverride(user?._id || userId);
  const isAdmin = user?.role === "admin" && !localDevPlan;
  const effectivePlan = getEffectivePlan(user);

  if (isAdmin) {
    const balance = await getTranscriptionBalanceSummary(userId, user);
    if (requestId) {
      await db.collection("transcription_transactions").insertOne({
        userId,
        type: "transcription_usage",
        source: "admin",
        seconds: -secondsToDeduct,
        credits: -secondsToCredits(secondsToDeduct),
        includedSecondsDeducted: 0,
        purchasedSecondsDeducted: 0,
        balanceAfter: {
          includedSeconds: balance.includedSeconds,
          purchasedSeconds: balance.purchasedSeconds,
          totalAvailableSeconds: -1,
          totalAvailableCredits: -1,
        },
        requestId,
        description: description || `Admin audio transcription: ${secondsToDeduct}s`,
        metadata: metadata || {},
        createdAt: new Date().toISOString(),
      });
    }
    return {
      success: true,
      deductedSeconds: secondsToDeduct,
      deductedCredits: secondsToCredits(secondsToDeduct),
      source: "admin",
      balance,
      requestId,
    };
  }

  // Free users use the admin-controlled Speech to Scripture quota instead of
  // the paid transcription balance. Keep an exact-second ledger entry so the
  // quota is shared by direct and legacy deduction routes.
  if (effectivePlan === "free") {
    const balance = await getTranscriptionBalanceSummary(userId, user);
    const nowIso = new Date().toISOString();
    await db.collection("transcription_transactions").insertOne({
      userId,
      type: "transcription_usage",
      source: "included",
      seconds: -secondsToDeduct,
      credits: -secondsToCredits(secondsToDeduct),
      includedSecondsDeducted: 0,
      purchasedSecondsDeducted: 0,
      balanceAfter: {
        includedSeconds: balance.includedSeconds,
        purchasedSeconds: balance.purchasedSeconds,
        totalAvailableSeconds: balance.totalAvailableSeconds,
        totalAvailableCredits: balance.totalAvailableCredits,
      },
      requestId,
      description: description || `Free Speech to Scripture: ${secondsToDeduct}s`,
      metadata: metadata || {},
      createdAt: nowIso,
    });
    return {
      success: true,
      deductedSeconds: secondsToDeduct,
      deductedCredits: secondsToCredits(secondsToDeduct),
      source: "included",
      balance,
      requestId,
    };
  }

  // 3. Atomically check and deduct from balance
  // Fetch current balance
  const balanceDoc = await getOrCreateTranscriptionBalance(userId, user);
  const availableIncluded = Math.max(0, balanceDoc.includedSeconds);
  const availablePurchased = Math.max(0, balanceDoc.purchasedSeconds);
  const totalAvailable = availableIncluded + availablePurchased;

  if (totalAvailable < secondsToDeduct) {
    const currentBalance = await getTranscriptionBalanceSummary(userId, user);
    return {
      success: false,
      deductedSeconds: 0,
      deductedCredits: 0,
      source: "included",
      balance: currentBalance,
      requestId,
    };
  }

  // Calculate split
  const deductFromIncluded = Math.min(availableIncluded, secondsToDeduct);
  const remainingNeeded = secondsToDeduct - deductFromIncluded;
  const deductFromPurchased = Math.min(availablePurchased, remainingNeeded);

  const sourceKind: "included" | "purchased" | "split" =
    deductFromIncluded > 0 && deductFromPurchased > 0
      ? "split"
      : deductFromIncluded > 0
        ? "included"
        : "purchased";

  const nowIso = new Date().toISOString();

  // Atomic update with optimistic lock to prevent race conditions
  const updateResult = await db.collection("transcription_balances").updateOne(
    {
      userId,
      includedSeconds: { $gte: deductFromIncluded },
      purchasedSeconds: { $gte: deductFromPurchased },
    },
    {
      $inc: {
        includedSeconds: -deductFromIncluded,
        purchasedSeconds: -deductFromPurchased,
      },
      $set: {
        updatedAt: nowIso,
      },
    }
  );

  if (updateResult.modifiedCount === 0) {
    // Concurrent update conflict: retry once
    const retryDoc = await db.collection<TranscriptionBalance>("transcription_balances").findOne({ userId });
    if (!retryDoc || (retryDoc.includedSeconds + retryDoc.purchasedSeconds) < secondsToDeduct) {
      const currentBalance = await getTranscriptionBalanceSummary(userId, user);
      return {
        success: false,
        deductedSeconds: 0,
        deductedCredits: 0,
        source: sourceKind,
        balance: currentBalance,
        requestId,
      };
    }
    // Re-calculate on retry
    const retryIncluded = Math.min(Math.max(0, retryDoc.includedSeconds), secondsToDeduct);
    const retryPurchased = Math.min(Math.max(0, retryDoc.purchasedSeconds), secondsToDeduct - retryIncluded);
    await db.collection("transcription_balances").updateOne(
      { userId },
      {
        $inc: {
          includedSeconds: -retryIncluded,
          purchasedSeconds: -retryPurchased,
        },
        $set: { updatedAt: nowIso },
      }
    );
  }

  // 4. Record transaction in ledger
  const updatedDoc = await db.collection<TranscriptionBalance>("transcription_balances").findOne({ userId });
  const newIncluded = updatedDoc?.includedSeconds ?? (availableIncluded - deductFromIncluded);
  const newPurchased = updatedDoc?.purchasedSeconds ?? (availablePurchased - deductFromPurchased);
  const newTotal = newIncluded + newPurchased;

  await db.collection("transcription_transactions").insertOne({
    userId,
    type: "transcription_usage",
    source: sourceKind,
    seconds: -secondsToDeduct,
    credits: -secondsToCredits(secondsToDeduct),
    includedSecondsDeducted: deductFromIncluded,
    purchasedSecondsDeducted: deductFromPurchased,
    balanceAfter: {
      includedSeconds: newIncluded,
      purchasedSeconds: newPurchased,
      totalAvailableSeconds: newTotal,
      totalAvailableCredits: secondsToCredits(newTotal),
    },
    requestId,
    description: description || `Transcription audio: ${secondsToDeduct}s (${secondsToCredits(secondsToDeduct)} credits)`,
    metadata: metadata || {},
    createdAt: nowIso,
  });

  const updatedSummary = await getTranscriptionBalanceSummary(userId, user);

  return {
    success: true,
    deductedSeconds: secondsToDeduct,
    deductedCredits: secondsToCredits(secondsToDeduct),
    source: sourceKind,
    balance: updatedSummary,
    requestId,
  };
}

/**
 * Adds purchased seconds to the user's purchased balance (never resets with billing cycle).
 */
export async function addPurchasedTranscriptionSeconds(params: {
  userId: string;
  seconds: number;
  amountPaid: number;
  currency: string;
  reference?: string;
  packId?: string;
  description?: string;
}): Promise<TranscriptionBalanceSummary> {
  const { userId, seconds, amountPaid, currency, reference, packId, description } = params;
  const addedSeconds = Math.max(0, Math.round(seconds));

  const client = await clientPromise;
  const db = client.db();

  await getOrCreateTranscriptionBalance(userId);
  const nowIso = new Date().toISOString();

  await db.collection("transcription_balances").updateOne(
    { userId },
    {
      $inc: { purchasedSeconds: addedSeconds },
      $set: { updatedAt: nowIso },
    }
  );

  const updatedDoc = await db.collection<TranscriptionBalance>("transcription_balances").findOne({ userId });
  const included = updatedDoc?.includedSeconds ?? 0;
  const purchased = updatedDoc?.purchasedSeconds ?? addedSeconds;
  const total = included + purchased;

  await db.collection("transcription_transactions").insertOne({
    userId,
    type: "credit_purchase",
    source: "purchased",
    seconds: addedSeconds,
    credits: secondsToCredits(addedSeconds),
    includedSecondsDeducted: 0,
    purchasedSecondsDeducted: 0,
    balanceAfter: {
      includedSeconds: included,
      purchasedSeconds: purchased,
      totalAvailableSeconds: total,
      totalAvailableCredits: secondsToCredits(total),
    },
    amountPaid,
    currency,
    requestId: reference,
    description: description || `Top-up purchase: ${secondsToHours(addedSeconds)}h (${secondsToCredits(addedSeconds)} credits)`,
    metadata: {
      reference,
      packId,
      amountPaid,
      currency,
    },
    createdAt: nowIso,
  });

  return getTranscriptionBalanceSummary(userId);
}

/**
 * Admin adjustment function to increase, decrease, or set a user's transcription balance.
 * Directly records an audit transaction and syncs to legacy credit records.
 */
export async function adminAdjustTranscriptionBalance(params: {
  userId: string;
  amount: number;
  unit?: "hours" | "credits" | "seconds";
  action?: "increase" | "decrease" | "set";
  target?: "purchased" | "included" | "auto";
  adminId?: string;
  reason?: string;
}): Promise<{
  balance: TranscriptionBalanceSummary;
  adjustedSeconds: number;
  adjustedCredits: number;
  adjustedHours: number;
  action: "increase" | "decrease" | "set";
}> {
  const {
    userId,
    amount,
    unit = "credits",
    action = amount >= 0 ? "increase" : "decrease",
    target = "auto",
    adminId = "system",
    reason = "Admin balance adjustment",
  } = params;

  let seconds = 0;
  if (unit === "hours") {
    seconds = Math.round(Math.abs(amount) * SECONDS_PER_HOUR);
  } else if (unit === "credits") {
    seconds = Math.round(Math.abs(amount) * SECONDS_PER_CREDIT);
  } else {
    seconds = Math.round(Math.abs(amount));
  }

  const client = await clientPromise;
  const db = client.db();

  await getOrCreateTranscriptionBalance(userId);
  const currentDoc = await db.collection<TranscriptionBalance>("transcription_balances").findOne({ userId });
  const currentIncluded = currentDoc?.includedSeconds ?? 0;
  const currentPurchased = currentDoc?.purchasedSeconds ?? 0;
  const nowIso = new Date().toISOString();

  let newIncluded = currentIncluded;
  let newPurchased = currentPurchased;
  let effectiveDeltaSeconds = 0;

  if (action === "set") {
    // If setting, amount is target total seconds
    if (target === "included") {
      newIncluded = Math.max(0, seconds);
    } else if (target === "purchased") {
      newPurchased = Math.max(0, seconds);
    } else {
      newPurchased = Math.max(0, seconds);
    }
    effectiveDeltaSeconds = (newIncluded + newPurchased) - (currentIncluded + currentPurchased);
  } else if (action === "increase") {
    effectiveDeltaSeconds = seconds;
    if (target === "included") {
      newIncluded = currentIncluded + seconds;
    } else {
      // Default: add to purchased so it never expires!
      newPurchased = currentPurchased + seconds;
    }
  } else {
    // decrease
    effectiveDeltaSeconds = -seconds;
    if (target === "included") {
      newIncluded = Math.max(0, currentIncluded - seconds);
    } else if (target === "purchased") {
      newPurchased = Math.max(0, currentPurchased - seconds);
    } else {
      // auto: deduct from purchased first or included first
      let remainingToDeduct = seconds;
      if (currentPurchased >= remainingToDeduct) {
        newPurchased = currentPurchased - remainingToDeduct;
        remainingToDeduct = 0;
      } else {
        remainingToDeduct -= currentPurchased;
        newPurchased = 0;
        newIncluded = Math.max(0, currentIncluded - remainingToDeduct);
      }
    }
  }

  const newTotal = newIncluded + newPurchased;

  await db.collection("transcription_balances").updateOne(
    { userId },
    {
      $set: {
        includedSeconds: newIncluded,
        purchasedSeconds: newPurchased,
        updatedAt: nowIso,
      },
    }
  );

  // Record transcription transaction
  await db.collection("transcription_transactions").insertOne({
    userId,
    type: "adjustment",
    source: "admin",
    seconds: effectiveDeltaSeconds,
    credits: secondsToCredits(effectiveDeltaSeconds),
    includedSecondsDeducted: currentIncluded - newIncluded,
    purchasedSecondsDeducted: currentPurchased - newPurchased,
    balanceAfter: {
      includedSeconds: newIncluded,
      purchasedSeconds: newPurchased,
      totalAvailableSeconds: newTotal,
      totalAvailableCredits: secondsToCredits(newTotal),
    },
    description: reason || `Admin adjusted balance by ${secondsToHours(effectiveDeltaSeconds)}h (${action})`,
    metadata: {
      adminId,
      action,
      target,
      unit,
      requestedAmount: amount,
    },
    createdAt: nowIso,
  });

  // Also sync to legacy credit transactions so legacy views remain accurate
  const creditChange = secondsToCredits(effectiveDeltaSeconds);
  if (creditChange !== 0) {
    try {
      const { insertCreditTransaction } = await import("./db");
      const { CreditTransactionType } = await import("@/types/schemas");
      await insertCreditTransaction({
        userId,
        type: CreditTransactionType.ADMIN_GRANT,
        source: "admin_adjustment",
        amount: creditChange,
        description: reason || `Admin adjusted transcription balance (${action} ${Math.abs(creditChange)} credits)`,
        metadata: {
          adminId,
          action,
          target,
          hours: secondsToHours(effectiveDeltaSeconds),
        } as any,
        createdAt: nowIso,
      });
    } catch (e) {
      console.warn("[adminAdjustTranscriptionBalance] Legacy transaction sync failed:", e);
    }
  }

  const balance = await getTranscriptionBalanceSummary(userId);
  return {
    balance,
    adjustedSeconds: effectiveDeltaSeconds,
    adjustedCredits: secondsToCredits(effectiveDeltaSeconds),
    adjustedHours: secondsToHours(effectiveDeltaSeconds),
    action,
  };
}

/**
 * Resets a user's monthly included balance upon subscription renewal or plan upgrade.
 * Preserves purchasedSeconds completely.
 */
export async function resetMonthlyIncludedSeconds(
  userId: string,
  plan?: string,
  options?: { reason?: string }
): Promise<TranscriptionBalanceSummary> {
  const client = await clientPromise;
  const db = client.db();

  let targetPlan = plan;
  if (!targetPlan || targetPlan !== "ambassador") {
    try {
      const u =
        (await db.collection("users").findOne({ _id: new ObjectId(userId) })) ||
        (await db.collection("users").findOne({ _id: userId as any }));
      if (u?.ambassador?.active) {
        targetPlan = "ambassador";
      } else if (!targetPlan) {
        targetPlan = getEffectivePlan(u as any);
      }
    } catch {
      targetPlan = targetPlan || "free";
    }
  }

  const allowed = await getPlanIncludedSeconds(targetPlan);
  const nowIso = new Date().toISOString();

  await getOrCreateTranscriptionBalance(userId);

  await db.collection("transcription_balances").updateOne(
    { userId },
    {
      $set: {
        includedSeconds: allowed,
        plan: targetPlan,
        lastResetAt: nowIso,
        updatedAt: nowIso,
      },
    }
  );

  const updatedDoc = await db.collection<TranscriptionBalance>("transcription_balances").findOne({ userId });
  const purchased = updatedDoc?.purchasedSeconds ?? 0;
  const total = allowed + purchased;

  await db.collection("transcription_transactions").insertOne({
    userId,
    type: "plan_allocation",
    source: "included",
    seconds: allowed,
    credits: secondsToCredits(allowed),
    includedSecondsDeducted: 0,
    purchasedSecondsDeducted: 0,
    balanceAfter: {
      includedSeconds: allowed,
      purchasedSeconds: purchased,
      totalAvailableSeconds: total,
      totalAvailableCredits: secondsToCredits(total),
    },
    description: options?.reason || `Monthly plan allowance reset: ${secondsToHours(allowed)}h (${plan})`,
    createdAt: nowIso,
  });

  return getTranscriptionBalanceSummary(userId);
}

/**
 * Applies the current admin-configured allowance to every active user on the
 * selected plan. Purchased seconds are always preserved.
 */
export async function syncTranscriptionBalancesForPlans(
  plans: string[],
  reason = "Admin updated transcription plan allowance",
): Promise<{ matched: number; reset: number; failed: number }> {
  const requestedPlans = new Set(plans.map((plan) => plan.toLowerCase().trim()).filter(Boolean));
  if (requestedPlans.size === 0) return { matched: 0, reset: 0, failed: 0 };

  const client = await clientPromise;
  const db = client.db();
  const or: Record<string, unknown>[] = [];
  if (requestedPlans.has("ambassador")) or.push({ "ambassador.active": true });
  const regularPlans = [...requestedPlans].filter((plan) => plan !== "ambassador");
  if (regularPlans.length > 0) or.push({ plan: { $in: regularPlans } });

  const users = await db.collection("users").find({
    isActive: { $ne: false },
    $or: or,
  }, {
    projection: { _id: 1, plan: 1, ambassador: 1 },
  }).toArray();

  let reset = 0;
  let failed = 0;
  for (const user of users) {
    const targetPlan = user.ambassador?.active ? "ambassador" : getEffectivePlan(user as any);
    if (!requestedPlans.has(targetPlan)) continue;
    try {
      await resetMonthlyIncludedSeconds(user._id.toString(), targetPlan, { reason });
      reset += 1;
    } catch (error) {
      failed += 1;
      console.warn("[syncTranscriptionBalancesForPlans] Failed for user", user._id.toString(), error);
    }
  }

  return { matched: users.length, reset, failed };
}

// ── Dynamic Pricing Calculation ──────────────────────────────────────────────

/**
 * Computes dynamic top-up pricing based on:
 *   - DeepInfra provider cost: $0.027 per transcription hour (or admin configured)
 *   - Exchange rate: live USD to target currency (via getUsdExchangeRate)
 *   - Profit margin: ₦40 per hour (or admin configured)
 *
 * Formula:
 *   sellingPricePerHourNGN = (providerCostUSD * usdNgnRate) + profitNgn
 *   Rounded cleanly (ceil to nearest 10 or 50).
 */
export async function calculateTopupPricing(currencyCode = "NGN"): Promise<TopupPricingResult> {
  const targetCurrency = (currencyCode || "NGN").toUpperCase();
  const providerCostUSD = await getProviderCostUsdPerHour();
  const profitNGN = await getProfitNgnPerHour();

  const usdRate = await getUsdExchangeRate(targetCurrency) || (targetCurrency === "NGN" ? 1450 : 1);

  let sellingPricePerHour = 0;

  if (targetCurrency === "NGN") {
    const providerCostNGN = providerCostUSD * usdRate;
    const baseSellingPrice = providerCostNGN + profitNGN;
    // Round cleanly up to nearest 10
    sellingPricePerHour = Math.ceil(baseSellingPrice / 10) * 10;
  } else {
    // For USD or other international currencies
    const profitUSD = profitNGN / (await getUsdExchangeRate("NGN") || 1450);
    const basePrice = (providerCostUSD + profitUSD) * usdRate;
    // Round to 2 decimal places with a clean floor of at least $0.05
    sellingPricePerHour = Math.max(0.05, Math.ceil(basePrice * 100) / 100);
  }

  // Load configured packages or use defaults
  let tiers: Array<{
    id?: string;
    hours: number;
    badge?: string;
    description?: string;
    customPriceNGN?: number;
    customPriceUSD?: number;
  }> = [
    { id: "topup-1h", hours: 1, badge: undefined, description: "Quick top-up for a single service or practice run." },
    { id: "topup-5h", hours: 5, badge: undefined, description: "Ideal for a full weekend of Sunday services." },
    { id: "topup-10h", hours: 10, badge: "Popular", description: "Best for active ministries running multiple weekly meetings." },
    { id: "topup-20h", hours: 20, badge: undefined, description: "Extended coverage for monthly conferences and youth camps." },
    { id: "topup-50h", hours: 50, badge: "Best Value", description: "Maximum savings for large productions and multi-campus events." },
  ];

  try {
    const { getPlatformSettings } = await import("./platformSettings");
    const settings = await getPlatformSettings();
    if (Array.isArray(settings?.transcriptionPricing?.tierPackages) && settings.transcriptionPricing.tierPackages.length > 0) {
      tiers = settings.transcriptionPricing.tierPackages;
    }
  } catch {
    // fallback
  }

  const packages: TopupPackage[] = tiers.map((tier) => {
    let price = 0;
    if (targetCurrency === "NGN" && typeof tier.customPriceNGN === "number" && tier.customPriceNGN > 0) {
      price = tier.customPriceNGN;
    } else if (targetCurrency === "USD" && typeof tier.customPriceUSD === "number" && tier.customPriceUSD > 0) {
      price = tier.customPriceUSD;
    } else {
      const rawPrice = tier.hours * sellingPricePerHour;
      price = targetCurrency === "NGN" ? Math.ceil(rawPrice / 50) * 50 : Math.round(rawPrice * 100) / 100;
    }

    const credits = tier.hours * CREDITS_PER_HOUR;
    const seconds = tier.hours * SECONDS_PER_HOUR;

    return {
      id: tier.id || `topup-${tier.hours}h`,
      hours: tier.hours,
      credits,
      seconds,
      price,
      currency: targetCurrency,
      pricePerHour: sellingPricePerHour,
      pricePerCredit: Math.round((price / credits) * 100) / 100,
      badge: tier.badge || undefined,
      description: tier.description || `Top-up package for ${tier.hours} hours.`,
    };
  });

  return {
    currency: targetCurrency,
    usdRate,
    providerCostPerHourUSD: providerCostUSD,
    profitPerHourNGN: profitNGN,
    sellingPricePerHour,
    packages,
  };
}
