/**
 * DockCountdownsTab.tsx — Simplified dock panel with 3 hardcoded countdowns.
 * No add/edit/duplicate/delete. Just 3 preset cards with Push & Start controls.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import Icon from "../DockIcon";
import type { CountdownConfig, OBSSettings, OverlaySyncState, CountdownOverlayPayload } from "../../countdowns/types";
import { getOverlayBaseUrlSync } from "../../services/overlayUrl";
import { getTextTheme, loadTextThemeFont } from "../../countdowns/textThemes";

// ── Hardcoded countdowns ───────────────────────────────────────────────────

function makeCountdown(title: string, minutes: number, templateId: "minimal" | "circular" | "modern" = "minimal"): CountdownConfig {
  const now = new Date().toISOString();
  return {
    id: `hardcoded-${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    templateId,
    timer: { mode: "fixed-duration" as const, durationSeconds: minutes * 60, showHours: false, showMinutes: true, showSeconds: true },
    background: {
      type: "solid" as const,
      color: templateId === "minimal" ? "#1a1a2e" : templateId === "circular" ? "#0f172a" : "#1e293b",
      gradientStart: "#1a1a2e", gradientEnd: "#16213e", gradientAngle: 135,
      imageUrl: "", videoUrl: "", blur: 0, brightness: 100, overlayOpacity: 0.6,
      zoom: 1, positionX: 50, positionY: 50, source: "builtin" as const, imageFit: "cover" as const,
      loop: true, muted: true, flyerMode: false,
    },
    text: {
      title, subtitle: "", fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700, fontSize: 48,
      letterSpacing: 2, lineHeight: 1.2, color: "#ffffff",
      shadowEnabled: true, shadowColor: "#000000", shadowBlur: 12, shadowOffsetX: 0, shadowOffsetY: 4,
    },
    animation: { entrance: "fade-in" as const, backgroundMotion: "none" as const, speed: 1 },
    obs: { sceneName: "", autoAction: "none" as const, autoActionScene: "", autoSwitchEnabled: false, autoSwitchScene: "", autoSwitchAtSeconds: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

const HARDCODED_COUNTDOWNS: CountdownConfig[] = [
  makeCountdown("Pre-Service", 15, "minimal"),
  makeCountdown("Worship Set", 5, "circular"),
  makeCountdown("Sermon Start", 10, "modern"),
];

// ── Live persist helpers ───────────────────────────────────────────────────

interface LivePersistState {
  id: string;
  remaining: number;
  running: boolean;
  savedAt: number;
}

const LIVE_STATE_KEY = "mce-dock-countdown-live";

function readLivePersistState(): LivePersistState | null {
  try {
    const raw = localStorage.getItem(LIVE_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeLivePersistState(state: LivePersistState | null): void {
  try {
    if (state) localStorage.setItem(LIVE_STATE_KEY, JSON.stringify(state));
    else localStorage.removeItem(LIVE_STATE_KEY);
  } catch { /* ignore */ }
}

// ── Countdown timer hook ───────────────────────────────────────────────────

