/**
 * DockMinistryTab.tsx — Ministry tab for the MakeChurchEasy Dock
 *
 * Sub-tabs:
 *   1. Lower Thirds — send/blank lower-third overlays via OBS
 *   2. Countdowns — countdown timers
 *   3. Tickers — push scrolling ticker announcements to OBS
 *
 * Uses dockObsClient for OBS communication (same WebSocket
 * connection shared across all dock tabs).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import type { DockStagedItem } from "../dockTypes";
import type { DockPresentationOutputTarget } from "../dockPresentationTarget";
import { isPresentationLinkTarget } from "../dockPresentationTarget";
import Icon from "../DockIcon";
import { LT_ALL_THEMES } from "../../lowerthirds/themes";
import { loadDockLTFavorites, loadDockFavoriteBibleThemes, loadDockTickerFavorites } from "../dockThemeData";
import { FAVORITE_THEMES_UPDATED_EVENT } from "../../services/favoriteThemes";
import { dockClient } from "../../services/dockBridge";
import type { LowerThirdTheme } from "../../lowerthirds/types";
import type { LTSize } from "../../lowerthirds/types";
import { LT_SIZE_LABELS, LT_SIZE_SCALE } from "../../lowerthirds/types";
import type { BibleTheme } from "../../bible/types";
import type { BibleThemeSettings } from "../../bible/types";
import type { TickerThemeColors } from "../../components/modules/tickerThemes";
import allThemesData from "../../../lower_thirds/all_themes.json";
import DockLowerThirdEditor from "./DockLowerThirdEditor";
import DockCountdownsTab from "./DockCountdownsTab";
import { requireEntitlement, getDockPlan, showUpgradeModal } from "../dockEntitlement";
import { getUserScopedKey } from "../../services/userScopedStorage";
import { getSettings } from "../../multiview/mvStore";
import { normalizeBrandColor } from "../../lowerthirds/runtimeBranding";
import { loadProjectionSettings, saveProjectionSettings } from "../dockProjectionSettings";
import { resolveOverlayAssetUrl } from "../../services/overlayUrl";
import {
  clearPresentationScreen,
  publishTickerToPresentation,
} from "../../services/presentationPublish";
import {
  DEFAULT_DOCK_TICKER_THEME_OPTION,
  getDockTickerThemeOptionsForFavorites,
  renderDockTickerThemeHtml,
  resolveDockTickerThemeOption,
} from "../tickerThemeCatalog";
import {
  REMOTE_PRODUCTION_THEMES_UPDATED_EVENT,
  fetchRemoteProductionThemes,
  getCachedRemoteProductionThemes,
  mergeRemoteLowerThirdThemes,
  type RemoteProductionTheme,
} from "../../services/remoteProductionThemes";

const ALL_LT_THEMES: LowerThirdTheme[] = [
  ...LT_ALL_THEMES,
  ...((allThemesData.themes as unknown as LowerThirdTheme[]) || [])
    .map((t) => t)
    .filter(
      (t) => !LT_ALL_THEMES.some((lt) => lt.id === t.id),
    ),
];

// Tagged union: supports both LowerThirdTheme (HTML template) and BibleTheme (CSS overlay)
interface LTThemeEntry {
  kind: "lt";
  theme: LowerThirdTheme;
  label: string;
}
interface BibleThemeEntry {
  kind: "bible";
  theme: BibleTheme;
  label: string;
}
type MixedLTThemeEntry = LTThemeEntry | BibleThemeEntry;

const MINISTRY_LT_SIZE_OPTIONS: LTSize[] = ["xs", "sm", "md", "lg"];
const DEFAULT_MINISTRY_LT_SIZE: LTSize = "sm";

function resolveMinistryLtSize(value: unknown): LTSize {
  return MINISTRY_LT_SIZE_OPTIONS.includes(value as LTSize) ? (value as LTSize) : DEFAULT_MINISTRY_LT_SIZE;
}

interface TickerMessage {
  id: string;
  text: string;
  active: boolean;
}

type TickerColorOverrides = Partial<TickerThemeColors>;
type TickerColorKey = keyof TickerThemeColors;

interface TickerSettings {
  speed: number;
  position: "top" | "bottom";
  loop: boolean;
  themeId: string;
  heading: string;
  colors: TickerColorOverrides;
}

interface TickerBranding {
  logoUrl: string;
  brandName: string;
  brandColor: string;
}

type BibleLtColorKey =
  | "fontColor"
  | "refFontColor"
  | "backgroundColor"
  | "boxBackground"
  | "referenceBackgroundColor";
type BibleLtColorOverrides = Partial<Pick<BibleThemeSettings, BibleLtColorKey>>;
type BibleLtColorOverrideMap = Record<string, BibleLtColorOverrides>;

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  presentationOutputTarget?: DockPresentationOutputTarget;
  hideTickerControls?: boolean;
  hideLowerThirdControls?: boolean;
}

const STORAGE_KEY = "dock-ticker-messages";
const SETTINGS_KEY = "dock-ticker-settings";
const BIBLE_LT_COLOR_OVERRIDES_KEY = "dock-bible-lt-color-overrides";
const MAX_CHARS = 140;
const TICKER_HEIGHT = 80;
const TICKER_COLOR_POPOVER_WIDTH = 270;
const COLOR_INPUT_FALLBACK = "#1d4ed8";
const TICKER_COLOR_INPUT_FALLBACKS: Record<TickerColorKey, string> = {
  accent: "#1d4ed8",
  accentText: "#ffffff",
  barBg: "#0f172a",
  barText: "#ffffff",
  separator: "#f97316",
};
const TICKER_COLOR_CONTROLS: Array<{ key: TickerColorKey; label: string }> = [
  { key: "accent", label: "Heading background" },
  { key: "accentText", label: "Heading text" },
  { key: "barText", label: "Ticker text" },
  { key: "barBg", label: "Ticker background" },
  { key: "separator", label: "Separator" },
];
const BIBLE_LT_COLOR_CONTROLS: Array<{ key: BibleLtColorKey; label: string; fallback: string }> = [
  { key: "fontColor", label: "Text", fallback: "#ffffff" },
  { key: "refFontColor", label: "Reference", fallback: "#f8fafc" },
  { key: "backgroundColor", label: "Screen background", fallback: "#000000" },
  { key: "boxBackground", label: "Lower-third bar", fallback: "#111827" },
  { key: "referenceBackgroundColor", label: "Reference badge", fallback: "#f97316" },
];
const EMPTY_BIBLE_LT_OVERRIDES: BibleLtColorOverrides = {};

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadMessages(): TickerMessage[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveMessages(msgs: TickerMessage[]) {
  try { localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(msgs)); } catch { /* ignore */ }
}

function sanitizeCssColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 80);
  if (!trimmed) return undefined;
  if (/[;{}<>]/.test(trimmed)) return undefined;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return trimmed;
  if (/^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(trimmed)) return trimmed;
  if (/^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(trimmed)) return trimmed;
  return undefined;
}

function colorInputValue(value: unknown, fallback: string = COLOR_INPUT_FALLBACK): string {
  const color = sanitizeCssColor(value);
  if (!color) return fallback;
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return fallback;
  if (hex.length === 3) {
    return `#${hex.split("").map((char) => char + char).join("")}`.toLowerCase();
  }
  return `#${hex}`.toLowerCase();
}

function loadTickerColorOverrides(raw: unknown): TickerColorOverrides {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const next: TickerColorOverrides = {};
  for (const { key } of TICKER_COLOR_CONTROLS) {
    const color = sanitizeCssColor(source[key]);
    if (color) next[key] = color;
  }
  return next;
}

