/**
 * userScopedStorage.ts — Centralized userId-scoped localStorage management
 *
 * Every user-owned localStorage key in the desktop app must go through this
 * module. On login the scoped key is used; on logout all user-scoped keys
 * are purged so the next account starts clean.
 *
 * Usage in consumer files:
 *   import { getUserScopedKey } from "../services/userScopedStorage";
 *   const raw = localStorage.getItem(getUserScopedKey("ocs-my-key"));
 *
 * Usage on logout (AuthContext):
 *   import { clearAllUserScopedStorage } from "../services/userScopedStorage";
 *   clearAllUserScopedStorage();
 */

import { getCurrentUserId } from "./db";

// ---------------------------------------------------------------------------
// Scoped key helper
// ---------------------------------------------------------------------------

/**
 * Returns a localStorage key namespaced to the current user.
 * Falls back to the bare key when no user is authenticated.
 */
export function getUserScopedKey(baseKey: string): string {
  const uid = getCurrentUserId();
  return uid ? `${baseKey}:${uid}` : baseKey;
}

function storedValueTimestamp(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    const parsedTimestamp = typeof parsed?.updatedAt === "string"
      ? Date.parse(parsed.updatedAt)
      : Number(parsed?.updatedAt);
    return Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
  } catch {
    // Non-object values are still valid; treat them as undated fallbacks.
    return 0;
  }
}

/**
 * Read a user-owned value while tolerating the auth/storage timing that is
 * common in an embedded OBS browser. Older builds wrote the bare key before
 * the user id was available, so migrate that value into the scoped key when
 * the id becomes available. When the dock is cold-started before auth, look
 * for the most recently written scoped value as a last-resort recovery path.
 */
export function readUserScopedStorage(baseKey: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    const scopedKey = getUserScopedKey(baseKey);
    const scopedValue = localStorage.getItem(scopedKey);
    const legacyValue = scopedKey === baseKey ? null : localStorage.getItem(baseKey);

    if (scopedValue !== null && legacyValue !== null) {
      const scopedTimestamp = storedValueTimestamp(scopedValue);
      const legacyTimestamp = storedValueTimestamp(legacyValue);
      if (legacyTimestamp > scopedTimestamp) {
        try {
          localStorage.setItem(scopedKey, legacyValue);
        } catch {
          // Embedded browser storage can be temporarily unavailable.
        }
        return legacyValue;
      }
      return scopedValue;
    }

    if (scopedValue !== null) {
      return scopedValue;
    }

    if (legacyValue !== null) {
      try {
        localStorage.setItem(scopedKey, legacyValue);
      } catch {
        // Embedded browser storage can be temporarily unavailable.
      }
      return legacyValue;
    }

    // Auth can arrive after the dock document has already rendered. Only use
    // this fallback in dock documents; the main app must not guess another
    // account's preferences during an auth transition.
    const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
    const isDockDocument = /^(dock|lm-dock)(?:\.html)?$/i.test(path);
    if (!isDockDocument) return null;

    let newest: { raw: string; timestamp: number } | null = null;
    const prefix = `${baseKey}:`;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const timestamp = storedValueTimestamp(raw);
      if (!newest || timestamp >= newest.timestamp) newest = { raw, timestamp };
    }
    return newest?.raw ?? null;
  } catch {
    return null;
  }
}

/** Write a user-owned value under the currently resolved user scope. */
export function writeUserScopedStorage(baseKey: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getUserScopedKey(baseKey), value);
  } catch {
    // Ignore storage quota and embedded-browser failures.
  }
}

// ---------------------------------------------------------------------------
// Key registry — every user-scoped key prefix used in the desktop app
// ---------------------------------------------------------------------------

/**
 * All localStorage key prefixes that contain user-owned data.
 * Used by `clearAllUserScopedStorage()` to purge on logout.
 * Keep this list alphabetically sorted for maintainability.
 */
