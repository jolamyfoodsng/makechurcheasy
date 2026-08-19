/**
 * Native Dock settings bridge.
 *
 * The OBS Dock is a normal localhost page, not a Tauri webview, so it cannot
 * call Tauri commands directly. In OBS it uses the desktop app's localhost
 * API; in the main Tauri window it uses the same commands directly. The
 * installed app therefore keeps settings in its SQLite database, including
 * when the Dock is opened through the Vite localhost:1420 development URL
 * (Vite proxies /api to the local overlay server). IndexedDB remains only as
 * a last-resort fallback when no local native service is running.
 */

import { hasTauriInvoke, safeTauriInvoke } from "./tauriSafe";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type SettingsMap = Record<string, unknown>;

const MIGRATION_MARKER = "__mce_native_dock_settings_migration_v1";
const BROWSER_SETTINGS_KEY_PREFIX = "__mce-browser-dock-settings-v1:";

/** Settings owned by the Dock shell and its production controls. */
const LEGACY_SETTING_KEYS = [
  "ocs-app-appearance",
  "obs-church-studio.theme-preference",
  "ocs-dock-typography",
  "ocs-dock-font-family",
  "ocs-dock-font-scale",
  "ocs-dock-output-typography",
  "ocs-dock-shell-preferences",
  "ocs-dock-staged-item",
  "ocs-dock-projection-settings",
  "ocs-production-mode-settings",
  "production-mode-settings",
  "mce_interface_language",
  "ocs-lm-dock-settings",
  "ocs-speech-to-scripture-mic-id",
  "ocs-dock-bible-preferences",
  "ocs-dock-bible-ui-preferences",
  "ocs-dock-bible-recent-searches-v1",
  "ocs-dock-notes-translations-v1",
  "ocs-dock-worship-preferences",
  "dock-worship-preferences",
  "ocs-dock-worship-ui-preferences",
  "ocs-dock-worship-song-defaults-v1",
  "ocs-dock-worship-recent-searches-v1",
  "ocs-dock-notes-preferences",
  "ocs-dock-media-preferences-v1",
  "ocs-dock-sermon-view-v1",
  "ocs-dock-sermon-theme-prefs-v1",
  "ocs-dock-sermon-theme-settings-v1",
  "ocs-dock-obs-params",
  "ocs-dock-program-background-scenes-v1",
  "ocs-dock-program-background-last-scene-v1",
  "dock-ministry-active-tab",
  "dock-ticker-settings",
  "dock-bible-lt-color-overrides",
  "dock-ministry-lower-third-size",
  "dock-scene-routing-v1",
  "ocs-dock-spellcheck-dictionary",
  "ocs-dock-auto-advance-worship",
  "ocs-dock-auto-advance-notes",
  "ocs-dock-auto-advance-bible",
  "mce-dock-browser-zoom-baseline-v1",
  "sidebar-collapsed",
  "mv-settings",
  "dock-mv-saved",
  "ocs-fav-bible-themes",
  "ocs-fav-worship-lt-themes",
  "ocs-fav-obs-themes",
  "ocs-fav-ticker-themes",
  "favorite-themes:bible",
  "favorite-themes:worship-lt",
  "favorite-themes:obs",
  "favorite-themes:tickers",
] as const;

const LEGACY_SETTING_PREFIXES = [
  "dtb-bg-picker-tab:",
  "dtb-bg-picker-type:",
  "dtb-bg-picker-local-styles:",
  "ocs-dock-auto-advance-",
] as const;

let currentScope = "device";
let settings: SettingsMap = {};
let hydrated = false;
let hydratedScope = "";
let hydrationPromise: Promise<void> | null = null;
const dirtyKeys = new Set<string>();
const writeQueues = new Map<string, Promise<void>>();
const browserWriteQueues = new Map<string, Promise<void>>();
let transportWarningShown = false;

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function readUserIdFromBrowserSession(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    const direct = localStorage.getItem("mce-dock-auth-user-id")?.trim();
    if (direct) return direct;

    const raw = localStorage.getItem("mce-auth-session");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { user?: { id?: unknown } };
    return typeof parsed.user?.id === "string" ? parsed.user.id.trim() : "";
  } catch {
    return "";
  }
}

export function getNativeDockSettingsScope(): string {
  const userId = readUserIdFromBrowserSession();
  return userId ? `user-${userId}` : "device";
}

