/**
 * offlineEntitlement.ts — what this computer may use while it is offline.
 *
 * Churches often keep the streaming laptop offline for days or months. The app
 * remembers, from the last successful sync with makechurcheazy.com:
 *   - when it last synced, and
 *   - until when the paid plan is paid for ("entitled until": subscription
 *     period end + renewal grace, trial end, admin / ambassador expiry).
 *
 * Rules (all work offline):
 *   1. The moment "entitled until" passes, paid features stop: the plan is Free.
 *   2. After SYNC_PROMPT_DAYS (14) without a sync, the app asks to come online.
 *   3. After PAID_PAUSE_DAYS (21) without a sync, paid features pause and the
 *      app runs as Free until it syncs. The app is never locked for being offline.
 *
 * "Now" is never earlier than the latest time this computer has seen (its own
 * clock or the server's), so turning the clock back does not extend a plan.
 *
 * This module only reads localStorage, so licenseService and licenseGuard can
 * both use it without importing each other.
 */
import { getUserScopedKey } from "./userScopedStorage";

export const SYNC_PROMPT_DAYS = 14;
export const PAID_PAUSE_DAYS = 21;
/** Auto-renewing subscriptions keep working this long past the period end, so a renewal can sync. */
export const RENEWAL_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const LICENSE_CACHE_KEY = "ocs-license-cache";
const LAST_ONLINE_KEY = "mce-last-online-at";
const CLOCK_HIGH_WATER_KEY = "mce-clock-high-water";
const PROMPT_SNOOZE_KEY = "mce-offline-sync-snooze-until";

/** The subset of the cached license payload this module needs. */
export interface EntitlementSnapshot {
  plan?: string | null;
  subscriptionStatus?: string | null;
  trialActive?: boolean | null;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
  renewalDate?: string | null;
  /** Sent by newer servers: the last moment paid features are paid for. null = no end date. */
  entitledUntil?: string | null;
  lastVerifiedAt?: string | null;
  serverTime?: string | null;
}

export interface OfflineEntitlementState {
  /** Last successful sync with the server (ms), 0 when never. */
  lastSyncMs: number;
  daysSinceSync: number;
  /** 14+ days without a sync: ask the user to come online. */
  syncDue: boolean;
  /** 21+ days without a sync: paid features are paused until it syncs. */
  paidPaused: boolean;
  /** When paid access ends (ms), or null when there is no end date / no paid plan. */
  entitledUntilMs: number | null;
  /** The paid period ended (checked against trusted time, offline too). */
  entitlementEnded: boolean;
  /** Days left before paid features pause for being offline. */
  daysUntilPause: number;
}

const toMs = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const isPaidPlan = (plan: string | null | undefined) => {
  const p = String(plan || "free").trim().toLowerCase();
  return p !== "" && p !== "free";
};

/**
 * When paid access ends, from a license snapshot.
 * Newer servers send `entitledUntil`; older ones are read from the trial / subscription dates.
 * Returns null for "no end date" (e.g. admin-granted plans) or a free plan.
 */
export function resolveEntitledUntilMs(snapshot: EntitlementSnapshot | null | undefined): number | null {
  if (!snapshot || !isPaidPlan(snapshot.plan)) return null;
  if (snapshot.entitledUntil !== undefined) return toMs(snapshot.entitledUntil);
  if (snapshot.trialActive) {
    const trialEnd = toMs(snapshot.trialEndsAt);
    if (trialEnd !== null) return trialEnd;
  }
  const periodEnd = toMs(snapshot.subscriptionEndsAt);
  if (periodEnd === null) return null;
  // A subscription that renews gets a grace window so the renewal can sync.
  return snapshot.renewalDate ? periodEnd + RENEWAL_GRACE_DAYS * DAY_MS : periodEnd;
}

/** Pure rule used by the app and the tests. */
export function evaluateOfflineEntitlement(
  snapshot: EntitlementSnapshot | null | undefined,
  lastSyncMs: number,
  nowMs: number,
): OfflineEntitlementState {
  const daysSinceSync = lastSyncMs > 0 ? Math.max(0, Math.floor((nowMs - lastSyncMs) / DAY_MS)) : 0;
  const entitledUntilMs = resolveEntitledUntilMs(snapshot);
  return {
    lastSyncMs,
    daysSinceSync,
    syncDue: lastSyncMs > 0 && daysSinceSync >= SYNC_PROMPT_DAYS,
    paidPaused: lastSyncMs > 0 && daysSinceSync >= PAID_PAUSE_DAYS,
    entitledUntilMs,
    entitlementEnded: entitledUntilMs !== null && nowMs >= entitledUntilMs,
    daysUntilPause: lastSyncMs > 0 ? Math.max(0, PAID_PAUSE_DAYS - daysSinceSync) : PAID_PAUSE_DAYS,
  };
}

/** Plan to use: a paid plan becomes Free when its period ended or the computer is overdue a sync. */
export function capPlanForOffline<T extends string>(plan: T, state: OfflineEntitlementState): T | "free" {
  if (!isPaidPlan(plan)) return plan;
  return state.paidPaused || state.entitlementEnded ? "free" : plan;
}

// ── Storage ──────────────────────────────────────────────────────────────────

function readNumber(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* storage unavailable */
  }
}

/** Current time that can't go backwards: max of the clock and the latest time seen. */
export function trustedNowMs(): number {
  const now = Date.now();
  const highWater = readNumber(CLOCK_HIGH_WATER_KEY);
  if (now > highWater + 60_000) writeNumber(CLOCK_HIGH_WATER_KEY, now);
  return Math.max(now, highWater);
}

/** After a successful sync: the server's time is the truth (also undoes a clock that ran ahead). */
export function noteServerTime(serverTime: string | null | undefined): void {
  const ms = toMs(serverTime ?? null) ?? Date.now();
  writeNumber(CLOCK_HIGH_WATER_KEY, Math.max(ms, Date.now() - 5 * 60_000));
}

export function readLicenseSnapshot(): EntitlementSnapshot | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(LICENSE_CACHE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { payload?: EntitlementSnapshot };
    return parsed?.payload ?? null;
  } catch {
    return null;
  }
}

export function readLastSyncMs(snapshot: EntitlementSnapshot | null = readLicenseSnapshot()): number {
  let scoped = 0;
  try {
    scoped = readNumber(getUserScopedKey(LAST_ONLINE_KEY));
  } catch {
    scoped = 0;
  }
  return Math.max(scoped, readNumber(LAST_ONLINE_KEY), toMs(snapshot?.lastVerifiedAt) ?? 0);
}

/** Offline entitlement for the signed-in user, from what is stored on this computer. */
export function getOfflineEntitlementState(): OfflineEntitlementState {
  const snapshot = readLicenseSnapshot();
  return evaluateOfflineEntitlement(snapshot, readLastSyncMs(snapshot), trustedNowMs());
}

// ── "Come online" prompt snooze ──────────────────────────────────────────────

export function isSyncPromptSnoozed(): boolean {
  return readNumber(PROMPT_SNOOZE_KEY) > Date.now();
}

export function snoozeSyncPrompt(hours = 24): void {
  writeNumber(PROMPT_SNOOZE_KEY, Date.now() + hours * 60 * 60 * 1000);
}
