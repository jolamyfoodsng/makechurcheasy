import type { BibleTheme } from "../bible/types";
import { themeSupportsBibleOverlayMode } from "../bible/themeVariantSupport";
import { BUILTIN_THEMES, DEFAULT_BUILTIN_THEME_ID, resolveBuiltinThemeId } from "../bible/themes/builtinThemes";
import { serializeBibleThemesForDock } from "./dockBibleThemeAssets";
import { getSettings } from "../multiview/mvStore";
import {
  hydrateNativeDockSettings,
  readNativeDockSetting,
  writeNativeDockSetting,
} from "./localDockSettings";

const PRODUCTION_SETTINGS_STORAGE_KEY = "ocs-production-mode-settings";

export type ProductionOverlayMode = "fullscreen" | "lower-third";

export interface ProductionModuleSettings {
  defaultMode: ProductionOverlayMode;
  fullscreenThemeId: string;
  lowerThirdThemeId: string;
}

export interface ProductionSettings {
  bible: ProductionModuleSettings;
  worship: ProductionModuleSettings;
  /** Dock Notes. Older saves have none; it starts as a copy of Worship. */
  notes: ProductionModuleSettings;
  updatedAt: string;
}

export interface DockProductionModuleSettings extends ProductionModuleSettings {
  fullscreenTheme: BibleTheme;
  lowerThirdTheme: BibleTheme;
}

export interface DockProductionSettingsPayload {
  bible: DockProductionModuleSettings;
  worship: DockProductionModuleSettings;
  /** Optional: payloads from older app versions don't carry it. */
  notes?: DockProductionModuleSettings;
  updatedAt: string;
}

// New accounts start on the "Caption Rule" starter theme (it has both looks), so
// the first verse, lyric or note sent from the Dock shows in OBS straight away.
const DEFAULT_THEME = BUILTIN_THEMES.find((theme) => theme.id === DEFAULT_BUILTIN_THEME_ID);
const FALLBACK_FULLSCREEN_THEME =
  DEFAULT_THEME ??
  BUILTIN_THEMES.find((theme) => theme.templateType === "fullscreen") ??
  BUILTIN_THEMES[0];
const FALLBACK_LOWER_THIRD_THEME =
  DEFAULT_THEME ??
  BUILTIN_THEMES.find((theme) => theme.templateType === "lower-third") ??
  BUILTIN_THEMES[0];

const DEFAULT_MODULE_SETTINGS: ProductionModuleSettings = {
  defaultMode: "fullscreen",
  fullscreenThemeId: FALLBACK_FULLSCREEN_THEME.id,
  lowerThirdThemeId: FALLBACK_LOWER_THIRD_THEME.id,
};

function canSyncDockData(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isOverlayMode(value: unknown): value is ProductionOverlayMode {
  return value === "fullscreen" || value === "lower-third";
}

function isBibleTheme(value: unknown): value is BibleTheme {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BibleTheme>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.templateType === "string" &&
    typeof candidate.settings === "object" &&
    candidate.settings !== null
  );
}

function readLocalSettings(): Partial<ProductionSettings> | null {
  const raw = readNativeDockSetting<unknown>(PRODUCTION_SETTINGS_STORAGE_KEY);
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Partial<ProductionSettings>;
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Partial<ProductionSettings> : null;
  } catch {
    return null;
  }
}

function writeLocalSettings(settings: ProductionSettings): void {
  writeNativeDockSetting(PRODUCTION_SETTINGS_STORAGE_KEY, settings);
}

async function readSettingsFromDockData(): Promise<Partial<ProductionSettings> | null> {
  if (!canSyncDockData()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string>("load_dock_data", { name: "dock-production-settings" });
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Partial<ProductionSettings>;
  } catch {
    // Dock data is a recovery fallback only.
  }
  return null;
}

function normalizeModuleSettings(
  value: Partial<ProductionModuleSettings> | undefined,
  fallback: ProductionModuleSettings = DEFAULT_MODULE_SETTINGS,
): ProductionModuleSettings {
  return {
    defaultMode: isOverlayMode(value?.defaultMode) ? value.defaultMode : fallback.defaultMode,
    // Retired classic built-ins (Default Dark, Classic Dark…) move to the starter theme.
    fullscreenThemeId:
      typeof value?.fullscreenThemeId === "string" && value.fullscreenThemeId.trim()
        ? resolveBuiltinThemeId(value.fullscreenThemeId)
        : fallback.fullscreenThemeId,
    lowerThirdThemeId:
      typeof value?.lowerThirdThemeId === "string" && value.lowerThirdThemeId.trim()
        ? resolveBuiltinThemeId(value.lowerThirdThemeId)
        : fallback.lowerThirdThemeId,
  };
}

