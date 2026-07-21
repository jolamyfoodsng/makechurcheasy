/**
 * DockCountdownsTab.tsx — Simplified dock panel with 3 hardcoded countdowns.
 * No add/edit/duplicate/delete. Just 3 preset cards with Push & Start controls.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import Icon from "../DockIcon";
import type { CountdownConfig, BackgroundSettings, BackgroundType, ImageFit, MessageSettings, OBSSettings, OverlaySyncState, CountdownOverlayPayload } from "../../countdowns/types";
// countdownDefaults removed — editBg initialized inline
import { getOverlayBaseUrlSync } from "../../services/overlayUrl";
import { getTextTheme, loadTextThemeFont } from "../../countdowns/textThemes";
import { validateMediaFile, backgroundFileAccept } from "../../countdowns/mediaValidation";
import { saveCountdownAsset, deleteCountdownAsset } from "../../countdowns/countdownStore";
import type { MediaItem } from "../../library/libraryTypes";
import {
  DOCK_COUNTDOWN_BG_SOURCE_NAME,
  DOCK_COUNTDOWN_SOURCE_NAME,
  resolveCountdownTargetScene,
} from "./dockCountdownScene";

// ── Hardcoded countdowns ───────────────────────────────────────────────────

function makeCountdown(title: string, minutes: number, templateId: "minimal" | "circular" | "modern" = "minimal"): CountdownConfig {
  const now = new Date().toISOString();
  return {
    id: `hardcoded-${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    templateId,
    timer: { mode: "fixed-duration" as const, durationSeconds: minutes * 60, showHours: false, showMinutes: true, showSeconds: true },
    message: { text: title, color: "#ffffff", position: "below" as const },
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
  onUpdateMessage,
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
  onUpdateMessage: (msg: MessageSettings | undefined) => void;
}) {
  const { t } = useTranslation();
  const [editingTime, setEditingTime] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAutoSwitch, setShowAutoSwitch] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgDraft, setMsgDraft] = useState<MessageSettings>({ text: "", color: "#ffffff", position: "below" });
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
        style={{ fontSize: 28, fontFamily: timerFont, fontWeight: timerWeight, color: timerColor, textShadow: timerShadow, letterSpacing: 1, lineHeight: 1, padding: "8px 0", cursor: isLive ? "default" : "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          if (!isLive && !editingTime) {
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

      {/* Push to separate scene toggle */}



      {/* Push & Start / Pause / Stop + Message */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
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
        {/* Message icon + inline editor */}
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <button
            type="button"
            title={cd.message?.text?.trim() ? `Message: ${cd.message.text}` : "Add message to overlay"}
            onClick={(e) => {
              e.stopPropagation();
              if (msgOpen) { setMsgOpen(false); return; }
              setMsgDraft(cd.message ? { ...cd.message } : { text: "", color: "#ffffff", position: "below" });
              setMsgOpen(true);
            }}
            style={{ background: cd.message?.text?.trim() ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 4, padding: "4px 6px", cursor: "pointer", color: cd.message?.text?.trim() ? "#a5b4fc" : "var(--dock-text-dim)", fontSize: 12, display: "flex", alignItems: "center", gap: 2, lineHeight: 1 }}
          >
            <Icon name="chat_bubble" size={12} />
          </button>
          {msgOpen && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: "100%", right: 0, marginBottom: 6, background: "var(--dock-surface, #1a1a2e)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 8, padding: 10, width: 220, zIndex: 50, display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--dock-text)" }}>Message (OBS Overlay)</span>
              <input
                type="text"
                value={msgDraft.text}
                onChange={(e) => setMsgDraft((p) => ({ ...p, text: e.target.value }))}
                placeholder="e.g. Welcome to our service"
                autoFocus
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 6, padding: "5px 8px", color: "var(--dock-text)", fontSize: 11, outline: "none", width: "100%" }}
              />
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={msgDraft.color} onChange={(e) => setMsgDraft((p) => ({ ...p, color: e.target.value }))}
                  style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", cursor: "pointer", padding: 1, background: "transparent" }} />
                <div style={{ display: "flex", gap: 3, flex: 1 }}>
                  {(["above", "below"] as const).map((pos) => (
                    <button key={pos} type="button" onClick={() => setMsgDraft((p) => ({ ...p, position: pos }))}
                      style={{ flex: 1, padding: "3px 0", borderRadius: 4, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", background: msgDraft.position === pos ? "rgba(99,102,241,0.3)" : "rgba(0,0,0,0.2)", color: "var(--dock-text)", fontSize: 10, cursor: "pointer", textTransform: "capitalize" }}>
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {cd.message?.text?.trim() && (
                  <button type="button" onClick={() => { onUpdateMessage(undefined); setMsgOpen(false); }}
                    style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#fca5a5", fontSize: 10, cursor: "pointer" }}>
                    Clear
                  </button>
                )}
                <button type="button" onClick={() => { onUpdateMessage(msgDraft.text.trim() ? { ...msgDraft } : undefined); setMsgOpen(false); }}
                  style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.2)", color: "#a5b4fc", fontSize: 10, cursor: "pointer", fontWeight: 600 }}>
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
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
            <span style={{ fontSize: 8, color: "var(--dock-text-dim)", lineHeight: 1.3 }}>{t("countdowns.autoSceneSwitchDesc", "Automatically switch OBS to a different scene when the countdown reaches a specific time.")}</span>

            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={cd.obs.autoSwitchEnabled ?? false}
                onChange={(e) => onUpdateObs({ autoSwitchEnabled: e.target.checked })}
                style={{ accentColor: "var(--dock-accent, #3b82f6)", width: 12, height: 12 }}
              />
              <span style={{ fontSize: 10, color: "var(--dock-text)" }}>{t("countdowns.enableAutoSceneSwitch", "Enable")}</span>
            </label>
            <span style={{ fontSize: 7, color: "var(--dock-text-dim)", lineHeight: 1.2, marginTop: -4 }}>{t("countdowns.enableAutoSceneSwitchDesc", "Turn on to auto-switch scenes at the trigger time.")}</span>

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
                <span style={{ fontSize: 7, color: "var(--dock-text-dim)", lineHeight: 1.2, marginTop: -4 }}>{t("countdowns.switchAtDesc", "Seconds remaining when the scene switch fires. 0 = at the very end.")}</span>

                <label style={{ display: "flex", flexDirection: "column", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                  <span style={{ fontSize: 9, color: "var(--dock-text-dim)" }}>{t("countdowns.targetScene", "Switch to scene")}</span>
                  <select
                    value={cd.obs.autoSwitchScene ?? ""}
                    onChange={(e) => onUpdateObs({ autoSwitchScene: e.target.value })}
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 4, padding: "3px 6px", color: "var(--dock-text)", fontSize: 10, outline: "none", width: "100%" }}
                  >
                    <option value="">{t("countdowns.selectScene", "Select scene...")}</option>
                    {obsScenes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <span style={{ fontSize: 7, color: "var(--dock-text-dim)", lineHeight: 1.2, marginTop: -4 }}>{t("countdowns.targetSceneDesc", "OBS scene to switch to when the countdown hits the trigger.")}</span>
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
  const obsControlArmedRef = useRef(false);

  // Edit modal state
  const [editingCd, setEditingCd] = useState<CountdownConfig | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [editBg, setEditBg] = useState<BackgroundSettings>({
    type: "solid", color: "#1a1a2e", gradientStart: "#1a1a2e", gradientEnd: "#16213e", gradientAngle: 135,
    imageUrl: "", videoUrl: "", blur: 0, brightness: 100, overlayOpacity: 0, zoom: 1, positionX: 50, positionY: 50,
    source: "upload", imageFit: "cover", loop: true, muted: true, flyerMode: false,
  });
  const [editMessage, setEditMessage] = useState<MessageSettings>({ text: "", color: "#ffffff", position: "below" });
  const [showBgSection, setShowBgSection] = useState(false);
  const [showMsgSection, setShowMsgSection] = useState(false);
  const [editBgMediaModal, setEditBgMediaModal] = useState(false);
  const [editMediaSearch, setEditMediaSearch] = useState("");
  const [editMediaItems, setEditMediaItems] = useState<MediaItem[]>([]);
  const [editMediaLoading, setEditMediaLoading] = useState(false);
  const editBgFileRef = useRef<HTMLInputElement | null>(null);
  const [editBgUploading, setEditBgUploading] = useState(false);
  const [editBgUploadError, setEditBgUploadError] = useState("");

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

    setPlaybackState(persist.running && remaining > 0 ? "running" : "paused");

    if (persist.running && remaining > 0) {
      timer.start();
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
      obsControlArmedRef.current &&
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

  const COUNTDOWN_SOURCE = DOCK_COUNTDOWN_SOURCE_NAME;
  const BG_SOURCE = DOCK_COUNTDOWN_BG_SOURCE_NAME;

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
        inputSettings: { url, width: 1920, height: 1080, shutdown: false, restart_when_active: false },
      });
    } else {
      await dockObsClient.call("CreateInput", {
        sceneName,
        inputName: sourceName,
        inputKind: "browser_source",
        inputSettings: { url, width: 1920, height: 1080, shutdown: false, restart_when_active: false },
      });
    }

    const sceneItems = await dockObsClient.call("GetSceneItemList", { sceneName }) as { sceneItems: Array<{ sceneItemId: number; sourceName: string }> };
    let item = sceneItems.sceneItems.find((i) => i.sourceName === sourceName);

    if (!item && existing) {
      const addResult = await dockObsClient.call("CreateSceneItem", {
        sceneName,
        sourceName,
        sceneItemEnabled: true,
      }) as { sceneItemId: number };
      item = { sceneItemId: addResult.sceneItemId, sourceName };
    }

    if (item) {
      await dockObsClient.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: true,
      });

      if (opts?.setTransform) {
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

      await dockObsClient.ensureTickerAboveSource(sceneName, sourceName).catch(() => { });
    }
  }

  async function hideObsSource(sourceName: string, sceneName?: string): Promise<void> {
    const target = resolveCountdownTargetScene(sceneName);
    const sceneItems = await dockObsClient.call("GetSceneItemList", { sceneName: target }) as { sceneItems: Array<{ sceneItemId: number; sourceName: string }> };
    const item = sceneItems.sceneItems.find((i) => i.sourceName === sourceName);
    if (item) {
      await dockObsClient.call("SetSceneItemEnabled", {
        sceneName: target,
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
      const targetScene = resolveCountdownTargetScene(cd.obs.sceneName);

      await ensureObsSource(COUNTDOWN_SOURCE, url, targetScene);
    } catch (err) {
      console.warn("[DockCountdowns] Failed to push to OBS:", err);
    }
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleShowInObs = useCallback(async (cd: CountdownConfig) => {
    await ensureObsConnected();
    if (!dockObsClient.isConnected) return;

    try {
      // 1. Push BG first, then countdown overlay ONCE with running state
      const baseUrl = getOverlayBaseUrlSync();
      const targetScene = resolveCountdownTargetScene(cd.obs.sceneName);

      const bgPayload = { config: cd, baseUrl, timestamp: Date.now() };
      const bgUrl = `${baseUrl}/countdown-bg-overlay.html#data=${encodeURIComponent(JSON.stringify(bgPayload))}`;
      await ensureObsSource(BG_SOURCE, bgUrl, targetScene, { setTransform: true });

      setActiveId(cd.id);
      setPlaybackState("running");
      obsControlArmedRef.current = true;
      autoSwitchTriggeredRef.current = false;

      // Use config's durationSeconds (reflects any inline edits via handleSetTime)
      const remaining = Math.floor(cd.timer.durationSeconds);
      writeLivePersistState({ id: cd.id, remaining, running: true, savedAt: Date.now() });
      setLiveCountdownId(cd.id);

      const sync: OverlaySyncState = { paused: false, remaining };
      const payload: CountdownOverlayPayload = { config: cd, baseUrl, timestamp: Date.now(), sync };
      const contentUrl = `${baseUrl}/countdown-overlay.html#data=${encodeURIComponent(JSON.stringify(payload))}`;
      await ensureObsSource(COUNTDOWN_SOURCE, contentUrl, targetScene, { setTransform: true });

      timer.start();
    } catch (err) {
      console.warn("[DockCountdowns] Failed to show in OBS:", err);
    }
  }, [timer, pushToObs]);

  const handlePause = useCallback(async (cd: CountdownConfig) => {
    const currentRemaining = timer.pause();
    const remaining = Math.floor(currentRemaining);
    setPlaybackState("paused");
    obsControlArmedRef.current = true;
    writeLivePersistState({ id: cd.id, remaining: currentRemaining, running: false, savedAt: Date.now() });
    const sync: OverlaySyncState = { paused: true, remaining };
    await pushToObs(cd, sync);
  }, [timer, pushToObs]);

  const handleResume = useCallback(async (cd: CountdownConfig) => {
    const persist = readLivePersistState();
    if (persist && persist.id === cd.id) {
      timer.setRemainingDirect(persist.remaining);
    }
    obsControlArmedRef.current = true;
    autoSwitchTriggeredRef.current = false;
    timer.start();
    setPlaybackState("running");
    const remaining = timer.remaining;
    writeLivePersistState({ id: cd.id, remaining, running: true, savedAt: Date.now() });
    const sync: OverlaySyncState = { paused: false, remaining: Math.floor(remaining) };
    await pushToObs(cd, sync);
  }, [timer, pushToObs]);

  const handleStopAndRemove = useCallback(async (cd: CountdownConfig) => {
    timer.reset();
    autoSwitchTriggeredRef.current = false;
    obsControlArmedRef.current = true;
    setActiveId(null);
    setPlaybackState("running");
    const targetScene = resolveCountdownTargetScene(cd.obs.sceneName);
    try {
      await ensureObsConnected();
      if (dockObsClient.isConnected) {
        await hideObsSource(BG_SOURCE, targetScene);
        await hideObsSource(COUNTDOWN_SOURCE, targetScene);
      }
    } catch (err) {
      console.warn("[DockCountdowns] Failed to hide OBS sources:", err);
    }
    writeLivePersistState(null);
    setLiveCountdownId(null);
  }, [timer]);

  const handleAdjustTime = useCallback(async (cd: CountdownConfig, deltaSeconds: number) => {
    const oldRemaining = timer.remaining;
    const newRemaining = Math.max(0, oldRemaining + deltaSeconds);
    setCountdowns((prev) => prev.map((c) =>
      c.id === cd.id ? { ...c, timer: { ...c.timer, durationSeconds: newRemaining } } : c,
    ));
    if (activeId === cd.id) {
      timer.adjustTime(deltaSeconds);
      if (liveCountdownId === cd.id) {
        writeLivePersistState({ id: cd.id, remaining: newRemaining, running: timer.isRunning, savedAt: Date.now() });
      }
      const sync: OverlaySyncState = { paused: !timer.isRunning, remaining: Math.floor(newRemaining) };
      await pushToObs(cd, sync);
    }
  }, [timer, pushToObs, liveCountdownId, activeId]);

  const handleSetTime = useCallback(async (cd: CountdownConfig, seconds: number) => {
    setCountdowns((prev) => prev.map((c) =>
      c.id === cd.id ? { ...c, timer: { ...c.timer, durationSeconds: seconds } } : c,
    ));
    if (activeId === cd.id) {
      timer.setRemainingDirect(seconds);
      if (liveCountdownId === cd.id) {
        writeLivePersistState({ id: cd.id, remaining: seconds, running: timer.isRunning, savedAt: Date.now() });
      }
      const sync: OverlaySyncState = { paused: !timer.isRunning, remaining: Math.floor(seconds) };
      await pushToObs(cd, sync);
    }
  }, [timer, pushToObs, liveCountdownId, activeId]);

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
                onAdjustTime={(delta) => handleAdjustTime(cd, delta)}
                onSetTime={(secs) => handleSetTime(cd, secs)}
                onShowObs={() => handleShowInObs(cd)}
                onPause={() => handlePause(cd)}
                onResume={() => handleResume(cd)}
                onStop={() => handleStopAndRemove(cd)}
                onEdit={async () => {
                  setEditingCd(cd);
                  setEditTitle(cd.title);
                  setEditMinutes(String(cd.timer.durationSeconds / 60));
                  setEditBg({ ...cd.background });
                  setEditMessage(cd.message ? { ...cd.message } : { text: "", color: "#ffffff", position: "below" });
                  setShowBgSection(false);
                  setShowMsgSection(false);
                  setEditBgUploadError("");
                  setEditBgUploading(false);
                  const scenes = await loadObsScenes();
                  setObsScenes(scenes);
                }}
                onReset={() => {
                  if (liveCountdownId === cd.id) {
                    timer.reset();
                    autoSwitchTriggeredRef.current = false;
                    obsControlArmedRef.current = true;
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
                onUpdateMessage={(msg) => {
                  setCountdowns((prev) => prev.map((c) =>
                    c.id === cd.id ? { ...c, message: msg } : c,
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
          <div style={{ background: "var(--dock-surface, #1e1e2e)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 12, padding: 20, width: 380, maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}
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

            {/* ── Background Section ─────────────────────────────── */}
            <div style={{ borderTop: "1px solid var(--dock-border, rgba(255,255,255,0.08))", paddingTop: 10 }}>
              <button type="button" onClick={() => setShowBgSection(!showBgSection)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", background: showBgSection ? "rgba(99,102,241,0.1)" : "rgba(0,0,0,0.2)", color: "var(--dock-text)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>🎨 {t("countdowns.background", "Background")}</span>
                <span style={{ fontSize: 10, color: "var(--dock-text-dim)" }}>{showBgSection ? "▲" : "▼"}</span>
              </button>

              {showBgSection && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Type selector */}
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["solid", "gradient", "image", "video", "transparent"] as BackgroundType[]).map((bgType) => (
                      <button key={bgType} type="button" onClick={() => { setEditBgUploadError(""); setEditBg((prev) => ({ ...prev, type: bgType })); }}
                        style={{ flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, fontWeight: 500, border: `1px solid ${editBg.type === bgType ? "#6366f1" : "var(--dock-border, rgba(255,255,255,0.1))"}`, background: editBg.type === bgType ? "rgba(99,102,241,0.2)" : "transparent", color: editBg.type === bgType ? "#818cf8" : "var(--dock-text-dim)", cursor: "pointer", textTransform: "capitalize" }}>
                        {bgType}
                      </button>
                    ))}
                  </div>

                  {/* Solid */}
                  {editBg.type === "solid" && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="color" value={editBg.color} onChange={(e) => setEditBg((p) => ({ ...p, color: e.target.value }))}
                        style={{ width: 34, height: 34, borderRadius: 6, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", cursor: "pointer", padding: 2, background: "transparent" }} />
                      <input type="text" value={editBg.color} onChange={(e) => setEditBg((p) => ({ ...p, color: e.target.value }))}
                        style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 6, padding: "6px 10px", color: "var(--dock-text)", fontSize: 12, outline: "none", fontFamily: "monospace", flex: 1 }} />
                    </div>
                  )}

                  {/* Gradient */}
                  {editBg.type === "gradient" && (
                    <>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 10, color: "var(--dock-text-dim)" }}>Start</span>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input type="color" value={editBg.gradientStart} onChange={(e) => setEditBg((p) => ({ ...p, gradientStart: e.target.value }))}
                              style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", cursor: "pointer", padding: 1, background: "transparent" }} />
                            <input type="text" value={editBg.gradientStart} onChange={(e) => setEditBg((p) => ({ ...p, gradientStart: e.target.value }))}
                              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 4, padding: "4px 6px", color: "var(--dock-text)", fontSize: 10, outline: "none", fontFamily: "monospace", flex: 1 }} />
                          </div>
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 10, color: "var(--dock-text-dim)" }}>End</span>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input type="color" value={editBg.gradientEnd} onChange={(e) => setEditBg((p) => ({ ...p, gradientEnd: e.target.value }))}
                              style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", cursor: "pointer", padding: 1, background: "transparent" }} />
                            <input type="text" value={editBg.gradientEnd} onChange={(e) => setEditBg((p) => ({ ...p, gradientEnd: e.target.value }))}
                              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 4, padding: "4px 6px", color: "var(--dock-text)", fontSize: 10, outline: "none", fontFamily: "monospace", flex: 1 }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 10, color: "var(--dock-text-dim)" }}>Angle: {editBg.gradientAngle}°</span>
                        <input type="range" min={0} max={360} value={editBg.gradientAngle}
                          onChange={(e) => setEditBg((p) => ({ ...p, gradientAngle: Number(e.target.value) }))}
                          style={{ width: "100%", accentColor: "#6366f1" }} />
                      </div>
                    </>
                  )}

                  {/* Image */}
                  {editBg.type === "image" && (
                    <>
                      {(editBg.type === "image" && editBg.imageUrl) ? (
                        <div style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
                          <img src={editBg.imageUrl} alt="" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                          <div style={{ position: "absolute", bottom: 4, right: 4, display: "flex", gap: 4 }}>
                            <button type="button" onClick={() => editBgFileRef.current?.click()}
                              style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 10, border: "none", cursor: "pointer" }}>Replace</button>
                            <button type="button" onClick={async () => {
                              if (editBg.assetId) await deleteCountdownAsset(editBg.assetId).catch(() => { });
                              setEditBg((p) => ({ ...p, type: "solid", imageUrl: "", assetId: "", builtinId: "", source: "upload" }));
                            }}
                              style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(220,38,38,0.8)", color: "#fff", fontSize: 10, border: "none", cursor: "pointer" }}>Remove</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", gap: 6 }}>
                            {editBgUploading ? (
                              <div style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px dashed var(--dock-border, rgba(255,255,255,0.15))", background: "rgba(0,0,0,0.2)", color: "var(--dock-text-dim)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                Uploading…
                              </div>
                            ) : (
                              <button type="button" onClick={() => { setEditBgUploadError(""); editBgFileRef.current?.click(); }}
                                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px dashed var(--dock-border, rgba(255,255,255,0.15))", background: "rgba(0,0,0,0.2)", color: "var(--dock-text-dim)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                <Upload size={14} /> Upload
                              </button>
                            )}
                            <button type="button" onClick={async () => {
                              setEditBgMediaModal(true);
                              setEditMediaLoading(true);
                              try {
                                const { getAllMedia } = await import("../../library/libraryDb");
                                const all = await getAllMedia();
                                setEditMediaItems(all.filter((m) => m.type === "image"));
                              } catch { setEditMediaItems([]); }
                              setEditMediaLoading(false);
                            }}
                              style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px dashed var(--dock-border, rgba(255,255,255,0.15))", background: "rgba(0,0,0,0.2)", color: "var(--dock-text-dim)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                              📁 Library
                            </button>
                          </div>
                          {editBgUploadError && (
                            <div style={{ fontSize: 10, color: "#ef4444", lineHeight: 1.3 }}>{editBgUploadError}</div>
                          )}
                        </>
                      )}
                      {/* Image fit */}
                      <div style={{ display: "flex", gap: 4 }}>
                        {(["cover", "contain", "stretch"] as ImageFit[]).map((fit) => (
                          <button key={fit} type="button" onClick={() => setEditBg((p) => ({ ...p, imageFit: fit }))}
                            style={{ flex: 1, padding: "4px 0", borderRadius: 6, fontSize: 10, fontWeight: 500, border: `1px solid ${editBg.imageFit === fit ? "#6366f1" : "var(--dock-border, rgba(255,255,255,0.1))"}`, background: editBg.imageFit === fit ? "rgba(99,102,241,0.2)" : "transparent", color: editBg.imageFit === fit ? "#818cf8" : "var(--dock-text-dim)", cursor: "pointer", textTransform: "capitalize" }}>
                            {fit}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 10, color: "var(--dock-text-dim)" }}>Brightness: {editBg.brightness}%</span>
                        <input type="range" min={10} max={200} value={editBg.brightness}
                          onChange={(e) => setEditBg((p) => ({ ...p, brightness: Number(e.target.value) }))}
                          style={{ width: "100%", accentColor: "#6366f1" }} />
                      </div>
                    </>
                  )}

                  {/* Video */}
                  {editBg.type === "video" && (
                    <>
                      {(editBg.type === "video" && editBg.videoUrl) ? (
                        <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#000" }}>
                          <video src={editBg.videoUrl} muted loop style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                          <div style={{ position: "absolute", bottom: 4, right: 4, display: "flex", gap: 4 }}>
                            <button type="button" onClick={() => editBgFileRef.current?.click()}
                              style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 10, border: "none", cursor: "pointer" }}>Replace</button>
                            <button type="button" onClick={async () => {
                              if (editBg.assetId) await deleteCountdownAsset(editBg.assetId).catch(() => { });
                              setEditBg((p) => ({ ...p, type: "solid", videoUrl: "", assetId: "", builtinId: "", source: "upload" }));
                            }}
                              style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(220,38,38,0.8)", color: "#fff", fontSize: 10, border: "none", cursor: "pointer" }}>Remove</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", gap: 6 }}>
                            {editBgUploading ? (
                              <div style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px dashed var(--dock-border, rgba(255,255,255,0.15))", background: "rgba(0,0,0,0.2)", color: "var(--dock-text-dim)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                Uploading…
                              </div>
                            ) : (
                              <button type="button" onClick={() => { setEditBgUploadError(""); editBgFileRef.current?.click(); }}
                                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px dashed var(--dock-border, rgba(255,255,255,0.15))", background: "rgba(0,0,0,0.2)", color: "var(--dock-text-dim)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                <Upload size={14} /> Upload
                              </button>
                            )}
                            <button type="button" onClick={async () => {
                              setEditBgMediaModal(true);
                              setEditMediaLoading(true);
                              try {
                                const { getAllMedia } = await import("../../library/libraryDb");
                                const all = await getAllMedia();
                                setEditMediaItems(all.filter((m) => m.type === "video"));
                              } catch { setEditMediaItems([]); }
                              setEditMediaLoading(false);
                            }}
                              style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px dashed var(--dock-border, rgba(255,255,255,0.15))", background: "rgba(0,0,0,0.2)", color: "var(--dock-text-dim)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                              📁 Library
                            </button>
                          </div>
                          {editBgUploadError && (
                            <div style={{ fontSize: 10, color: "#ef4444", lineHeight: 1.3 }}>{editBgUploadError}</div>
                          )}
                        </>
                      )}
                      <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--dock-text-dim)", cursor: "pointer" }}>
                          <input type="checkbox" checked={editBg.loop} onChange={(e) => setEditBg((p) => ({ ...p, loop: e.target.checked }))} style={{ accentColor: "#6366f1" }} /> Loop
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--dock-text-dim)", cursor: "pointer" }}>
                          <input type="checkbox" checked={editBg.muted} onChange={(e) => setEditBg((p) => ({ ...p, muted: e.target.checked }))} style={{ accentColor: "#6366f1" }} /> Muted
                        </label>
                      </div>
                    </>
                  )}




                  {/* Hidden file input */}
                  <input ref={editBgFileRef} type="file" accept={backgroundFileAccept()} style={{ display: "none" }}
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files?.length) return;
                      const file = files[0];
                      const result = validateMediaFile(file);
                      if (!result.valid) {
                        setEditBgUploadError(result.error || "Unsupported file type");
                        if (editBgFileRef.current) editBgFileRef.current.value = "";
                        return;
                      }
                      setEditBgUploadError("");
                      setEditBgUploading(true);
                      try {
                        if (editBg.assetId) await deleteCountdownAsset(editBg.assetId).catch(() => { });
                        const { assetId, overlayUrl } = await saveCountdownAsset(file);
                        const isImage = result.mediaType === "image";
                        setEditBg((p) => ({
                          ...p,
                          type: isImage ? "image" : "video",
                          source: "upload",
                          assetId,
                          builtinId: "",
                          imageUrl: isImage ? overlayUrl : p.imageUrl,
                          videoUrl: !isImage ? overlayUrl : p.videoUrl,
                        }));
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        console.warn("[DockCountdowns] Upload failed:", msg);
                        setEditBgUploadError(msg);
                      } finally {
                        setEditBgUploading(false);
                        if (editBgFileRef.current) editBgFileRef.current.value = "";
                      }
                    }} />

                  {/* Media library modal */}
                  {editBgMediaModal && (
                    <div style={{ border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 8, padding: 10, background: "rgba(0,0,0,0.3)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dock-text)" }}>Choose from Library</span>
                        <button type="button" onClick={() => { setEditBgMediaModal(false); setEditMediaSearch(""); }}
                          style={{ background: "none", border: "none", color: "var(--dock-text-dim)", cursor: "pointer", fontSize: 16 }}>×</button>
                      </div>
                      <input type="text" placeholder="Search..." value={editMediaSearch} onChange={(e) => setEditMediaSearch(e.target.value)}
                        style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 6, padding: "6px 10px", color: "var(--dock-text)", fontSize: 12, outline: "none", width: "100%", marginBottom: 8 }} />
                      <div style={{ maxHeight: 180, overflowY: "auto" }}>
                        {editMediaLoading ? (
                          <div style={{ padding: 16, textAlign: "center", color: "var(--dock-text-dim)", fontSize: 12 }}>Loading...</div>
                        ) : editMediaItems.length === 0 ? (
                          <div style={{ padding: 16, textAlign: "center", color: "var(--dock-text-dim)", fontSize: 12 }}>No media files found</div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                            {editMediaItems
                              .filter((m) => !editMediaSearch || m.name.toLowerCase().includes(editMediaSearch.toLowerCase()))
                              .map((item) => (
                                <button key={item.id} type="button"
                                  onClick={() => {
                                    const isImage = item.type === "image";
                                    setEditBg((p) => ({
                                      ...p,
                                      type: isImage ? "image" : "video",
                                      source: "media-library",
                                      assetId: "",
                                      builtinId: "",
                                      imageUrl: isImage ? (item.url || "") : p.imageUrl,
                                      videoUrl: !isImage ? (item.url || "") : p.videoUrl,
                                    }));
                                    setEditBgMediaModal(false);
                                    setEditMediaSearch("");
                                  }}
                                  style={{ borderRadius: 6, overflow: "hidden", border: "2px solid transparent", cursor: "pointer", background: "none", padding: 0, textAlign: "left" }}
                                  title={item.name}>
                                  <div style={{ width: "100%", height: 50, backgroundImage: `url(${item.thumbnailUrl || item.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                                  <div style={{ fontSize: 9, padding: "3px 4px", color: "var(--dock-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Message Section ────────────────────────────────── */}
            <div style={{ borderTop: "1px solid var(--dock-border, rgba(255,255,255,0.08))", paddingTop: 10 }}>
              <button type="button" onClick={() => setShowMsgSection(!showMsgSection)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", background: showMsgSection ? "rgba(99,102,241,0.1)" : "rgba(0,0,0,0.2)", color: "var(--dock-text)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>💬 {t("countdowns.message", "Message")}</span>
                <span style={{ fontSize: 10, color: "var(--dock-text-dim)" }}>{showMsgSection ? "▲" : "▼"}</span>
              </button>

              {showMsgSection && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--dock-text-dim)" }}>Message Text</span>
                    <input
                      type="text"
                      value={editMessage.text}
                      onChange={(e) => setEditMessage((p) => ({ ...p, text: e.target.value }))}
                      placeholder="e.g. Welcome to our service"
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 6, padding: "6px 10px", color: "var(--dock-text)", fontSize: 12, outline: "none" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--dock-text-dim)" }}>Color</span>
                    <input type="color" value={editMessage.color} onChange={(e) => setEditMessage((p) => ({ ...p, color: e.target.value }))}
                      style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", cursor: "pointer", padding: 1, background: "transparent" }} />
                    <input type="text" value={editMessage.color} onChange={(e) => setEditMessage((p) => ({ ...p, color: e.target.value }))}
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", borderRadius: 6, padding: "6px 10px", color: "var(--dock-text)", fontSize: 12, outline: "none", fontFamily: "monospace", flex: 1 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--dock-text-dim)" }}>Position</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {(["above", "below"] as const).map((pos) => (
                        <button key={pos} type="button" onClick={() => setEditMessage((p) => ({ ...p, position: pos }))}
                          style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", background: editMessage.position === pos ? "rgba(99,102,241,0.3)" : "rgba(0,0,0,0.2)", color: "var(--dock-text)", fontSize: 11, cursor: "pointer", textTransform: "capitalize" }}>
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Actions ────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" className="dock-btn dock-btn--small" onClick={() => setEditingCd(null)} style={{ fontSize: 11 }}>
                {t("common.cancel", "Cancel")}
              </button>
              <button type="button" className="dock-btn dock-btn--small dock-btn--success" onClick={async () => {
                const mins = parseFloat(editMinutes) || 0;
                const secs = Math.round(mins * 60);
                const updatedCd: CountdownConfig = {
                  ...editingCd,
                  title: editTitle.trim() || editingCd.title,
                  timer: { ...editingCd.timer, durationSeconds: secs },
                  background: { ...editBg },
                  message: editMessage.text.trim() ? { ...editMessage } : undefined,
                };
                setCountdowns((prev) => prev.map((c) => c.id === editingCd.id ? updatedCd : c));
                setEditingCd(null);

                if (liveCountdownId === updatedCd.id) {
                  try {
                    await ensureObsConnected();
                    if (dockObsClient.isConnected) {
                      const baseUrl = getOverlayBaseUrlSync();
                      const targetScene = resolveCountdownTargetScene(updatedCd.obs.sceneName);
                      const bgPayload = { config: updatedCd, baseUrl, timestamp: Date.now() };
                      const bgUrl = `${baseUrl}/countdown-bg-overlay.html#data=${encodeURIComponent(JSON.stringify(bgPayload))}`;
                      await ensureObsSource(BG_SOURCE, bgUrl, targetScene, { setTransform: true });
                      const sync: OverlaySyncState = { paused: playbackState === "paused", remaining: Math.floor(timer.remaining) };
                      const payload: CountdownOverlayPayload = { config: updatedCd, baseUrl, timestamp: Date.now(), sync };
                      const contentUrl = `${baseUrl}/countdown-overlay.html#data=${encodeURIComponent(JSON.stringify(payload))}`;
                      await ensureObsSource(COUNTDOWN_SOURCE, contentUrl, targetScene, { setTransform: true });
                    }
                  } catch (err) {
                    console.warn("[DockCountdowns] Failed to update OBS after edit:", err);
                  }
                }
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
