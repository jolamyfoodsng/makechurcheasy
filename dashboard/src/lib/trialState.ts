/**
 * trialState.ts — Derived subscription state helper.
 *
 * Every dashboard page MUST use getSubscriptionState() instead of
 * directly reading user.plan or planLabel. This single source of
 * truth computes whether a user is on a trial, their remaining
 * days, and what label to display everywhere.
 */

import { isActiveTrial as isCanonicalTrialActive, normalizePlanId } from "@/lib/subscriptionSourceOfTruth";

export interface TrialState {
  /** "trial" if active trial, "subscription" otherwise */
  type: "trial" | "subscription";
  /** Display plan name: "Growth Trial" for trial users, "Pro Plan" for paid, etc. */
  plan: string;
  /** Human-readable plan label for UI: "Growth Trial", "Growth", "Pro", etc. */
  planLabel: string;
  /** Days remaining in trial (only when type === "trial") */
  daysRemaining?: number;
  /** Trial end date ISO string (only when type === "trial") */
  endsAt?: string;
  /** Whether the trial is active */
  isTrialActive: boolean;
  /** Whether the user is on the free tier */
  isFreePlan: boolean;
}

/** Minimal user shape — supports both nested trial object and legacy flat fields. */
interface TrialStateUser {
  plan?: string;
  trial?: {
    active?: boolean;
    status?: "active" | "expired" | "stopped" | "cancelled";
    startedAt?: string | null;
    endsAt?: string | null;
    durationDays?: number | null;
    stoppedAt?: string | null;
    stoppedReason?: string;
    restartedAt?: string | null;
  } | null;
  // Legacy flat fields
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  trialDurationDays?: number | null;
}

/**
 * Derives subscription state from mongoUser and plan config.
 *
 * @param mongoUser - The user record from /api/auth/status
 * @param planConfigLabel - The plan label from planConfig (e.g. "Free", "Growth")
 * @returns TrialState that all dashboard pages should use
 */
export function getSubscriptionState(
  mongoUser: TrialStateUser | null,
  planConfigLabel?: string
): TrialState {
  const plan = normalizePlanId(mongoUser?.plan || "free");
  const isFreePlan = plan === "free";

  // Support both nested trial object and legacy flat fields
  const trialEndsAtStr = mongoUser?.trial?.endsAt || mongoUser?.trialEndsAt || null;
  const trialEndsAt = trialEndsAtStr ? new Date(trialEndsAtStr) : null;

  const now = new Date();
  const trialDaysLeft = trialEndsAt
    ? Math.max(
      0,
      Math.ceil(
        (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
    )
    : 0;

  // Check trial status (new format) or fall back to active flag / date comparison (legacy)
  const isTrialActive = isCanonicalTrialActive(mongoUser as any) && isFreePlan;

  if (isTrialActive) {
    const trialLabel = planConfigLabel
      ? (planConfigLabel.toLowerCase().endsWith("trial") ? planConfigLabel : `${planConfigLabel} Trial`)
      : "Growth Trial";

    return {
      type: "trial",
      plan: planConfigLabel || "Growth",
      planLabel: trialLabel,
      daysRemaining: trialDaysLeft,
      endsAt: trialEndsAtStr || undefined,
      isTrialActive: true,
      isFreePlan: true,
    };
  }

  const displayLabel =
    planConfigLabel ||
    plan.charAt(0).toUpperCase() + plan.slice(1);

  return {
    type: "subscription",
    plan: displayLabel,
    planLabel: displayLabel,
    isTrialActive: false,
    isFreePlan,
  };
}

/**
 * Whether the user has consumed a trial that is now over.
 * Keep this server-state based: local UI only reacts to the account payload.
 */
export function isTrialExpiredForUpgrade(
  mongoUser: TrialStateUser | null
): boolean {
  if (!mongoUser?.trial) return false;

  const plan = normalizePlanId(mongoUser.plan || "free");
  if (plan !== "free") return false;

  const status = String(mongoUser.trial.status || "").toLowerCase();
  if (status === "expired" || status === "stopped" || status === "cancelled") {
    return true;
  }

  const trialEndsAtStr = mongoUser.trial.endsAt || mongoUser.trialEndsAt || null;
  if (!trialEndsAtStr) return false;

  const trialEndsAtMs = new Date(trialEndsAtStr).getTime();
  return Number.isFinite(trialEndsAtMs) && Date.now() >= trialEndsAtMs;
}

/**
 * Format trial end date for display.
 * e.g. "Jun 28, 2026"
 */
export function formatTrialEndDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get trial progress percentage (0-100).
 * 0% = just started, 100% = about to expire.
 */
export function getTrialProgressPct(
  trialStartedAt: string | null | undefined,
  trialEndsAt: string | null | undefined,
  totalDays: number
): number {
  if (!trialStartedAt || !trialEndsAt) return 0;
  const start = new Date(trialStartedAt).getTime();
  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  if (now >= end) return 100;
  if (now <= start) return 0;
  const elapsed = now - start;
  const total = end - start;
  return Math.min(100, Math.round((elapsed / total) * 100));
}
