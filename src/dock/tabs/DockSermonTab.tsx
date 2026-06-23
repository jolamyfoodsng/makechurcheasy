/**
 * DockSermonTab.tsx — Quote / Point cue lists for the Ministry dock.
 *
 * Replaces the old message-details form with a Worship-like list/detail flow:
 * create a Quote or Point list, then manage slides that can be previewed or
 * sent live with the standard single-click / double-click interaction.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BibleTheme, BibleThemeCategory } from "../../bible/types";
import type { ThemeLike } from "../../lowerthirds/themes";
import { MERGED_ALL_THEMES } from "../../lowerthirds/themes";
import { cleanupSermonSlideText } from "../../services/localLlm";
import Icon from "../DockIcon";
import { dockObsClient } from "../dockObsClient";
import type { DockStagedItem } from "../dockTypes";
import { requireEntitlement } from "../dockEntitlement";
import { getUserScopedKey } from "../../services/userScopedStorage";

const STORAGE_KEY = "ocs-dock-sermon-items-v1";
const OLD_STORAGE_KEY = "ocs-dock-sermon";
const VIEW_PREFS_KEY = "ocs-dock-sermon-view-v1";
const THEME_PREFS_KEY = "ocs-dock-sermon-theme-prefs-v1";
const SERMON_THEME_SETTINGS_KEY = "ocs-dock-sermon-theme-settings-v1";
const SERMON_HISTORY_KEY = "ocs-dock-sermon-history-v1";
const HISTORY_LIMIT = 20;

interface SermonHistoryItem {
  id: string;
  type: SermonItemType;
  topic: string;
  speakerName: string | null;
  seriesName: string | null;
  content: string;
  themeSource: ThemeSource;
  selectedLtThemeId?: string;
  selectedLtThemeName?: string;
  selectedLtThemeHtml?: string;
  selectedLtThemeCss?: string;
  selectedLtThemeVariables?: Array<Record<string, unknown>>;
  selectedLtThemeFontImports?: string[];
  selectedLtThemeAccentColor?: string;
  activeThemeId?: string;
  activeThemeName?: string;
  overlayMode: OverlayMode;
  ltColorOverrides?: LtThemeColorOverrides;
  ltVariableValues?: LtThemeVariableValues;
  timestamp: number;
}

function loadSermonHistory(): SermonHistoryItem[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(SERMON_HISTORY_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SermonHistoryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function saveSermonHistory(items: SermonHistoryItem[]): void {
  try {
    localStorage.setItem(getUserScopedKey(SERMON_HISTORY_KEY), JSON.stringify(items.slice(0, HISTORY_LIMIT)));
  } catch { /* ignore */ }
}

type SermonItemType = "quote" | "point";
type OverlayMode = "fullscreen" | "lower-third";
type SermonStep = "theme" | "compose";

interface SermonSlide {
  id: string;
  content: string;
  fontWeight?: "normal" | "bold";
  fontSizeDelta?: number;
  lineHeight?: number;
  uppercase?: boolean;
  fontFamily?: string;
  letterSpacing?: number;
  textWidth?: number;
  verticalPos?: "top" | "center" | "bottom";
  textAlign?: "left" | "center" | "right";
  safeArea?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SermonItem {
  id: string;
  type: SermonItemType;
  topic: string;
  speakerName: string | null;
  seriesName: string | null;
  themeTag: "general";
  slides: SermonSlide[];
  createdAt: number;
  updatedAt: number;
}

interface ItemDraft {
  type: SermonItemType;
  content: string;
  speakerName: string;
  topic: string;
  seriesName: string;
}

interface ItemModalState {
  mode: "create" | "edit";
  itemId?: string;
  draft: ItemDraft;
}

interface SlideModalState {
  mode: "create" | "edit";
  itemId: string;
  slideId?: string;
  content: string;
  fontWeight: "normal" | "bold";
  fontSizeDelta: number;
  lineHeight?: number;
  uppercase: boolean;
  fontFamily?: string;
  letterSpacing?: number;
  textWidth?: number;
  verticalPos?: "top" | "center" | "bottom";
  textAlign?: "left" | "center" | "right";
  safeArea?: boolean;
}

type ThemeSource = "bible" | "lt-template";

interface LtThemeVariableValues {
  [key: string]: string;
}

interface LtThemeColorOverrides {
  [key: string]: string;
}

const CSS_COLOR_VARS = ["--bg1", "--bg2", "--bg", "--fg", "--accent", "--bd", "--glow", "--muted", "--sub", "--fw-white", "--fw-maroon", "--fw-text-dark", "--fw-text-white"];

function extractCssColorVars(html: string, css?: string): string[] {
  const combined = css ? `${html} ${css}` : html;
  const found: string[] = [];
  for (const v of CSS_COLOR_VARS) { if (combined.includes(`${v}:`)) found.push(v); }
  return found;
}


function extractColorValue(html: string, varName: string): string {
  const regex = new RegExp(`${varName}:([^;"]+)`);
  const match = html.match(regex);
  return match ? match[1].trim() : "";
}

function applyColorOverrides(html: string, overrides: LtThemeColorOverrides): string {
  let result = html;
  for (const [key, value] of Object.entries(overrides)) {
    if (value) {
      const regex = new RegExp(`${key}:([^;"]+)`);
      result = result.replace(regex, `${key}:${value}`);
    }
  }
  return result;
}

function adjustColorBrightness(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function attributionFor(item: SermonItem): string {
  if (item.type !== "quote") return "";
  return [item.speakerName, item.seriesName].filter(Boolean).join(" / ");
}

function displaySlideText(_item: SermonItem, slide: SermonSlide): string {
  const text = slide.content.trim();
  return slide.uppercase ? text.toUpperCase() : text;
}

function pointTopicFromContent(content: string): string {
  const firstLine = content
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) ?? "Point";
  return firstLine.length > 56 ? `${firstLine.slice(0, 53).trim()}...` : firstLine;
}

function clampFontSizeDelta(value: number): number {
  return Math.max(-20, Math.min(172, value));
}

function fontSizeDeltaFromValue(value: number): number {
  return clampFontSizeDelta(Math.round(value) - 28);
}

function slideFontSizeValue(slide: SermonSlide): number {
  return Math.max(10, Math.min(200, 28 + (slide.fontSizeDelta ?? 0)));
}

function clampLineHeight(value: number): number {
  return Math.max(1, Math.min(2.4, Number(value.toFixed(2))));
}

function slideLineHeightValue(slide: SermonSlide, theme: BibleTheme | null): number {
  const themeLineHeight = theme?.settings?.lineHeight;
  return clampLineHeight(slide.lineHeight ?? (typeof themeLineHeight === "number" && Number.isFinite(themeLineHeight) ? themeLineHeight : 1.35));
}

function clampLetterSpacing(value: number): number {
  return Math.max(-4, Math.min(20, Number(value.toFixed(1))));
}

function clampTextWidth(value: number): number {
  return Math.max(30, Math.min(100, Math.round(value)));
}

const SERMON_FONTS = [
  { label: "Inter", value: '"Inter", sans-serif' },
  { label: "Montserrat", value: '"Montserrat", sans-serif' },
  { label: "Bebas Neue", value: '"Bebas Neue", sans-serif' },
  { label: "Playfair", value: '"Playfair Display", serif' },
  { label: "Poppins", value: '"Poppins", sans-serif' },
  { label: "Oswald", value: '"Oswald", sans-serif' },
  { label: "Lato", value: '"Lato", sans-serif' },
  { label: "Merriweather", value: '"Merriweather", serif' },
];

function getSlideTypography(slide: SermonSlide, theme: BibleTheme | null) {
  return {
    fontFamily: slide.fontFamily ?? theme?.settings?.fontFamily ?? '"Inter", sans-serif',
    fontSize: slideFontSizeValue(slide),
    fontWeight: slide.fontWeight ?? theme?.settings?.fontWeight ?? "normal",
    lineHeight: slideLineHeightValue(slide, theme),
    letterSpacing: slide.letterSpacing ?? 0,
    textTransform: slide.uppercase ? "uppercase" as const : "none" as const,
    textAlign: slide.textAlign ?? theme?.settings?.textAlign ?? "center",
    verticalPos: slide.verticalPos ?? "center",
    textWidth: slide.textWidth ?? 80,
    safeArea: slide.safeArea ?? false,
  };
}

function hasTypographyOverrides(slide: SermonSlide): boolean {
  return Boolean(
    slide.fontFamily ||
    slide.letterSpacing !== undefined ||
    slide.textWidth !== undefined ||
    slide.verticalPos ||
    slide.textAlign ||
    slide.fontSizeDelta !== 0 ||
    slide.fontWeight ||
    slide.lineHeight !== undefined ||
    slide.uppercase,
  );
}

function isSermonItem(value: unknown): value is SermonItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SermonItem>;
  return Boolean(
    typeof item.id === "string" &&
    (item.type === "quote" || item.type === "point") &&
    typeof item.topic === "string" &&
    Array.isArray(item.slides),
  );
}

function loadItems(): SermonItem[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.filter(isSermonItem);
    }
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem(getUserScopedKey(OLD_STORAGE_KEY));
    if (!raw) return [];
    const oldData = JSON.parse(raw) as {
      title?: string;
      series?: string;
      speaker?: string;
      points?: Array<{ id?: string; text?: string; type?: SermonItemType; attribution?: string }>;
    };
    const points = Array.isArray(oldData.points) ? oldData.points : [];
    if (!oldData.title && points.length === 0) return [];
    const now = Date.now();
    const type: SermonItemType = points.some((point) => point.type === "quote") ? "quote" : "point";
    return [{
      id: createId("sermon-item"),
      type,
      topic: oldData.title || "Imported sermon notes",
      speakerName: type === "quote" ? (oldData.speaker || points.find((point) => point.attribution)?.attribution || null) : null,
      seriesName: type === "quote" ? (oldData.series || null) : null,
      themeTag: "general",
      slides: points.length > 0
        ? points.map((point) => ({
          id: point.id || createId("sermon-slide"),
          content: normalizeText(point.text),
          createdAt: now,
          updatedAt: now,
        })).filter((slide) => slide.content)
        : [{
          id: createId("sermon-slide"),
          content: oldData.title || "Imported sermon notes",
          createdAt: now,
          updatedAt: now,
        }],
      createdAt: now,
      updatedAt: now,
    }];
  } catch {
    return [];
  }
}

function saveItems(items: SermonItem[]): void {
  try {
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(items));
  } catch { /* ignore OBS CEF storage failures */ }
}

function loadViewPrefs(): { activeItemId: string | null; selectedSlideId: string | null; overlayMode: OverlayMode } {
  try {
    const parsed = JSON.parse(localStorage.getItem(getUserScopedKey(VIEW_PREFS_KEY)) || "{}") as {
      activeItemId?: unknown;
      selectedSlideId?: unknown;
      overlayMode?: unknown;
    };
    return {
      activeItemId: typeof parsed.activeItemId === "string" ? parsed.activeItemId : null,
      selectedSlideId: typeof parsed.selectedSlideId === "string" ? parsed.selectedSlideId : null,
      overlayMode: parsed.overlayMode === "fullscreen" ? "fullscreen" : "lower-third",
    };
  } catch {
    return { activeItemId: null, selectedSlideId: null, overlayMode: "lower-third" };
  }
}

function saveViewPrefs(activeItemId: string | null, selectedSlideId: string | null, overlayMode: OverlayMode): void {
  try {
    localStorage.setItem(getUserScopedKey(VIEW_PREFS_KEY), JSON.stringify({ activeItemId, selectedSlideId, overlayMode }));
  } catch { /* ignore OBS CEF storage failures */ }
}

interface SermonThemePrefs {
  recentThemeIds: string[];
  favoriteThemeIds: string[];
}