function loadBibleLtColorOverrides(): BibleLtColorOverrideMap {
  try {
    const raw = localStorage.getItem(getUserScopedKey(BIBLE_LT_COLOR_OVERRIDES_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: BibleLtColorOverrideMap = {};
    for (const [themeId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const source = value as Record<string, unknown>;
      const overrides: BibleLtColorOverrides = {};
      for (const { key } of BIBLE_LT_COLOR_CONTROLS) {
        const color = sanitizeCssColor(source[key]);
        if (color) overrides[key] = color;
      }
      if (Object.keys(overrides).length > 0) next[themeId] = overrides;
    }
    return next;
  } catch {
    return {};
  }
}

function saveBibleLtColorOverrides(value: BibleLtColorOverrideMap) {
  try {
    localStorage.setItem(getUserScopedKey(BIBLE_LT_COLOR_OVERRIDES_KEY), JSON.stringify(value));
  } catch { /* ignore */ }
}

function loadSettings(): TickerSettings {
  const defaultTheme = DEFAULT_DOCK_TICKER_THEME_OPTION;
  try {
    const raw = localStorage.getItem(getUserScopedKey(SETTINGS_KEY));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TickerSettings>;
      const parsedTheme = resolveDockTickerThemeOption(parsed.themeId) ?? defaultTheme;
      return {
        speed: typeof parsed.speed === "number" ? parsed.speed : 50,
        position: parsed.position === "top" ? "top" : "bottom",
        loop: typeof parsed.loop === "boolean" ? parsed.loop : true,
        themeId: parsedTheme?.id ?? "",
        heading: typeof parsed.heading === "string" && parsed.heading.trim()
          ? parsed.heading.slice(0, 20)
          : parsedTheme?.defaultHeading ?? "LIVE",
        colors: loadTickerColorOverrides(parsed.colors),
      };
    }
  } catch { /* ignore */ }
  return {
    speed: 50,
    position: "bottom",
    loop: true,
    themeId: defaultTheme?.id ?? "",
    heading: defaultTheme?.defaultHeading ?? "LIVE",
    colors: {},
  };
}

function saveSettings(s: TickerSettings) {
  try { localStorage.setItem(getUserScopedKey(SETTINGS_KEY), JSON.stringify(s)); } catch { /* ignore */ }
}

function loadInitialTickerBranding(): TickerBranding {
  const settings = getSettings();
  return {
    logoUrl: resolveOverlayAssetUrl(settings.brandLogoPath),
    brandName: settings.churchName || "MakeChurchEasy",
    brandColor: settings.brandColor || "#6A34DE",
  };
}

type MinistrySubTab = "ticker" | "lower-thirds" | "countdowns";

const MINISTRY_TAB_KEY = "dock-ministry-active-tab";

function loadMinistryTab(): MinistrySubTab {
  try {
    const raw = localStorage.getItem(MINISTRY_TAB_KEY);
    if (raw === "ticker" || raw === "lower-thirds" || raw === "countdowns") return raw;
  } catch { /* ignore */ }
  return "ticker";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DockMinistryTab({
  staged: _staged,
  onStage: _onStage,
  presentationOutputTarget = "obs",
  hideTickerControls = false,
  hideLowerThirdControls = false,
}: Props) {
  const { t } = useTranslation();
  const presentationLinkMode = isPresentationLinkTarget(presentationOutputTarget);
  const showTickerTab = !hideTickerControls;
  const showLowerThirdTab = !hideLowerThirdControls;
  const [subTab, setSubTab] = useState<MinistrySubTab>(loadMinistryTab);
  const [messages, setMessages] = useState<TickerMessage[]>(loadMessages);
  const [newText, setNewText] = useState("");
  const [settings, setSettings] = useState<TickerSettings>(loadSettings);
  const [running, setRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [obsConnected, setObsConnected] = useState(dockObsClient.isConnected);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dockPlan, setDockPlan] = useState<string>(() => getDockPlan());
  const showCountdownsTab = dockPlan !== "free";
  const [tickerFavIds, setTickerFavIds] = useState<Set<string>>(new Set());
  const [remoteProductionThemes, setRemoteProductionThemes] = useState<RemoteProductionTheme[]>(() => getCachedRemoteProductionThemes());
  const [tickerBranding, setTickerBranding] = useState<TickerBranding>(loadInitialTickerBranding);
  const [tickerColorPopoverOpen, setTickerColorPopoverOpen] = useState(false);
  const [tickerColorPopoverPosition, setTickerColorPopoverPosition] = useState({ top: 0, left: 0 });
  const [bibleLtColorOverrides, setBibleLtColorOverrides] = useState<BibleLtColorOverrideMap>(loadBibleLtColorOverrides);

  // Lower-thirds state — mixed LowerThirdTheme + BibleTheme entries
  const [ltFavorites, setLtFavorites] = useState<MixedLTThemeEntry[]>([]);
  const [ltSelectedIdx, setLtSelectedIdx] = useState(0);
  const [ltSending, setLtSending] = useState(false);
  const [ltFeedback, setLtFeedback] = useState<string | null>(null);
  const [ltFeedbackTone, setLtFeedbackTone] = useState<"success" | "error">("success");
  const [ltSize, setLtSize] = useState<LTSize>(() => {
    const saved = getSettings().defaultSpeakerSize;
    return resolveMinistryLtSize(saved);
  });
  const [ltLive, setLtLive] = useState(false);
  // BibleTheme lower-third text input (used when a BibleTheme is selected)
  const [bibleLtText, setBibleLtText] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tickerColorPopoverRef = useRef<HTMLDivElement | null>(null);
  const tickerColorPopoverPanelRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const availableLtThemes = useMemo(
    () => mergeRemoteLowerThirdThemes(ALL_LT_THEMES, remoteProductionThemes),
    [remoteProductionThemes],
  );

  const updateTickerColorPopoverPosition = useCallback(() => {
    const anchor = tickerColorPopoverRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = window.innerWidth || 320;
    const viewportHeight = window.innerHeight || 480;
    const left = Math.max(
      margin,
      Math.min(rect.right - TICKER_COLOR_POPOVER_WIDTH, viewportWidth - TICKER_COLOR_POPOVER_WIDTH - margin),
    );
    const estimatedHeight = 224;
    const top = rect.bottom + estimatedHeight + margin > viewportHeight
      ? Math.max(margin, rect.top - estimatedHeight - 4)
      : rect.bottom + 4;
    setTickerColorPopoverPosition({ top, left });
  }, []);

  // Persist
  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { saveBibleLtColorOverrides(bibleLtColorOverrides); }, [bibleLtColorOverrides]);
  useEffect(() => { try { localStorage.setItem(MINISTRY_TAB_KEY, subTab); } catch { /* ignore */ } }, [subTab]);
  useEffect(() => {
    const tabHidden =
      (subTab === "ticker" && !showTickerTab) ||
      (subTab === "lower-thirds" && !showLowerThirdTab) ||
      (subTab === "countdowns" && !showCountdownsTab);
    if (!tabHidden) return;
    const fallback = showTickerTab
      ? "ticker"
      : showLowerThirdTab
        ? "lower-thirds"
        : showCountdownsTab
          ? "countdowns"
          : null;
    if (fallback && fallback !== subTab) setSubTab(fallback);
  }, [showCountdownsTab, showLowerThirdTab, showTickerTab, subTab]);

  useEffect(() => {
    if (!tickerColorPopoverOpen) return;
    updateTickerColorPopoverPosition();
    const closeOnPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (tickerColorPopoverRef.current?.contains(target)) return;
      if (tickerColorPopoverPanelRef.current?.contains(target)) return;
      setTickerColorPopoverOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTickerColorPopoverOpen(false);
    };
    const reposition = () => updateTickerColorPopoverPosition();
    document.addEventListener("mousedown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [tickerColorPopoverOpen, updateTickerColorPopoverPosition]);

  // OBS connection
  useEffect(() => {
    mountedRef.current = true;
    const unsub = dockObsClient.onStatusChange((status) => {
      if (mountedRef.current) setObsConnected(status === "connected");
    });
    if (mountedRef.current) setObsConnected(dockObsClient.isConnected);
    return () => { mountedRef.current = false; unsub(); };
  }, []);

  // Refresh dock plan every 30s (matches DockAuthGate polling)
  useEffect(() => {
    const id = setInterval(() => {
      if (mountedRef.current) setDockPlan(getDockPlan());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const localBranding = loadInitialTickerBranding();
    fetch(`/uploads/dock-branding.json?_=${Date.now()}`, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((branding: unknown) => {
        if (cancelled || !branding || typeof branding !== "object") return;
        const data = branding as Record<string, unknown>;
        const logoFileName = typeof data.brandLogoFileName === "string" ? data.brandLogoFileName.trim() : "";
        const brandLogoPath = typeof data.brandLogoPath === "string" ? data.brandLogoPath.trim() : "";
        const logoUrl = logoFileName
          ? resolveOverlayAssetUrl(`/uploads/${encodeURIComponent(logoFileName)}`)
          : resolveOverlayAssetUrl(brandLogoPath || localBranding.logoUrl);
        setTickerBranding({
          logoUrl,
          brandName: typeof data.churchName === "string" && data.churchName.trim()
            ? data.churchName.trim()
            : localBranding.brandName,
          brandColor: typeof data.brandColor === "string" && data.brandColor.trim()
            ? data.brandColor.trim()
            : localBranding.brandColor,
        });
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const syncCachedRemoteThemes = () => setRemoteProductionThemes(getCachedRemoteProductionThemes());
    syncCachedRemoteThemes();
    void fetchRemoteProductionThemes().then((themes) => {
      if (mountedRef.current) setRemoteProductionThemes(themes);
    });
    window.addEventListener(REMOTE_PRODUCTION_THEMES_UPDATED_EVENT, syncCachedRemoteThemes);
    return () => window.removeEventListener(REMOTE_PRODUCTION_THEMES_UPDATED_EVENT, syncCachedRemoteThemes);
  }, []);

  // Enforce free plan: delete MCE Ticker source from OBS when user is free/downgraded
  useEffect(() => {
    if (dockPlan !== "free") return;
    if (!obsConnected) return;

    (async () => {
      try {
        // Remove "MCE Ticker" input — OBS auto-removes all scene items referencing it
        await dockObsClient.call("RemoveInput", { inputName: "MCE Ticker" }).catch(() => { });
        console.log("[DockMinistry] Free plan enforced: removed MCE Ticker source");
      } catch { /* OBS may not be connected, source may not exist */ }
    })();
  }, [dockPlan, obsConnected]);

  // Clear feedback after 3s
  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => { if (mountedRef.current) { setSuccess(null); setError(null); } }, 3000);
    return () => clearTimeout(t);
  }, [success, error]);

  // Clear LT feedback after 3s
  useEffect(() => {
    if (!ltFeedback) return;
    const t = setTimeout(() => { if (mountedRef.current) setLtFeedback(null); }, 3000);
    return () => clearTimeout(t);
  }, [ltFeedback]);

  const refreshLtFavorites = useCallback(async () => {
    try {
      const [ltIdSet, bibleThemes] = await Promise.all([
        loadDockLTFavorites().catch(() => new Set<string>()),
        loadDockFavoriteBibleThemes().catch(() => [] as BibleTheme[]),
      ]);
      const entries: MixedLTThemeEntry[] = [];

      // LowerThirdTheme favorites — only show themes favorited/added to OBS
      const ltThemes = availableLtThemes.filter((t) => ltIdSet.has(t.id));
      for (const t of ltThemes) {
        entries.push({ kind: "lt", theme: t, label: t.name });
      }

      // BibleTheme lower-third favorites (custom themes from ProductionThemeSettingsPage)
      for (const bt of bibleThemes) {
        entries.push({ kind: "bible", theme: bt, label: `✦ ${bt.name}` });
      }

      setLtFavorites(entries);
    } catch (err) {
      console.warn("[DockMinistry] Failed to load LT favorites:", err);
      setLtFavorites([]);
    }
  }, [availableLtThemes]);

  const refreshTickerFavorites = useCallback(async () => {
    try {
      const favIds = await loadDockTickerFavorites();
      setTickerFavIds(favIds);
      const available = getDockTickerThemeOptionsForFavorites(favIds, remoteProductionThemes);
      setSettings((current) => {
        const currentTheme = available.find((option) => option.id === current.themeId);
        if (currentTheme) return current;
        const fallback = available[0];
        return fallback
          ? { ...current, themeId: fallback.id, heading: fallback.defaultHeading }
          : current;
      });
    } catch {
      // Keep the current ticker theme list if favorites cannot be read.
    }
  }, [remoteProductionThemes]);

  // Load favorite LT themes (both LowerThirdTheme and BibleTheme lower-thirds)
  useEffect(() => {
    void refreshLtFavorites();
  }, [refreshLtFavorites]);

  // Load ticker favorites
  useEffect(() => {
    void refreshTickerFavorites();
  }, [refreshTickerFavorites]);

  useEffect(() => {
    const refreshAll = () => {
      void refreshLtFavorites();
      void refreshTickerFavorites();
    };
    window.addEventListener(FAVORITE_THEMES_UPDATED_EVENT, refreshAll);
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.includes("ocs-fav-")) {
        refreshAll();
      }
    };
    window.addEventListener("storage", onStorage);
    const unsubscribe = dockClient.onState((msg) => {
      if (msg.type === "state:favorite-themes-updated") {
        refreshAll();
      }
    });
    return () => {
      window.removeEventListener(FAVORITE_THEMES_UPDATED_EVENT, refreshAll);
      window.removeEventListener("storage", onStorage);
      unsubscribe();
    };
  }, [refreshLtFavorites, refreshTickerFavorites]);

  const effectiveThemeList = getDockTickerThemeOptionsForFavorites(tickerFavIds, remoteProductionThemes);
  const selectedTickerTheme =
    effectiveThemeList.find((option) => option.id === settings.themeId) ??
    effectiveThemeList[0] ??
    DEFAULT_DOCK_TICKER_THEME_OPTION;
  const activeMessages = messages.filter((m) => m.active);

  const tickerColors: TickerThemeColors | undefined = (() => {
    if (!selectedTickerTheme) return undefined;
    const brandColor = normalizeBrandColor(tickerBranding.brandColor);
    const baseColors: TickerThemeColors = selectedTickerTheme.source === "dock" || selectedTickerTheme.source === "remote"
      ? {
        ...selectedTickerTheme.theme.defaultColors,
        accent: brandColor,
        separator: brandColor,
      }
      : {
        accent: sanitizeCssColor(selectedTickerTheme.accentColor) ?? brandColor,
        accentText: "#ffffff",
        barBg: "#0f172a",
        barText: "#ffffff",
        separator: sanitizeCssColor(selectedTickerTheme.accentColor) ?? brandColor,
      };
    return {
      ...baseColors,
      ...loadTickerColorOverrides(settings.colors),
    };
  })();
  const tickerBrandLogoUrl = selectedTickerTheme?.source === "dock" || selectedTickerTheme?.source === "remote"
    ? tickerBranding.logoUrl
    : "";
  const tickerBrandName = tickerBranding.brandName || "MakeChurchEasy";

  const fallbackLtTheme = (availableLtThemes[0] ?? ALL_LT_THEMES[0]) as LowerThirdTheme;
  const ltSelectedEntry = ltFavorites[ltSelectedIdx] ?? ltFavorites[0] ?? { kind: "lt" as const, theme: fallbackLtTheme, label: fallbackLtTheme?.name ?? "Speaker" };
  const selectedBibleLtSettings = ltSelectedEntry.kind === "bible"
    ? (ltSelectedEntry.theme.variants?.lowerThird?.settings ?? ltSelectedEntry.theme.settings)
    : null;
  const selectedBibleLtOverrides = ltSelectedEntry.kind === "bible"
    ? (bibleLtColorOverrides[ltSelectedEntry.theme.id] ?? EMPTY_BIBLE_LT_OVERRIDES)
    : EMPTY_BIBLE_LT_OVERRIDES;
  const selectedBibleLtEffectiveSettings = useMemo<Record<string, unknown> | null>(
    () => selectedBibleLtSettings
      ? {
        ...(selectedBibleLtSettings as unknown as Record<string, unknown>),
        ...selectedBibleLtOverrides,
      }
      : null,
    [selectedBibleLtSettings, selectedBibleLtOverrides],
  );
  const selectedBibleLtAnimationDuration = selectedBibleLtEffectiveSettings
    ? Number(selectedBibleLtEffectiveSettings.animationDuration) || 800
    : 800;

  // Reset selected index when favorites change
  useEffect(() => { setLtSelectedIdx(0); }, [ltFavorites]);

  const handleSelectLtTheme = useCallback((entryIdx: number) => {
    if (entryIdx >= 0 && entryIdx < ltFavorites.length) setLtSelectedIdx(entryIdx);
  }, [ltFavorites]);

  const setTickerColorOverride = useCallback((key: TickerColorKey, value: string) => {
    setSettings((current) => {
      const nextColors = { ...(current.colors ?? {}) };
      const color = sanitizeCssColor(value);
      if (color) {
        nextColors[key] = color;
      } else {
        delete nextColors[key];
      }
      return { ...current, colors: nextColors };
    });
  }, []);

  const setBibleLtColorOverride = useCallback((themeId: string, key: BibleLtColorKey, value: string) => {
    setBibleLtColorOverrides((current) => {
      const themeOverrides = { ...(current[themeId] ?? {}) };
      const color = sanitizeCssColor(value);
      if (color) {
        themeOverrides[key] = color;
      } else {
        delete themeOverrides[key];
      }
      const next = { ...current };
      if (Object.keys(themeOverrides).length > 0) {
        next[themeId] = themeOverrides;
      } else {
        delete next[themeId];
      }
      return next;
    });
  }, []);

  // ── Add message ──
  const handleAdd = useCallback(async () => {
    if (!(await requireEntitlement("tickers", 0))) return;
    const text = newText.trim();
    if (!text) return;
    if (text.length > MAX_CHARS) return;
    setMessages((prev) => [...prev, { id: genId(), text, active: true }]);
    setNewText("");
    textareaRef.current?.focus();
  }, [newText]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  }, [handleAdd]);

  // ── Toggle message active ──
  const handleToggleMessage = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, active: !m.active } : m));
  }, []);

  // ── Delete message ──
  const handleDelete = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ── Edit message ──
  const handleStartEdit = useCallback((id: string, text: string) => {
    setEditingId(id);
    setEditText(text);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    const text = editText.trim();
    if (!text || text.length > MAX_CHARS) return;
    setMessages((prev) => prev.map((m) => m.id === editingId ? { ...m, text } : m));
    setEditingId(null);
    setEditText("");
  }, [editingId, editText]);

  // ── Push ticker to OBS ──
  const handlePush = useCallback(async () => {
    if (!(await requireEntitlement("tickers", 0))) return;
    if (activeMessages.length === 0) {
      setError(t("ministry.addAtLeastOne"));
      return;
    }
    if (!selectedTickerTheme) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      if (presentationLinkMode) {
        await publishTickerToPresentation({
          text: activeMessages.map((m) => m.text).join("   •   "),
          position: settings.position,
          speed: settings.speed,
          textColor: tickerColors?.barText,
          backgroundColor: tickerColors?.barBg,
          paused: false,
        });
        setRunning(true);
        setIsPaused(false);
        setSuccess(t("ministry.tickerLive"));
        return;
      }

      await ensureObsConnected();
      const html = renderDockTickerThemeHtml({
        option: selectedTickerTheme,
        heading: settings.heading,
        messages: activeMessages.map((m) => m.text),
        speed: settings.speed,
        position: settings.position,
        loop: settings.loop,
        paused: false,
        colors: tickerColors,
        brandLogoUrl: tickerBrandLogoUrl,
        brandName: tickerBrandName,
      });

      const video = await dockObsClient.call("GetVideoSettings") as { baseWidth: number; baseHeight: number };
      const canvasW = video.baseWidth;
      const canvasH = video.baseHeight;
      const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);
      const sourceName = "MCE Ticker";
      const presentationSceneName = "MCE Presentation";

      // Always route MCE Ticker to MCE Presentation scene
      const targetScene = presentationSceneName;

      // Ensure MCE Presentation scene exists
      const scenes = await dockObsClient.call("GetSceneList") as { scenes: Array<{ sceneName: string }> };
      const sceneExists = scenes.scenes.some((s) => s.sceneName === presentationSceneName);
      if (!sceneExists) {
        await dockObsClient.call("CreateScene", { sceneName: presentationSceneName });
        await new Promise((r) => setTimeout(r, 100));
      }

      // Create or update MCE Ticker browser source in target scene
      const inputs = await dockObsClient.call("GetInputList") as { inputs: Array<{ inputName: string }> };
      const inputExists = inputs.inputs.some((i) => i.inputName === sourceName);

      let sceneItemId: number;
      if (inputExists) {
        await dockObsClient.call("SetInputSettings", {
          inputName: sourceName,
          inputSettings: { url: dataUrl, width: canvasW, height: TICKER_HEIGHT, shutdown: false, restart_when_active: false },
        });
        const items = await dockObsClient.call("GetSceneItemList", { sceneName: targetScene }) as { sceneItems: Array<{ sourceName: string; sceneItemId: number }> };
        const existing = items.sceneItems.find((i) => i.sourceName === sourceName);
        if (existing) {
          sceneItemId = existing.sceneItemId;
          await dockObsClient.call("SetSceneItemEnabled", { sceneName: targetScene, sceneItemId, sceneItemEnabled: true });
        } else {
          const created = await dockObsClient.call("CreateSceneItem", { sceneName: targetScene, sourceName, sceneItemEnabled: true }) as { sceneItemId: number };
          sceneItemId = created.sceneItemId;
        }
      } else {
        const created = await dockObsClient.call("CreateInput", {
          sceneName: targetScene,
          inputName: sourceName,
          inputKind: "browser_source",
          inputSettings: { url: dataUrl, width: canvasW, height: TICKER_HEIGHT, css: "", shutdown: false, restart_when_active: false },
          sceneItemEnabled: true,
        }) as { sceneItemId: number };
        sceneItemId = created.sceneItemId;
      }

      // Position ticker
      const posY = settings.position === "top" ? 0 : canvasH - TICKER_HEIGHT;
      await dockObsClient.call("SetSceneItemTransform", {
        sceneName: targetScene,
        sceneItemId,
        sceneItemTransform: {
          positionX: 0,
          positionY: posY,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          boundsType: "OBS_BOUNDS_STRETCH",
          boundsWidth: canvasW,
          boundsHeight: TICKER_HEIGHT,
          boundsAlignment: 0,
          cropLeft: 0,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
        },
      });
      await dockObsClient.ensureTickerAboveSource(targetScene, sourceName).catch(() => { });
      await dockObsClient.syncLowerThirdTickerClearance(targetScene).catch(() => { });

      const projectionSettings = loadProjectionSettings();
      if (projectionSettings.tickerLayerPriority !== "ticker-above") {
        saveProjectionSettings({
          ...projectionSettings,
          tickerLayerPriority: "ticker-above",
        });
      }

      await dockObsClient.applyProjectionSettings({ allowSceneMutation: true }).catch(() => { });

      setRunning(true);
      setIsPaused(false);
      setSuccess(t("ministry.tickerLive"));
    } catch (err) {
      console.warn("[DockMinistry] Push failed:", err);
      setError(err instanceof Error ? err.message : t("ministry.pushFailed"));
    } finally {
      setSending(false);
    }
  }, [activeMessages, presentationLinkMode, selectedTickerTheme, settings, t, tickerBrandLogoUrl, tickerBrandName, tickerColors]);

  // ── Pause ticker (stops scroll in OBS) ──
  const handlePause = useCallback(async () => {
    if (!selectedTickerTheme) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      if (presentationLinkMode) {
        await publishTickerToPresentation({
          text: activeMessages.map((m) => m.text).join("   •   "),
          position: settings.position,
          speed: settings.speed,
          textColor: tickerColors?.barText,
          backgroundColor: tickerColors?.barBg,
          paused: !isPaused,
        });
        setIsPaused((p) => !p);
        setSuccess(isPaused ? t("ministry.resumed") : t("ministry.paused"));
        return;
      }

      const html = renderDockTickerThemeHtml({
        option: selectedTickerTheme,
        heading: settings.heading,
        messages: activeMessages.map((m) => m.text),
        speed: settings.speed,
        position: settings.position,
        loop: settings.loop,
        paused: !isPaused,
        colors: tickerColors,
        brandLogoUrl: tickerBrandLogoUrl,
        brandName: tickerBrandName,
      });
      const video = await dockObsClient.call("GetVideoSettings") as { baseWidth: number; baseHeight: number };
      const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);
      await dockObsClient.call("SetInputSettings", {
        inputName: "MCE Ticker",
        inputSettings: { url: dataUrl, width: video.baseWidth, height: TICKER_HEIGHT },
      });
      setIsPaused((p) => !p);
      setSuccess(isPaused ? t("ministry.resumed") : t("ministry.paused"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ministry.pauseFailed"));
    } finally {
      setSending(false);
    }
  }, [activeMessages, isPaused, presentationLinkMode, selectedTickerTheme, settings, t, tickerBrandLogoUrl, tickerBrandName, tickerColors]);

  // ── Clear ticker (hide in OBS) ──
  const handleClear = useCallback(async () => {
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      if (presentationLinkMode) {
        await clearPresentationScreen();
        setRunning(false);
        setIsPaused(false);
        setSuccess(t("ministry.tickerCleared"));
        return;
      }

      // Turn off MCE Ticker wherever it lives — MCE Presentation + current program scene
      const scenesToCheck = new Set<string>();
      scenesToCheck.add("MCE Presentation");
      try {
        const cur = await dockObsClient.call("GetCurrentProgramScene") as { currentProgramSceneName: string };
        scenesToCheck.add(cur.currentProgramSceneName);
      } catch { /* ignore */ }

      for (const sceneName of scenesToCheck) {
        const items = await dockObsClient.call("GetSceneItemList", { sceneName }) as {
          sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
        };
        const tickerItem = items.sceneItems.find((i) => i.sourceName === "MCE Ticker");
        if (tickerItem) {
          await dockObsClient.call("SetSceneItemEnabled", {
            sceneName,
            sceneItemId: tickerItem.sceneItemId,
            sceneItemEnabled: false,
          });
        }
      }
      await dockObsClient.syncLowerThirdTickerClearance("MCE Presentation").catch(() => { });

      setRunning(false);
      setIsPaused(false);
      setSuccess(t("ministry.tickerCleared"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ministry.clearFailed"));
    } finally {
      setSending(false);
    }
  }, [presentationLinkMode, t]);

  return (
    <div className="dock-mv-tab">
      {/* ── Header ── */}
   

      {/* ── Sub-Tab Switcher ── */}
      <div className="dock-ministry-tabs">
        {showTickerTab && (
          <button
            type="button"
            className={`dock-ministry-tab${subTab === "ticker" ? " dock-ministry-tab--active" : ""}`}
            onClick={() => setSubTab("ticker")}
            title={t("ministry.ticker")}>
            <Icon name="campaign" size={12} />
            <span>{t("ministry.ticker")}</span>
          </button>
        )}
        {showLowerThirdTab && (
          <button
            type="button"
            className={`dock-ministry-tab${subTab === "lower-thirds" ? " dock-ministry-tab--active" : ""}`}
            onClick={() => setSubTab("lower-thirds")}
            title={t("ministry.lowerThirds")}>
            <Icon name="subtitles" size={12} />
            <span>{t("ministry.lowerThirds")}</span>
          </button>
        )}
        {showCountdownsTab && (
          <button
            type="button"
            className={`dock-ministry-tab${subTab === "countdowns" ? " dock-ministry-tab--active" : ""}`}
            onClick={() => setSubTab("countdowns")}
            title={t("ministry.countdowns")}>
            <Icon name="timer" size={12} />
            <span>{t("ministry.countdowns")}</span>
          </button>
        )}
      </div>

      {/* ── Ticker Tab ── */}
      {showTickerTab && subTab === "ticker" && dockPlan === "free" && (
        <div style={{ padding: "24px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {t("upgrade.tickerRequired", "Ticker requires Basic plan or higher")}
          </div>
          <div style={{ fontSize: 11, color: "var(--dock-text-dim)", marginBottom: 16, lineHeight: 1.5 }}>
            {t("upgrade.tickerDescription", "Live-updating scripture, prayer points, and announcements for your congregation.")}
          </div>
          <button
            type="button"
            className="dock-btn dock-btn--primary dock-btn--sm"
            onClick={() => showUpgradeModal("Upgrade to Basic or higher to enable the Ticker feature.")}
          >
            <Icon name="upgrade" size={14} />
            <span>{t("upgrade.upgradePlan", "Upgrade Plan")}</span>
          </button>
        </div>
      )}
      {showTickerTab && subTab === "ticker" && dockPlan !== "free" && (
        <>
          {/* Feedback */}
          {error && (
            <div className="dock-mv-tab__feedback dock-mv-tab__feedback--error">
              <Icon name="error" size={14} />
              <span>{error}</span>
              <button type="button" className="dock-mv-tab__feedback-close" onClick={() => setError(null)} title={t("common.close")}>
                <Icon name="close" size={12} />
              </button>
            </div>
          )}
          {success && (
            <div className="dock-mv-tab__feedback dock-mv-tab__feedback--success">
              <Icon name="check_circle" size={14} />
              <span>{success}</span>
            </div>
          )}

          <div className="dock-mv-tab__list">
            {/* Theme Picker */}
            <div className="dock-mv-tab__section">
              <div style={{ padding: "4px 0" }}>
                <select
                  value={selectedTickerTheme?.id ?? ""}
                  onChange={(e) => {
                    const nextTheme = resolveDockTickerThemeOption(e.target.value, remoteProductionThemes);
                    setSettings((s) => ({
                      ...s,
                      themeId: e.target.value,
                      heading: nextTheme?.defaultHeading ?? s.heading,
                      colors: {},
                    }));
                  }}
                  style={{
                    width: "100%",
                    background: "var(--dock-surface)",
                    border: "1px solid var(--dock-border)",
                    borderRadius: 3,
                    padding: "4px 6px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--dock-text)",
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {effectiveThemeList.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Settings */}
            <div className="dock-mv-tab__section">
              <div className="dock-mv-tab__section-label">{t("ministry.settings")}</div>
              <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "block", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 50 }}>{t("ministry.heading")}</label>
                  <div
                    ref={tickerColorPopoverRef}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      zIndex: tickerColorPopoverOpen ? 1000 : "auto",
                    }}
                  >
                    <input
                      type="text"
                      value={settings.heading}
                      onChange={(e) => setSettings((s) => ({ ...s, heading: e.target.value.slice(0, 20) }))}
                      placeholder={t("ministry.typeHeading")}
                      maxLength={20}
                      style={{
                        minHeight: '30px',
                        flex: 1,
                        minWidth: 0,
                        background: "var(--dock-surface)",
                        border: "1px solid var(--dock-border)",
                        borderRadius: 3,
                        padding: "3px 6px",
                        fontSize: 11,
                        color: "var(--dock-text)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setTickerColorPopoverOpen((open) => {
                          const next = !open;
                          if (next) {
                            updateTickerColorPopoverPosition();
                            requestAnimationFrame(updateTickerColorPopoverPosition);
                          }
                          return next;
                        });
                      }}
                      title={t("ministry.colors", "Colors")}
                      aria-label={t("ministry.colors", "Colors")}
                      style={{
                        width: 30,
                        height: 30,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        borderRadius: 3,
                        border: "1px solid var(--dock-border)",
                        background: tickerColorPopoverOpen ? "var(--dock-accent)" : "var(--dock-surface)",
                        color: tickerColorPopoverOpen ? "#fff" : "var(--dock-text)",
                        cursor: "pointer",
                      }}
                    >
                      <Icon name="palette" size={15} />
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 50 }}>{t("ministry.speed")}</label>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={settings.speed}
                    onChange={(e) => setSettings((s) => ({ ...s, speed: Number(e.target.value) }))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 24, textAlign: "right" }}>{settings.speed}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 20 }}>
                  <div style={{ display: "block", alignItems: "center", gap: 6 }}>
                    <label style={{ fontSize: 10, display: "block", color: "var(--dock-text-dim)", minWidth: 50, }}>{t("ministry.position")}</label>
                    <div className="dock-console-segmented dock-console-segmented--compact">
                      <button
                        type="button"
                        className={`dock-console-segmented__item${settings.position === "top" ? " dock-console-segmented__item--active" : ""}`}
                        onClick={() => setSettings((s) => ({ ...s, position: "top" }))}
                        title={t("ministry.top")}>
                        {t("ministry.top")}
                      </button>
                      <button
                        type="button"
                        className={`dock-console-segmented__item${settings.position === "bottom" ? " dock-console-segmented__item--active" : ""}`}
                        onClick={() => setSettings((s) => ({ ...s, position: "bottom" }))}
                        title={t("ministry.bottom")}>
                        {t("ministry.bottom")}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "block", alignItems: "center", gap: 6, }}>
                    <label style={{ display: "block", fontSize: 10, color: "var(--dock-text-dim)" }}>{t("ministry.loop")}</label>
                    <div className="dock-console-segmented dock-console-segmented--compact">
                      <button
                        type="button"
                        className={`dock-console-segmented__item${!settings.loop ? " dock-console-segmented__item--active" : ""}`}
                        onClick={() => setSettings((s) => ({ ...s, loop: false }))}
                        title={t("ministry.once")}>
                        {t("ministry.once")}
                      </button>
                      <button
                        type="button"
                        className={`dock-console-segmented__item${settings.loop ? " dock-console-segmented__item--active" : ""}`}
                        onClick={() => setSettings((s) => ({ ...s, loop: true }))}
                        title={t("ministry.looping")}>
                        {t("ministry.looping")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Compose */}
            <div className="dock-mv-tab__section">
              <div className="dock-mv-tab__section-label">{t("ministry.messages")}</div>
              {/* <div className="dock-mv-tab__section-desc">{t("ministry.messagesDesc")}</div> */}
              <div style={{ padding: "4px 0" }}>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
                  <textarea
                    ref={textareaRef}
                    value={newText}
                    onChange={(e) => setNewText(e.target.value.slice(0, MAX_CHARS))}
                    onKeyDown={handleKeyDown}
                    placeholder={t("ministry.typeMessage")}
                    rows={4}
                    style={{
                      flex: 1,
                      minHeight: '80px',
                      background: "var(--dock-surface)",
                      border: "1px solid var(--dock-border)",
                      borderRadius: 3,
                      padding: "4px 6px",
                      fontSize: 11,
                      color: "var(--dock-text)",
                      resize: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="button"
                    className="dock-btn dock-btn--accent dock-btn--sm"
                    onClick={handleAdd}
                    disabled={!newText.trim()}
                    style={{ height: 30, whiteSpace: "nowrap" }}
                    title={t("common.add")}>
                    Add Message
                    <Icon name="add" size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 9, color: "var(--dock-text-dim)", textAlign: "right", marginTop: 2 }}>
                  {newText.length}/{MAX_CHARS}
                </div>
              </div>

              {/* Message list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 200, overflowY: "auto" }}>
                {messages.length === 0 && (
                  <div style={{ fontSize: 11, color: "var(--dock-text-dim)", padding: "8px 0", textAlign: "center" }}>
                    {t("ministry.noMessages")}
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 4px",
                      borderRadius: 3,
                      background: msg.active ? "var(--dock-surface)" : "transparent",
                      opacity: msg.active ? 1 : 0.5,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleMessage(msg.id)}
                      title={msg.active ? t("ministry.deactivate") : t("ministry.activate")}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        border: `1.5px solid ${msg.active ? "var(--dock-accent)" : "var(--dock-border)"}`,
                        background: msg.active ? "var(--dock-accent)" : "transparent",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      {msg.active && <Icon name="check" size={9} style={{ color: "#fff" }} />}

                    </button>

                    {editingId === msg.id ? (
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value.slice(0, MAX_CHARS))}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") { setEditingId(null); setEditText(""); } }}
                        onBlur={handleSaveEdit}
                        autoFocus
                        style={{
                          flex: 1,
                          background: "var(--dock-surface)",
                          border: "1px solid var(--dock-accent)",
                          borderRadius: 3,
                          padding: "1px 4px",
                          fontSize: 11,
                          color: "var(--dock-text)",
                          fontFamily: "inherit",
                        }}
                      />
                    ) : (
                      <span
                        style={{ flex: 1, fontSize: 11, color: "var(--dock-text)", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        onDoubleClick={() => handleStartEdit(msg.id, msg.text)}
                        title={t("ministry.doubleClickToEdit")}
                      >
                        {msg.text}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleStartEdit(msg.id, msg.text)}
                      title={t("ministry.doubleClickToEdit")}
                      style={{
                        width: 16,
                        height: 16,
                        border: "none",
                        background: "transparent",
                        color: "var(--dock-text-dim)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="edit" size={10} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(msg.id)}
                      title={t("common.delete")}
                      style={{
                        width: 16,
                        height: 16,
                        border: "none",
                        background: "transparent",
                        color: "var(--dock-text-dim)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="close" size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Control */}
            <div className="dock-mv-tab__section">
              <div style={{ display: "flex", gap: 6, padding: "4px 0" }}>
                {/* Go Live — always shown */}
                <button
                  type="button"
                  className={`dock-btn dock-btn--sm ${sending ? "dock-btn--loading" : "dock-btn--primary"}`}
                  onClick={handlePush}
                  disabled={sending || activeMessages.length === 0 || (!obsConnected && !presentationLinkMode)}
                  style={{ flex: 1 }}
                  title={t("ministry.goLive")}>
                  <Icon name="play_arrow" size={14} />
                  <span>{t("ministry.goLive")}</span>
                </button>

                {/* Pause / Resume — only when running */}
                {running && (
                  <button
                    type="button"
                    className={`dock-btn dock-btn--sm ${sending ? "dock-btn--loading" : "dock-btn--secondary"}`}
                    onClick={handlePause}
                    disabled={sending}
                    title={isPaused ? t("ministry.resume") : t("ministry.pause")}>
                    <Icon name={isPaused ? "play_arrow" : "pause"} size={14} />
                    <span>{isPaused ? t("ministry.resume") : t("ministry.pause")}</span>
                  </button>
                )}

                {/* Clear — only when running */}
                {running && (
                  <button
                    type="button"
                    className={`dock-btn dock-btn--sm ${sending ? "dock-btn--loading" : "dock-btn--danger"}`}
                    onClick={handleClear}
                    disabled={sending}
                    title={t("common.clear")}>
                    <Icon name="visibility_off" size={14} />
                    <span>{t("common.clear")}</span>
                  </button>
                )}
              </div>
              {!obsConnected && !presentationLinkMode && (
                <div style={{ fontSize: 10, color: "var(--dock-red)", textAlign: "center" }}>
                  {t("ministry.connectToObs")}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Lower Thirds Tab ── */}
      {showLowerThirdTab && subTab === "lower-thirds" && (
        <>
          {/* LT Feedback */}
          {ltFeedback && (
            <div className={`dock-mv-tab__feedback dock-mv-tab__feedback--${ltFeedbackTone}`}>
              <Icon name={ltFeedbackTone === "success" ? "check_circle" : "error"} size={14} />
              <span>{ltFeedback}</span>
              <button type="button" className="dock-mv-tab__feedback-close" onClick={() => setLtFeedback(null)} title={t("common.close")}>
                <Icon name="close" size={12} />
              </button>
            </div>
          )}

          <div className="dock-mv-tab__list">
            {/* Theme Picker */}
            <div className="dock-mv-tab__section">
              <div className="dock-mv-tab__section-label">{t("ministry.theme")}</div>
              <div className="dock-mv-tab__section-desc">{t("ministry.themeDesc")}</div>
              <div style={{ padding: "4px 0" }}>
                {ltFavorites.length > 0 ? (
                  <select
                    value={ltSelectedIdx}
                    onChange={(e) => handleSelectLtTheme(Number(e.target.value))}
                    style={{
                      width: "100%",
                      background: "var(--dock-surface)",
                      border: "1px solid var(--dock-border)",
                      borderRadius: 3,
                      padding: "4px 6px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--dock-text)",
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {ltFavorites.map((entry, i) => (
                      <option key={`${entry.kind}-${entry.label}-${i}`} value={i}>
                        {entry.label}{entry.kind === "bible" ? ` ${t("ministry.custom")}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    width: "100%",
                    background: "var(--dock-surface)",
                    border: "1px solid var(--dock-border)",
                    borderRadius: 3,
                    padding: "4px 6px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--dock-text-dim)",
                    fontFamily: "inherit",
                    opacity: 0.8,
                  }}>
                    {ltSelectedEntry?.label ?? t("ministry.speaker")}
                  </div>
                )}
              </div>
            </div>

            {/* Size Multiplier */}
            <div className="dock-mv-tab__section">
                  <div className="dock-mv-tab__section-label">{t("ministry.size")}</div>
                  <div className="dock-mv-tab__section-desc">{t("ministry.sizeDesc")}</div>
                  <div style={{ padding: "4px 0", display: "flex", gap: 4 }}>
                    {MINISTRY_LT_SIZE_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setLtSize(s)}
                        style={{
                          flex: 1,
                          padding: "4px 0",
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: "inherit",
                          borderRadius: 3,
                          border: `1px solid ${ltSize === s ? "var(--dock-accent)" : "var(--dock-border)"}`,
                          background: ltSize === s ? "var(--dock-accent)" : "transparent",
                          color: ltSize === s ? "#fff" : "var(--dock-text-dim)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {LT_SIZE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Render editor based on selected theme type */}
                {ltSelectedEntry?.kind === "lt" ? (
                  <DockLowerThirdEditor
                    theme={ltSelectedEntry.theme}
                    themes={ltFavorites.filter((e) => e.kind === "lt").map((e) => (e as LTThemeEntry).theme)}
                    onSelectTheme={(themeId) => {
                      const idx = ltFavorites.findIndex((e) => e.kind === "lt" && (e as LTThemeEntry).theme.id === themeId);
                      if (idx >= 0) setLtSelectedIdx(idx);
                    }}
                    sending={ltSending}
                    size={ltSize}
                    onSend={async (url) => {
                      if (!(await requireEntitlement("lowerThirds", 0))) return;
                      setLtSending(true);
                      setLtFeedback(null);
                      try {
                        await ensureObsConnected();
                        const scale = LT_SIZE_SCALE[ltSize] ?? 1;
                        const sourceSize = {
                          sourceWidth: Math.round(1920 / scale),
                          sourceHeight: Math.round(1080 / scale),
                        };
                        if (ltLive) {
                          const exitDuration = ((ltSelectedEntry?.theme as LowerThirdTheme)?.exitAnimation?.duration ?? 800) + 100;
                          await dockObsClient.replaceLiveLowerThirdOverlayUrl(url, sourceSize, exitDuration);
                        } else {
                          await dockObsClient.pushLowerThirdOverlayUrl(url, sourceSize);
                        }
                        setLtLive(true);
                        setLtFeedbackTone("success");
                        setLtFeedback(t("ministry.lowerThirdLive"));
                      } catch (err) {
                        setLtFeedbackTone("error");
                        setLtFeedback(err instanceof Error ? err.message : t("ministry.sendFailed"));
                      } finally {
                        setLtSending(false);
                      }
                    }}
                    onBlank={async (url) => {
                      setLtSending(true);
                      setLtFeedback(null);
                      try {
                        await ensureObsConnected();
                        const exitDuration = ((ltSelectedEntry?.theme as LowerThirdTheme)?.exitAnimation?.duration ?? 800) + 100;
                        await dockObsClient.animateLowerThirdOverlayUrlOut(url, exitDuration);
                        setLtLive(false);
                        setLtFeedbackTone("success");
                        setLtFeedback(t("ministry.lowerThirdCleared"));
                      } catch (err) {
                        setLtFeedbackTone("error");
                        setLtFeedback(err instanceof Error ? err.message : t("ministry.blankFailed"));
                      } finally {
                        setLtSending(false);
                      }
                    }}
                    onAnimateOut={async (url) => {
                      setLtSending(true);
                      setLtFeedback(null);
                      try {
                        await ensureObsConnected();
                        const exitDuration = ((ltSelectedEntry?.theme as LowerThirdTheme)?.exitAnimation?.duration ?? 800) + 100;
                        await dockObsClient.animateLowerThirdOverlayUrlOut(url, exitDuration);
                        setLtLive(false);
                        setLtFeedbackTone("success");
                        setLtFeedback(t("ministry.lowerThirdAnimatedOut"));
                      } catch (err) {
                        setLtFeedbackTone("error");
                        setLtFeedback(err instanceof Error ? err.message : t("ministry.animateOutFailed"));
                      } finally {
                        setLtSending(false);
                      }
                    }}
                  />
                ) : ltSelectedEntry?.kind === "bible" ? (
                  /* BibleTheme lower-third: simple text input + send via pushBible */
                  <div className="dock-mv-tab__section">
                    <div className="dock-mv-tab__section-label">{t("ministry.content")}</div>
                    <div className="dock-mv-tab__section-desc">{t("ministry.contentDesc")}</div>
                    <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea
                        value={bibleLtText}
                        onChange={(e) => setBibleLtText(e.target.value)}
                        placeholder={t("ministry.typeText")}
                        rows={3}
                        style={{
                          width: "100%",
                          background: "var(--dock-surface)",
                          border: "1px solid var(--dock-border)",
                          borderRadius: 3,
                          padding: "4px 6px",
                          fontSize: 11,
                          color: "var(--dock-text)",
                          resize: "none",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>

                    {/* BibleTheme preview note */}
                    <div style={{ fontSize: 9, color: "var(--dock-text-dim)", marginTop: 4 }}>
                      {t("ministry.usingCustomTheme")} {ltSelectedEntry.theme.name}
                    </div>

                    {selectedBibleLtSettings && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 8,
                          border: "1px solid var(--dock-border)",
                          borderRadius: 4,
                          background: "var(--dock-surface)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--dock-text)", textTransform: "uppercase", letterSpacing: 0.3 }}>
                              {t("lowerThird.appearance", "Appearance")}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--dock-text-dim)", marginTop: 2 }}>
                              {t("lowerThird.appearanceDesc", "Adjust colors for this lower-third theme.")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (ltSelectedEntry.kind === "bible") {
                                setBibleLtColorOverrides((current) => {
                                  const next = { ...current };
                                  delete next[ltSelectedEntry.theme.id];
                                  return next;
                                });
                              }
                            }}
                            style={{
                              border: "1px solid var(--dock-border)",
                              borderRadius: 3,
                              background: "var(--dock-input-bg)",
                              color: "var(--dock-text-dim)",
                              cursor: "pointer",
                              fontSize: 10,
                              padding: "2px 6px",
                              flexShrink: 0,
                            }}
                          >
                            {t("common.reset", "Reset")}
                          </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                          {BIBLE_LT_COLOR_CONTROLS.map((control) => {
                            const explicitColor = selectedBibleLtOverrides[control.key] ?? "";
                            const baseColor = String(selectedBibleLtSettings[control.key] || control.fallback);
                            const effectiveColor = sanitizeCssColor(explicitColor) ?? sanitizeCssColor(baseColor) ?? control.fallback;
                            return (
                              <label
                                key={control.key}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 26px",
                                  alignItems: "center",
                                  gap: 5,
                                  minWidth: 0,
                                }}
                              >
                                <span style={{ fontSize: 9, color: "var(--dock-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {t(`lowerThird.color.${control.key}`, control.label)}
                                </span>
                                <input
                                  type="color"
                                  value={colorInputValue(explicitColor || effectiveColor, control.fallback)}
                                  onChange={(event) => setBibleLtColorOverride(ltSelectedEntry.theme.id, control.key, event.target.value)}
                                  title={control.label}
                                  style={{
                                    width: 26,
                                    height: 22,
                                    border: "1px solid var(--dock-border)",
                                    borderRadius: 3,
                                    background: "transparent",
                                    padding: 0,
                                    cursor: "pointer",
                                  }}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 6, padding: "6px 0" }}>
                      <button
                        type="button"
                        className={`dock-btn dock-btn--sm ${ltSending ? "dock-btn--loading" : "dock-btn--primary"}`}
                        disabled={ltSending || !bibleLtText.trim() || !obsConnected}
                        onClick={async () => {
                          if (!bibleLtText.trim() || ltSelectedEntry?.kind !== "bible") return;
                          setLtSending(true);
                          setLtFeedback(null);
                          try {
                            await ensureObsConnected();
                            await dockObsClient.pushBible({
                              book: "",
                              chapter: 0,
                              verse: 0,
                              translation: "",
                              verseText: bibleLtText.trim(),
                              overlayMode: "lower-third",
                              bibleThemeSettings: selectedBibleLtEffectiveSettings,
                            });
                            setLtLive(true);
                            setLtFeedbackTone("success");
                            setLtFeedback(t("ministry.lowerThirdLive"));
                          } catch (err) {
                            setLtFeedbackTone("error");
                            setLtFeedback(err instanceof Error ? err.message : t("ministry.sendFailed"));
                          } finally {
                            setLtSending(false);
                          }
                        }}
                        style={{ flex: 1 }}
                      >
                        <Icon name="play_arrow" size={14} />
                        <span>{t("ministry.goLive")}</span>
                      </button>
                      {ltLive && (
                        <button
                          type="button"
                          className={`dock-btn dock-btn--sm ${ltSending ? "dock-btn--loading" : ""}`}
                          disabled={ltSending || !obsConnected}
                          onClick={async () => {
                            setLtSending(true);
                            setLtFeedback(null);
                            try {
                              await ensureObsConnected();
                              await dockObsClient.pushBible({
                                book: "",
                                chapter: 0,
                                verse: 0,
                                translation: "",
                                verseText: "",
                                overlayMode: "lower-third",
                                bibleThemeSettings: selectedBibleLtEffectiveSettings,
                              });
                              // Wait for exit animation (use theme's animation duration), then disable the source
                              const animDuration = selectedBibleLtAnimationDuration;
                              await new Promise((r) => setTimeout(r, animDuration + 100));
                              await dockObsClient.clearBible();
                              setLtLive(false);
                              setLtFeedbackTone("success");
                              setLtFeedback(t("ministry.lowerThirdAnimatedOut"));
                            } catch (err) {
                              setLtFeedbackTone("error");
                              setLtFeedback(err instanceof Error ? err.message : t("ministry.animateOutFailed"));
                            } finally {
                              setLtSending(false);
                            }
                          }}
                          style={{
                            flex: 1,
                            background: "transparent",
                            border: "1px solid var(--dock-border)",
                            color: "var(--dock-text-dim)",
                          }}
                        >
                          <Icon name="animation" size={14} />
                          <span>{t("ministry.animateOut")}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={`dock-btn dock-btn--sm ${ltSending ? "dock-btn--loading" : ""}`}
                        disabled={ltSending || !obsConnected}
                        onClick={async () => {
                          setLtSending(true);
                          setLtFeedback(null);
                          try {
                            await ensureObsConnected();
                            await dockObsClient.pushBible({
                              book: "",
                              chapter: 0,
                              verse: 0,
                              translation: "",
                              verseText: "",
                              overlayMode: "lower-third",
                              bibleThemeSettings: selectedBibleLtEffectiveSettings,
                            });
                            // Wait for exit animation (use theme's animation duration), then disable the source
                            const animDuration = selectedBibleLtAnimationDuration;
                            await new Promise((r) => setTimeout(r, animDuration + 100));
                            await dockObsClient.clearBible();
                            setLtLive(false);
                            setLtFeedbackTone("success");
                            setLtFeedback(t("ministry.lowerThirdCleared"));
                          } catch (err) {
                            setLtFeedbackTone("error");
                            setLtFeedback(err instanceof Error ? err.message : t("ministry.blankFailed"));
                          } finally {
                            setLtSending(false);
                          }
                        }}
                        style={{
                          flex: 1,
                          background: "transparent",
                          border: "1px solid var(--dock-border)",
                          color: "var(--dock-text-dim)",
                        }}
                      >
                        <Icon name="visibility_off" size={14} />
                        <span>{t("ministry.blank")}</span>
                      </button>
                    </div>
                  </div>
                ) : null}
          </div>
        </>
      )}

      {/* ── Countdowns Tab ── */}
      {showCountdownsTab && subTab === "countdowns" && (
        <DockCountdownsTab presentationOutputTarget={presentationOutputTarget} />
      )}

      {tickerColorPopoverOpen && tickerColors && createPortal(
        <div
          ref={tickerColorPopoverPanelRef}
          role="dialog"
          aria-label={t("ministry.tickerColors", "Ticker colors")}
          style={{
            position: "fixed",
            top: tickerColorPopoverPosition.top,
            left: tickerColorPopoverPosition.left,
            zIndex: 10000,
            width: TICKER_COLOR_POPOVER_WIDTH,
            padding: 10,
            background: "var(--dock-surface-alt, #1f2937)",
            border: "1px solid var(--dock-border, #334155)",
            borderRadius: 4,
            boxShadow: "0 18px 50px rgba(0,0,0,0.36)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--dock-text, #f8fafc)", textTransform: "uppercase", letterSpacing: 0.3 }}>
              {t("ministry.tickerColors", "Ticker colors")}
            </span>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, colors: {} }))}
              style={{
                border: "1px solid var(--dock-border, #334155)",
                borderRadius: 3,
                background: "var(--dock-surface, #111827)",
                color: "var(--dock-text-dim, #cbd5e1)",
                cursor: "pointer",
                fontSize: 10,
                padding: "2px 6px",
              }}
            >
              {t("common.reset", "Reset")}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {TICKER_COLOR_CONTROLS.map(({ key, label }) => {
              const explicitColor = settings.colors?.[key] ?? "";
              const effectiveColor = sanitizeCssColor(explicitColor) ?? tickerColors[key];
              return (
                <label
                  key={key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "92px 28px 1fr",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 10,
                    color: "var(--dock-text-dim, #cbd5e1)",
                  }}
                >
                  <span>{t(`ministry.tickerColor.${key}`, label)}</span>
                  <input
                    type="color"
                    value={colorInputValue(explicitColor || effectiveColor, TICKER_COLOR_INPUT_FALLBACKS[key])}
                    onChange={(e) => setTickerColorOverride(key, e.target.value)}
                    title={label}
                    style={{
                      width: 28,
                      height: 24,
                      border: "1px solid var(--dock-border, #334155)",
                      borderRadius: 3,
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  />
                  <input
                    type="text"
                    value={explicitColor}
                    onChange={(e) => setTickerColorOverride(key, e.target.value)}
                    placeholder={effectiveColor}
                    spellCheck={false}
                    style={{
                      minWidth: 0,
                      height: 24,
                      background: "var(--dock-surface, #111827)",
                      border: "1px solid var(--dock-border, #334155)",
                      borderRadius: 3,
                      color: "var(--dock-text, #f8fafc)",
                      fontFamily: "inherit",
                      fontSize: 10,
                      padding: "0 6px",
                    }}
                  />
                </label>
              );
            })}
          </div>
        </div>,
        document.body,
      )}

    </div>
  );
}
