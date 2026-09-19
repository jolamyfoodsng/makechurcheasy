import { getEnvConfig } from "./envConfig";
import type { LowerThirdTheme, LTVariable } from "../lowerthirds/types";
import type { TickerThemeColors, TickerThemeConfig } from "../components/modules/tickerThemes";
import type { TickerTheme } from "../data/tickerThemes";

export type RemoteProductionThemeKind = "lower-third" | "ticker";

export interface RemoteProductionTheme {
  _id?: string;
  themeId: string;
  kind: RemoteProductionThemeKind;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  html?: string;
  css?: string;
  variables?: Array<Record<string, unknown>>;
  colors?: Record<string, string>;
  preview?: Record<string, unknown> | null;
  fontImports?: string[];
  accentColor?: string;
  enabled?: boolean;
  updatedAt?: string;
}

interface RemoteProductionThemeCache {
  ts: number;
  themes: RemoteProductionTheme[];
}

export const REMOTE_PRODUCTION_THEMES_UPDATED_EVENT = "remote-production-themes-updated";

const CACHE_KEY = "mce.remote-production-themes.v1";
const CACHE_TTL_MS = 2 * 60 * 1000;
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TICKER_COLORS: TickerThemeColors = {
  accent: "#1D4ED8",
  accentText: "#FFFFFF",
  barBg: "#0F172A",
  barText: "#F8FAFC",
  separator: "#F97316",
};

let memoryCache: RemoteProductionThemeCache | null = null;
let inFlight: Promise<RemoteProductionTheme[]> | null = null;

function apiBaseUrl(): string {
  const config = getEnvConfig();
  return (config.apiBaseUrl || config.authApiUrl || "").replace(/\/+$/, "");
}

function readCache(): RemoteProductionThemeCache | null {
  if (memoryCache) return memoryCache;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RemoteProductionThemeCache;
    if (!parsed || !Array.isArray(parsed.themes) || typeof parsed.ts !== "number") return null;
    memoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(themes: RemoteProductionTheme[]): void {
  const cache = { ts: Date.now(), themes };
  memoryCache = cache;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Best-effort cache.
  }
}

function emitUpdate(themes: RemoteProductionTheme[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REMOTE_PRODUCTION_THEMES_UPDATED_EVENT, { detail: { themes } }));
}

function isFresh(cache: RemoteProductionThemeCache | null): boolean {
  return !!cache && Date.now() - cache.ts < CACHE_TTL_MS;
}

function isUsableStale(cache: RemoteProductionThemeCache | null): boolean {
  return !!cache && Date.now() - cache.ts < STALE_TTL_MS;
}

function normalizeTheme(raw: unknown): RemoteProductionTheme | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const themeId = typeof item.themeId === "string" ? item.themeId.trim() : "";
  const kind = item.kind === "ticker" ? "ticker" : item.kind === "lower-third" ? "lower-third" : null;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!themeId || !kind || !name) return null;

  return {
    _id: typeof item._id === "string" ? item._id : undefined,
    themeId,
    kind,
    name,
    description: typeof item.description === "string" ? item.description : "",
    category: typeof item.category === "string" ? item.category : undefined,
    icon: typeof item.icon === "string" ? item.icon : undefined,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [],
    html: typeof item.html === "string" ? item.html : "",
    css: typeof item.css === "string" ? item.css : "",
    variables: Array.isArray(item.variables) ? item.variables.filter((variable): variable is Record<string, unknown> => !!variable && typeof variable === "object" && !Array.isArray(variable)) : [],
    colors: item.colors && typeof item.colors === "object" && !Array.isArray(item.colors)
      ? Object.fromEntries(Object.entries(item.colors as Record<string, unknown>).map(([key, value]) => [key, String(value)]))
      : undefined,
    preview: item.preview && typeof item.preview === "object" && !Array.isArray(item.preview) ? item.preview as Record<string, unknown> : null,
    fontImports: Array.isArray(item.fontImports) ? item.fontImports.filter((url): url is string => typeof url === "string") : [],
    accentColor: typeof item.accentColor === "string" ? item.accentColor : undefined,
    enabled: item.enabled !== false,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
  };
}

