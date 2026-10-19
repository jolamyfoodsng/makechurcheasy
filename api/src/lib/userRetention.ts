/**
 * userRetention.ts — "is this user still with me?"
 *
 * The 30-day activity score says how much a church used the product recently. This says where each
 * account is in its life with the product, from the last time it did something real
 * (presenting, searching, creating songs, uploading, voice and so on; just opening the app or
 * connecting OBS does not count).
 *
 *   new            signed up in the last 7 days and has not used it yet (give them time)
 *   never-started  signed up more than 7 days ago and has never used it
 *   active         used it in the last 10 days (covers a weekly Sunday rhythm plus a missed day)
 *   slipping       last used 11–24 days ago (one to three weeks without use)
 *   at-risk        last used 25–44 days ago
 *   lost           last used 45+ days ago
 */
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { USE_EVENT_NAMES } from "./userEngagement";

export type RetentionStatus = "new" | "never-started" | "active" | "slipping" | "at-risk" | "lost";

export interface RetentionInfo {
  status: RetentionStatus;
  /** Plain-language label for the admin. */
  label: string;
  /** Whole days since the last real use; null when they never used it. */
  daysSinceUse: number | null;
  lastUseAt: string | null;
  firstUseAt: string | null;
  /** True for the two states that still need a nudge: slipping and at-risk. */
  needsAttention: boolean;
}

export const RETENTION_LIMITS = { activeDays: 10, slippingDays: 24, atRiskDays: 44, newAccountDays: 7 } as const;

export const RETENTION_ORDER: RetentionStatus[] = ["active", "new", "slipping", "at-risk", "lost", "never-started"];

export const RETENTION_LABELS: Record<RetentionStatus, string> = {
  active: "Still with us",
  new: "New: getting started",
  slipping: "Slipping away",
  "at-risk": "At risk",
  lost: "Lost",
  "never-started": "Never started",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(value: unknown): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export interface RetentionInput {
  createdAt?: unknown;
  lastUseAt?: unknown;
  firstUseAt?: unknown;
}

export function classifyRetention(input: RetentionInput, now = Date.now()): RetentionInfo {
  const lastUse = toMs(input.lastUseAt);
  const firstUse = toMs(input.firstUseAt);
  const created = toMs(input.createdAt);
  const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);

  let status: RetentionStatus;
  let daysSinceUse: number | null = null;
  if (lastUse === null) {
    const ageDays = created === null ? Infinity : Math.max(0, (now - created) / DAY_MS);
    status = ageDays <= RETENTION_LIMITS.newAccountDays ? "new" : "never-started";
  } else {
    daysSinceUse = Math.max(0, Math.floor((now - lastUse) / DAY_MS));
    status = daysSinceUse <= RETENTION_LIMITS.activeDays ? "active"
      : daysSinceUse <= RETENTION_LIMITS.slippingDays ? "slipping"
        : daysSinceUse <= RETENTION_LIMITS.atRiskDays ? "at-risk"
          : "lost";
  }
  return {
    status,
    label: RETENTION_LABELS[status],
    daysSinceUse,
    lastUseAt: iso(lastUse),
    firstUseAt: iso(firstUse),
    needsAttention: status === "slipping" || status === "at-risk",
  };
}

/** The first and last time each user really used the product (all time), in one query. */
export async function loadRealUseTimes(db: Db, userIds: string[]): Promise<Map<string, { firstUseAt: string; lastUseAt: string }>> {
  const result = new Map<string, { firstUseAt: string; lastUseAt: string }>();
  if (!userIds.length) return result;
  const idVariants: Array<string | ObjectId> = [
    ...userIds,
    ...userIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)),
  ];
  const rows = await db.collection("activity_events").aggregate<{ _id: string; first: Date; last: Date }>([
    { $match: { userId: { $in: idVariants }, event: { $in: USE_EVENT_NAMES } } },
    { $group: { _id: { $toString: "$userId" }, first: { $min: "$timestamp" }, last: { $max: "$timestamp" } } },
  ], { allowDiskUse: true }).toArray();
  for (const row of rows) {
    const first = toMs(row.first);
    const last = toMs(row.last);
    if (row._id && first && last) result.set(String(row._id), { firstUseAt: new Date(first).toISOString(), lastUseAt: new Date(last).toISOString() });
  }
  return result;
}
