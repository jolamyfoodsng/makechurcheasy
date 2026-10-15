/**
 * studioAccess.ts — what the free plan can do in the Studio.
 *
 * A free account (no paid plan and no active trial) gets a small daily allowance of the extras that cost the
 * most to run or give the most polish; the trial and every paid plan have no limit. Counts are kept per day on
 * this computer. Nothing here blocks the words, songs, Bible or the output itself.
 */
import { getLicensePayload } from "../services/licenseGuard";

export type FreeLimitKey = "camera" | "project" | "saved";

/** camera and project are per day; saved is the most graphics kept in My graphics at once. */
export const FREE_LIMITS: Record<FreeLimitKey, number> = { camera: 3, project: 5, saved: 3 };

const LABELS: Record<FreeLimitKey, string> = {
  camera: "camera turn-ons a day",
  project: "graphic projections a day",
  saved: "saved graphics",
};

export function isFreeStudio(): boolean {
  const payload = getLicensePayload();
  if (!payload) return true;
  if (payload.trialActive) return false;
  return String(payload.plan || "free").trim().toLowerCase() === "free";
}

function dayKey(kind: FreeLimitKey): string {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `mce.studio.free.${kind}.${day}`;
}

function usedToday(kind: FreeLimitKey): number {
  try { return Math.max(0, Number(localStorage.getItem(dayKey(kind))) || 0); } catch { return 0; }
}

/** How many are left today (Infinity on a paid plan or trial). */
export function freeUsesLeft(kind: FreeLimitKey): number {
  if (!isFreeStudio()) return Infinity;
  return Math.max(0, FREE_LIMITS[kind] - usedToday(kind));
}

/** Uses one. Returns false (and uses nothing) when the free allowance for today is gone. */
export function consumeFreeUse(kind: FreeLimitKey): boolean {
  if (!isFreeStudio()) return true;
  const used = usedToday(kind);
  if (used >= FREE_LIMITS[kind]) return false;
  try { localStorage.setItem(dayKey(kind), String(used + 1)); } catch { /* not counted */ }
  return true;
}

export function freeLimitMessage(kind: FreeLimitKey): string {
  return `Free plan: ${FREE_LIMITS[kind]} ${LABELS[kind]}${kind === "saved" ? "" : " — you've used them today"}. Upgrade or start the trial for unlimited.`;
}

export function freeLeftNote(kind: FreeLimitKey): string {
  const left = freeUsesLeft(kind);
  if (!Number.isFinite(left)) return "";
  return `Free plan: ${left} of ${FREE_LIMITS[kind]} ${LABELS[kind]} left today.`;
}
