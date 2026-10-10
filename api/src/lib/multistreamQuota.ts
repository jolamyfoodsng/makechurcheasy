/**
 * multistreamQuota.ts — Monthly multi-stream hours per church (server is the source of truth).
 *
 * Usage comes from the heartbeats the app sends while it is live through the cloud
 * engine (see /api/broadcast/usage), so hours used on any computer count.
 */

import type { Db } from "mongodb";
import { getLimitsForPlan } from "./planLimits";
import { resolveEffectivePlan, type RawMongoUser } from "./trial";

export interface MultistreamQuota {
  plan: string;
  allowed: boolean;
  unlimited: boolean;
  hours: number;
  usedSeconds: number;
  /** -1 when unlimited. */
  remainingSeconds: number;
  exhausted: boolean;
  periodStart: string;
  periodEnd: string;
}

function monthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

/** Hours included in the church's plan this month. -1 = unlimited, 0 = not included. */
export function getMultistreamAllowance(user: Record<string, any>): { plan: string; hours: number } {
  const override = Number(user?.multistreamHoursOverride);
  const effective = resolveEffectivePlan(user as RawMongoUser);
  if (Number.isFinite(override) && user?.multistreamHoursOverride !== undefined && user?.multistreamHoursOverride !== null) {
    return { plan: effective, hours: override };
  }
  const raw = String(user?.plan || "").trim().toLowerCase();
  if (effective !== "free" && (raw === "pro" || raw === "unlimited" || raw === "church_pro" || user?.ambassador?.active)) {
    return { plan: raw || "pro", hours: 40 };
  }
  const limits = getLimitsForPlan(effective);
  return { plan: effective, hours: limits.multistream ? limits.multistreamHours : 0 };
}

export async function getMultistreamQuota(db: Db, user: Record<string, any>, now = new Date()): Promise<MultistreamQuota> {
  const { plan, hours } = getMultistreamAllowance(user);
  const { start, end } = monthBounds(now);
  const userId = String(user._id);

  const rows = await db.collection("multistream_sessions").aggregate([
    { $match: { userId, startedAt: { $gte: start, $lt: end } } },
    { $group: { _id: null, usedSeconds: { $sum: "$usedSeconds" } } },
  ]).toArray();
  const usedSeconds = Math.max(0, Math.round(Number(rows[0]?.usedSeconds || 0)));

  const unlimited = hours < 0;
  const allowed = unlimited || hours > 0;
  const remainingSeconds = unlimited ? -1 : Math.max(0, hours * 3600 - usedSeconds);
  return {
    plan,
    allowed,
    unlimited,
    hours: unlimited ? -1 : hours,
    usedSeconds,
    remainingSeconds,
    exhausted: allowed && !unlimited && remainingSeconds <= 0,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

export function quotaExhaustedMessage(quota: MultistreamQuota): string {
  return `This month's ${quota.hours} multi-stream hours are used up. They renew on ${new Date(quota.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`;
}
