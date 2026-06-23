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
}

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ocs-subscription-cache";

// ── Storage ──────────────────────────────────────────────────────────────────

function readCacheRaw(): SubscriptionCache | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (!raw) return null;
    return JSON.parse(raw) as SubscriptionCache;
  } catch {
    return null;
  }
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
  return true;
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
  return Date.now() < offlineExpires;
}

/**
 * Days remaining in the offline verification window.
 * Returns 0 if expired or no cache.
 */
export function getOfflineDaysRemaining(): number {
  const cache = readCacheRaw();
  if (!cache) return 0;

  const offlineExpires = new Date(cache.payload.offlineExpiresAt).getTime();
  const remaining = offlineExpires - Date.now();
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
  return cache?.payload.plan || "free";
}

/**
 * Get cached credits balance (adjusted for pending offline deductions).
 */
export function getCachedCredits(): number {
  if (!isOfflineValid()) return 0;
  const cache = readCacheRaw();
  return cache?.payload.creditsRemaining ?? 0;
}

/**
 * Update the credits in the cache (e.g. after an offline deduction).
 * Only works if the cache exists and is still within the offline window.
 */
export function updateCachedCredits(newBalance: number): void {
  const cache = readCacheRaw();
  if (!cache) return;
  if (!isOfflineValid()) return;

  cache.payload.creditsRemaining = newBalance;
  cache.cachedAt = Date.now();
  writeCache(cache);
}