const USER_SCOPED_KEY_PREFIXES = [
  // Credits / financial
  "ocs-credits-balance",
  "ocs-pending-credits",
  "ocs-subscription-cache",
  "ocs-license-cache",
  "ocs-pro-unlocked",
  "ocs-consumed-renewals",
  "voiceBibleUsage",

  // Plan / entitlements
  "ocs-dock-plan",
  "ocs-dock-entitlements",
  "ocs-dock-song-limit",

  // Bible
  "ocs-dock-bible-preferences",
  "ocs-dock-bible-ui-preferences",
  "ocs-dock-bible-recent-searches-v1",
  "ocs-dock-bible-history-v1",
  "ocs-bible-custom-themes",

  // Worship
  "ocs-dock-auto-advance-worship",
  "ocs-dock-worship-preferences",
  "ocs-dock-worship-ui-preferences",
  "ocs-dock-worship-song-defaults-v1",
  "ocs-dock-worship-recent-searches-v1",
  "ocs-fav-worship-lt-themes",
  "ocs-worship-layout-prefs",

  // Media
  "ocs-dock-media-preferences-v1",
  "ocs-dock-media-library-v1",

  // Notes
  "ocs-dock-auto-advance-notes",
  "ocs-dock-notes-preferences",
  "ocs-dock-notes-v1",

  // Sermon
  "ocs-dock-sermon-items-v1",
  "ocs-dock-sermon",
  "ocs-dock-sermon-view-v1",
  "ocs-dock-sermon-theme-prefs-v1",
  "ocs-dock-sermon-theme-settings-v1",
  "ocs-dock-sermon-history-v1",

  // Ticker / ministry
  "dock-ticker-messages",
  "dock-ticker-settings",
  "ocs.ticker-messages",
  "ocs.ticker-settings",
  "ocs-fav-ticker-themes",
  "ocs-ticker-templates",

  // Speaker / lower thirds
  "service-hub.speaker.presets",
  "service-hub.speaker.theme-order",
  "service-hub.lt.presets",
  "service-hub.lt.version-history",
  "dock-ministry-lower-third-size",
  "dock-scene-routing-v1",
  "ocs-lt-global-defaults",
  "ocs-lt-duration-configs",
  "dock-lt-saved",

  // Service state
  "ocs-service-state",
  "ocs-scene-mapping",

  // LM dock
  "ocs-lm-dock-settings",

  // Multiview
  "dock-mv-saved",
  "dock-mv-layouts",
  "mvg-added-ids",
  "mv-settings",
  "mv-recovery-layout",
  "mv-onboarding-complete",
  "mce-presentation-text-slides",
  "mce-presentation-tickers",

  // Theme
  "ocs-app-appearance",
  "obs-church-studio.theme-preference",
  "ocs-fav-obs-themes",
  "ocs-fav-bible-themes",

  // Production settings
  "ocs-production-mode-settings",

  // Pre-service
  "preservice.plan",
  "preservice.runtime",
  "preservice.audioLibrary",

  // Dashboard
  "obs-studio-recent-opened",

  // Dock projection
  "ocs-dock-projection-settings",

  // Misc user state
  "mce-automation-macros-v1",
  "mce-automation-rules-v1",
  "mce-automation-logs-v1",
  "ocs-dock-spellcheck-dictionary",
  "ocs-dock-typography",
  "ocs-song-title-counter-v1",
  "ocs-dock-font-family",
  "ocs-dock-font-scale",
  "ocs-dock-output-typography",
  "ocs-dock-lt-speaker-hint-seen",
  "ocs-speech-to-scripture-mic-id",
  "bible-skip-layout-confirm",
  "dtb-bg-picker-type",
  "dtb-bg-picker-tab",
  "dtb-bg-picker-local-styles",
  "voice-bible-settings",

  // Onboarding (user-scoped)
  "mce_onboarding_state",
] as const;

// ---------------------------------------------------------------------------
// Clear all user-scoped keys on logout
// ---------------------------------------------------------------------------

/**
 * Removes every localStorage key that contains user-owned data.
 * Called by AuthContext on logout to prevent cross-account data leakage.
 *
 * Only removes keys that match a known prefix followed by `:{userId}`.
 * Bare (unscoped) keys are left intact to avoid breaking device-global
 * state that may coexist with the same prefix.
 */
export function clearAllUserScopedStorage(): void {
  if (typeof window === "undefined") return;

  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // Check if this key matches any known user-scoped prefix
    for (const prefix of USER_SCOPED_KEY_PREFIXES) {
      if (key.startsWith(`${prefix}:`)) {
        keysToRemove.push(key);
        break;
      }
    }
  }

  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }

  if (keysToRemove.length > 0) {
    console.log(`[userScopedStorage] Cleared ${keysToRemove.length} user-scoped localStorage keys on logout`);
  }
}

/**
 * Migrates data from an unscoped localStorage key to a scoped one.
 * Reads from the old key, writes to the scoped key (if data exists),
 * then removes the old key.
 *
 * @returns true if migration happened, false if no data or already scoped
 */
export function migrateUnscopedKey(oldKey: string, scopedKey: string): boolean {
  if (typeof window === "undefined") return false;
  if (oldKey === scopedKey) return false;

  try {
    const raw = localStorage.getItem(oldKey);
    if (raw === null) return false;

    // Only migrate if the scoped key doesn't already have data
    const existing = localStorage.getItem(scopedKey);
    if (existing !== null) return false;

    localStorage.setItem(scopedKey, raw);
    localStorage.removeItem(oldKey);
    return true;
  } catch {
    return false;
  }
}
