/**
 * userRetention.ts (dashboard) — how the admin shows "is this user still with me?".
 * The status itself is worked out by the API (api/src/lib/userRetention.ts) from the last time the
 * user really used the product; this file only holds the labels and colours.
 */
export type RetentionStatus = "new" | "never-started" | "active" | "slipping" | "at-risk" | "lost";

export interface RetentionInfo {
  status: RetentionStatus;
  label: string;
  daysSinceUse: number | null;
  lastUseAt: string | null;
  firstUseAt: string | null;
  needsAttention: boolean;
}

export const RETENTION_ORDER: RetentionStatus[] = ["active", "new", "slipping", "at-risk", "lost", "never-started"];

export const RETENTION_STYLE: Record<RetentionStatus, { label: string; hint: string; badge: string; dot: string }> = {
  active: { label: "Still with us", hint: "Used it in the last 10 days", badge: "bg-emerald-950/60 text-emerald-300 border-emerald-700/60", dot: "bg-emerald-400" },
  new: { label: "New", hint: "Signed up in the last 7 days and has not used it yet", badge: "bg-sky-950/60 text-sky-300 border-sky-700/60", dot: "bg-sky-400" },
  slipping: { label: "Slipping", hint: "Last used it 11 to 24 days ago", badge: "bg-amber-950/60 text-amber-300 border-amber-700/60", dot: "bg-amber-400" },
  "at-risk": { label: "At risk", hint: "Last used it 25 to 44 days ago", badge: "bg-orange-950/60 text-orange-300 border-orange-700/60", dot: "bg-orange-400" },
  lost: { label: "Lost", hint: "Last used it 45 or more days ago", badge: "bg-rose-950/50 text-rose-300 border-rose-800/60", dot: "bg-rose-400" },
  "never-started": { label: "Never started", hint: "Signed up more than 7 days ago and never used it", badge: "bg-slate-800/70 text-slate-300 border-slate-600/60", dot: "bg-slate-400" },
};

export function formatDaysSinceUse(info: Pick<RetentionInfo, "daysSinceUse">): string {
  if (info.daysSinceUse === null) return "Never used it";
  if (info.daysSinceUse === 0) return "Used it today";
  if (info.daysSinceUse === 1) return "Used it yesterday";
  return `Used it ${info.daysSinceUse} days ago`;
}

/** Counts per status, for the summary strip. */
export function countRetention(users: Array<{ retention?: RetentionInfo | null }>): Record<RetentionStatus | "unknown", number> {
  const counts: Record<RetentionStatus | "unknown", number> = { active: 0, new: 0, slipping: 0, "at-risk": 0, lost: 0, "never-started": 0, unknown: 0 };
  for (const u of users) counts[u.retention?.status ?? "unknown"] += 1;
  return counts;
}