function canUseLocalHttpApi(): boolean {
  if (typeof window === "undefined") return false;
  // The main desktop window may report an HTTP-like protocol, but when Tauri
  // is present its command bridge is the authoritative path.
  if (hasTauriInvoke()) return false;
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function browserSettingsKey(scope: string): string {
  return `${BROWSER_SETTINGS_KEY_PREFIX}${encodeURIComponent(scope)}`;
}

async function loadFromBrowserDatabase(scope: string): Promise<SettingsMap> {
  if (typeof indexedDB === "undefined") return {};

  const { getByKey, STORES } = await import("./db");
  const stored = await getByKey<unknown>(STORES.APP_SETTINGS, browserSettingsKey(scope));
  return stored && typeof stored === "object" && !Array.isArray(stored)
    ? stored as SettingsMap
    : {};
}

function queueBrowserDatabaseUpdate(
  scope: string,
  update: (current: SettingsMap) => SettingsMap,
): Promise<void> {
  const previous = browserWriteQueues.get(scope) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const current = await loadFromBrowserDatabase(scope);
      const updated = update(current);
      const { putRecord, STORES } = await import("./db");
      await putRecord(STORES.APP_SETTINGS, updated, browserSettingsKey(scope));
    });

  browserWriteQueues.set(scope, next);
  next.finally(() => {
    if (browserWriteQueues.get(scope) === next) browserWriteQueues.delete(scope);
  }).catch(() => undefined);
  return next;
}

function legacyStorageKeys(baseKey: string): string[] {
  const userId = readUserIdFromBrowserSession();
  return Array.from(new Set([
    userId ? `${baseKey}:${userId}` : "",
    baseKey,
  ].filter(Boolean)));
}

function isLegacySettingsKey(key: string): boolean {
  return LEGACY_SETTING_KEYS.includes(key as (typeof LEGACY_SETTING_KEYS)[number])
    || LEGACY_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function collectLegacyKeys(): string[] {
  const keys = new Set<string>(LEGACY_SETTING_KEYS);
  if (typeof localStorage === "undefined") return [...keys];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isLegacySettingsKey(key)) {
        // A scoped key is converted back to its base key for the native DB.
        const userId = readUserIdFromBrowserSession();
        const suffix = userId ? `:${userId}` : "";
        keys.add(suffix && key.endsWith(suffix) ? key.slice(0, -suffix.length) : key);
      }
    }
  } catch {
    // Storage enumeration can fail in restricted OBS browser contexts.
  }
  return [...keys];
}