function loadThemePrefs(): SermonThemePrefs {
  try {
    const raw = localStorage.getItem(getUserScopedKey(THEME_PREFS_KEY));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        return {
          recentThemeIds: Array.isArray((parsed as { recentThemeIds?: unknown }).recentThemeIds)
            ? ((parsed as { recentThemeIds: string[] }).recentThemeIds.filter((id: unknown): id is string => typeof id === "string"))
            : [],
          favoriteThemeIds: Array.isArray((parsed as { favoriteThemeIds?: unknown }).favoriteThemeIds)
            ? ((parsed as { favoriteThemeIds: string[] }).favoriteThemeIds.filter((id: unknown): id is string => typeof id === "string"))
            : [],
        };
      }
    }
  } catch { /* ignore */ }
  return { recentThemeIds: [], favoriteThemeIds: [] };
}

function saveThemePrefs(prefs: SermonThemePrefs): void {
  try {
    localStorage.setItem(getUserScopedKey(THEME_PREFS_KEY), JSON.stringify(prefs));
  } catch { /* ignore */ }
}

interface SermonThemeSettings {
  themeSource?: ThemeSource;
  selectedLtThemeId?: string;
  selectedLtThemeName?: string;
  selectedLtThemeHtml?: string;
  selectedLtThemeCss?: string;
  selectedLtThemeVariables?: Array<Record<string, unknown>>;
  selectedLtThemeFontImports?: string[];
  selectedLtThemeAccentColor?: string;
  selectedLtThemeCategory?: string;
  selectedLtThemeIcon?: string;
  selectedLtThemeDescription?: string;
  ltVariableValues?: LtThemeVariableValues;
  ltColorOverrides?: LtThemeColorOverrides;
  fullscreenThemeId?: string;
  fullscreenThemeName?: string;
  fullscreenThemeSettings?: Record<string, unknown>;
  lowerThirdThemeId?: string;
  lowerThirdThemeName?: string;
  lowerThirdThemeSettings?: Record<string, unknown>;
  sermonStep?: SermonStep;
}