function useCountdownTimer(cd: CountdownConfig | null) {
  const [remaining, setRemaining] = useState(cd?.timer.durationSeconds ?? 0);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef = useRef(cd);

  useEffect(() => {
    cdRef.current = cd;
    if (cd) {
      setRemaining(cd.timer.durationSeconds);
      setIsComplete(false);
    }
  }, [cd?.id]);

  const start = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(true);
    setIsComplete(false);
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setIsRunning(false);
          setIsComplete(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    return remaining;
  }, [remaining]);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    setIsComplete(false);
    setRemaining(cdRef.current?.timer.durationSeconds ?? 0);
  }, []);

  const adjustTime = useCallback((delta: number) => {
    setRemaining((prev) => Math.max(0, prev + delta));
  }, []);

  const setRemainingDirect = useCallback((secs: number) => {
    setRemaining(Math.max(0, secs));
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const formatted = (() => {
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = Math.floor(remaining % 60);
    if (cd?.timer.showHours) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  })();

  return { remaining, isRunning, isComplete, formatted, start, pause, reset, adjustTime, setRemainingDirect };
}

// ── Simplified Countdown Card ──────────────────────────────────────────────

function CountdownCard({
  cd,
  isLive,
  isPaused,
  formattedTime,
  obsScenes,
  onSelect,
  onAdjustTime,
  onSetTime,
  onShowObs,
  onPause,
  onResume,
  onStop,
  onEdit,
  onReset,
  onUpdateObs,
}: {
  cd: CountdownConfig;
  isLive: boolean;
  isPaused: boolean;
  formattedTime: string;
  obsScenes: string[];
  onSelect: () => void;
  onAdjustTime: (deltaSeconds: number) => void;
  onSetTime: (seconds: number) => void;
  onShowObs: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onEdit: () => void;
  onReset: () => void;
  onUpdateObs: (patch: Partial<OBSSettings>) => void;
}) {
  const { t } = useTranslation();
  const [editingTime, setEditingTime] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAutoSwitch, setShowAutoSwitch] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Theme-aware timer display
  const theme = cd.textThemeId ? getTextTheme(cd.textThemeId) : null;
  if (theme) loadTextThemeFont(theme);
  const timerFont = theme ? theme.fontFamily : "monospace";
  const timerWeight = theme ? theme.fontWeight : 700;
  const timerColor = theme ? theme.timerColor : "#fff";
  const timerShadow = theme ? theme.timerShadow : "none";

  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius: 10,
        border: `1px solid ${isLive ? "rgba(34,197,94,0.5)" : "var(--dock-border, rgba(255,255,255,0.08))"}`,
        background: isLive ? "rgba(34,197,94,0.06)" : "var(--dock-surface, rgba(255,255,255,0.04))",
        cursor: "pointer",
        transition: "all 0.15s",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {/* Title + Live badge + three-dot menu */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dock-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cd.title}
          </span>
          {cd.obs.autoSwitchEnabled && cd.obs.autoSwitchScene && (
            <span style={{ fontSize: 8, fontWeight: 600, background: "rgba(99,102,241,0.8)", color: "#fff", borderRadius: 3, padding: "1px 4px", whiteSpace: "nowrap", flexShrink: 0 }}>
              {(() => {
                const sec = cd.obs.autoSwitchAtSeconds ?? 0;
                const m = Math.floor(sec / 60);
                const s = Math.floor(sec % 60);
                return `Switch @ ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
              })()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {isLive ? (
            <span style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(34,197,94,0.9)", borderRadius: 4, padding: "1px 6px" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{t("common.live")}</span>
            </span>
          ) : (
            <span style={{ fontSize: 9, color: "var(--dock-text-dim)" }}>
              {cd.timer.durationSeconds / 60}min
            </span>
          )}
          {/* Three-dot menu */}
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--dock-text-dim)", display: "flex", alignItems: "center", borderRadius: 4 }}
              title={t("common.actions", "Actions")}
            >
              <Icon name="more_vert" size={14} />
            </button>
            {menuOpen && (
              <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 20, background: "var(--dock-surface, #1e1e2e)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 8, padding: 4, minWidth: 130, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", background: "none", border: "none", borderRadius: 4, cursor: "pointer", color: "var(--dock-text)", fontSize: 12, textAlign: "left" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <Icon name="edit" size={13} />
                  <span>{t("common.edit", "Edit")}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onReset(); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", background: "none", border: "none", borderRadius: 4, cursor: "pointer", color: "var(--dock-text)", fontSize: 12, textAlign: "left" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <Icon name="restart_alt" size={13} />
                  <span>{t("countdowns.reset", "Reset")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timer (click to edit inline) */}
      <div
        style={{ fontSize: 28, fontFamily: timerFont, fontWeight: timerWeight, color: timerColor, textShadow: timerShadow, letterSpacing: 1, lineHeight: 1, padding: "8px 0", cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          if (!editingTime) {
            setEditValue(formattedTime);
            setEditingTime(true);
          }
        }}
      >
        {editingTime ? (
          <input
            autoFocus
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                const parts = editValue.split(":").map(Number);
                let secs = 0;
                if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
                else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
                else secs = parts[0] || 0;
                onSetTime(Math.max(0, secs));
                setEditingTime(false);
              } else if (ev.key === "Escape") {
                setEditingTime(false);
              }
            }}
            onBlur={() => setEditingTime(false)}
            onClick={(ev) => ev.stopPropagation()}
            style={{ fontSize: 28, fontFamily: timerFont, fontWeight: timerWeight, color: timerColor, background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-accent, #3b82f6)", borderRadius: 4, padding: "2px 6px", width: "100%", letterSpacing: 1, lineHeight: 1, outline: "none" }}
          />
        ) : (
          formattedTime
        )}
      </div>

      {/* Timer adjust controls */}
      <div style={{ display: "flex", gap: 3, alignItems: "center", marginTop: 4 }}>
        <button type="button" className="dock-btn dock-btn--small" onClick={(e) => { e.stopPropagation(); onAdjustTime(-60); }} title="-1 minute" style={{ fontSize: 10, fontWeight: 700, padding: "4px 5px", minWidth: 0 }}>-1m</button>
        <button type="button" className="dock-btn dock-btn--small" onClick={(e) => { e.stopPropagation(); onAdjustTime(-10); }} title="-10 seconds" style={{ fontSize: 10, fontWeight: 700, padding: "4px 5px", minWidth: 0 }}><Icon name="fast_rewind" size={10} /></button>
        <button type="button" className="dock-btn dock-btn--small" onClick={(e) => { e.stopPropagation(); onAdjustTime(10); }} title="+10 seconds" style={{ fontSize: 10, fontWeight: 700, padding: "4px 5px", minWidth: 0 }}><Icon name="fast_forward" size={10} /></button>
        <button type="button" className="dock-btn dock-btn--small" onClick={(e) => { e.stopPropagation(); onAdjustTime(60); }} title="+1 minute" style={{ fontSize: 10, fontWeight: 700, padding: "4px 5px", minWidth: 0 }}>+1m</button>
      </div>

      {/* Push & Start / Pause / Stop */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
        {isLive ? (
          <>
            <button type="button" className="dock-btn dock-btn--small dock-btn--danger" onClick={(e) => { e.stopPropagation(); onStop(); }} style={{ fontSize: 10, padding: "4px 6px", display: "flex", alignItems: "center", gap: 3 }}>
              <Icon name="stop" size={10} /> {t("countdowns.stopAndRemove", "Stop & Remove")}
            </button>
            <button type="button" className="dock-btn dock-btn--small" onClick={(e) => { e.stopPropagation(); isPaused ? onResume() : onPause(); }} title={isPaused ? t("countdowns.resume", "Resume") : t("countdowns.pause", "Pause")} style={{ fontSize: 10, padding: "4px 6px" }}>
              <Icon name={isPaused ? "play_arrow" : "pause"} size={10} />
            </button>
          </>
        ) : (
          <button type="button" className="dock-btn dock-btn--small dock-btn--success" onClick={(e) => { e.stopPropagation(); onShowObs(); }} style={{ fontSize: 10, padding: "4px 6px" }}>
            {t("countdowns.pushAndStart", "Push & Start")}
          </button>
        )}
      </div>

      {/* Auto Scene Switch */}
      <div style={{ borderTop: "1px solid var(--dock-border, rgba(255,255,255,0.06))", marginTop: 6, paddingTop: 6 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowAutoSwitch(!showAutoSwitch); }}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--dock-text-dim)", fontSize: 9 }}
        >
          <Icon name={showAutoSwitch ? "expand_less" : "expand_more"} size={12} />
          <span>{t("countdowns.autoSceneSwitch", "Auto Scene Switch")}</span>
          {cd.obs.autoSwitchEnabled && (
            <span style={{ fontSize: 8, background: "rgba(99,102,241,0.8)", color: "#fff", borderRadius: 3, padding: "0 3px", marginLeft: 2 }}>
              ON
            </span>
          )}
        </button>

        {showAutoSwitch && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, paddingLeft: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={cd.obs.autoSwitchEnabled ?? false}
                onChange={(e) => onUpdateObs({ autoSwitchEnabled: e.target.checked })}
                style={{ accentColor: "var(--dock-accent, #3b82f6)", width: 12, height: 12 }}
              />
              <span style={{ fontSize: 10, color: "var(--dock-text)" }}>{t("countdowns.enableAutoSceneSwitch", "Enable")}</span>
            </label>

            {(cd.obs.autoSwitchEnabled ?? false) && (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                  <span style={{ fontSize: 9, color: "var(--dock-text-dim)" }}>{t("countdowns.switchAt", "Trigger at (seconds)")}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={cd.obs.autoSwitchAtSeconds ?? 0}
                    onChange={(e) => onUpdateObs({ autoSwitchAtSeconds: parseInt(e.target.value, 10) || 0 })}
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 4, padding: "3px 6px", color: "var(--dock-text)", fontSize: 10, outline: "none", width: "100%" }}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                  <span style={{ fontSize: 9, color: "var(--dock-text-dim)" }}>{t("countdowns.targetScene", "Scene")}</span>
                  <select
                    value={cd.obs.autoSwitchScene ?? ""}
                    onChange={(e) => onUpdateObs({ autoSwitchScene: e.target.value })}
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 4, padding: "3px 6px", color: "var(--dock-text)", fontSize: 10, outline: "none", width: "100%" }}
                  >
                    <option value="">{t("countdowns.selectScene", "Select scene...")}</option>
                    {obsScenes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function DockCountdownsTab() {
  const { t } = useTranslation();
  const [countdowns, setCountdowns] = useState<CountdownConfig[]>(HARDCODED_COUNTDOWNS);
  const [liveCountdownId, setLiveCountdownId] = useState<string | null>(() => readLivePersistState()?.id ?? null);
  const livePersistRef = useRef<LivePersistState | null>(readLivePersistState());
  const restoredRef = useRef(false);
  const autoSwitchTriggeredRef = useRef(false);

  // Edit modal state
  const [editingCd, setEditingCd] = useState<CountdownConfig | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const [obsScenes, setObsScenes] = useState<string[]>([]);

  // Per-card timer state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<"running" | "paused">("running");
  const activeCd = countdowns.find((c) => c.id === activeId) ?? null;
  const timer = useCountdownTimer(activeCd);

  // Restore activeId when liveCountdownId is set but activeId is not
  useEffect(() => {
    if (liveCountdownId && !activeId) {
      setActiveId(liveCountdownId);
    }
  }, [liveCountdownId, activeId]);

  // Restore timer remaining when activeCd becomes available after mount
  useEffect(() => {
    if (restoredRef.current) return;
    const persist = livePersistRef.current;
    if (!persist || !activeCd || activeCd.id !== persist.id) return;

    restoredRef.current = true;
    livePersistRef.current = null;

    let remaining = persist.remaining;
    if (persist.running && persist.savedAt) {
      const elapsed = (Date.now() - persist.savedAt) / 1000;
      remaining = Math.max(0, remaining - elapsed);
    }

    timer.setRemainingDirect(remaining);

    if (persist.running && remaining > 0) {
      timer.start();
      const sync: OverlaySyncState = { paused: false, remaining: Math.floor(remaining) };
      pushToObs(activeCd, sync);
    } else {
      const sync: OverlaySyncState = { paused: true, remaining: Math.floor(remaining) };
      pushToObs(activeCd, sync);
    }
  }, [activeCd]);

  // Persist live state
  useEffect(() => {
    function save() {
      if (liveCountdownId) {
        writeLivePersistState({
          id: liveCountdownId,
          remaining: timer.remaining,
          running: timer.isRunning,
          savedAt: Date.now(),
        });
      }
    }
    const handleBeforeUnload = () => save();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = setInterval(save, 2000);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [liveCountdownId, timer.remaining, timer.isRunning]);

  // Clear live countdown when timer completes
  useEffect(() => {
    if (timer.isComplete && liveCountdownId) {
      writeLivePersistState(null);
      setLiveCountdownId(null);
    }
  }, [timer.isComplete, liveCountdownId]);

  // Auto scene switch: fire once when remaining drops to or below the trigger
  useEffect(() => {
    if (!activeCd) return;
    const autoEnabled = activeCd.obs.autoSwitchEnabled;
    const triggerTime = activeCd.obs.autoSwitchAtSeconds ?? 0;
    const targetScene = activeCd.obs.autoSwitchScene;
    if (
      autoEnabled &&
      targetScene &&
      !autoSwitchTriggeredRef.current &&
      timer.remaining <= triggerTime
    ) {
      autoSwitchTriggeredRef.current = true;
      ensureObsConnected().then(() => {
        if (dockObsClient.isConnected) {
          dockObsClient.call("SetCurrentProgramScene", { sceneName: targetScene });
        }
      }).catch((err) => {
        console.warn("[DockCountdowns] Auto scene switch failed:", err);
      });
    }
  }, [timer.remaining, activeCd]);

  // Load OBS scenes on mount so card dropdowns have data
  useEffect(() => {
    loadObsScenes().then(setObsScenes);
  }, []);

  // ── OBS ─────────────────────────────────────────────────────────────────

  const COUNTDOWN_SOURCE = "MCE Countdown";
  const BG_SOURCE = "MCE Countdown BG";
  const PRESENTATION_SCENE = "MCE Presentation";

  async function loadObsScenes(): Promise<string[]> {
    try {
      await ensureObsConnected();
      if (!dockObsClient.isConnected) return [];
      const result = await dockObsClient.call("GetSceneList", {}) as { scenes: Array<{ sceneName: string }> };
      return result.scenes.map((s) => s.sceneName);
    } catch {
      return [];
    }
  }

  async function ensureObsScene(sceneName: string): Promise<void> {
    const scenes = await dockObsClient.call("GetSceneList", {}) as { scenes: Array<{ sceneName: string }> };
    const exists = scenes.scenes.some((s) => s.sceneName === sceneName);
    if (!exists) {
      await dockObsClient.call("CreateScene", { sceneName });
    }
  }

  async function ensureObsSource(
    sourceName: string,
    url: string,
    sceneName: string,
    opts?: { setTransform?: boolean },
  ): Promise<void> {
    await ensureObsScene(sceneName);

    const inputs = await dockObsClient.call("GetInputList", { inputKind: "browser_source" }) as { inputs: Array<{ inputName: string }> };
    const existing = inputs.inputs.find((i) => i.inputName === sourceName);

    if (existing) {
      await dockObsClient.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: { url, width: 1920, height: 1080, shutdown: false },
      });
    } else {
      await dockObsClient.call("CreateInput", {
        sceneName,
        inputName: sourceName,
        inputKind: "browser_source",
        inputSettings: { url, width: 1920, height: 1080, shutdown: false },
      });
    }

    const sceneItems = await dockObsClient.call("GetSceneItemList", { sceneName }) as { sceneItems: Array<{ sceneItemId: number; sourceName: string }> };
    const item = sceneItems.sceneItems.find((i) => i.sourceName === sourceName);

    if (item) {
      await dockObsClient.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: true,
      });

      if (opts?.setTransform) {
        const allItems = await dockObsClient.call("GetSceneItemList", { sceneName }) as { sceneItems: Array<{ sceneItemId: number }> };
        const topIndex = Math.max(0, allItems.sceneItems.length - 1);
        await dockObsClient.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemIndex: topIndex,
        });

        const vs = await dockObsClient.call("GetVideoSettings", {}) as any;
        await dockObsClient.call("SetSceneItemTransform", {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemTransform: {
            positionX: 0, positionY: 0,
            boundsType: "OBS_BOUNDS_STRETCH",
            boundsWidth: vs.baseWidth, boundsHeight: vs.baseHeight,
            boundsAlignment: 0,
          },
        });
      }
    }
  }

  async function hideObsSource(sourceName: string): Promise<void> {
    const sceneItems = await dockObsClient.call("GetSceneItemList", { sceneName: PRESENTATION_SCENE }) as { sceneItems: Array<{ sceneItemId: number; sourceName: string }> };
    const item = sceneItems.sceneItems.find((i) => i.sourceName === sourceName);
    if (item) {
      await dockObsClient.call("SetSceneItemEnabled", {
        sceneName: PRESENTATION_SCENE,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: false,
      });
    }
  }

  const pushToObs = useCallback(async (cd: CountdownConfig, sync?: OverlaySyncState) => {
    await ensureObsConnected();
    if (!dockObsClient.isConnected) return;

    try {
      const baseUrl = getOverlayBaseUrlSync();
      const payload: CountdownOverlayPayload = { config: cd, baseUrl, timestamp: Date.now(), sync };
      const url = `${baseUrl}/countdown-overlay.html#data=${encodeURIComponent(JSON.stringify(payload))}`;

      await ensureObsSource(COUNTDOWN_SOURCE, url, PRESENTATION_SCENE);
    } catch (err) {
      console.warn("[DockCountdowns] Failed to push to OBS:", err);
    }
  }, []);

  const showInObs = useCallback(async (cd: CountdownConfig) => {
    await ensureObsConnected();
    if (!dockObsClient.isConnected) return;

    try {
      const baseUrl = getOverlayBaseUrlSync();

      const bgPayload = { config: cd, baseUrl, timestamp: Date.now() };
      const bgUrl = `${baseUrl}/countdown-bg-overlay.html#data=${encodeURIComponent(JSON.stringify(bgPayload))}`;
      await ensureObsSource(BG_SOURCE, bgUrl, PRESENTATION_SCENE, { setTransform: true });

      const sync: OverlaySyncState = { paused: true, remaining: cd.timer.durationSeconds };
      const contentPayload: CountdownOverlayPayload = { config: cd, baseUrl, timestamp: Date.now(), sync };
      const contentUrl = `${baseUrl}/countdown-overlay.html#data=${encodeURIComponent(JSON.stringify(contentPayload))}`;
      await ensureObsSource(COUNTDOWN_SOURCE, contentUrl, PRESENTATION_SCENE, { setTransform: true });

      setLiveCountdownId(cd.id);
    } catch (err) {
      console.warn("[DockCountdowns] Failed to show in OBS:", err);
    }
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleShowInObs = useCallback(async (cd: CountdownConfig) => {
    await showInObs(cd);
    setActiveId(cd.id);
    setPlaybackState("running");
    autoSwitchTriggeredRef.current = false;
    setTimeout(async () => {
      timer.start();
      const duration = cd.timer.durationSeconds;
      writeLivePersistState({ id: cd.id, remaining: duration, running: true, savedAt: Date.now() });
      setLiveCountdownId(cd.id);
      const sync: OverlaySyncState = { paused: false, remaining: Math.floor(duration) };
      await pushToObs(cd, sync);
    }, 50);
  }, [showInObs, timer, pushToObs]);

  const handlePause = useCallback(async (cd: CountdownConfig) => {
    const currentRemaining = timer.pause();
    const remaining = Math.floor(currentRemaining);
    setPlaybackState("paused");
    writeLivePersistState({ id: cd.id, remaining: currentRemaining, running: false, savedAt: Date.now() });
    const sync: OverlaySyncState = { paused: true, remaining };
    await pushToObs(cd, sync);
  }, [timer, pushToObs]);

  const handleResume = useCallback(async (cd: CountdownConfig) => {
    const persist = readLivePersistState();
    if (persist && persist.id === cd.id) {
      timer.setRemainingDirect(persist.remaining);
    }
    autoSwitchTriggeredRef.current = false;
    timer.start();
    setPlaybackState("running");
    const remaining = timer.remaining;
    writeLivePersistState({ id: cd.id, remaining, running: true, savedAt: Date.now() });
    const sync: OverlaySyncState = { paused: false, remaining: Math.floor(remaining) };
    await pushToObs(cd, sync);
  }, [timer, pushToObs]);

  const handleStopAndRemove = useCallback(async (_cd: CountdownConfig) => {
    timer.reset();
    autoSwitchTriggeredRef.current = false;
    setActiveId(null);
    setPlaybackState("running");
    try {
      await ensureObsConnected();
      if (dockObsClient.isConnected) {
        await hideObsSource(BG_SOURCE);
        await hideObsSource(COUNTDOWN_SOURCE);
      }
    } catch (err) {
      console.warn("[DockCountdowns] Failed to hide OBS sources:", err);
    }
    writeLivePersistState(null);
    setLiveCountdownId(null);
  }, [timer]);

  const handleAdjustTime = useCallback(async (cd: CountdownConfig, deltaSeconds: number) => {
    timer.adjustTime(deltaSeconds);
    const newRemaining = Math.max(0, timer.remaining + deltaSeconds);
    if (liveCountdownId === cd.id) {
      writeLivePersistState({ id: cd.id, remaining: newRemaining, running: timer.isRunning, savedAt: Date.now() });
    }
    const sync: OverlaySyncState = { paused: !timer.isRunning, remaining: Math.floor(newRemaining) };
    await pushToObs(cd, sync);
  }, [timer, pushToObs, liveCountdownId]);

  const handleSetTime = useCallback(async (cd: CountdownConfig, seconds: number) => {
    timer.setRemainingDirect(seconds);
    if (liveCountdownId === cd.id) {
      writeLivePersistState({ id: cd.id, remaining: seconds, running: timer.isRunning, savedAt: Date.now() });
    }
    const sync: OverlaySyncState = { paused: !timer.isRunning, remaining: Math.floor(seconds) };
    await pushToObs(cd, sync);
  }, [timer, pushToObs, liveCountdownId]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="dock-tab-content" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--dock-border, rgba(255,255,255,0.08))", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="timer" size={14} style={{ color: "var(--dock-accent, #3b82f6)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dock-text)" }}>{t("countdowns.myCountdowns")}</span>
          <span style={{ fontSize: 10, color: "var(--dock-text-dim)" }}>({countdowns.length})</span>
        </div>
      </div>

      {/* Countdown list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {countdowns.map((cd) => {
            const isThisLive = liveCountdownId === cd.id;
            const isThisActive = activeId === cd.id;
            const timeDisplay = isThisActive ? timer.formatted : formatTimeStatic(cd);

            return (
              <CountdownCard
                key={cd.id}
                cd={cd}
                isLive={isThisLive}
                isPaused={isThisLive && playbackState === "paused"}
                formattedTime={timeDisplay}
                obsScenes={obsScenes}
                onSelect={() => setActiveId(cd.id)}
                onAdjustTime={isThisActive ? (delta) => handleAdjustTime(cd, delta) : () => { }}
                onSetTime={isThisActive ? (secs) => handleSetTime(cd, secs) : () => { }}
                onShowObs={() => handleShowInObs(cd)}
                onPause={() => handlePause(cd)}
                onResume={() => handleResume(cd)}
                onStop={() => handleStopAndRemove(cd)}
                onEdit={async () => {
                  setEditingCd(cd);
                  setEditTitle(cd.title);
                  setEditMinutes(String(cd.timer.durationSeconds / 60));
                  const scenes = await loadObsScenes();
                  setObsScenes(scenes);
                }}
                onReset={() => {
                  if (liveCountdownId === cd.id) {
                    timer.reset();
                    autoSwitchTriggeredRef.current = false;
                    const sync: OverlaySyncState = { paused: true, remaining: cd.timer.durationSeconds };
                    pushToObs(cd, sync);
                    writeLivePersistState(null);
                    setLiveCountdownId(null);
                    setPlaybackState("running");
                  }
                }}
                onUpdateObs={(patch) => {
                  setCountdowns((prev) => prev.map((c) =>
                    c.id === cd.id ? { ...c, obs: { ...c.obs, ...patch } } : c,
                  ));
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Edit Modal */}
      {editingCd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
          onClick={() => setEditingCd(null)}>
          <div style={{ background: "var(--dock-surface, #1e1e2e)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 12, padding: 20, width: 320, maxHeight: "80vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}
            onClick={(e) => e.stopPropagation()}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--dock-text)" }}>{t("countdowns.editCountdown", "Edit Countdown")}</span>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--dock-text-dim)" }}>{t("common.title", "Title")}</span>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 6, padding: "6px 10px", color: "var(--dock-text)", fontSize: 12, outline: "none" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--dock-text-dim)" }}>{t("countdowns.durationMinutes", "Duration (minutes)")}</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={editMinutes}
                onChange={(e) => setEditMinutes(e.target.value)}
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 6, padding: "6px 10px", color: "var(--dock-text)", fontSize: 12, outline: "none" }}
              />
            </label>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" className="dock-btn dock-btn--small" onClick={() => setEditingCd(null)} style={{ fontSize: 11 }}>
                {t("common.cancel", "Cancel")}
              </button>
              <button type="button" className="dock-btn dock-btn--small dock-btn--success" onClick={() => {
                const mins = parseFloat(editMinutes) || 0;
                const secs = Math.round(mins * 60);
                setCountdowns((prev) => prev.map((c) =>
                  c.id === editingCd.id
                    ? {
                      ...c,
                      title: editTitle.trim() || c.title,
                      timer: { ...c.timer, durationSeconds: secs },
                    }
                    : c,
                ));
                setEditingCd(null);
              }} style={{ fontSize: 11 }}>
                {t("common.save", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTimeStatic(cd: CountdownConfig): string {
  const sec = cd.timer.durationSeconds;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (cd.timer.showHours) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