async function loadFromDesktop(scope: string): Promise<SettingsMap> {
  if (canUseLocalHttpApi()) {
    try {
      const response = await fetch(`/api/dock-settings?scope=${encodeURIComponent(scope)}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = await response.json() as { values?: unknown };
        return payload.values && typeof payload.values === "object" && !Array.isArray(payload.values)
          ? payload.values as SettingsMap
          : {};
      }
    } catch {
      // Fall back to the browser database when the optional local API is down.
    }
  }

  if (hasTauriInvoke()) {
    try {
      const raw = await safeTauriInvoke<string>("load_dock_settings", { scope });
      const payload = JSON.parse(raw) as { values?: unknown };
      return payload.values && typeof payload.values === "object" && !Array.isArray(payload.values)
        ? payload.values as SettingsMap
        : {};
    } catch {
      // Fall back to the browser database if the native bridge is unavailable.
    }
  }

  return loadFromBrowserDatabase(scope);
}

async function saveToDesktop(scope: string, key: string, value: unknown): Promise<void> {
  if (canUseLocalHttpApi()) {
    try {
      const response = await fetch("/api/dock-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, key, value }),
        // Preserve a setting change if the OBS browser is reloaded immediately
        // after the user makes it.
        keepalive: true,
      });
      if (response.ok) return;
    } catch {
      // Fall back to the browser database when the optional local API is down.
    }
  }

  if (hasTauriInvoke()) {
    try {
      await safeTauriInvoke("save_dock_setting", { scope, key, value });
      return;
    } catch {
      // Fall back to the browser database if the native bridge is unavailable.
    }
  }

  await queueBrowserDatabaseUpdate(scope, (current) => ({ ...current, [key]: value }));
}

async function deleteFromDesktop(scope: string, key: string): Promise<void> {
  if (canUseLocalHttpApi()) {
    try {
      const response = await fetch("/api/dock-settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, key }),
        keepalive: true,
      });
      if (response.ok) return;
    } catch {
      // Fall back to the browser database when the optional local API is down.
    }
  }

  if (hasTauriInvoke()) {
    try {
      await safeTauriInvoke("delete_dock_setting", { scope, key });
      return;
    } catch {
      // Fall back to the browser database if the native bridge is unavailable.
    }
  }

  await queueBrowserDatabaseUpdate(scope, (current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });
}

function queueWrite(scope: string, key: string, value: unknown): Promise<void> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => saveToDesktop(scope, key, value))
    .catch((error) => {
      if (!transportWarningShown) {
        transportWarningShown = true;
        console.warn("[DockSettings] Native settings save failed:", error);
      }
      throw error;
    });
  writeQueues.set(key, next);
  next.finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  }).catch(() => undefined);
  return next;
}

async function migrateLegacyValue(key: string, loaded: SettingsMap): Promise<void> {
  if (Object.prototype.hasOwnProperty.call(loaded, key)) return;

  let raw: string | null = null;
  let sourceKey = "";
  if (typeof localStorage !== "undefined") {
    for (const candidate of legacyStorageKeys(key)) {
      try {
        raw = localStorage.getItem(candidate);
      } catch {
        raw = null;
      }
      if (raw !== null) {
        sourceKey = candidate;
        break;
      }
    }
  }

  // Existing builds also mirrored preferences into the browser IndexedDB.
  // Import that copy only when there is no native record or localStorage copy.
  if (raw === null) {
    try {
      const { getByKey, STORES } = await import("./db");
      const userId = readUserIdFromBrowserSession();
      const candidates = userId ? [`${key}:${userId}`, key] : [key];
      for (const candidate of candidates) {
        const durable = await getByKey<unknown>(STORES.APP_SETTINGS, candidate);
        if (durable !== undefined) {
          loaded[key] = durable;
          await saveToDesktop(currentScope, key, durable);
          try {
            const { deleteRecord } = await import("./db");
            await deleteRecord(STORES.APP_SETTINGS, candidate);
          } catch {
            // The native copy is already safe; cleanup can happen later.
          }
          return;
        }
      }
    } catch {
      // IndexedDB may be unavailable; continue without a migration source.
    }
  }

  if (raw === null) return;
  const value = parseJson(raw);
  loaded[key] = value;
  await saveToDesktop(currentScope, key, value);

  // Remove only the setting that was successfully copied. Auth/session and
  // content stores are deliberately outside this migration list.
  if (sourceKey) {
    try {
      localStorage.removeItem(sourceKey);
    } catch {
      // Ignore restricted storage cleanup.
    }
  }
}

export async function hydrateNativeDockSettings(): Promise<void> {
  const requestedScope = getNativeDockSettingsScope();
  if (hydrated && hydratedScope === requestedScope) return;
  if (hydrationPromise) return hydrationPromise;

  // Writes from a previously hydrated user/device scope must never be merged
  // into the next user's first paint. Those writes already target their old
  // scope; only writes made while this hydration is in flight are pending.
  if (hydrated && hydratedScope && hydratedScope !== requestedScope) {
    dirtyKeys.clear();
  }

  hydrationPromise = (async () => {
    currentScope = requestedScope;
    const scopedValues = await loadFromDesktop(currentScope);
    // Older builds wrote before the signed-in user scope was available. Keep
    // those laptop-local values as a fallback while giving an explicit user
    // scope precedence once it exists. This also keeps the main window and
    // the OBS Dock compatible during the scope migration.
    const deviceValues = currentScope === "device"
      ? {}
      : await loadFromDesktop("device").catch(() => ({}));
    const loaded = { ...deviceValues, ...scopedValues };
    const pendingValues = Object.fromEntries(
      [...dirtyKeys]
        .filter((key) => Object.prototype.hasOwnProperty.call(settings, key))
        .map((key) => [key, settings[key]]),
    );
    settings = { ...loaded, ...pendingValues };

    if (settings[MIGRATION_MARKER] !== true) {
      let migrationFailed = false;
      for (const key of collectLegacyKeys()) {
        try {
          await migrateLegacyValue(key, settings);
        } catch (error) {
          migrationFailed = true;
          console.warn(`[DockSettings] Could not migrate ${key}:`, error);
        }
      }
      if (!migrationFailed) {
        settings[MIGRATION_MARKER] = true;
        await saveToDesktop(currentScope, MIGRATION_MARKER, true);
      }
    }

    hydrated = true;
    hydratedScope = currentScope;
    dirtyKeys.clear();
  })()
    .catch((error) => {
      console.warn("[DockSettings] Native settings hydration failed; using in-memory defaults:", error);
      // Keep the app usable if the local server is still starting. A later
      // call can retry because this flag remains false.
      throw error;
    })
    .finally(() => {
      hydrationPromise = null;
    });

  return hydrationPromise;
}

export function isNativeDockSettingsHydrated(): boolean {
  return hydrated;
}

export function readNativeDockSetting<T = unknown>(key: string): T | undefined {
  return settings[key] as T | undefined;
}

export function writeNativeDockSetting(key: string, value: unknown): void {
  settings[key] = value;
  dirtyKeys.add(key);
  // Capture the scope at the moment the operator changes a setting. If the
  // auth session changes while an earlier write is queued, that write must
  // not be redirected into the new user's scope.
  void queueWrite(currentScope, key, value).catch(() => undefined);
}

export function removeNativeDockSetting(key: string): void {
  delete settings[key];
  dirtyKeys.add(key);
  void deleteFromDesktop(currentScope, key).catch(() => undefined);
}

export function getNativeDockSettingsSnapshot(): SettingsMap {
  return { ...settings };
}

export const NATIVE_DOCK_SETTINGS_MIGRATION_MARKER = MIGRATION_MARKER;
export type { JsonValue };