function resolveTheme(
  themeId: string,
  templateType: BibleTheme["templateType"],
  themes: BibleTheme[],
): BibleTheme {
  // Themes with both looks (every ready-made layer theme) fit either slot.
  const mode = templateType === "lower-third" ? "lower-third" : "fullscreen";
  return (
    themes.find((theme) => theme.id === resolveBuiltinThemeId(themeId) && themeSupportsBibleOverlayMode(theme, mode)) ??
    (DEFAULT_THEME && themeSupportsBibleOverlayMode(DEFAULT_THEME, mode) ? DEFAULT_THEME : undefined) ??
    themes.find((theme) => theme.templateType === templateType) ??
    (templateType === "lower-third" ? FALLBACK_LOWER_THIRD_THEME : FALLBACK_FULLSCREEN_THEME)
  );
}

function uniqueThemes(themes: BibleTheme[]): BibleTheme[] {
  const seen = new Set<string>();
  const result: BibleTheme[] = [];
  for (const theme of themes) {
    if (seen.has(theme.id)) continue;
    seen.add(theme.id);
    result.push(theme);
  }
  return result;
}

export function getDefaultProductionSettings(): ProductionSettings {
  const globalDefaults = getSettings();
  const moduleDefaults: ProductionModuleSettings = {
    ...DEFAULT_MODULE_SETTINGS,
    defaultMode: globalDefaults.defaultBibleOverlayMode,
  };
  return {
    bible: { ...moduleDefaults },
    worship: { ...moduleDefaults },
    notes: { ...moduleDefaults },
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeProductionSettings(raw?: Partial<ProductionSettings> | null): ProductionSettings {
  const fallback = getDefaultProductionSettings();
  return {
    bible: normalizeModuleSettings(raw?.bible, fallback.bible),
    worship: normalizeModuleSettings(raw?.worship, fallback.worship),
    notes: normalizeModuleSettings(raw?.notes, normalizeModuleSettings(raw?.worship, fallback.worship)),
    updatedAt:
      typeof raw?.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt
        : fallback.updatedAt,
  };
}

export async function loadAvailableProductionThemes(): Promise<BibleTheme[]> {
  try {
    let customThemes: BibleTheme[] | null = null;
    if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
      // OBS browser dock: the app's file is current, this page's local copy can be stale.
      try {
        const res = await fetch("/uploads/dock-bible-themes.json", { cache: "no-store" });
        if (res.ok) {
          const data: unknown = await res.json();
          if (Array.isArray(data)) customThemes = data as BibleTheme[];
        }
      } catch {
        customThemes = null;
      }
    }
    if (!customThemes) {
      const { getCustomThemes } = await import("../bible/bibleDb");
      customThemes = await getCustomThemes();
    }
    const builtinIds = new Set(BUILTIN_THEMES.map((theme) => theme.id));
    return uniqueThemes([
      ...BUILTIN_THEMES,
      ...customThemes.filter((theme) => !builtinIds.has(theme.id)),
    ]);
  } catch {
    return [...BUILTIN_THEMES];
  }
}

export function resolveProductionSettings(
  settings: ProductionSettings,
  themes: BibleTheme[],
): DockProductionSettingsPayload {
  const normalized = normalizeProductionSettings(settings);
  const availableThemes = themes.length > 0 ? uniqueThemes(themes) : [...BUILTIN_THEMES];

  const buildModule = (moduleSettings: ProductionModuleSettings): DockProductionModuleSettings => ({
    ...moduleSettings,
    fullscreenTheme: resolveTheme(moduleSettings.fullscreenThemeId, "fullscreen", availableThemes),
    lowerThirdTheme: resolveTheme(moduleSettings.lowerThirdThemeId, "lower-third", availableThemes),
  });

  return {
    updatedAt: normalized.updatedAt,
    bible: buildModule(normalized.bible),
    worship: buildModule(normalized.worship),
    notes: buildModule(normalized.notes),
  };
}

export function getDefaultDockProductionSettings(): DockProductionSettingsPayload {
  return resolveProductionSettings(getDefaultProductionSettings(), BUILTIN_THEMES);
}

export async function getProductionSettings(): Promise<ProductionSettings> {
  await hydrateNativeDockSettings().catch(() => undefined);
  let resolved = readLocalSettings() ?? undefined;

  if (!resolved) {
    const dockSettings = await readSettingsFromDockData();
    if (dockSettings) {
      resolved = dockSettings;
    }
  }

  const normalized = normalizeProductionSettings(resolved);
  writeLocalSettings(normalized);
  return normalized;
}

export async function saveProductionSettings(settings: ProductionSettings): Promise<ProductionSettings> {
  const normalized = normalizeProductionSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  });

  writeLocalSettings(normalized);
  return normalized;
}

