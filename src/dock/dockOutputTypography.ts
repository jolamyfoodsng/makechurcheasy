import {
  loadDockPreference,
  readDockPreference,
  saveDockPreference,
  writeDockPreference,
} from "../services/dockPreferenceStorage";
import { writeUserScopedStorage } from "../services/userScopedStorage";

const DOCK_OUTPUT_TYPOGRAPHY_STORAGE_KEY = "ocs-dock-output-typography";

export interface DockOutputTypographyPreferences {
  [key: string]: unknown;
  fontScale: number;
  updatedAt?: string;
}

export const DEFAULT_DOCK_OUTPUT_FONT_SCALE = 1;
export const DOCK_OUTPUT_FONT_SCALE_OPTIONS = [
  { id: "smaller", label: "Smaller (80%)", value: 0.8 },
  { id: "small", label: "Small (90%)", value: 0.9 },
  { id: "default", label: "Default (100%)", value: 1 },
  { id: "large", label: "Large (110%)", value: 1.1 },
  { id: "extra-large", label: "Extra large (125%)", value: 1.25 },
] as const;

export function normalizeDockOutputFontScale(value: unknown): number {
  if (value === null || value === undefined || value === "") return DEFAULT_DOCK_OUTPUT_FONT_SCALE;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_DOCK_OUTPUT_FONT_SCALE;
  return DOCK_OUTPUT_FONT_SCALE_OPTIONS.reduce(
    (best, option) => Math.abs(option.value - numeric) < Math.abs(best - numeric) ? option.value : best,
    DEFAULT_DOCK_OUTPUT_FONT_SCALE,
  );
}

function normalizePreferences(value?: Partial<DockOutputTypographyPreferences> | null): DockOutputTypographyPreferences {
  return {
    fontScale: normalizeDockOutputFontScale(value?.fontScale),
    ...(value?.updatedAt ? { updatedAt: value.updatedAt } : {}),
  };
}

function readLocalPreferences(): DockOutputTypographyPreferences {
  const structured = readDockPreference<DockOutputTypographyPreferences>(DOCK_OUTPUT_TYPOGRAPHY_STORAGE_KEY);
  if (structured) return normalizePreferences(structured);

  // There is no legacy output-size key. Keep this fallback explicit so a
  // malformed or unavailable browser store never changes the output scale.
  return normalizePreferences();
}

function persistPreferences(value: Partial<DockOutputTypographyPreferences>): void {
  const next = normalizePreferences({
    ...readLocalPreferences(),
    ...value,
    updatedAt: new Date().toISOString(),
  });
  writeUserScopedStorage(DOCK_OUTPUT_TYPOGRAPHY_STORAGE_KEY, JSON.stringify(next));
  writeDockPreference(DOCK_OUTPUT_TYPOGRAPHY_STORAGE_KEY, next);
  void saveDockPreference(DOCK_OUTPUT_TYPOGRAPHY_STORAGE_KEY, next);
}

export function loadDockOutputFontScale(): number {
  return readLocalPreferences().fontScale;
}

export function saveDockOutputFontScale(value: unknown): void {
  persistPreferences({ fontScale: normalizeDockOutputFontScale(value) });
}

export async function hydrateDockOutputTypographyPreferences(): Promise<DockOutputTypographyPreferences> {
  const durable = await loadDockPreference<DockOutputTypographyPreferences>(DOCK_OUTPUT_TYPOGRAPHY_STORAGE_KEY).catch(() => null);
  const next = normalizePreferences(durable ?? readLocalPreferences());
  if (durable || next.fontScale !== DEFAULT_DOCK_OUTPUT_FONT_SCALE) persistPreferences(next);
  return next;
}

/** Apply the sidebar's output scale to Bible, Notes, and Worship text. */
export function applyDockOutputFontScale(
  themeSettings: Record<string, unknown> | null | undefined,
  scale = loadDockOutputFontScale(),
): Record<string, unknown> | null {
  if (!themeSettings) return null;
  const normalizedScale = normalizeDockOutputFontScale(scale);
  if (normalizedScale === DEFAULT_DOCK_OUTPUT_FONT_SCALE) return { ...themeSettings };

  const next = { ...themeSettings };
  for (const key of ["fontSize", "refFontSize"] as const) {
    const value = Number(next[key]);
    if (Number.isFinite(value)) next[key] = Math.max(1, Math.round(value * normalizedScale));
  }
  return next;
}
