/**
 * subscriptionCache.ts — Local subscription state cache
 *
 * Stores a signed subscription payload in localStorage so the app
 * can determine the user's plan and credits instantly on startup,
 * even when offline.
 *
 * The cache is verified with Ed25519 signatures to prevent tampering.
 * If the 14-day offline window expires, the app reverts to the free plan.
 */

import { verifySubscriptionSignature } from "./cryptoVerify";
import { getUserScopedKey } from "./userScopedStorage";
import { trustedNowMs } from "./offlineEntitlement";
import { isSealEnforced } from "./verifiedLicense";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubscriptionPayload {
  userId: string;
  plan: string;
  subscriptionStatus: "active" | "expired" | "none";
  creditsRemaining: number;
  expiresAt: string | null;
  lastVerifiedAt: string;
  offlineExpiresAt: string;
}

export interface SubscriptionCache {
  payload: SubscriptionPayload;
  signature: string;
  cachedAt: number;
  /**
   * Credits spent while offline. Kept outside the signed payload and only ever
   * allowed to LOWER the balance, so editing it can't add credits.
   */
  adjustedCredits?: number;
}

export interface RefreshSubscriptionStateOptions {
  apiBases: string[];
  deviceId: string;
  deviceSecret?: string | null;
  appVersion?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ocs-subscription-cache";

// ── Storage ──────────────────────────────────────────────────────────────────

/**
 * "payload|signature" of the copy whose signature has been verified in this run.
 * On release builds the cache is only trusted when it still matches this, so
 * editing the stored plan / credits / expiry in localStorage has no effect.
 */
let verifiedFingerprint: string | null = null;

function fingerprint(cache: SubscriptionCache): string {
  return `${JSON.stringify(cache.payload)}|${cache.signature}`;
}

function readStored(): SubscriptionCache | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (!raw) return null;
    return JSON.parse(raw) as SubscriptionCache;
  } catch {
    return null;
  }
}

function readCacheRaw(): SubscriptionCache | null {
  const cache = readStored();
  if (!cache) return null;
  if (isSealEnforced() && fingerprint(cache) !== verifiedFingerprint) return null;
  return cache;
}

/**
 * Startup check: keep the stored snapshot only if its signature verifies and it
 * belongs to the signed-in user. Anything else is deleted.
 */
export async function restoreSubscriptionCache(expectedUserId: string | null | undefined): Promise<void> {
  verifiedFingerprint = null;
  const cache = readStored();
  if (!cache?.payload || typeof cache.signature !== "string") return;

  const ownedByUser = !expectedUserId || cache.payload.userId === expectedUserId;
  const valid = ownedByUser
    && await verifySubscriptionSignature(cache.payload as unknown as Record<string, unknown>, cache.signature);
  if (valid) {
    verifiedFingerprint = fingerprint(cache);
    return;
  }
  if (isSealEnforced()) clearSubscriptionCache();
}

function writeCache(cache: SubscriptionCache): void {
  try {
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(cache));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Save a signed subscription payload to the local cache.
 * Verifies the signature before saving.
 * Returns true if saved successfully.
 */
export async function saveSubscriptionState(
  payload: SubscriptionPayload,
  signature: string
): Promise<boolean> {
  const valid = await verifySubscriptionSignature(payload as unknown as Record<string, unknown>, signature);
  if (!valid) {
    console.warn("[subscriptionCache] Signature verification failed — not saving");
    return false;
  }

  const cache: SubscriptionCache = {
    payload,
    signature,
    cachedAt: Date.now(),
  };

  writeCache(cache);
  verifiedFingerprint = fingerprint(cache);
  return true;
}

/**
 * Fetch and persist the signed subscription snapshot used by offline plan
 * checks. Failure is non-fatal; the last verified snapshot stays in place.
 */
export async function refreshSubscriptionState(
  options: RefreshSubscriptionStateOptions,
): Promise<boolean> {
  const apiBases = Array.from(new Set(
    options.apiBases.filter(Boolean).map((base) => base.replace(/\/+$/, "")),
  ));

  for (const apiBase of apiBases) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(`${apiBase}/api/user/subscription-state`, {
        headers: {
          "X-Device-Id": options.deviceId,
          ...(options.deviceSecret ? { "X-Device-Secret": options.deviceSecret } : {}),
          ...(options.appVersion ? { "X-App-Version": options.appVersion } : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) continue;

      const data = await response.json() as {
        payload?: SubscriptionPayload;
        signature?: string;
      };

      if (!data.payload || typeof data.signature !== "string") continue;
      return await saveSubscriptionState(data.payload, data.signature);
    } catch {
      // Try the next configured API base. Existing cached state remains valid.
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return false;
}

/**
 * Read the cached subscription state.
 * Returns null if no cache exists.
 */
export function getCachedSubscription(): SubscriptionCache | null {
  return readCacheRaw();
}

/**
 * Clear the subscription cache (e.g. on logout).
 */
export function clearSubscriptionCache(): void {
  verifiedFingerprint = null;
  try {
    localStorage.removeItem(getUserScopedKey(STORAGE_KEY));
  } catch {
    // ignore
  }
}

// ── Offline Validity ─────────────────────────────────────────────────────────

/**
 * Whether the offline verification window is still valid.
 * Returns false if the cache is missing or the 14-day window has expired.
 */
export function isOfflineValid(): boolean {
  const cache = readCacheRaw();
  if (!cache) return false;

  const offlineExpires = new Date(cache.payload.offlineExpiresAt).getTime();
  return trustedNowMs() < offlineExpires;
}

function isCachedSubscriptionActive(cache: SubscriptionCache): boolean {
  if (cache.payload.subscriptionStatus !== "active") return false;

  if (!cache.payload.expiresAt) return true;
  const expiresAt = new Date(cache.payload.expiresAt).getTime();
  return !Number.isFinite(expiresAt) || trustedNowMs() < expiresAt;
}

/**
 * Days remaining in the offline verification window.
 * Returns 0 if expired or no cache.
 */
export function getOfflineDaysRemaining(): number {
  const cache = readCacheRaw();
  if (!cache) return 0;

  const offlineExpires = new Date(cache.payload.offlineExpiresAt).getTime();
  const remaining = offlineExpires - trustedNowMs();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / (1000 * 60 * 60 * 24));
}

/**
 * Get the effective plan tier from the cache.
 * Returns "free" if offline window expired or no cache.
 */
export function getCachedPlan(): string {
  if (!isOfflineValid()) return "free";
  const cache = readCacheRaw();
  if (!cache || !isCachedSubscriptionActive(cache)) return "free";
  return cache?.payload.plan || "free";
}

/**
 * Get cached credits balance (adjusted for pending offline deductions).
 */
export function getCachedCredits(): number {
  if (!isOfflineValid()) return 0;
  const cache = readCacheRaw();
  if (!cache || !isCachedSubscriptionActive(cache)) return 0;
  const signed = cache.payload.creditsRemaining ?? 0;
  return typeof cache.adjustedCredits === "number" ? Math.min(signed, cache.adjustedCredits) : signed;
}

/**
 * Record credits spent while offline. Only lowers the balance; the signed
 * payload is left untouched so its signature keeps verifying.
 */
export function updateCachedCredits(newBalance: number): void {
  const cache = readCacheRaw();
  if (!cache) return;
  if (!isOfflineValid()) return;

  const current = typeof cache.adjustedCredits === "number"
    ? Math.min(cache.payload.creditsRemaining, cache.adjustedCredits)
    : cache.payload.creditsRemaining;
  cache.adjustedCredits = Math.min(current, newBalance);
  cache.cachedAt = Date.now();
  writeCache(cache);
}
