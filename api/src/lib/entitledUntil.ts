/**
 * entitledUntil — the last moment a user's paid features are paid for.
 *
 * Sent to the desktop app in the device license so it can stop paid features
 * the moment they end, even when the church laptop stays offline for weeks.
 * Returns null when there is no end date (admin role, open-ended admin plans,
 * ambassador without expiry) or no paid plan at all.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
/** Matches the license route: an active subscription keeps access 7 days past the period end. */
export const RENEWAL_GRACE_DAYS = 7;

interface Expiring {
  active?: boolean | string | null;
  expiresAt?: string | Date | null;
}

export interface EntitledUntilInput {
  effectivePlan: string;
  role?: string | null;
  trialActive: boolean;
  trialEndsAt: string | null;
  subscriptionStatus: "active" | "cancelled" | "expired" | "none";
  /** currentPeriodEnd (or the past-due grace end). */
  subscriptionEndsAt: string | null;
  /** Set when the subscription will renew. */
  renewalDate: string | null;
  gracePeriodEndsAt?: string | null;
  ambassador?: Expiring | null;
  adminTemporaryPlan?: Expiring | null;
  adminManagedSubscription?: Expiring | null;
}

const ms = (value: string | Date | null | undefined): number | null => {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
};
const isOn = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";

export function computeEntitledUntil(input: EntitledUntilInput, nowMs: number = Date.now()): string | null {
  if (!input.effectivePlan || input.effectivePlan === "free") return null;
  if (String(input.role || "").toLowerCase() === "admin") return null;

  // Every source that currently grants paid access, with its end (null = no end).
  const ends: Array<number | null> = [];
  for (const grant of [input.ambassador, input.adminTemporaryPlan, input.adminManagedSubscription]) {
    if (grant && isOn(grant.active)) {
      const end = ms(grant.expiresAt);
      if (end === null || end > nowMs) ends.push(end);
    }
  }
  if (input.subscriptionStatus === "active") {
    const periodEnd = ms(input.subscriptionEndsAt);
    if (periodEnd === null) {
      ends.push(null); // admin-created subscription without a billing period
    } else {
      const grace = ms(input.gracePeriodEndsAt);
      const renewing = Boolean(input.renewalDate);
      ends.push(Math.max(periodEnd, grace ?? 0, renewing ? periodEnd + RENEWAL_GRACE_DAYS * DAY_MS : 0));
    }
  }
  if (input.trialActive) ends.push(ms(input.trialEndsAt));

  if (ends.length === 0) return null;
  if (ends.some((end) => end === null)) return null;
  return new Date(Math.max(...(ends as number[]))).toISOString();
}
