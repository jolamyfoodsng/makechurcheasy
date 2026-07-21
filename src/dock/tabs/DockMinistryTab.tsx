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

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import type { DockStagedItem } from "../dockTypes";
import Icon from "../DockIcon";
import {
  TICKER_THEMES,
  generateTickerHTML,
} from "../../components/modules/tickerThemes";
import { LT_ALL_THEMES } from "../../lowerthirds/themes";
import { loadDockLTFavorites, loadDockFavoriteBibleThemes, loadDockTickerFavorites } from "../dockThemeData";
import type { LowerThirdTheme } from "../../lowerthirds/types";
import type { LTSize } from "../../lowerthirds/types";
import { LT_SIZE_LABELS, LT_SIZE_SCALE } from "../../lowerthirds/types";
import type { BibleTheme } from "../../bible/types";
import allThemesData from "../../../lower_thirds/all_themes.json";
import DockLowerThirdEditor from "./DockLowerThirdEditor";
import DockCountdownsTab from "./DockCountdownsTab";
import { requireEntitlement, getDockPlan, showUpgradeModal } from "../dockEntitlement";
import { getUserScopedKey } from "../../services/userScopedStorage";
import { getSettings } from "../../multiview/mvStore";
import { normalizeBrandColor } from "../../lowerthirds/runtimeBranding";
import { loadProjectionSettings, saveProjectionSettings } from "../dockProjectionSettings";

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

interface TickerMessage {
  id: string;
  text: string;
  active: boolean;
}

interface TickerSettings {
  speed: number;
  position: "top" | "bottom";
  loop: boolean;
  themeId: string;
  heading: string;
}

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  tickerOutputMode?: "source" | "scene";
}

const STORAGE_KEY = "dock-ticker-messages";
const SETTINGS_KEY = "dock-ticker-settings";
const MAX_CHARS = 140;
const TICKER_HEIGHT = 80;

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

function loadSettings(): TickerSettings {
  try {
    const raw = localStorage.getItem(getUserScopedKey(SETTINGS_KEY));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    speed: 50,
    position: "bottom",
    loop: true,
    themeId: TICKER_THEMES[0]?.id ?? "",
    heading: TICKER_THEMES[0]?.defaultHeading ?? "LIVE",
  };
}