function loadSermonThemeSettings(): SermonThemeSettings {
  try {
    const raw = localStorage.getItem(getUserScopedKey(SERMON_THEME_SETTINGS_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SermonThemeSettings;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSermonThemeSettings(settings: SermonThemeSettings): void {
  try {
    localStorage.setItem(getUserScopedKey(SERMON_THEME_SETTINGS_KEY), JSON.stringify(settings));
  } catch { /* ignore */ }
}

function makeDraft(type: SermonItemType = "quote"): ItemDraft {
  return {
    type,
    content: "",
    speakerName: "",
    topic: "",
    seriesName: "",
  };
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function makeItemFromDraft(draft: ItemDraft, existing?: SermonItem): SermonItem {
  const now = Date.now();
  const content = draft.content.trim();
  const firstSlide = existing?.slides[0];
  const slides = existing?.slides.length
    ? existing.slides.map((slide, index) =>
      index === 0
        ? { ...slide, content, updatedAt: now }
        : slide,
    )
    : [{ id: createId("sermon-slide"), content, createdAt: now, updatedAt: now }];

  return {
    id: existing?.id ?? createId("sermon-item"),
    type: draft.type,
    topic: draft.type === "quote" ? draft.topic.trim() : pointTopicFromContent(content),
    speakerName: draft.type === "quote" ? draft.speakerName.trim() : null,
    seriesName: draft.type === "quote" ? (draft.seriesName.trim() || null) : null,
    themeTag: "general",
    slides: firstSlide ? slides : slides.filter((slide) => slide.content.trim()),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function validateDraft(draft: ItemDraft): string {
  if (!draft.content.trim()) return draft.type === "quote" ? "Quote text is required." : "Point text is required.";
  if (draft.type === "quote" && !draft.topic.trim()) return "Topic / message title is required.";
  if (draft.type === "quote" && !draft.speakerName.trim()) return "Speaker name is required for quotes.";
  return "";
}

function buildLtPreviewHtml(theme: ThemeLike, values: LtThemeVariableValues, colorOverrides?: LtThemeColorOverrides, previewOnly?: boolean): string {
  if (!theme.html || !theme.css) return "";
  let html = theme.html;
  let css = theme.css;

  if (colorOverrides && Object.keys(colorOverrides).length > 0) {
    html = applyColorOverrides(html, colorOverrides);
    css = applyColorOverrides(css, colorOverrides);
  }

  const resolvedValues: Record<string, string> = {};
  if (theme.variables) {
    for (const v of theme.variables) {
      const varDef = v as Record<string, unknown>;
      if (typeof varDef.key === "string") {
        resolvedValues[varDef.key] = (values[varDef.key] as string) ?? (varDef.defaultValue as string) ?? "";
      }
    }
  }

  for (const [key, value] of Object.entries(resolvedValues)) {
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    html = html.split(`{{${key}}}`).join(escaped);
  }
  html = html.split("{{state}}").join("in");

  const fontImports = theme.fontImports?.map((url) => `<link rel="stylesheet" href="${url}">`).join("\n") || "";
  const wrapperClass = previewOnly ? ' class="dock-sermon-preview-wrapper"' : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fontImports}
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { min-width:200px; transform-origin: top left; text-align: left; }
.dock-sermon-preview-wrapper .panel.info-panel>* {
  font-size: 10px !important;

}

${css}
</style>
</head>
<body>
<div${wrapperClass}>
${html}
</div>
</body>
</html>`;
}

function getSlideStyleOverrides(slide: SermonSlide, theme: BibleTheme | null): Record<string, unknown> | null {
  const overrides: Record<string, unknown> = {};
  if (slide.fontWeight) {
    overrides.fontWeight = slide.fontWeight;
    overrides.refFontWeight = slide.fontWeight;
  }
  if (slide.uppercase) {
    overrides.textTransform = "uppercase";
  }
  if (typeof slide.lineHeight === "number") {
    overrides.lineHeight = clampLineHeight(slide.lineHeight);
  }

  const delta = slide.fontSizeDelta ?? 0;
  if (delta !== 0 && theme?.settings) {
    const baseFontSize = theme.settings.fontSize;
    const baseRefFontSize = theme.settings.refFontSize;
    if (Number.isFinite(baseFontSize)) {
      overrides.fontSize = Math.max(10, Math.round(baseFontSize + delta));
    }
    if (Number.isFinite(baseRefFontSize)) {
      overrides.refFontSize = Math.max(8, Math.round(baseRefFontSize + Math.round(delta * 0.55)));
    }
  }

  if (slide.fontFamily) {
    overrides.fontFamily = slide.fontFamily;
  }
  if (typeof slide.letterSpacing === "number") {
    overrides.letterSpacing = clampLetterSpacing(slide.letterSpacing);
  }
  if (typeof slide.textWidth === "number") {
    overrides.textWidth = clampTextWidth(slide.textWidth);
  }
  if (slide.verticalPos) {
    overrides.verticalPos = slide.verticalPos;
  }
  if (slide.textAlign) {
    overrides.textAlign = slide.textAlign;
    overrides.refTextAlign = slide.textAlign;
  }
  if (slide.safeArea) {
    overrides.safeArea = true;
  }

  return Object.keys(overrides).length ? overrides : null;
}

export default function DockSermonTab({ staged, onStage }: Props) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewPrefsRef = useRef(loadViewPrefs());
  const themePrefsRef = useRef(loadThemePrefs());
  const savedThemeSettingsRef = useRef(loadSermonThemeSettings());
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [items, setItems] = useState<SermonItem[]>(() => loadItems());
  const [activeItemId, setActiveItemId] = useState<string | null>(() => viewPrefsRef.current.activeItemId);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(() => viewPrefsRef.current.selectedSlideId);
  const [sermonStep, setSermonStep] = useState<SermonStep>(() => {
    const saved = savedThemeSettingsRef.current.sermonStep;
    if (saved === "theme" || saved === "compose") return saved;
    const hasItems = loadItems().length > 0;
    return hasItems ? "compose" : "theme";
  });
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [slideModal, setSlideModal] = useState<SlideModalState | null>(null);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [sending, setSending] = useState(false);
  const [slideCleanupPending, setSlideCleanupPending] = useState(false);
  const [showTextStyleModal, setShowTextStyleModal] = useState(false);
  const [showColorSettingsModal, setShowColorSettingsModal] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [history, setHistory] = useState<SermonHistoryItem[]>(() => loadSermonHistory());
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(() => viewPrefsRef.current.overlayMode);
  const [fullscreenTheme, setFullscreenTheme] = useState<BibleTheme | null>(() => {
    const saved = savedThemeSettingsRef.current;
    if (saved.fullscreenThemeId && saved.fullscreenThemeName) {
      return {
        id: saved.fullscreenThemeId,
        name: saved.fullscreenThemeName,
        source: "builtin" as const,
        templateType: "fullscreen" as const,
        settings: saved.fullscreenThemeSettings as unknown as BibleTheme["settings"],
        createdAt: "",
        updatedAt: "",
      };
    }
    return null;
  });
  const [lowerThirdTheme, setLowerThirdTheme] = useState<BibleTheme | null>(() => {
    const saved = savedThemeSettingsRef.current;
    if (saved.lowerThirdThemeId && saved.lowerThirdThemeName) {
      return {
        id: saved.lowerThirdThemeId,
        name: saved.lowerThirdThemeName,
        source: "builtin" as const,
        templateType: "lower-third" as const,
        settings: saved.lowerThirdThemeSettings as unknown as BibleTheme["settings"],
        createdAt: "",
        updatedAt: "",
      };
    }
    return null;
  });
  const [themeCategory, setThemeCategory] = useState<BibleThemeCategory | "all">("all");
  const [themeSearch, setThemeSearch] = useState("");
  const [themePrefs, setThemePrefs] = useState<SermonThemePrefs>(() => themePrefsRef.current);
  const [allThemes, setAllThemes] = useState<BibleTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(false);
  const [ltThemes, setLtThemes] = useState<ThemeLike[]>([]);
  const [selectedLtTheme, setSelectedLtTheme] = useState<ThemeLike | null>(() => {
    const saved = savedThemeSettingsRef.current;
    if (saved.selectedLtThemeId && saved.selectedLtThemeHtml && saved.selectedLtThemeCss) {
      return {
        id: saved.selectedLtThemeId,
        name: saved.selectedLtThemeName ?? saved.selectedLtThemeId,
        html: saved.selectedLtThemeHtml,
        css: saved.selectedLtThemeCss,
        variables: saved.selectedLtThemeVariables ?? [],
        fontImports: saved.selectedLtThemeFontImports ?? [],
        accentColor: saved.selectedLtThemeAccentColor,
        category: (saved.selectedLtThemeCategory ?? "general") as ThemeLike["category"],
        icon: saved.selectedLtThemeIcon,
        description: saved.selectedLtThemeDescription,
      };
    }
    return null;
  });
  const [ltVariableValues, setLtVariableValues] = useState<LtThemeVariableValues>(() => {
    return savedThemeSettingsRef.current.ltVariableValues ?? {};
  });
  const [ltColorOverrides, setLtColorOverrides] = useState<LtThemeColorOverrides>(() => {
    return savedThemeSettingsRef.current.ltColorOverrides ?? {};
  });
  const [themeSource, setThemeSource] = useState<ThemeSource>(() => {
    const saved = savedThemeSettingsRef.current.themeSource;
    return saved === "lt-template" ? "lt-template" : "bible";
  });

  const clearItemModalFields = useCallback(() => {
    setFormError("");
    setItemModal((current) => {
      if (!current) return current;
      return {
        ...current,
        draft: {
          ...makeDraft(current.draft.type),
          type: current.draft.type,
        },
      };
    });
  }, []);

  const clearSlideModalFields = useCallback(() => {
    setFormError("");
    setSlideModal((current) => (current ? { ...current, content: "" } : current));
  }, []);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!showOverflowMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".dock-sermon-step-header__overflow-wrap")) {
        setShowOverflowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOverflowMenu]);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, items],
  );
  const activeSelectedSlide = useMemo(
    () => activeItem?.slides.find((slide) => slide.id === selectedSlideId) ?? null,
    [activeItem, selectedSlideId],
  );
  const stagedSermonData = staged?.type === "sermon" && staged.data && typeof staged.data === "object"
    ? staged.data as Record<string, unknown>
    : null;
  const isVisible = staged?.type === "sermon" && Boolean(stagedSermonData);
  const activeTheme = themeSource === "lt-template" ? null : (overlayMode === "fullscreen" ? fullscreenTheme : lowerThirdTheme);

  const filteredThemes = useMemo(() => {
    const q = themeSearch.toLowerCase().trim();
    let result = allThemes;
    if (themeCategory !== "all") {
      result = result.filter((theme) => {
        const cats = theme.categories?.length ? theme.categories : theme.category ? [theme.category] : [];
        return cats.includes(themeCategory);
      });
    }
    if (q) {
      result = result.filter(
        (theme) =>
          theme.name.toLowerCase().includes(q) ||
          (theme.description ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [allThemes, themeCategory, themeSearch]);

  const favoriteThemes = useMemo(
    () => filteredThemes.filter((theme) => themePrefs.favoriteThemeIds.includes(theme.id)),
    [filteredThemes, themePrefs.favoriteThemeIds],
  );

  const recentThemes = useMemo(() => {
    const themeById = new Map(allThemes.map((theme) => [theme.id, theme]));
    return themePrefs.recentThemeIds
      .map((id) => themeById.get(id))
      .filter((theme): theme is BibleTheme => theme != null && !themePrefs.favoriteThemeIds.includes(theme.id))
      .slice(0, 6);
  }, [allThemes, themePrefs.recentThemeIds, themePrefs.favoriteThemeIds]);

  useEffect(() => {
    saveItems(items);
  }, [items]);

  useEffect(() => {
    if (!activeItemId) return;
    const active = items.find((item) => item.id === activeItemId);
    if (!active) {
      setActiveItemId(null);
      setSelectedSlideId(null);
      return;
    }
    if (selectedSlideId && !active.slides.some((slide) => slide.id === selectedSlideId)) {
      setSelectedSlideId(active.slides[0]?.id ?? null);
    }
  }, [activeItemId, items, selectedSlideId]);

  useEffect(() => {
    saveViewPrefs(activeItemId, selectedSlideId, overlayMode);
  }, [activeItemId, overlayMode, selectedSlideId]);



  useEffect(() => () => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
  }, []);

  useEffect(() => {
    if (sermonStep !== "theme") return;
    let cancelled = false;
    setThemesLoading(true);
    (async () => {
      try {
        const { loadDockFavoriteBibleThemes } = await import("../dockThemeData");
        const themes = await loadDockFavoriteBibleThemes(overlayMode === "fullscreen" ? "fullscreen" : "lower-third");
        if (!cancelled) setAllThemes(themes);
      } catch { /* ignore */ }
      finally { if (!cancelled) setThemesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [sermonStep, overlayMode]);

  useEffect(() => {
    if (sermonStep !== "theme" || overlayMode !== "lower-third") return;
    const ltOnly = MERGED_ALL_THEMES.filter((t) => t.html && t.css && t.variables);
    setLtThemes(ltOnly);
  }, [sermonStep, overlayMode]);

  const recordThemeUsage = useCallback((themeId: string) => {
    setThemePrefs((current) => {
      const recent = [themeId, ...current.recentThemeIds.filter((id) => id !== themeId)].slice(0, 12);
      const next = { ...current, recentThemeIds: recent };
      saveThemePrefs(next);
      return next;
    });
  }, []);

  const toggleThemeFavorite = useCallback((themeId: string) => {
    setThemePrefs((current) => {
      const isFav = current.favoriteThemeIds.includes(themeId);
      const favorites = isFav
        ? current.favoriteThemeIds.filter((id) => id !== themeId)
        : [themeId, ...current.favoriteThemeIds];
      const next = { ...current, favoriteThemeIds: favorites };
      saveThemePrefs(next);
      return next;
    });
  }, []);

  const handleThemeSelect = useCallback((theme: BibleTheme) => {
    const setter = overlayMode === "fullscreen" ? setFullscreenTheme : setLowerThirdTheme;
    setter(theme);
    recordThemeUsage(theme.id);
    setThemeSource("bible");
    setSelectedLtTheme(null);
    setSermonStep("compose");
    saveSermonThemeSettings({
      themeSource: "bible",
      selectedLtThemeId: undefined,
      selectedLtThemeHtml: undefined,
      selectedLtThemeCss: undefined,
      fullscreenThemeId: overlayMode === "fullscreen" ? theme.id : fullscreenTheme?.id,
      fullscreenThemeName: overlayMode === "fullscreen" ? theme.name : fullscreenTheme?.name,
      fullscreenThemeSettings: overlayMode === "fullscreen" ? theme.settings as unknown as Record<string, unknown> : fullscreenTheme?.settings as unknown as Record<string, unknown>,
      lowerThirdThemeId: overlayMode === "lower-third" ? theme.id : lowerThirdTheme?.id,
      lowerThirdThemeName: overlayMode === "lower-third" ? theme.name : lowerThirdTheme?.name,
      lowerThirdThemeSettings: overlayMode === "lower-third" ? theme.settings as unknown as Record<string, unknown> : lowerThirdTheme?.settings as unknown as Record<string, unknown>,
      sermonStep: "compose",
    });
  }, [overlayMode, recordThemeUsage, fullscreenTheme, lowerThirdTheme]);

  const handleLtThemeSelect = useCallback((theme: ThemeLike) => {
    setSelectedLtTheme(theme);
    setThemeSource("lt-template");
    setFullscreenTheme(null);
    setLowerThirdTheme(null);
    const initialValues: LtThemeVariableValues = {};
    if (theme.variables) {
      for (const v of theme.variables) {
        if (typeof v.key === "string" && typeof v.defaultValue === "string") {
          initialValues[v.key] = v.defaultValue;
        }
      }
    }
    setLtVariableValues(initialValues);

    const colorVars = extractCssColorVars(theme.html || "", theme.css || "");
    const initialColors: LtThemeColorOverrides = {};
    for (const v of colorVars) {
      initialColors[v] = extractColorValue(theme.html || "", v) || extractColorValue(theme.css || "", v);
    }
    setLtColorOverrides(initialColors);

    recordThemeUsage(theme.id);
    setSermonStep("compose");
    saveSermonThemeSettings({
      themeSource: "lt-template",
      selectedLtThemeId: theme.id,
      selectedLtThemeName: theme.name,
      selectedLtThemeHtml: theme.html,
      selectedLtThemeCss: theme.css,
      selectedLtThemeVariables: theme.variables as Array<Record<string, unknown>> | undefined,
      selectedLtThemeFontImports: theme.fontImports,
      selectedLtThemeAccentColor: theme.accentColor,
      selectedLtThemeCategory: theme.category,
      selectedLtThemeIcon: theme.icon,
      selectedLtThemeDescription: theme.description,
      ltVariableValues: initialValues,
      ltColorOverrides: initialColors,
      fullscreenThemeId: undefined,
      fullscreenThemeName: undefined,
      fullscreenThemeSettings: undefined,
      lowerThirdThemeId: undefined,
      lowerThirdThemeName: undefined,
      lowerThirdThemeSettings: undefined,
      sermonStep: "compose",
    });
  }, [recordThemeUsage]);

  const updateLtVariable = useCallback((key: string, value: string) => {
    setLtVariableValues((current) => {
      const next = { ...current, [key]: value };
      saveSermonThemeSettings({
        themeSource,
        selectedLtThemeId: selectedLtTheme?.id,
        selectedLtThemeName: selectedLtTheme?.name,
        selectedLtThemeHtml: selectedLtTheme?.html,
        selectedLtThemeCss: selectedLtTheme?.css,
        selectedLtThemeVariables: selectedLtTheme?.variables as Array<Record<string, unknown>> | undefined,
        selectedLtThemeFontImports: selectedLtTheme?.fontImports,
        selectedLtThemeAccentColor: selectedLtTheme?.accentColor,
        selectedLtThemeCategory: selectedLtTheme?.category,
        selectedLtThemeIcon: selectedLtTheme?.icon,
        selectedLtThemeDescription: selectedLtTheme?.description,
        ltVariableValues: next,
        ltColorOverrides,
        fullscreenThemeId: fullscreenTheme?.id,
        fullscreenThemeName: fullscreenTheme?.name,
        fullscreenThemeSettings: fullscreenTheme?.settings as Record<string, unknown> | undefined,
        lowerThirdThemeId: lowerThirdTheme?.id,
        lowerThirdThemeName: lowerThirdTheme?.name,
        lowerThirdThemeSettings: lowerThirdTheme?.settings as Record<string, unknown> | undefined,
        sermonStep,
      });
      return next;
    });
  }, [themeSource, selectedLtTheme, ltColorOverrides, fullscreenTheme, lowerThirdTheme, sermonStep]);

  const updateLtColor = useCallback((varName: string, value: string) => {
    setLtColorOverrides((current) => {
      const next = { ...current, [varName]: value };
      saveSermonThemeSettings({
        themeSource,
        selectedLtThemeId: selectedLtTheme?.id,
        selectedLtThemeName: selectedLtTheme?.name,
        selectedLtThemeHtml: selectedLtTheme?.html,
        selectedLtThemeCss: selectedLtTheme?.css,
        selectedLtThemeVariables: selectedLtTheme?.variables as Array<Record<string, unknown>> | undefined,
        selectedLtThemeFontImports: selectedLtTheme?.fontImports,
        selectedLtThemeAccentColor: selectedLtTheme?.accentColor,
        selectedLtThemeCategory: selectedLtTheme?.category,
        selectedLtThemeIcon: selectedLtTheme?.icon,
        selectedLtThemeDescription: selectedLtTheme?.description,
        ltVariableValues,
        ltColorOverrides: next,
        fullscreenThemeId: fullscreenTheme?.id,
        fullscreenThemeName: fullscreenTheme?.name,
        fullscreenThemeSettings: fullscreenTheme?.settings as Record<string, unknown> | undefined,
        lowerThirdThemeId: lowerThirdTheme?.id,
        lowerThirdThemeName: lowerThirdTheme?.name,
        lowerThirdThemeSettings: lowerThirdTheme?.settings as Record<string, unknown> | undefined,
        sermonStep,
      });
      return next;
    });
  }, [themeSource, selectedLtTheme, ltVariableValues, fullscreenTheme, lowerThirdTheme, sermonStep]);

  const resetLtColors = useCallback(() => {
    if (!selectedLtTheme) return;
    const colorVars = extractCssColorVars(selectedLtTheme.html || "", selectedLtTheme.css || "");
    const initialColors: LtThemeColorOverrides = {};
    for (const v of colorVars) {
      initialColors[v] = extractColorValue(selectedLtTheme.html || "", v) || extractColorValue(selectedLtTheme.css || "", v);
    }
    setLtColorOverrides(initialColors);
  }, [selectedLtTheme]);

  const handleInstantNew = useCallback(async () => {
    if (!(await requireEntitlement("sermonExport", items.length))) return;
    if (activeItem) {
      const snapshot: SermonHistoryItem = {
        id: createId("sermon-history"),
        type: activeItem.type,
        topic: activeItem.topic,
        speakerName: activeItem.speakerName,
        seriesName: activeItem.seriesName,
        content: activeItem.slides[0]?.content ?? "",
        themeSource,
        selectedLtThemeId: selectedLtTheme?.id,
        selectedLtThemeName: selectedLtTheme?.name,
        selectedLtThemeHtml: selectedLtTheme?.html,
        selectedLtThemeCss: selectedLtTheme?.css,
        selectedLtThemeVariables: selectedLtTheme?.variables as Array<Record<string, unknown>> | undefined,
        selectedLtThemeFontImports: selectedLtTheme?.fontImports,
        selectedLtThemeAccentColor: selectedLtTheme?.accentColor,
        activeThemeId: activeTheme?.id,
        activeThemeName: activeTheme?.name,
        overlayMode,
        ltColorOverrides,
        ltVariableValues,
        timestamp: Date.now(),
      };
      const next = [snapshot, ...history].slice(0, HISTORY_LIMIT);
      setHistory(next);
      saveSermonHistory(next);
    }
    const now = Date.now();
    const newItem: SermonItem = {
      id: createId("sermon-item"),
      type: "quote",
      topic: "",
      speakerName: null,
      seriesName: null,
      themeTag: "general",
      slides: [{
        id: createId("sermon-slide"),
        content: "",
        createdAt: now,
        updatedAt: now,
      }],
      createdAt: now,
      updatedAt: now,
    };
    setItems((current) => [newItem, ...current]);
    setActiveItemId(newItem.id);
    setSelectedSlideId(newItem.slides[0].id);
    setSermonStep("compose");
    setFormError("");
  }, [activeItem, items, themeSource, selectedLtTheme, activeTheme, overlayMode, ltColorOverrides, ltVariableValues, history]);

  const restoreFromHistory = useCallback(async (item: SermonHistoryItem) => {
    if (!(await requireEntitlement("sermonExport", items.length))) return;
    const now = Date.now();
    if (item.themeSource === "lt-template" && item.selectedLtThemeHtml && item.selectedLtThemeCss) {
      setThemeSource("lt-template");
      setSelectedLtTheme({
        id: item.selectedLtThemeId ?? "restored",
        name: item.selectedLtThemeName ?? "Restored",
        html: item.selectedLtThemeHtml,
        css: item.selectedLtThemeCss,
        variables: item.selectedLtThemeVariables ?? [],
        fontImports: item.selectedLtThemeFontImports ?? [],
        accentColor: item.selectedLtThemeAccentColor ?? "",
        category: "general",
      });
      setLtColorOverrides(item.ltColorOverrides ?? {});
      setLtVariableValues(item.ltVariableValues ?? {});
      setFullscreenTheme(null);
      setLowerThirdTheme(null);
    } else if (item.activeThemeId && item.activeThemeName) {
      setThemeSource("bible");
      setSelectedLtTheme(null);
      const restoredTheme = {
        id: item.activeThemeId,
        name: item.activeThemeName,
        source: "builtin" as const,
        templateType: (item.overlayMode === "fullscreen" ? "fullscreen" : "lower-third") as BibleTheme["templateType"],
        settings: {} as unknown as BibleTheme["settings"],
        createdAt: "",
        updatedAt: "",
      };
      if (item.overlayMode === "fullscreen") {
        setFullscreenTheme(restoredTheme);
        setLowerThirdTheme(null);
      } else {
        setLowerThirdTheme(restoredTheme);
        setFullscreenTheme(null);
      }
    }
    if (item.overlayMode !== overlayMode) {
      setOverlayMode(item.overlayMode);
    }
    const newItem: SermonItem = {
      id: createId("sermon-item"),
      type: item.type,
      topic: item.topic,
      speakerName: item.speakerName,
      seriesName: item.seriesName,
      themeTag: "general",
      slides: [{
        id: createId("sermon-slide"),
        content: item.content,
        createdAt: now,
        updatedAt: now,
      }],
      createdAt: now,
      updatedAt: now,
    };
    setItems((current) => [newItem, ...current]);
    setActiveItemId(newItem.id);
    setSelectedSlideId(newItem.slides[0].id);
    setSermonStep("compose");
    setShowHistoryDrawer(false);
  }, [items, overlayMode]);

  const closeItemModal = useCallback(() => {
    setFormError("");
    setItemModal(null);
  }, []);

  const saveItemModal = useCallback(async () => {
    if (!itemModal) return;
    if (!(await requireEntitlement("sermonExport", items.length))) return;
    const error = validateDraft(itemModal.draft);
    if (error) {
      setFormError(error);
      return;
    }

    const existing = itemModal.itemId ? items.find((item) => item.id === itemModal.itemId) : undefined;
    const nextItem = makeItemFromDraft(itemModal.draft, existing);
    setItems((current) => {
      if (existing) return current.map((item) => (item.id === existing.id ? nextItem : item));
      return [nextItem, ...current];
    });
    setActiveItemId(nextItem.id);
    setSelectedSlideId(nextItem.slides[0]?.id ?? null);
    setSermonStep("compose");
    setFormError("");
    setItemModal(null);
  }, [itemModal, items]);

  const openSlideModal = useCallback((item: SermonItem, slide?: SermonSlide) => {
    setFormError("");
    setSlideModal({
      mode: slide ? "edit" : "create",
      itemId: item.id,
      slideId: slide?.id,
      content: slide?.content ?? "",
      fontWeight: slide?.fontWeight ?? "bold",
      fontSizeDelta: slide?.fontSizeDelta ?? 0,
      lineHeight: slide?.lineHeight,
      uppercase: Boolean(slide?.uppercase),
      fontFamily: slide?.fontFamily,
      letterSpacing: slide?.letterSpacing,
      textWidth: slide?.textWidth,
      verticalPos: slide?.verticalPos,
      textAlign: slide?.textAlign,
      safeArea: slide?.safeArea,
    });
  }, []);

  const closeSlideModal = useCallback(() => {
    setFormError("");
    setSlideModal(null);
  }, []);

  const saveSlideModal = useCallback(async () => {
    if (!slideModal) return;
    if (!(await requireEntitlement("sermonExport", items.length))) return;
    const content = slideModal.content.trim();
    if (!content) {
      setFormError("Slide text is required.");
      return;
    }

    const now = Date.now();
    let nextSlideId = slideModal.slideId ?? "";
    setItems((current) => current.map((item) => {
      if (item.id !== slideModal.itemId) return item;
      if (slideModal.mode === "edit" && slideModal.slideId) {
        return {
          ...item,
          slides: item.slides.map((slide) =>
            slide.id === slideModal.slideId
              ? {
                ...slide,
                content,
                fontWeight: slideModal.fontWeight,
                fontSizeDelta: slideModal.fontSizeDelta,
                lineHeight: slideModal.lineHeight,
                uppercase: slideModal.uppercase,
                fontFamily: slideModal.fontFamily,
                letterSpacing: slideModal.letterSpacing,
                textWidth: slideModal.textWidth,
                verticalPos: slideModal.verticalPos,
                textAlign: slideModal.textAlign,
                safeArea: slideModal.safeArea,
                updatedAt: now,
              }
              : slide,
          ),
          updatedAt: now,
        };
      }

      nextSlideId = createId("sermon-slide");
      return {
        ...item,
        slides: [
          ...item.slides,
          {
            id: nextSlideId,
            content,
            fontWeight: slideModal.fontWeight,
            fontSizeDelta: slideModal.fontSizeDelta,
            lineHeight: slideModal.lineHeight,
            uppercase: slideModal.uppercase,
            fontFamily: slideModal.fontFamily,
            letterSpacing: slideModal.letterSpacing,
            textWidth: slideModal.textWidth,
            verticalPos: slideModal.verticalPos,
            textAlign: slideModal.textAlign,
            safeArea: slideModal.safeArea,
            createdAt: now,
            updatedAt: now,
          },
        ],
        updatedAt: now,
      };
    }));
    setSelectedSlideId(nextSlideId);
    setFormError("");
    setSlideModal(null);
  }, [slideModal, items]);

  const cleanupSlideModal = useCallback(async () => {
    if (!slideModal) return;
    const content = slideModal.content.trim();
    if (!content) {
      setFormError("Slide text is required.");
      return;
    }

    setFormError("");
    setSlideCleanupPending(true);
    try {
      const cleaned = await cleanupSermonSlideText(content, { semanticMode: "local" });
      if (!cleaned.trim()) {
        setFormError("The AI helper returned an empty result.");
        return;
      }
      setSlideModal((current) => (current ? { ...current, content: cleaned } : current));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFormError(message);
    } finally {
      setSlideCleanupPending(false);
    }
  }, [slideModal]);

  const updateSelectedSlideTypography = useCallback((patch: Partial<Pick<SermonSlide, "fontWeight" | "fontSizeDelta" | "lineHeight" | "uppercase" | "fontFamily" | "letterSpacing" | "textWidth" | "verticalPos" | "textAlign" | "safeArea">>) => {
    if (!activeItemId || !selectedSlideId) return;
    const now = Date.now();
    setItems((current) => current.map((item) => {
      if (item.id !== activeItemId) return item;
      return {
        ...item,
        slides: item.slides.map((slide) =>
          slide.id === selectedSlideId
            ? {
              ...slide,
              ...patch,
              fontSizeDelta: typeof patch.fontSizeDelta === "number"
                ? clampFontSizeDelta(patch.fontSizeDelta)
                : slide.fontSizeDelta,
              lineHeight: typeof patch.lineHeight === "number"
                ? clampLineHeight(patch.lineHeight)
                : slide.lineHeight,
              letterSpacing: typeof patch.letterSpacing === "number"
                ? clampLetterSpacing(patch.letterSpacing)
                : slide.letterSpacing,
              textWidth: typeof patch.textWidth === "number"
                ? clampTextWidth(patch.textWidth)
                : slide.textWidth,
              updatedAt: now,
            }
            : slide,
        ),
        updatedAt: now,
      };
    }));
  }, [activeItemId, selectedSlideId]);

  const resetSelectedSlideTypography = useCallback(() => {
    if (!activeItemId || !selectedSlideId) return;
    const now = Date.now();
    setItems((current) => current.map((item) => {
      if (item.id !== activeItemId) return item;
      return {
        ...item,
        slides: item.slides.map((slide) =>
          slide.id === selectedSlideId
            ? {
              ...slide,
              fontSizeDelta: 0,
              fontWeight: undefined,
              lineHeight: undefined,
              uppercase: false,
              fontFamily: undefined,
              letterSpacing: undefined,
              textWidth: undefined,
              verticalPos: undefined,
              textAlign: undefined,
              safeArea: undefined,
              updatedAt: now,
            }
            : slide,
        ),
        updatedAt: now,
      };
    }));
  }, [activeItemId, selectedSlideId]);

  const pushSlide = useCallback(async (
    item: SermonItem,
    slide: SermonSlide,
    options?: { backgroundOnly?: boolean },
  ) => {
    if (!slide.content.trim()) return;
    if (!(await requireEntitlement("sermonExport", items.length))) return;
    const displayText = displaySlideText(item, slide);
    const attribution = attributionFor(item);
    const subtitle = item.type === "quote" ? attribution : "";

    setSelectedSlideId(slide.id);
    setActionError("");

    const snapshot: SermonHistoryItem = {
      id: createId("sermon-history"),
      type: item.type,
      topic: item.topic,
      speakerName: item.speakerName,
      seriesName: item.seriesName,
      content: slide.content,
      themeSource,
      selectedLtThemeId: selectedLtTheme?.id,
      selectedLtThemeName: selectedLtTheme?.name,
      selectedLtThemeHtml: selectedLtTheme?.html,
      selectedLtThemeCss: selectedLtTheme?.css,
      selectedLtThemeVariables: selectedLtTheme?.variables as Array<Record<string, unknown>> | undefined,
      selectedLtThemeFontImports: selectedLtTheme?.fontImports,
      selectedLtThemeAccentColor: selectedLtTheme?.accentColor,
      activeThemeId: activeTheme?.id,
      activeThemeName: activeTheme?.name,
      overlayMode,
      ltColorOverrides,
      ltVariableValues,
      timestamp: Date.now(),
    };
    const nextHistory = [snapshot, ...history].slice(0, HISTORY_LIMIT);
    setHistory(nextHistory);
    saveSermonHistory(nextHistory);

    if (themeSource === "lt-template" && selectedLtTheme && selectedLtTheme.html) {
      const values = { ...ltVariableValues };
      const logoUrl = "";
      if (logoUrl && !values.logoUrl) {
        values.logoUrl = logoUrl;
      }

      const themedHtml = Object.keys(ltColorOverrides).length > 0
        ? applyColorOverrides(selectedLtTheme.html, ltColorOverrides)
        : selectedLtTheme.html;
      const themedCss = Object.keys(ltColorOverrides).length > 0
        ? applyColorOverrides(selectedLtTheme.css || "", ltColorOverrides)
        : (selectedLtTheme.css || "");

      onStage({
        type: "sermon",
        label: displayText,
        subtitle,
        data: {
          itemId: item.id,
          slideId: slide.id,
          itemType: item.type,
          topic: item.topic,
          speakerName: item.speakerName,
          seriesName: item.seriesName,
          content: slide.content,
          overlayMode,
          themeSource: "lt-template",
          ltThemeId: selectedLtTheme.id,
          ltThemeHtml: themedHtml,
          ltThemeCss: themedCss,
          ltVariables: values,
          ltColorOverrides,
        },
      });

      // Auto-reconnect if not connected
      if (!dockObsClient.isConnected) {
        await dockObsClient.connect();
      }
      if (!dockObsClient.isConnected) return;

      setSending(true);
      try {
        await dockObsClient.pushLowerThird({
          name: displayText,
          role: subtitle || undefined,
          title: item.type === "quote" ? item.topic : undefined,
          context: "sermon",
          values,
          ltTheme: {
            id: selectedLtTheme.id,
            html: themedHtml,
            css: themedCss,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
        if (!isTransient) {
          console.warn(`[DockSermonTab] Show failed:`, error);
          setActionError(message);
        } else {
          console.warn(`[DockSermonTab] Show failed (transient):`, message);
        }
      } finally {
        setSending(false);
      }
      return;
    }

    const themeSettings = (activeTheme?.settings as Record<string, unknown> | undefined) ?? null;
    const liveOverrides = getSlideStyleOverrides(slide, activeTheme);

    onStage({
      type: "sermon",
      label: displayText,
      subtitle,
      data: {
        itemId: item.id,
        slideId: slide.id,
        itemType: item.type,
        topic: item.topic,
        speakerName: item.speakerName,
        seriesName: item.seriesName,
        content: slide.content,
        overlayMode,
        bibleThemeId: activeTheme?.id ?? null,
        bibleThemeSettings: themeSettings,
        liveOverrides,
        backgroundOnly: Boolean(options?.backgroundOnly),
      },
    });

    // Auto-reconnect if not connected
    if (!dockObsClient.isConnected) {
      await dockObsClient.connect();
    }
    if (!dockObsClient.isConnected) return;

    setSending(true);
    try {
      await dockObsClient.pushSermonCue({
        text: displayText,
        label: subtitle || undefined,
        topic: item.type === "quote" ? item.topic : undefined,
        itemType: item.type,
        overlayMode,
        bibleThemeSettings: themeSettings,
        liveOverrides,
        backgroundOnly: Boolean(options?.backgroundOnly),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn(`[DockSermonTab] Show failed:`, error);
        setActionError(message);
      } else {
        console.warn(`[DockSermonTab] Show failed (transient):`, message);
      }
    } finally {
      setSending(false);
    }
  }, [activeTheme, items, ltColorOverrides, ltVariableValues, onStage, overlayMode, selectedLtTheme, themeSource]);

  const handleShowSlide = useCallback((item: SermonItem, slide: SermonSlide) => {
    void pushSlide(item, slide);
  }, [pushSlide]);

  const handleSelectSlideFromQueue = useCallback((itemId: string, slideId: string) => {
    setActiveItemId(itemId);
    setSelectedSlideId(slideId);
    window.setTimeout(() => {
      composerTextareaRef.current?.focus();
      composerTextareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  const handleClearSermon = useCallback(async () => {
    setActionError("");
    // Auto-reconnect if not connected
    if (!dockObsClient.isConnected) {
      await dockObsClient.connect();
    }
    if (!dockObsClient.isConnected) return;

    dockObsClient.clearSermonCue().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn(`[DockSermonTab] clear failed:`, error);
        setActionError(message);
      }
    });
  }, []);

  const renderThemeStep = () => {
    const themeCategories: { key: BibleThemeCategory | "all"; label: string }[] = [
      { key: "all", label: "All" },
      { key: "general", label: "General" },
      { key: "bible", label: "Bible" },
      { key: "worship", label: "Worship" },
    ];

    const renderLtThemeCard = (theme: ThemeLike) => {
      const isActive = selectedLtTheme?.id === theme.id;
      const category = theme.category || "general";
      const previewHtml = buildLtPreviewHtml(theme, {});

      const bgVar = extractColorValue(theme.html || "", "--bg1") || extractColorValue(theme.html || "", "--bg") || extractColorValue(theme.html || "", "--fw-maroon") || "";
      const fgVar = extractColorValue(theme.html || "", "--fg") || extractColorValue(theme.html || "", "--fw-text-white") || "#fff";
      const accentVar = extractColorValue(theme.html || "", "--accent") || theme.accentColor || "#6A34DE";

      return (
        <button
          key={theme.id}
          className={`dock-sermon-theme-card dock-sermon-theme-card--lt${isActive ? " dock-sermon-theme-card--active" : ""}`}
          onClick={() => handleLtThemeSelect(theme)}
          title={theme.description || theme.name}
        >
          <div className="dock-sermon-theme-card__preview">
            {previewHtml && (
              <iframe
                className="dock-sermon-theme-card__iframe"
                srcDoc={previewHtml}
                title={theme.name}
                sandbox="allow-same-origin"
              />
            )}
            {!previewHtml && (
              <div
                className="dock-sermon-theme-card__fallback"
                style={{ background: bgVar || theme.accentColor || "#0F172A", color: fgVar }}
              >
                {theme.icon && <Icon name={theme.icon} size={16} />}
              </div>
            )}
          </div>
          <div className="dock-sermon-theme-card__info">
            <span className="dock-sermon-theme-card__name">{theme.name}</span>
            <div className="dock-sermon-theme-card__meta">
              <span className={`dock-sermon-theme-card__badge dock-sermon-theme-card__badge--${category}`}>
                {category}
              </span>
              {(bgVar || fgVar) && (
                <div className="dock-sermon-theme-card__colors">
                  {bgVar && <span className="dock-sermon-theme-card__color-dot" style={{ background: bgVar }} title="Background" />}
                  {fgVar && <span className="dock-sermon-theme-card__color-dot" style={{ background: fgVar }} title="Text" />}
                  {accentVar && <span className="dock-sermon-theme-card__color-dot" style={{ background: accentVar }} title="Accent" />}
                </div>
              )}
            </div>
          </div>
        </button>
      );
    };

    const renderThemeCard = (theme: BibleTheme, compact = false) => {
      const isActive = activeTheme?.id === theme.id;
      const isFav = themePrefs.favoriteThemeIds.includes(theme.id);
      const bgColor = theme.settings.boxBackground || theme.settings.backgroundColor || "#0F172A";
      const fontColor = theme.settings.fontColor || "#fff";
      const bgImage = theme.settings.boxBackgroundImage || theme.settings.backgroundImage;
      const hasBgImage = Boolean(bgImage && !bgImage.startsWith("__"));
      const textAlign = theme.settings.textAlign || "center";

      return (
        <button
          key={theme.id}
          className={`dock-sermon-theme-card${isActive ? " dock-sermon-theme-card--active" : ""}${compact ? " dock-sermon-theme-card--compact" : ""}`}
          onClick={() => handleThemeSelect(theme)}
          title={theme.description || theme.name}
        >
          <div
            className="dock-sermon-theme-card__swatch"
            style={{
              background: hasBgImage ? `url(${bgImage}) center/cover` : bgColor,
              color: fontColor,
              fontFamily: theme.settings.fontFamily,
              textAlign,
            }}
          >
            <span
              className="dock-sermon-theme-card__swatch-main"
              style={{
                fontSize: compact ? 10 : 12,
                fontWeight: theme.settings.fontWeight === "light" ? 400 : theme.settings.fontWeight === "bold" ? 700 : 500,
                textTransform: theme.settings.textTransform,
                textShadow: theme.settings.textShadow,
              }}
            >
              {theme.name}
            </span>
          </div>
          <div className="dock-sermon-theme-card__info">
            <span className="dock-sermon-theme-card__name">{theme.name}</span>
            <div className="dock-sermon-theme-card__meta">
              {(theme.categories?.length ? theme.categories : theme.category ? [theme.category] : []).slice(0, 2).map((cat) => (
                <span key={cat} className={`dock-sermon-theme-card__badge dock-sermon-theme-card__badge--${cat}`}>
                  {cat}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={`dock-sermon-theme-card__fav${isFav ? " dock-sermon-theme-card__fav--active" : ""}`}
            onClick={(e) => { e.stopPropagation(); toggleThemeFavorite(theme.id); }}
            title={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <Icon name={isFav ? "star" : "star_border"} size={12} />
          </button>
        </button>
      );
    };

    const renderSection = (label: string, themes: BibleTheme[], icon: string, compact = false) => {
      if (themes.length === 0) return null;
      return (
        <div className="dock-sermon-theme-section">
          <div className="dock-sermon-theme-section__header">
            <div className="dock-sermon-theme-section__title">
              <Icon name={icon} size={12} />
              <span>{label}</span>
              <span className="dock-sermon-theme-section__count">{themes.length}</span>
            </div>
          </div>
          <div className={`dock-sermon-theme-grid${compact ? " dock-sermon-theme-grid--compact" : ""}`}>
            {themes.map((theme) => renderThemeCard(theme, compact))}
          </div>
        </div>
      );
    };

    return (
      <div className="dock-sermon-view dock-sermon-view--theme">
        {/* Step Header */}
        <section className="dock-sermon-step-header">
          <div className="dock-sermon-step-header__title">Choose Theme</div>
          <div className="dock-sermon-step-header__mode">
            <div className="dock-console-segmented dock-console-segmented--compact" role="group" aria-label="Sermon overlay mode">
              <button
                type="button"
                className={`dock-console-segmented__item${overlayMode === "fullscreen" ? " dock-console-segmented__item--active" : ""}`}
                onClick={() => setOverlayMode("fullscreen")}
              >
                Full
              </button>
              <button
                type="button"
                className={`dock-console-segmented__item${overlayMode === "lower-third" ? " dock-console-segmented__item--active" : ""}`}
                onClick={() => setOverlayMode("lower-third")}
              >
                LT
              </button>
            </div>
          </div>
        </section>

        {/* Search */}
        <div className="dock-sermon-theme-search">
          <Icon name="search" size={14} />
          <input
            type="text"
            className="dock-sermon-theme-search__input"
            placeholder="Search themes..."
            value={themeSearch}
            onChange={(e) => setThemeSearch(e.target.value)}
            aria-label="Search themes"
          />
          {themeSearch && (
            <button type="button" className="dock-sermon-theme-search__clear" onClick={() => setThemeSearch("")} aria-label="Clear search">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="dock-sermon-theme-categories" role="tablist" aria-label="Theme categories">
          {themeCategories.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={themeCategory === key}
              className={`dock-sermon-theme-cat${themeCategory === key ? " dock-sermon-theme-cat--active" : ""}`}
              onClick={() => setThemeCategory(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Theme Content */}
        <div className="dock-sermon-theme-content">
          {themesLoading ? (
            <div className="dock-sermon-theme-loading">
              <Icon name="hourglass_empty" size={20} />
              <span>Loading themes...</span>
            </div>
          ) : (
            <>
              {overlayMode === "lower-third" && ltThemes.length > 0 && (
                <div className="dock-sermon-theme-section">
                  <div className="dock-sermon-theme-section__header">
                    <div className="dock-sermon-theme-section__title">
                      <Icon name="widgets" size={12} />
                      <span>HTML Templates</span>
                      <span className="dock-sermon-theme-section__count">{ltThemes.length}</span>
                    </div>
                  </div>
                  <div className="dock-sermon-theme-grid dock-sermon-theme-grid--lt">
                    {ltThemes.map((theme) => renderLtThemeCard(theme))}
                  </div>
                </div>
              )}

              {renderSection("Favorites", favoriteThemes, "star", true)}
              {/* {renderSection("Recently Used", recentThemes, "history", true)} */}
              {/* {renderSection("All Themes", filteredThemes.filter(
                (t) => !favoriteThemes.includes(t) && !recentThemes.includes(t)
              ), "widgets")} */}

              {filteredThemes.length === 0 && favoriteThemes.length === 0 && recentThemes.length === 0 && ltThemes.length === 0 && (
                <div className="dock-sermon-theme-empty">
                  <Icon name="palette" size={24} />
                  <div className="dock-sermon-theme-empty__title">No themes found</div>
                  <div className="dock-sermon-theme-empty__text">
                    {themeSearch ? "Try a different search term" : "No themes available for this mode"}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Continue hint */}
        {activeTheme && (
          <div className="dock-sermon-theme-hint">
            <Icon name="arrow_forward" size={12} />
            <span>Tap a theme to start composing</span>
          </div>
        )}
      </div>
    );
  };

  const renderComposeStep = () => {
    const selectedSlide = activeItem?.slides.find((slide) => slide.id === selectedSlideId) ?? activeItem?.slides[0] ?? null;

    return (
      <div className="dock-sermon-view dock-sermon-view--compose">
        {/* Minimal Header */}
        <section className="dock-sermon-step-header dock-sermon-step-header--minimal">
          <div className="dock-sermon-step-header__left">
            <button
              type="button"
              className="dock-sermon-step-header__back"
              onClick={() => setSermonStep("theme")}
              title="Back to themes"
            >
              <Icon name="arrow_back" size={14} />
            </button>
            <div>
              <div className="dock-sermon-step-header__title">Compose</div>
              <div className="dock-sermon-step-header__subtitle">Create and preview your message</div>
            </div>
          </div>
          <div className="dock-sermon-step-header__right">
            <button type="button" className="dock-sermon-step-header__new-btn" onClick={handleInstantNew}>
              <Icon name="add" size={14} />
              New Message
            </button>
            <div className="dock-sermon-step-header__overflow-wrap">
              <button
                type="button"
                className="dock-sermon-step-header__overflow"
                onClick={() => setShowOverflowMenu((v) => !v)}
                title="More options"
              >
                <Icon name="more_vert" size={16} />
              </button>
              {showOverflowMenu && (
                <div className="dock-sermon-step-header__overflow-menu">
                  <button
                    type="button"
                    className="dock-sermon-step-header__overflow-item"
                    onClick={() => { setShowOverflowMenu(false); setShowHistoryDrawer(true); }}
                  >
                    <Icon name="history" size={14} />
                    <span>History</span>
                    {history.length > 0 && <span className="dock-sermon-step-header__overflow-badge">{history.length}</span>}
                  </button>
                  {activeItem && themeSource === "lt-template" && (
                    <button
                      type="button"
                      className="dock-sermon-step-header__overflow-item"
                      onClick={() => { setShowOverflowMenu(false); setShowColorSettingsModal(true); }}
                    >
                      <Icon name="palette" size={14} />
                      <span>Color Settings</span>
                    </button>
                  )}
                  {activeItem && selectedSlide && themeSource === "bible" && (
                    <button
                      type="button"
                      className="dock-sermon-step-header__overflow-item"
                      onClick={() => { setShowOverflowMenu(false); setShowTextStyleModal(true); }}
                    >
                      <Icon name="tune" size={14} />
                      <span>Text Style</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="dock-sermon-step-header__overflow-item"
                    onClick={() => { setShowOverflowMenu(false); setSermonStep("theme"); }}
                  >
                    <Icon name="palette" size={14} />
                    <span>Change Theme</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {items.length === 0 ? (
          <div className="dock-sermon-compose-empty">
            <Icon name="format_quote" size={24} />
            <div className="dock-sermon-compose-empty__title">No sermon cues yet</div>
            <div className="dock-sermon-compose-empty__text">Create a quote to begin sending content live.</div>
            <button type="button" className="dock-sermon-compose-empty__btn" onClick={handleInstantNew}>
              <Icon name="add" size={14} />
              Create First Quote
            </button>
          </div>
        ) : (
          <>
            {/* Active Quote Editor */}
            {activeItem && themeSource !== "lt-template" && (
              <section className="dock-sermon-compose-editor">
                <div className="dock-sermon-compose-editor__header">
                  <div className="dock-sermon-compose-editor__title">
                    {activeItem.type === "quote" ? "Quote" : "Point"}
                    {activeItem.topic && <span className="dock-sermon-compose-editor__topic">{activeItem.topic}</span>}
                  </div>
                  <div className="dock-sermon-compose-editor__header-actions">
                    <button
                      type="button"
                      className="dock-sermon-compose-editor__theme-btn"
                      onClick={() => setSermonStep("theme")}
                      title="Change theme"
                    >
                      <Icon name="palette" size={14} />
                      <span>{activeTheme?.name ?? "Choose Theme"}</span>
                      <Icon name="chevron_right" size={14} />
                    </button>
                    <button
                      type="button"
                      className="dock-sermon-compose-editor__add"
                      onClick={() => activeItem && openSlideModal(activeItem)}
                    >
                      <Icon name="add" size={14} />
                      Slide
                    </button>
                  </div>
                </div>

                {/* Theme-styled preview area */}
                {activeTheme && (
                  <div
                    className="dock-sermon-compose-editor__preview"
                    style={{
                      background: activeTheme.settings.boxBackgroundImage
                        ? `url(${activeTheme.settings.boxBackgroundImage}) center/cover`
                        : activeTheme.settings.backgroundImage
                          ? `url(${activeTheme.settings.backgroundImage}) center/cover`
                          : activeTheme.settings.boxBackground || activeTheme.settings.backgroundColor || "#0F172A",
                      color: activeTheme.settings.fontColor || "#fff",
                      fontFamily: activeTheme.settings.fontFamily,
                      textAlign: activeTheme.settings.textAlign || "center",
                    }}
                  >
                    <span
                      className="dock-sermon-compose-editor__preview-text"
                      style={{
                        fontSize: 14,
                        fontWeight: activeTheme.settings.fontWeight === "bold" ? 700 : activeTheme.settings.fontWeight === "light" ? 400 : 500,
                        textTransform: activeTheme.settings.textTransform,
                        textShadow: activeTheme.settings.textShadow,
                      }}
                    >
                      {selectedSlide ? displaySlideText(activeItem, selectedSlide) : "Your text here"}
                    </span>
                    {activeItem.type === "quote" && attributionFor(activeItem) && (
                      <span
                        className="dock-sermon-compose-editor__preview-ref"
                        style={{
                          fontSize: 11,
                          color: activeTheme.settings.refFontColor || "rgba(255,255,255,0.7)",
                          fontWeight: activeTheme.settings.refFontWeight === "bold" ? 700 : 400,
                        }}
                      >
                        {attributionFor(activeItem)}
                      </span>
                    )}
                  </div>
                )}

                <div className="dock-sermon-compose-editor__field">
                  <textarea
                    ref={composerTextareaRef}
                    className="dock-sermon-compose-editor__textarea"
                    placeholder="Type or paste content…"
                    value={selectedSlide?.content ?? ""}
                    onChange={(event) => {
                      if (!activeItemId || !selectedSlideId) return;
                      const now = Date.now();
                      setItems((current) => current.map((item) => {
                        if (item.id !== activeItemId) return item;
                        return {
                          ...item,
                          slides: item.slides.map((slide) =>
                            slide.id === selectedSlideId ? { ...slide, content: event.target.value, updatedAt: now } : slide
                          ),
                          updatedAt: now,
                        };
                      }));
                    }}
                    aria-label="Content editor"
                  />
                  <div className="dock-sermon-compose-editor__char-count">
                    {(selectedSlide?.content ?? "").length} chars
                  </div>
                </div>

                {/* Metadata */}
                {activeItem.type === "quote" && (activeItem.speakerName || activeItem.seriesName) && (
                  <div className="dock-sermon-compose-meta">
                    {activeItem.speakerName && (
                      <div className="dock-sermon-compose-meta__item">
                        <Icon name="person" size={12} />
                        <span>{activeItem.speakerName}</span>
                      </div>
                    )}
                    {activeItem.seriesName && (
                      <div className="dock-sermon-compose-meta__item">
                        <Icon name="collections_bookmark" size={12} />
                        <span>{activeItem.seriesName}</span>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Color Settings Trigger */}
            {activeItem && themeSource === "lt-template" && (
              <button
                type="button"
                className="dock-sermon-color-settings-trigger"
                onClick={() => setShowColorSettingsModal(true)}
              >
                <Icon name="palette" size={16} />
                <span>Color Settings</span>
                {Object.keys(ltColorOverrides).length > 0 && (
                  <div className="dock-sermon-color-settings-trigger__dot" />
                )}
              </button>
            )}

            {/* Text Style Trigger */}
            {activeItem && selectedSlide && themeSource === "bible" && (
              <button
                type="button"
                className="dock-sermon-text-style-trigger"
                onClick={() => setShowTextStyleModal(true)}
              >
                <Icon name="tune" size={16} />
                <span>Text Style</span>
                {hasTypographyOverrides(selectedSlide) && (
                  <div className="dock-sermon-text-style-trigger__dot" />
                )}
              </button>
            )}

            {/* LT Theme Dynamic Form */}
            {activeItem && themeSource === "lt-template" && selectedLtTheme && selectedLtTheme.variables && (
              <section className="dock-sermon-lt-form">
                <div className="dock-sermon-lt-form__header">
                  <div className="dock-sermon-lt-form__title">
                    <Icon name="edit_note" size={14} />
                    <span>Content Fields</span>
                  </div>
                  <button
                    type="button"
                    className="dock-sermon-lt-form__theme-btn"
                    onClick={() => setSermonStep("theme")}
                    title="Change theme"
                  >
                    <Icon name="palette" size={14} />
                    <span>{selectedLtTheme.name}</span>
                    <Icon name="chevron_right" size={14} />
                  </button>
                </div>

                <div className="dock-sermon-lt-form__fields">
                  {(() => {
                    const grouped: Record<string, typeof selectedLtTheme.variables> = {};
                    for (const v of selectedLtTheme.variables) {
                      const varDef = v as Record<string, unknown>;
                      const key = varDef.key as string;
                      const group = varDef.group as string | undefined || "Content";
                      if (key === "state" || key === "animMode" || group === "Animation") continue;
                      if (!grouped[group]) grouped[group] = [];
                      grouped[group].push(v);
                    }

                    return Object.entries(grouped).map(([groupName, vars]) => (
                      <div key={groupName} className="dock-sermon-lt-form__group">
                        <div className="dock-sermon-lt-form__group-label">{groupName}</div>
                        {vars.map((v) => {
                          const varDef = v as Record<string, unknown>;
                          const key = varDef.key as string;
                          const label = (varDef.label as string) || key;
                          const type = varDef.type as string;
                          const placeholder = varDef.placeholder as string | undefined;
                          const required = varDef.required as boolean | undefined;
                          const value = ltVariableValues[key] ?? (varDef.defaultValue as string) ?? "";

                          if (type === "select" && Array.isArray(varDef.options)) {
                            return (
                              <label key={key} className="dock-sermon-lt-form__field">
                                <span>{label}{required && <span className="dock-sermon-lt-form__required">*</span>}</span>
                                <select
                                  className="dock-input"
                                  value={value}
                                  onChange={(e) => updateLtVariable(key, e.target.value)}
                                >
                                  {(varDef.options as Array<{ label: string; value: string }>).map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </label>
                            );
                          }

                          if (type === "text" && key.toLowerCase().includes("quote")) {
                            return (
                              <label key={key} className="dock-sermon-lt-form__field">
                                <span>{label}{required && <span className="dock-sermon-lt-form__required">*</span>}</span>
                                <textarea
                                  className="dock-input dock-sermon-lt-form__textarea"
                                  placeholder={placeholder || label}
                                  value={value}
                                  onChange={(e) => updateLtVariable(key, e.target.value)}
                                  rows={3}
                                />
                              </label>
                            );
                          }

                          return (
                            <label key={key} className="dock-sermon-lt-form__field">
                              <span>{label}{required && <span className="dock-sermon-lt-form__required">*</span>}</span>
                              <input
                                className="dock-input"
                                type="text"
                                placeholder={placeholder || label}
                                value={value}
                                onChange={(e) => updateLtVariable(key, e.target.value)}
                              />
                            </label>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              </section>
            )}

            {/* LT Theme Live Preview */}
            {activeItem && themeSource === "lt-template" && selectedLtTheme && selectedLtTheme.html && (
              <section className="dock-sermon-lt-preview">
                <div className="dock-sermon-lt-preview__header" onClick={() => setIsPreviewCollapsed((v) => !v)}>
                  <div className="dock-sermon-lt-preview__title">
                    <Icon name="visibility" size={14} />
                    <span>Live Preview</span>
                  </div>
                  <button type="button" className="dock-sermon-lt-preview__toggle" title={isPreviewCollapsed ? "Expand preview" : "Collapse preview"}>
                    <Icon name={isPreviewCollapsed ? "expand_more" : "expand_less"} size={16} />
                  </button>
                </div>
                {!isPreviewCollapsed && (
                  <div className="dock-sermon-lt-preview__frame dock-sermon-lt-preview__frame--scaled">
                    <iframe
                      className="dock-sermon-lt-preview__iframe"
                      srcDoc={buildLtPreviewHtml(selectedLtTheme, ltVariableValues, ltColorOverrides, true)}
                      title="Lower third preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                )}
              </section>
            )}

            {/* Slide Queue */}
            {activeItem && activeItem.slides.length > 0 && (
              <section className="dock-sermon-compose-queue">
                <div className="dock-sermon-compose-queue__header">
                  <div className="dock-sermon-compose-queue__title">Queue</div>
                  <span className="dock-sermon-compose-queue__count">{activeItem.slides.length}</span>
                </div>

                <div className="dock-sermon-compose-queue__list">
                  {activeItem.slides.map((slide, index) => {
                    const isSelected = selectedSlideId === slide.id;
                    const isShowing = isSelected && isVisible;
                    return (
                      <div
                        key={slide.id}
                        className={`dock-sermon-queue-card${isShowing ? " dock-sermon-queue-card--showing" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          handleSelectSlideFromQueue(activeItem.id, slide.id);
                        }}
                      >
                        <div className="dock-sermon-queue-card__badge">{index + 1}</div>
                        <div className="dock-sermon-queue-card__body">
                          <div className="dock-sermon-queue-card__text">
                            {displaySlideText(activeItem, slide)}
                          </div>
                          {activeItem.type === "quote" && attributionFor(activeItem) && (
                            <div className="dock-sermon-queue-card__meta">
                              {attributionFor(activeItem)}
                            </div>
                          )}
                        </div>
                        <div className="dock-sermon-queue-card__actions">
                          <button
                            type="button"
                            className="dock-sermon-queue-card__action dock-sermon-queue-card__action--show"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleShowSlide(activeItem, slide);
                            }}
                            title="Show"
                          >
                            <Icon name="play_arrow" size={14} />
                          </button>
                        </div>
                        {isShowing && (
                          <div className="dock-sermon-queue-card__showing-indicator">
                            <Icon name="fiber_manual_record" size={8} />
                            SHOWING
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Output Controls */}
            <section className="dock-sermon-compose-output">
              <div className="dock-sermon-compose-output__row">
                <button
                  type="button"
                  className="dock-sermon-compose-output__btn dock-sermon-compose-output__btn--preview"
                  onClick={() => activeItem && selectedSlide && pushSlide(activeItem, selectedSlide)}
                  disabled={!selectedSlide || sending}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className="dock-sermon-compose-output__btn dock-sermon-compose-output__btn--send"
                  onClick={() => {
                    if (activeItem && selectedSlide) {
                      pushSlide(activeItem, selectedSlide);
                    }
                  }}
                  disabled={!selectedSlide || sending}
                >
                  <Icon name="send" size={14} />
                  {sending ? "Sending..." : "Send to Display"}
                </button>
              </div>

              <div className="dock-sermon-compose-output__secondary">
                <button
                  type="button"
                  className="dock-sermon-compose-output__clear"
                  onClick={handleClearSermon}
                >
                  Clear
                </button>
              </div>
            </section>

            {/* Shortcut Hints */}

          </>
        )}

        {/* Action Error */}
        {actionError && (
          <div className="dock-dialog__error">
            <Icon name="warning" size={14} />
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError("")} className="dock-dialog__error-close">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {sermonStep === "theme" ? renderThemeStep() : renderComposeStep()}

      {itemModal && (
        <div className="dock-dialog-backdrop" role="presentation">
          <div className="dock-dialog" role="dialog" aria-modal="true" aria-labelledby="dock-sermon-item-title">
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">{itemModal.mode === "edit" ? "Edit Sermon Cue" : "Add Sermon Cue"}</div>
                <h2 id="dock-sermon-item-title" className="dock-dialog__title">Quote or point list</h2>
              </div>
              <button type="button" className="dock-dialog__close" onClick={closeItemModal} aria-label="Close sermon cue dialog">
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              <div className="dock-sermon-type-toggle" role="group" aria-label="Sermon cue type">
                {(["quote", "point"] as SermonItemType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`dock-theme-pill${itemModal.draft.type === type ? " dock-theme-pill--active" : ""}`}
                    onClick={() => {
                      setFormError("");
                      setItemModal((current) => current ? {
                        ...current,
                        draft: {
                          ...current.draft,
                          type,
                          speakerName: type === "point" ? "" : current.draft.speakerName,
                          seriesName: type === "point" ? "" : current.draft.seriesName,
                        },
                      } : current);
                    }}
                  >
                    {type === "quote" ? "Quote" : "Point"}
                  </button>
                ))}
              </div>

              {itemModal.draft.type === "quote" && (
                <div className="dock-sermon-quote-meta-row">
                  <label className="dock-dialog-field">
                    <span>Speaker name</span>
                    <input
                      className="dock-input"
                      value={itemModal.draft.speakerName}
                      onChange={(event) => setItemModal((current) => current ? {
                        ...current,
                        draft: { ...current.draft, speakerName: event.target.value },
                      } : current)}
                    />
                  </label>
                  <label className="dock-dialog-field">
                    <span>Topic / message title</span>
                    <input
                      className="dock-input"
                      value={itemModal.draft.topic}
                      onChange={(event) => setItemModal((current) => current ? {
                        ...current,
                        draft: { ...current.draft, topic: event.target.value },
                      } : current)}
                    />
                  </label>
                </div>
              )}

              {itemModal.draft.type === "quote" && (
                <label className="dock-dialog-field">
                  <span>Series name optional</span>
                  <input
                    className="dock-input"
                    value={itemModal.draft.seriesName}
                    onChange={(event) => setItemModal((current) => current ? {
                      ...current,
                      draft: { ...current.draft, seriesName: event.target.value },
                    } : current)}
                  />
                </label>
              )}

              <label className="dock-dialog-field">
                <span>{itemModal.draft.type === "quote" ? "Quote text" : "Point text"}</span>
                <textarea
                  className="dock-input dock-dialog-textarea dock-dialog-textarea--short"
                  value={itemModal.draft.content}
                  onChange={(event) => setItemModal((current) => current ? {
                    ...current,
                    draft: { ...current.draft, content: event.target.value },
                  } : current)}
                />
              </label>

              {formError && <div className="dock-dialog__error">{formError}</div>}
            </div>
            <div className="dock-dialog__footer">
              <button
                type="button"
                className="dock-btn dock-btn--ghost"
                onClick={clearItemModalFields}
              >
                Clear Fields
              </button>
              <button type="button" className="dock-btn dock-btn--ghost" onClick={closeItemModal}>Cancel</button>
              <button type="button" className="dock-btn dock-btn--primary" onClick={saveItemModal}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {slideModal && (
        <div className="dock-dialog-backdrop" role="presentation">
          <div className="dock-dialog dock-dialog--compact" role="dialog" aria-modal="true" aria-labelledby="dock-sermon-slide-title">
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">{slideModal.mode === "edit" ? "Edit Slide" : "Add Slide"}</div>
                <h2 id="dock-sermon-slide-title" className="dock-dialog__title">Sermon slide text</h2>
              </div>
              <button type="button" className="dock-dialog__close" onClick={closeSlideModal} aria-label="Close sermon slide dialog">
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              <label className="dock-dialog-field">
                <span>Slide text</span>
                <textarea
                  className="dock-input dock-dialog-textarea dock-dialog-textarea--short"
                  spellCheck
                  value={slideModal.content}
                  onChange={(event) => setSlideModal((current) => current ? { ...current, content: event.target.value } : current)}
                />
              </label>
              {formError && <div className="dock-dialog__error">{formError}</div>}
            </div>
            <div className="dock-dialog__footer">
              <button
                type="button"
                className="dock-btn dock-btn--preview"
                onClick={() => void cleanupSlideModal()}
                disabled={slideCleanupPending}
              >
                {slideCleanupPending ? "Cleaning..." : "Clean Text"}
              </button>
              <button
                type="button"
                className="dock-btn dock-btn--ghost"
                onClick={clearSlideModalFields}
              >
                Clear Text
              </button>
              <button type="button" className="dock-btn dock-btn--ghost" onClick={closeSlideModal}>Cancel</button>
              <button type="button" className="dock-btn dock-btn--primary" onClick={saveSlideModal}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showTextStyleModal && activeItem && activeSelectedSlide && (() => {
        const slide = activeSelectedSlide;
        const typo = getSlideTypography(slide, activeTheme);
        const hasOverrides = hasTypographyOverrides(slide);

        return (
          <div className="dock-dialog-backdrop" role="presentation" onClick={() => setShowTextStyleModal(false)}>
            <div className="dock-dialog dock-dialog--text-style" role="dialog" aria-modal="true" aria-labelledby="dock-text-style-title" onClick={(e) => e.stopPropagation()}>
              <div className="dock-dialog__header">
                <div>
                  <div className="dock-dialog__eyebrow">Typography</div>
                  <h2 id="dock-text-style-title" className="dock-dialog__title">Text Style</h2>
                </div>
                <button type="button" className="dock-dialog__close" onClick={() => setShowTextStyleModal(false)} aria-label="Close text style dialog">
                  <Icon name="close" size={14} />
                </button>
              </div>

              <div className="dock-dialog__body dock-dialog__body--scrollable">
                {/* Font Family */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">Font Family</div>
                  <div className="dock-sermon-text-style__fonts">
                    {SERMON_FONTS.map((font) => {
                      const isActive = slide.fontFamily === font.value;
                      return (
                        <button
                          key={font.value}
                          type="button"
                          className={`dock-sermon-text-style__font${isActive ? " dock-sermon-text-style__font--active" : ""}`}
                          style={{ fontFamily: font.value }}
                          onClick={() => updateSelectedSlideTypography({ fontFamily: isActive ? undefined : font.value })}
                        >
                          {font.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Size */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">
                    Font Size
                    <span className="dock-sermon-text-style__value">{typo.fontSize}px</span>
                  </div>
                  <div className="dock-sermon-text-style__size-ctrl">
                    <button
                      type="button"
                      className="dock-sermon-text-style__size-btn"
                      onClick={() => updateSelectedSlideTypography({ fontSizeDelta: (slide.fontSizeDelta ?? 0) - 4 })}
                    >
                      <Icon name="remove" size={14} />
                    </button>
                    <div className="dock-sermon-text-style__size-track">
                      <input
                        type="range"
                        className="dock-sermon-text-style__size-slider"
                        min={16}
                        max={120}
                        value={typo.fontSize}
                        onChange={(e) => updateSelectedSlideTypography({ fontSizeDelta: fontSizeDeltaFromValue(Number(e.target.value)) })}
                      />
                    </div>
                    <button
                      type="button"
                      className="dock-sermon-text-style__size-btn"
                      onClick={() => updateSelectedSlideTypography({ fontSizeDelta: (slide.fontSizeDelta ?? 0) + 4 })}
                    >
                      <Icon name="add" size={14} />
                    </button>
                  </div>
                </div>

                {/* Font Weight */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">Weight</div>
                  <div className="dock-sermon-text-style__segmented">
                    {([
                      { key: "normal", label: "Regular" },
                      { key: "bold", label: "Bold" },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        className={`dock-sermon-text-style__seg${slide.fontWeight === key ? " dock-sermon-text-style__seg--active" : ""}`}
                        onClick={() => updateSelectedSlideTypography({ fontWeight: slide.fontWeight === key ? undefined : key })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Case */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">Case</div>
                  <div className="dock-sermon-text-style__segmented">
                    {([
                      { key: false, label: "Aa" },
                      { key: true, label: "UPPER" },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={String(key)}
                        type="button"
                        className={`dock-sermon-text-style__seg${slide.uppercase === key ? " dock-sermon-text-style__seg--active" : ""}`}
                        onClick={() => updateSelectedSlideTypography({ uppercase: slide.uppercase === key ? false : key })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Line Height */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">
                    Line Height
                    <span className="dock-sermon-text-style__value">{typo.lineHeight.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    className="dock-sermon-text-style__slider"
                    min={1.0}
                    max={2.0}
                    step={0.05}
                    value={typo.lineHeight}
                    onChange={(e) => updateSelectedSlideTypography({ lineHeight: Number(e.target.value) })}
                  />
                  <div className="dock-sermon-text-style__slider-labels">
                    <span>Tight</span>
                    <span>Loose</span>
                  </div>
                </div>

                {/* Letter Spacing */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">
                    Letter Spacing
                    <span className="dock-sermon-text-style__value">{typo.letterSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    className="dock-sermon-text-style__slider"
                    min={-2}
                    max={8}
                    step={0.5}
                    value={typo.letterSpacing}
                    onChange={(e) => updateSelectedSlideTypography({ letterSpacing: Number(e.target.value) })}
                  />
                  <div className="dock-sermon-text-style__slider-labels">
                    <span>Tight</span>
                    <span>Wide</span>
                  </div>
                </div>

                {/* Text Width */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">
                    Text Width
                    <span className="dock-sermon-text-style__value">{typo.textWidth}%</span>
                  </div>
                  <input
                    type="range"
                    className="dock-sermon-text-style__slider"
                    min={30}
                    max={100}
                    step={5}
                    value={typo.textWidth}
                    onChange={(e) => updateSelectedSlideTypography({ textWidth: Number(e.target.value) })}
                  />
                  <div className="dock-sermon-text-style__slider-labels">
                    <span>Narrow</span>
                    <span>Full</span>
                  </div>
                </div>

                {/* Vertical Position */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">Vertical Position</div>
                  <div className="dock-sermon-text-style__position">
                    {(["top", "center", "bottom"] as const).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        className={`dock-sermon-text-style__pos${typo.verticalPos === pos ? " dock-sermon-text-style__pos--active" : ""}`}
                        onClick={() => updateSelectedSlideTypography({ verticalPos: typo.verticalPos === pos ? undefined : pos })}
                      >
                        <Icon name={pos === "top" ? "arrow_upward" : pos === "center" ? "drag_handle" : "arrow_downward"} size={14} />
                        <span>{pos === "top" ? "Top" : pos === "center" ? "Center" : "Bottom"}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Horizontal Alignment */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">Alignment</div>
                  <div className="dock-sermon-text-style__segmented">
                    {(["left", "center", "right"] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        className={`dock-sermon-text-style__seg${typo.textAlign === align ? " dock-sermon-text-style__seg--active" : ""}`}
                        onClick={() => updateSelectedSlideTypography({ textAlign: typo.textAlign === align ? undefined : align })}
                      >
                        <Icon name={align === "left" ? "format_align_left" : align === "center" ? "format_align_center" : "format_align_right"} size={14} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Safe Area */}
                <div className="dock-sermon-text-style__group">
                  <div className="dock-sermon-text-style__label">
                    <button
                      type="button"
                      className={`dock-sermon-text-style__toggle${typo.safeArea ? " dock-sermon-text-style__toggle--on" : ""}`}
                      onClick={() => updateSelectedSlideTypography({ safeArea: !typo.safeArea })}
                    >
                      <div className={`dock-sermon-text-style__toggle-track${typo.safeArea ? " dock-sermon-text-style__toggle-track--on" : ""}`}>
                        <div className="dock-sermon-text-style__toggle-thumb" />
                      </div>
                      <span>Safe Area Guides</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="dock-dialog__footer">
                {hasOverrides && (
                  <button
                    type="button"
                    className="dock-btn dock-btn--ghost"
                    onClick={resetSelectedSlideTypography}
                  >
                    <Icon name="restart_alt" size={14} />
                    Reset
                  </button>
                )}
                <button type="button" className="dock-btn dock-btn--primary" onClick={() => setShowTextStyleModal(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Color Settings Modal ── */}
      {showColorSettingsModal && themeSource === "lt-template" && (
        <div className="dock-dialog-backdrop" role="presentation" onClick={() => setShowColorSettingsModal(false)}>
          <div className="dock-dialog dock-dialog--color-settings" role="dialog" aria-modal="true" aria-labelledby="dock-color-settings-title" onClick={(e) => e.stopPropagation()}>
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">Appearance</div>
                <h2 id="dock-color-settings-title" className="dock-dialog__title">Color Settings</h2>
              </div>
              <button type="button" className="dock-dialog__close" onClick={() => setShowColorSettingsModal(false)} aria-label="Close color settings dialog">
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="dock-dialog__body dock-dialog__body--scrollable">
              <div className="dock-sermon-color-settings">
                {extractCssColorVars(selectedLtTheme?.html || "", selectedLtTheme?.css || "").map((v) => {
                  const label = v === "--fg" ? "Text" : v === "--accent" ? "Accent" : v === "--bg2" ? "Background 2" : v === "--bg1" ? "Background" : v === "--bg" ? "Background" : v === "--fw-white" ? "Top Bar BG" : v === "--fw-maroon" ? "Quote BG" : v === "--fw-text-dark" ? "Top Bar Text" : v === "--fw-text-white" ? "Quote Text" : v;
                  const val = ltColorOverrides[v] || extractColorValue(selectedLtTheme?.html || "", v) || extractColorValue(selectedLtTheme?.css || "", v) || "#000";
                  return (
                    <div key={v} className="dock-sermon-color-settings__group">
                      <div className="dock-sermon-color-settings__label">{label}</div>
                      <div className="dock-sermon-color-settings__color-ctrl">
                        <input
                          type="color"
                          className="dock-sermon-color-settings__picker"
                          value={val}
                          onChange={(e) => {
                            updateLtColor(v, e.target.value);
                            if (v === "--bg1" && selectedLtTheme?.html?.includes("--bg2:")) {
                              const darker = adjustColorBrightness(e.target.value, -15);
                              updateLtColor("--bg2", darker);
                            }
                          }}
                        />
                        <input
                          type="text"
                          className="dock-sermon-color-settings__hex"
                          value={val}
                          onChange={(e) => updateLtColor(v, e.target.value)}
                          placeholder="#000"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="dock-dialog__footer">
              {Object.keys(ltColorOverrides).length > 0 && (
                <button
                  type="button"
                  className="dock-btn dock-btn--ghost"
                  onClick={resetLtColors}
                >
                  <Icon name="restart_alt" size={14} />
                  Reset
                </button>
              )}
              <button type="button" className="dock-btn dock-btn--primary" onClick={() => setShowColorSettingsModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Drawer ── */}
      {showHistoryDrawer && (
        <div className="dock-sermon-history-backdrop" onClick={() => setShowHistoryDrawer(false)}>
          <div className="dock-sermon-history-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="dock-sermon-history-drawer__header">
              <div>
                <div className="dock-sermon-history-drawer__eyebrow">Quick Recovery</div>
                <h3 className="dock-sermon-history-drawer__title">History</h3>
              </div>
              <button type="button" className="dock-sermon-history-drawer__close" onClick={() => setShowHistoryDrawer(false)} aria-label="Close history">
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-sermon-history-drawer__body">
              {history.length === 0 ? (
                <div className="dock-sermon-history-drawer__empty">
                  <Icon name="history" size={20} />
                  <p>No history yet</p>
                  <span>Quotes sent live or previewed appear here</span>
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="dock-sermon-history-card">
                    <div className="dock-sermon-history-card__preview" style={{
                      background: item.themeSource === "lt-template"
                        ? (item.ltColorOverrides?.["--bg1"] || item.ltColorOverrides?.["--bg"] || item.ltColorOverrides?.["--fw-maroon"] || "#0F172A")
                        : "#0F172A",
                      color: item.themeSource === "lt-template"
                        ? (item.ltColorOverrides?.["--fg"] || item.ltColorOverrides?.["--fw-text-white"] || "#fff")
                        : "#fff",
                    }}>
                      <span>{item.type === "quote" ? "Q" : "P"}</span>
                    </div>
                    <div className="dock-sermon-history-card__content">
                      <div className="dock-sermon-history-card__topic">
                        {item.topic}
                        <span className={`dock-sermon-history-card__type ${item.type === "quote" ? "quote" : "point"}`}>
                          {item.type}
                        </span>
                      </div>
                      <div className="dock-sermon-history-card__excerpt">
                        {item.content.length > 60 ? `${item.content.slice(0, 60)}…` : item.content}
                      </div>
                      <div className="dock-sermon-history-card__meta">
                        {item.speakerName && <span>{item.speakerName}</span>}
                        <span className="dock-sermon-history-card__time">{formatTimeAgo(item.timestamp)}</span>
                      </div>
                    </div>
                    <div className="dock-sermon-history-card__actions">
                      <button
                        type="button"
                        className="dock-sermon-history-card__action dock-sermon-history-card__action--restore"
                        onClick={() => restoreFromHistory(item)}
                        title="Restore"
                      >
                        <Icon name="restore" size={14} />
                      </button>
                      <button
                        type="button"
                        className="dock-sermon-history-card__action dock-sermon-history-card__action--delete"
                        onClick={() => {
                          const next = history.filter((h) => h.id !== item.id);
                          setHistory(next);
                          saveSermonHistory(next);
                        }}
                        title="Delete"
                      >
                        <Icon name="delete" size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
