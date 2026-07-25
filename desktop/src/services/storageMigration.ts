/**
 * storageMigration.ts — One-time migration of localStorage keys
 *
 * When we rebranded from VerseCast to MakeChurchEasy, all storage keys
 * were renamed. This module migrates old keys to new keys on first run.
 *
 * Safe to call multiple times — only migrates keys that still have old names.
 */

const MIGRATION_DONE_KEY = "mce_storage_migration_v1_done";

interface KeyMapping {
  old: string;
  new: string;
}

const KEY_MIGRATIONS: KeyMapping[] = [
  // Plan config
  { old: "vc_plan_config", new: "mce_plan_config" },
  // Migration flag
  { old: "vc_mongo_content_migration_v1", new: "mce_mongo_content_migration_v1" },
  // Login state
  { old: "vc_has_visited", new: "mce_has_visited" },
  // Languages cache
  { old: "vc_languages", new: "mce_languages" },
  // Analytics
  { old: "versecast_installation_id", new: "mce_installation_id" },
  { old: "versecast-first-launch-seen", new: "mce-first-launch-seen" },
  // Trial
  { old: "versecast_trial_welcome_shown", new: "mce_trial_welcome_shown" },
  // Auth session
  { old: "versecast-auth-session", new: "mce-auth-session" },
  // Onboarding
  { old: "versecast-onboarding-complete", new: "mce-onboarding-complete" },
  { old: "versecast-onboarding-step", new: "mce-onboarding-step" },
];

export function migrateStorageKeys(): void {
  try {
    // Skip if already migrated
    if (localStorage.getItem(MIGRATION_DONE_KEY) === "true") return;

    for (const { old: oldKey, new: newKey } of KEY_MIGRATIONS) {
      const value = localStorage.getItem(oldKey);
      if (value !== null) {
        // Only copy if new key doesn't already exist
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, value);
        }
        localStorage.removeItem(oldKey);
      }
    }

    localStorage.setItem(MIGRATION_DONE_KEY, "true");
  } catch {
    // non-critical — localStorage may be unavailable
  }
}