function saveSettings(s: TickerSettings) {
  try { localStorage.setItem(getUserScopedKey(SETTINGS_KEY), JSON.stringify(s)); } catch { /* ignore */ }
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

export default function DockMinistryTab({ staged: _staged, onStage: _onStage, tickerOutputMode }: Props) {
  const { t } = useTranslation();
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
  const [tickerFavIds, setTickerFavIds] = useState<Set<string>>(new Set());

  // Lower-thirds state — mixed LowerThirdTheme + BibleTheme entries
  const [ltFavorites, setLtFavorites] = useState<MixedLTThemeEntry[]>([]);
  const [ltSelectedIdx, setLtSelectedIdx] = useState(0);
  const [ltSending, setLtSending] = useState(false);
  const [ltFeedback, setLtFeedback] = useState<string | null>(null);
  const [ltFeedbackTone, setLtFeedbackTone] = useState<"success" | "error">("success");
  const [ltSize, setLtSize] = useState<LTSize>(() => {
    const saved = getSettings().defaultSpeakerSize;
    return (saved && LT_SIZE_LABELS[saved as LTSize]) ? (saved as LTSize) : "xl";
  });
  const [ltLive, setLtLive] = useState(false);
  // BibleTheme lower-third text input (used when a BibleTheme is selected)
  const [bibleLtText, setBibleLtText] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);

  // Persist
  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { try { localStorage.setItem(MINISTRY_TAB_KEY, subTab); } catch { /* ignore */ } }, [subTab]);

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

  // Load favorite LT themes (both LowerThirdTheme and BibleTheme lower-thirds)
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadDockLTFavorites().catch(() => new Set<string>()),
      loadDockFavoriteBibleThemes().catch(() => [] as BibleTheme[]),
    ]).then(([ltIdSet, bibleThemes]) => {
      if (cancelled) return;
      const entries: MixedLTThemeEntry[] = [];

      // LowerThirdTheme favorites
      const ltThemes = ALL_LT_THEMES.filter((t) => ltIdSet.has(t.id));
      for (const t of ltThemes.length > 0 ? ltThemes : LT_ALL_THEMES.slice(0, 6)) {
        entries.push({ kind: "lt", theme: t, label: t.name });
      }

      // BibleTheme lower-third favorites (custom themes from ProductionThemeSettingsPage)
      for (const bt of bibleThemes) {
        entries.push({ kind: "bible", theme: bt, label: `✦ ${bt.name}` });
      }

      setLtFavorites(entries);
    }).catch((err) => {
      console.warn("[DockMinistry] Failed to load LT favorites:", err);
      if (!cancelled) {
        setLtFavorites(LT_ALL_THEMES.slice(0, 6).map((t) => ({ kind: "lt" as const, theme: t, label: t.name })));
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Load ticker favorites
  useEffect(() => {
    let cancelled = false;
    loadDockTickerFavorites().then((favIds) => {
      if (cancelled) return;
      setTickerFavIds(favIds);
      const available = favIds.size > 0
        ? TICKER_THEMES.filter((t) => favIds.has(t.id))
        : TICKER_THEMES.slice(0, 1);
      const currentInList = available.some((t) => t.id === settings.themeId);
      if (!currentInList && available.length > 0) {
        setSettings((s) => ({ ...s, themeId: available[0].id, heading: available[0].defaultHeading }));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const tickerThemeList = tickerFavIds.size > 0
    ? TICKER_THEMES.filter((t) => tickerFavIds.has(t.id))
    : TICKER_THEMES.slice(0, 1);
  const theme = tickerThemeList.find((t) => t.id === settings.themeId) ?? tickerThemeList[0] ?? TICKER_THEMES[0];
  const activeMessages = messages.filter((m) => m.active);

  // Derive branded ticker colors from the app's brand color
  const brandedColors = (() => {
    const brandColor = normalizeBrandColor(getSettings().brandColor);
    return {
      ...theme.defaultColors,
      accent: brandColor,
      separator: brandColor,
    };
  })();

  const ltSelectedEntry = ltFavorites[ltSelectedIdx] ?? ltFavorites[0] ?? null;

  // Reset selected index when favorites change
  useEffect(() => { setLtSelectedIdx(0); }, [ltFavorites]);

  const handleSelectLtTheme = useCallback((entryIdx: number) => {
    if (entryIdx >= 0 && entryIdx < ltFavorites.length) setLtSelectedIdx(entryIdx);
  }, [ltFavorites]);

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
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      await ensureObsConnected();
      const html = generateTickerHTML(
        theme,
        brandedColors,
        settings.heading,
        activeMessages.map((m) => m.text),
        settings.speed,
        settings.position,
        settings.loop,
        false,
      );

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

      // In scene mode, switch preview to MCE Presentation for user to transition
      const currentProgramScene = (await dockObsClient.call("GetCurrentProgramScene") as { currentProgramSceneName: string }).currentProgramSceneName;
      if (tickerOutputMode === "scene") {
        try { localStorage.setItem("dock-ticker-original-scene", currentProgramScene); } catch { /* ignore */ }
        await dockObsClient.call("SetCurrentPreviewScene", { sceneName: presentationSceneName });
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
      setSuccess(tickerOutputMode === "scene" ? t("ministry.tickerLiveScene") : t("ministry.tickerLive"));
    } catch (err) {
      console.warn("[DockMinistry] Push failed:", err);
      setError(err instanceof Error ? err.message : t("ministry.pushFailed"));
    } finally {
      setSending(false);
    }
  }, [activeMessages, theme, settings, tickerOutputMode]);

  // ── Pause ticker (stops scroll in OBS) ──
  const handlePause = useCallback(async () => {
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const html = generateTickerHTML(
        theme,
        brandedColors,
        settings.heading,
        activeMessages.map((m) => m.text),
        settings.speed,
        settings.position,
        settings.loop,
        !isPaused,
      );
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
  }, [theme, settings, activeMessages, isPaused]);

  // ── Clear ticker (hide in OBS) ──
  const handleClear = useCallback(async () => {
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
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

      // Restore original scene in preview if we had switched away
      if (tickerOutputMode === "scene") {
        let originalScene = "";
        try { originalScene = localStorage.getItem("dock-ticker-original-scene") || ""; } catch { /* ignore */ }
        if (originalScene) {
          await dockObsClient.call("SetCurrentPreviewScene", { sceneName: originalScene }).catch(() => { });
        }
        try { localStorage.removeItem("dock-ticker-original-scene"); } catch { /* ignore */ }
      }

      setRunning(false);
      setIsPaused(false);
      setSuccess(t("ministry.tickerCleared"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ministry.clearFailed"));
    } finally {
      setSending(false);
    }
  }, [tickerOutputMode]);

  return (
    <div className="dock-mv-tab">
      {/* ── Header ── */}
      <div className="dock-mv-tab__header">
        <div className="dock-mv-tab__title-row">
          <Icon name="campaign" size={16} />
          <span className="dock-mv-tab__title">{t('ministry.title')}</span>
        </div>
      </div>

      {/* ── Sub-Tab Switcher ── */}
      <div className="dock-ministry-tabs">
        <button
          type="button"
          className={`dock-ministry-tab${subTab === "ticker" ? " dock-ministry-tab--active" : ""}`}
          onClick={() => setSubTab("ticker")}
          title={t("ministry.ticker")}>
          <Icon name="campaign" size={12} />
          <span>{t("ministry.ticker")}</span>
        </button>
        <button
          type="button"
          className={`dock-ministry-tab${subTab === "lower-thirds" ? " dock-ministry-tab--active" : ""}`}
          onClick={() => setSubTab("lower-thirds")}
          title={t("ministry.lowerThirds")}>
          <Icon name="subtitles" size={12} />
          <span>{t("ministry.lowerThirds")}</span>
        </button>
        {dockPlan !== "free" && (
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
      {subTab === "ticker" && dockPlan === "free" && (
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
      {subTab === "ticker" && dockPlan !== "free" && (
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
                  value={theme.id}
                  onChange={(e) => {
                    const t = TICKER_THEMES.find((x) => x.id === e.target.value);
                    setSettings((s) => ({ ...s, themeId: e.target.value, heading: t?.defaultHeading ?? s.heading }));
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
                  {tickerThemeList.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Settings */}
            <div className="dock-mv-tab__section">
              <div className="dock-mv-tab__section-label">{t("ministry.settings")}</div>
              <div className="dock-mv-tab__section-desc">{t("ministry.settingsDesc")}</div>
              <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "block", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 50 }}>{t("ministry.heading")}</label>
                  <div>
                    <input
                      type="text"
                      value={settings.heading}
                      onChange={(e) => setSettings((s) => ({ ...s, heading: e.target.value.slice(0, 20) }))}
                      placeholder={t("ministry.typeHeading")}
                      maxLength={20}
                      style={{
                        minHeight: '30px',
                        width: "90%",
                        flex: 1,
                        background: "var(--dock-surface)",
                        border: "1px solid var(--dock-border)",
                        borderRadius: 3,
                        padding: "3px 6px",
                        fontSize: 11,
                        color: "var(--dock-text)",
                      }}
                    />
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
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 50 }}>{t("ministry.position")}</label>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label style={{ fontSize: 10, color: "var(--dock-text-dim)" }}>{t("ministry.loop")}</label>
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
              <div className="dock-mv-tab__section-desc">{t("ministry.messagesDesc")}</div>
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
                  disabled={sending || activeMessages.length === 0 || !obsConnected}
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
              {!obsConnected && (
                <div style={{ fontSize: 10, color: "var(--dock-red)", textAlign: "center" }}>
                  {t("ministry.connectToObs")}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Lower Thirds Tab ── */}
      {subTab === "lower-thirds" && (
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
            {ltFavorites.length === 0 ? (
              <div className="dock-mv-tab__section">
                <div style={{ fontSize: 11, color: "var(--dock-text-dim)", textAlign: "center", padding: "12px 0" }}>
                  <Icon name="subtitles" size={24} style={{ color: "var(--dock-border)", display: "block", margin: "0 auto 8px" }} />
                  {t("ministry.starThemeHint")}
                </div>
              </div>
            ) : (
              <>
                {/* Theme Picker Dropdown */}
                <div className="dock-mv-tab__section">
                  <div className="dock-mv-tab__section-label">{t("ministry.theme")}</div>
                  <div className="dock-mv-tab__section-desc">{t("ministry.themeDesc")}</div>
                  <div style={{ padding: "4px 0" }}>
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
                  </div>
                </div>

                {/* Size Multiplier */}
                <div className="dock-mv-tab__section">
                  <div className="dock-mv-tab__section-label">{t("ministry.size")}</div>
                  <div className="dock-mv-tab__section-desc">{t("ministry.sizeDesc")}</div>
                  <div style={{ padding: "4px 0", display: "flex", gap: 4 }}>
                    {(["xl", "x2"] as LTSize[]).map((s) => (
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
                    live={ltLive}
                    onSend={async (url) => {
                      if (!(await requireEntitlement("lowerThirds", 0))) return;
                      setLtSending(true);
                      setLtFeedback(null);
                      try {
                        await ensureObsConnected();
                        const scale = LT_SIZE_SCALE[ltSize] ?? 1;
                        await dockObsClient.pushLowerThirdOverlayUrl(url, {
                          sourceWidth: Math.round(1920 / scale),
                          sourceHeight: Math.round(1080 / scale),
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
                    onUpdate={async (url) => {
                      try {
                        await ensureObsConnected();
                        await dockObsClient.call("SetInputSettings", {
                          inputName: "MCE Lower Third",
                          inputSettings: { url },
                        });
                      } catch (err) {
                        console.warn("[DockMinistry] LT update failed:", err);
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
                              bibleThemeSettings: ltSelectedEntry.theme.settings as unknown as Record<string, unknown>,
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
                                bibleThemeSettings: ltSelectedEntry?.kind === "bible" ? ltSelectedEntry.theme.settings as unknown as Record<string, unknown> : null,
                              });
                              // Wait for exit animation (use theme's animation duration), then disable the source
                              const animDuration = ltSelectedEntry?.kind === "bible" ? Number(ltSelectedEntry.theme.settings?.animationDuration) || 800 : 800;
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
                              bibleThemeSettings: ltSelectedEntry?.kind === "bible" ? ltSelectedEntry.theme.settings as unknown as Record<string, unknown> : null,
                            });
                            // Wait for exit animation (use theme's animation duration), then disable the source
                            const animDuration = ltSelectedEntry?.kind === "bible" ? Number(ltSelectedEntry.theme.settings?.animationDuration) || 800 : 800;
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
              </>
            )}
          </div>
        </>
      )}

      {/* ── Countdowns Tab ── */}
      {subTab === "countdowns" && dockPlan !== "free" && (
        <DockCountdownsTab />
      )}

    </div>
  );
}