export async function fetchRemoteProductionThemes(options: { force?: boolean } = {}): Promise<RemoteProductionTheme[]> {
  const cache = readCache();
  if (!options.force && cache && isFresh(cache)) return cache.themes;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const base = apiBaseUrl();
      if (!base) return cache?.themes ?? [];
      const res = await fetch(`${base}/api/production-themes`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Production theme catalog failed: ${res.status}`);
      const body = await res.json() as { themes?: unknown[] };
      const themes = (Array.isArray(body.themes) ? body.themes : [])
        .map(normalizeTheme)
        .filter((theme): theme is RemoteProductionTheme => !!theme && theme.enabled !== false);
      writeCache(themes);
      emitUpdate(themes);
      return themes;
    } catch (error) {
      console.warn("[remoteProductionThemes] Failed to refresh production theme catalog:", error);
      if (cache && isUsableStale(cache)) return cache.themes;
      return [];
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function getCachedRemoteProductionThemes(): RemoteProductionTheme[] {
  return readCache()?.themes.filter((theme) => theme.enabled !== false) ?? [];
}

export function remoteThemeToLowerThird(theme: RemoteProductionTheme): LowerThirdTheme | null {
  if (theme.kind !== "lower-third") return null;
  if (!theme.html?.trim() || !theme.css?.trim()) return null;
  return {
    id: theme.themeId,
    name: theme.name,
    description: theme.description || "Admin-managed lower-third theme",
    category: theme.category === "bible" || theme.category === "worship" || theme.category === "speaker"
      ? theme.category
      : "general",
    icon: theme.icon || "closed_caption",
    html: theme.html,
    css: theme.css,
    variables: normalizeVariables(theme.variables),
    animation: { name: "fadeInUp", duration: 500, easing: "ease-out" },
    exitAnimation: { name: "fadeOut", duration: 300, easing: "ease-in" },
    accentColor: theme.accentColor || theme.colors?.accent || "#1D4ED8",
    tags: theme.tags || [],
    usesTailwind: false,
    fontImports: theme.fontImports || [],
  };
}

export function remoteThemeToTickerConfig(theme: RemoteProductionTheme): TickerThemeConfig | null {
  if (theme.kind !== "ticker") return null;
  if (theme.html?.trim() || theme.css?.trim()) return null;
  const colors = toTickerColors(theme.colors, theme.accentColor);
  const previewBarStyle = theme.preview?.barStyle;
  const barStyle = previewBarStyle === "gradient" || previewBarStyle === "glass" ? previewBarStyle : "solid";
  return {
    id: theme.themeId,
    name: theme.name,
    description: theme.description || "Admin-managed ticker theme",
    icon: theme.icon || "campaign",
    tags: theme.tags || [],
    defaultColors: colors,
    defaultHeading: String(theme.preview?.defaultHeading || theme.preview?.heading || "LIVE"),
    fontFamily: String(theme.preview?.fontFamily || "'Inter', 'Segoe UI', sans-serif"),
    fontImport: theme.fontImports?.[0],
    headingIcon: String(theme.preview?.headingIcon || "campaign"),
    headingRadius: String(theme.preview?.headingRadius || "6px"),
    separatorChar: String(theme.preview?.separatorChar || "•"),
    barStyle,
  };
}

export function remoteThemeToPermanentTickerTheme(theme: RemoteProductionTheme): TickerTheme | null {
  if (theme.kind !== "ticker") return null;
  if (!theme.html?.trim() && !theme.css?.trim()) return null;
  const colors = toTickerColors(theme.colors, theme.accentColor);
  return {
    id: theme.themeId,
    name: theme.name,
    description: theme.description || "Admin-managed ticker template",
    accentColor: colors.accent,
    badge: String(theme.preview?.defaultHeading || theme.preview?.heading || "LIVE"),
    tickerText: String(theme.preview?.tickerText || "Welcome to church"),
    speed: String(theme.preview?.speed || "24s"),
    html: theme.html || "",
    css: theme.css || "",
    fontImports: theme.fontImports || [],
    variables: normalizeTickerVariables(theme.variables),
  };
}

export function mergeRemoteLowerThirdThemes(
  localThemes: LowerThirdTheme[],
  remoteThemes: RemoteProductionTheme[],
): LowerThirdTheme[] {
  const merged = new Map<string, LowerThirdTheme>();
  for (const theme of localThemes) merged.set(theme.id, theme);
  for (const theme of remoteThemes) {
    const converted = remoteThemeToLowerThird(theme);
    if (converted) merged.set(converted.id, converted);
  }
  return [...merged.values()];
}

function normalizeVariables(variables: RemoteProductionTheme["variables"]): LTVariable[] {
  const source = Array.isArray(variables) ? variables : [];
  return source
    .map((variable): LTVariable | null => {
      const key = String(variable.key || "").trim();
      if (!key) return null;
      const type = String(variable.type || "text");
      return {
        key,
        label: String(variable.label || key),
        type: isLtVariableType(type) ? type : "text",
        defaultValue: String(variable.defaultValue || ""),
        placeholder: typeof variable.placeholder === "string" ? variable.placeholder : undefined,
        options: Array.isArray(variable.options)
          ? variable.options
            .filter((option): option is { label: string; value: string } => !!option && typeof option === "object" && "label" in option && "value" in option)
            .map((option) => ({ label: String(option.label), value: String(option.value) }))
          : undefined,
        required: Boolean(variable.required),
        maxLength: typeof variable.maxLength === "number" ? variable.maxLength : undefined,
        group: typeof variable.group === "string" ? variable.group : undefined,
        separator: typeof variable.separator === "string" ? variable.separator : undefined,
      };
    })
    .filter((variable): variable is LTVariable => !!variable);
}

function normalizeTickerVariables(variables: RemoteProductionTheme["variables"]): TickerTheme["variables"] {
  const source = Array.isArray(variables) ? variables : [];
  const normalized: TickerTheme["variables"] = [];
  for (const variable of source) {
    const key = String(variable.key || "").trim();
    if (!key) continue;
    normalized.push({
      key,
      label: String(variable.label || key),
      type: String(variable.type || "text"),
      defaultValue: String(variable.defaultValue || ""),
      placeholder: String(variable.placeholder || ""),
      required: Boolean(variable.required),
      group: String(variable.group || "Content"),
    });
  }
  return normalized;
}

function isLtVariableType(value: string): value is LTVariable["type"] {
  return ["text", "number", "color", "select", "toggle", "list", "image"].includes(value);
}

function toTickerColors(colors: RemoteProductionTheme["colors"], accentColor: string | undefined): TickerThemeColors {
  return {
    accent: colors?.accent || accentColor || DEFAULT_TICKER_COLORS.accent,
    accentText: colors?.accentText || DEFAULT_TICKER_COLORS.accentText,
    barBg: colors?.barBg || DEFAULT_TICKER_COLORS.barBg,
    barText: colors?.barText || DEFAULT_TICKER_COLORS.barText,
    separator: colors?.separator || accentColor || DEFAULT_TICKER_COLORS.separator,
  };
}