async function serializeDockPayload(
  payload: DockProductionSettingsPayload,
): Promise<DockProductionSettingsPayload> {
  const serializedThemes = await serializeBibleThemesForDock(
    uniqueThemes([
      payload.bible.fullscreenTheme,
      payload.bible.lowerThirdTheme,
      payload.worship.fullscreenTheme,
      payload.worship.lowerThirdTheme,
      ...(payload.notes ? [payload.notes.fullscreenTheme, payload.notes.lowerThirdTheme] : []),
    ]),
  );
  const serializedById = new Map(serializedThemes.map((theme) => [theme.id, theme]));

  const mapModule = (moduleSettings: DockProductionModuleSettings): DockProductionModuleSettings => ({
    ...moduleSettings,
    fullscreenTheme:
      serializedById.get(moduleSettings.fullscreenTheme.id) ?? moduleSettings.fullscreenTheme,
    lowerThirdTheme:
      serializedById.get(moduleSettings.lowerThirdTheme.id) ?? moduleSettings.lowerThirdTheme,
  });

  return {
    ...payload,
    bible: mapModule(payload.bible),
    worship: mapModule(payload.worship),
    ...(payload.notes ? { notes: mapModule(payload.notes) } : {}),
  };
}

export async function buildDockProductionSettingsPayload(
  settings?: ProductionSettings,
): Promise<DockProductionSettingsPayload> {
  const [resolvedSettings, themes] = await Promise.all([
    settings ? Promise.resolve(normalizeProductionSettings(settings)) : getProductionSettings(),
    loadAvailableProductionThemes(),
  ]);
  const payload = resolveProductionSettings(resolvedSettings, themes);
  return serializeDockPayload(payload);
}

export async function syncProductionSettingsToDock(
  settings?: ProductionSettings,
): Promise<DockProductionSettingsPayload> {
  const payload = await buildDockProductionSettingsPayload(settings);

  if (!canSyncDockData()) {
    return payload;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", {
      name: "dock-production-settings",
      data: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[productionSettings] Failed to sync production settings to dock:", err);
  }

  return payload;
}

function normalizeDockPayload(raw: unknown): DockProductionSettingsPayload | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<Record<keyof DockProductionSettingsPayload, unknown>>;
  const normalized = normalizeProductionSettings(candidate as Partial<ProductionSettings>);
  const fallback = resolveProductionSettings(normalized, BUILTIN_THEMES);

  const normalizeDockModule = (
    value: unknown,
    fallbackModule: DockProductionModuleSettings,
  ): DockProductionModuleSettings => {
    const moduleValue = value && typeof value === "object"
      ? (value as Partial<DockProductionModuleSettings>)
      : {};
    const baseModule = normalizeModuleSettings(moduleValue, fallbackModule);

    return {
      ...baseModule,
      fullscreenTheme: isBibleTheme(moduleValue.fullscreenTheme)
        ? moduleValue.fullscreenTheme
        : fallbackModule.fullscreenTheme,
      lowerThirdTheme: isBibleTheme(moduleValue.lowerThirdTheme)
        ? moduleValue.lowerThirdTheme
        : fallbackModule.lowerThirdTheme,
    };
  };

  return {
    updatedAt: normalized.updatedAt,
    bible: normalizeDockModule(candidate.bible, fallback.bible),
    worship: normalizeDockModule(candidate.worship, fallback.worship),
    notes: normalizeDockModule(candidate.notes, fallback.notes ?? fallback.worship),
  };
}

const DOCK_FAST_PROD_SETTINGS_KEY = "__mce_dock_fast_prod_settings_v1";

export function readFastDockProductionSettings(): DockProductionSettingsPayload | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DOCK_FAST_PROD_SETTINGS_KEY);
    if (!raw) return null;
    return normalizeDockPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeFastDockProductionSettings(payload: DockProductionSettingsPayload): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DOCK_FAST_PROD_SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or restricted environment errors.
  }
}

export async function loadDockProductionSettings(): Promise<DockProductionSettingsPayload> {
  // The signed-in user's native Dock database is the source of truth. The
  // JSON file is a bootstrap fallback for an installation that has never
  // saved production settings; reading it first can overwrite a locally
  // selected theme/mode with an older published value during Dock startup.
  try {
    await hydrateNativeDockSettings();
    const local = readLocalSettings();
    if (local) {
      const payload = await buildDockProductionSettingsPayload();
      writeFastDockProductionSettings(payload);
      return payload;
    }
  } catch {
    // Fall through to the published bootstrap payload below.
  }

  try {
    const response = await fetch("/uploads/dock-production-settings.json", { cache: "no-store" });
    if (response.ok) {
      const raw: unknown = await response.json();
      const normalized = normalizeDockPayload(raw);
      if (normalized) {
        writeFastDockProductionSettings(normalized);
        return normalized;
      }
    }
  } catch {
    // Fall through to app-side resolution.
  }

  try {
    const payload = await buildDockProductionSettingsPayload();
    writeFastDockProductionSettings(payload);
    return payload;
  } catch {
    const fallback = getDefaultDockProductionSettings();
    writeFastDockProductionSettings(fallback);
    return fallback;
  }
}

