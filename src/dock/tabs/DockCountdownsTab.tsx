/**
 * DockCountdownsTab.tsx — Live countdown control panel
 *
 * Simple mental model for church operators:
 * - See countdowns at a glance
 * - One tap to Show / Pause / Hide
 * - Everything else (edit, duplicate, reset, delete) behind ⋯
 *
 * No text themes, no background controls, no templates here.
 * That's the editor's job.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { dockClient, type DockStateMessage } from "../../services/dockBridge";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import Icon from "../DockIcon";
import { nanoid } from "nanoid";
import type { CountdownConfig } from "../../countdowns/types";
import { createDefaultCountdown, getTemplateName } from "../../countdowns/countdownDefaults";
import { getCountdowns, saveCountdown, deleteCountdown, saveCountdownAsset } from "../../countdowns/countdownStore";
import { getOverlayBaseUrlSync } from "../../services/overlayUrl";
import { getTextTheme, loadTextThemeFont, applyTextTheme, type CountdownTextTheme } from "../../countdowns/textThemes";
import TextThemePicker from "../../countdowns/TextThemePicker";
import { validateMediaFile, backgroundFileAccept } from "../../countdowns/mediaValidation";
import { BUILTIN_CATEGORIES, getBuiltinsByCategory, type BuiltinBackground } from "../../countdowns/builtinBackgrounds";
import type { BackgroundType, ImageFit } from "../../countdowns/types";

// ── Timer hook ─────────────────────────────────────────────────────────────

function useCountdownTimer(cd: CountdownConfig | null) {
  const [remaining, setRemaining] = useState(cd?.timer.durationSeconds ?? 0);
  const [isRunning, setIsRunning] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const totalRef = useRef(cd?.timer.durationSeconds ?? 0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (cd) {
      setRemaining(cd.timer.durationSeconds);
      totalRef.current = cd.timer.durationSeconds;
      setIsRunning(false);
      startedAtRef.current = null;
      cancelAnimationFrame(frameRef.current);
    }
  }, [cd?.id]);

  const start = useCallback(() => {
    if (!cd) return;
    startedAtRef.current = Date.now();
    totalRef.current = remaining;
    setIsRunning(true);
  }, [cd, remaining]);

  const pause = useCallback(() => {
    setIsRunning(false);
    cancelAnimationFrame(frameRef.current);
  }, []);

  const reset = useCallback(() => {
    if (!cd) return;
    setIsRunning(false);
    startedAtRef.current = null;
    setRemaining(cd.timer.durationSeconds);
    totalRef.current = cd.timer.durationSeconds;
    cancelAnimationFrame(frameRef.current);
  }, [cd]);

  useEffect(() => {
    if (!isRunning) return;
    const tick = () => {
      const elapsed = (Date.now() - startedAtRef.current!) / 1000;
      const r = Math.max(0, totalRef.current - elapsed);
      setRemaining(r);
      if (r > 0) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [isRunning]);

  const totalSeconds = Math.floor(remaining);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const total = totalRef.current || 1;
  const progress = ((total - remaining) / total) * 100;

  let formatted: string;
  if (cd?.timer.showHours) {
    formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  } else {
    formatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return { remaining, isRunning, progress, formatted, start, pause, reset, isComplete: remaining <= 0 };
}

// ── Quick Countdown Modal ──────────────────────────────────────────────────

function QuickCountdownModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, minutes: number) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("Service Starts Soon");
  const [minutes, setMinutes] = useState(10);

  return (
    <div className="dock-modal-overlay" onClick={onClose}>
      <div className="dock-modal" onClick={(e) => e.stopPropagation()} style={{ width: 300 }}>
        <div className="dock-modal__header">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--dock-text)", margin: 0 }}>
            {t("countdowns.quickCountdown")}
          </h3>
          <button type="button" className="dock-toolbar__btn" onClick={onClose} style={{ width: 24, height: 24, padding: 0, border: "none", color: "var(--dock-text-dim)" }}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="dock-modal__body" style={{ padding: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--dock-text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("countdowns.durationMinutes")}
          </label>
          <input
            type="number"
            min={1}
            max={180}
            value={minutes}
            onChange={(e) => { const n = Number(e.target.value); if (n > 0) setMinutes(n); }}
            className="dock-input"
            style={{ width: "100%", marginBottom: 12 }}
          />
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--dock-text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("countdowns.titleLabel")}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="dock-input"
            style={{ width: "100%", marginBottom: 16 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="dock-btn dock-btn--secondary" onClick={onClose} style={{ flex: 1 }}>
              {t("common.cancel")}
            </button>
            <button type="button" className="dock-btn dock-btn--primary" onClick={() => onCreate(title, minutes)} style={{ flex: 1 }}>
              <Icon name="bolt" size={13} /> {t("countdowns.createAndShow")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Countdown Modal ──────────────────────────────────────────────────

function EditCountdownModal({
  cd,
  onClose,
  onSave,
}: {
  cd: CountdownConfig;
  onClose: () => void;
  onSave: (updated: CountdownConfig) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(cd.title);
  const totalSec = cd.timer.durationSeconds;
  const [minutes, setMinutes] = useState(Math.floor(totalSec / 60));
  const [seconds, setSeconds] = useState(totalSec % 60);
  const [showHours, setShowHours] = useState(cd.timer.showHours);
  const [bg, setBg] = useState({ ...cd.background });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [builtinOpen, setBuiltinOpen] = useState(false);
  const [builtinCat, setBuiltinCat] = useState<string | null>(null);

  const updateBg = (patch: Partial<typeof bg>) => setBg((prev) => ({ ...prev, ...patch }));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = validateMediaFile(file);
    if (!result.valid) { setUploadError(result.error || "Invalid file"); return; }
    setUploadError(null);
    try {
      const { assetId, overlayUrl } = await saveCountdownAsset(file);
      const isVideo = result.mediaType === "video";
      updateBg({
        source: "upload",
        type: isVideo ? "video" : "image",
        assetId,
        imageUrl: isVideo ? bg.imageUrl : overlayUrl,
        videoUrl: isVideo ? overlayUrl : bg.videoUrl,
      });
    } catch (err) {
      setUploadError("Upload failed. Please try again.");
    }
    e.target.value = "";
  };

  const handleRemoveMedia = () => {
    updateBg({ source: "upload", type: "solid", assetId: "", imageUrl: "", videoUrl: "" });
  };

  const handleBuiltinSelect = (b: BuiltinBackground) => {
    updateBg({ source: "builtin", type: b.type, builtinId: b.id, imageUrl: "", videoUrl: "", assetId: "", color: b.type === "solid" ? b.source : bg.color, gradientStart: b.type === "gradient" ? extractGradientStart(b.source) : bg.gradientStart, gradientEnd: b.type === "gradient" ? extractGradientEnd(b.source) : bg.gradientEnd, gradientAngle: b.type === "gradient" ? extractGradientAngle(b.source) : bg.gradientAngle });
    setBuiltinOpen(false);
    setBuiltinCat(null);
  };

  const handleSave = () => {
    const durationSeconds = minutes * 60 + seconds;
    if (durationSeconds <= 0) return;
    onSave({
      ...cd,
      title,
      timer: { ...cd.timer, durationSeconds, showHours },
      background: bg,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  const bgTypeButtons: { type: BackgroundType; icon: string; label: string }[] = [
    { type: "solid", icon: "palette", label: t("countdowns.solid", "Solid") },
    { type: "gradient", icon: "gradient", label: t("countdowns.gradient", "Gradient") },
    { type: "image", icon: "image", label: t("countdowns.image", "Image") },
    { type: "video", icon: "videocam", label: t("countdowns.video", "Video") },
  ];

  const hasMedia = (bg.type === "image" && bg.imageUrl) || (bg.type === "video" && bg.videoUrl);

  return (
    <div className="dock-modal-overlay" onClick={onClose}>
      <div className="dock-modal" onClick={(e) => e.stopPropagation()} style={{ width: 320, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div className="dock-modal__header" style={{ flexShrink: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--dock-text)", margin: 0 }}>
            {t("common.edit")} {t("countdowns.title", "Countdown")}
          </h3>
          <button type="button" className="dock-toolbar__btn" onClick={onClose} style={{ width: 24, height: 24, padding: 0, border: "none", color: "var(--dock-text-dim)" }}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="dock-modal__body" style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          {/* ── Title ── */}
          <label style={labelStyle}>{t("countdowns.titleLabel")}</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="dock-input" style={{ width: "100%", marginBottom: 12 }} />

          {/* ── Duration ── */}
          <label style={labelStyle}>{t("countdowns.duration", "Duration")}</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={subLabelStyle}>{t("countdowns.minutes", "Min")}</div>
              <input type="number" min={0} max={599} value={minutes} onChange={(e) => { const n = Number(e.target.value); if (n >= 0) setMinutes(n); }} className="dock-input" style={{ width: "100%" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={subLabelStyle}>{t("countdowns.seconds", "Sec")}</div>
              <input type="number" min={0} max={59} value={seconds} onChange={(e) => { const n = Number(e.target.value); if (n >= 0 && n <= 59) setSeconds(n); }} className="dock-input" style={{ width: "100%" }} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--dock-text-dim)", marginBottom: 16, cursor: "pointer" }}>
            <input type="checkbox" checked={showHours} onChange={(e) => setShowHours(e.target.checked)} style={{ accentColor: "var(--dock-accent, #3b82f6)" }} />
            {t("countdowns.showHours", "Show hours")}
          </label>

          {/* ── Background ── */}
          <label style={labelStyle}>{t("countdowns.background", "Background")}</label>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {bgTypeButtons.map((b) => (
              <button key={b.type} type="button" onClick={() => updateBg({ type: b.type })} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 0", borderRadius: 6, border: `1px solid ${bg.type === b.type ? "var(--dock-accent, #3b82f6)" : "var(--dock-border, rgba(255,255,255,0.08))"}`, background: bg.type === b.type ? "rgba(59,130,246,0.1)" : "transparent", color: bg.type === b.type ? "var(--dock-accent, #3b82f6)" : "var(--dock-text-dim)", cursor: "pointer", fontSize: 10, fontWeight: 500 }}>
                <Icon name={b.icon} size={14} /> {b.label}
              </button>
            ))}
          </div>

          {/* Solid */}
          {bg.type === "solid" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input type="color" value={bg.color} onChange={(e) => updateBg({ color: e.target.value })} style={{ width: 32, height: 28, border: "none", borderRadius: 4, cursor: "pointer", padding: 0 }} />
              <input type="text" value={bg.color} onChange={(e) => updateBg({ color: e.target.value })} className="dock-input" style={{ flex: 1, fontSize: 11 }} />
            </div>
          )}

          {/* Gradient */}
          {bg.type === "gradient" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={subLabelStyle}>{t("countdowns.startColor", "Start")}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="color" value={bg.gradientStart} onChange={(e) => updateBg({ gradientStart: e.target.value })} style={{ width: 28, height: 26, border: "none", borderRadius: 4, cursor: "pointer", padding: 0 }} />
                    <input type="text" value={bg.gradientStart} onChange={(e) => updateBg({ gradientStart: e.target.value })} className="dock-input" style={{ flex: 1, fontSize: 10 }} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={subLabelStyle}>{t("countdowns.endColor", "End")}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="color" value={bg.gradientEnd} onChange={(e) => updateBg({ gradientEnd: e.target.value })} style={{ width: 28, height: 26, border: "none", borderRadius: 4, cursor: "pointer", padding: 0 }} />
                    <input type="text" value={bg.gradientEnd} onChange={(e) => updateBg({ gradientEnd: e.target.value })} className="dock-input" style={{ flex: 1, fontSize: 10 }} />
                  </div>
                </div>
              </div>
              <div style={{ background: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientStart}, ${bg.gradientEnd})`, height: 28, borderRadius: 6, marginBottom: 6 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--dock-text-dim)" }}>
                {t("countdowns.angle", "Angle")}: {bg.gradientAngle}°
                <input type="range" min={0} max={360} value={bg.gradientAngle} onChange={(e) => updateBg({ gradientAngle: Number(e.target.value) })} style={{ flex: 1 }} />
              </label>
            </div>
          )}

          {/* Image */}
          {bg.type === "image" && (
            <div style={{ marginBottom: 12 }}>
              {hasMedia ? (
                <div style={{ position: "relative", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                  <img src={bg.imageUrl} alt="" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="dock-btn dock-btn--small" style={{ fontSize: 9, padding: "2px 6px" }}><Icon name="swap_horiz" size={10} /> {t("countdowns.replace", "Replace")}</button>
                    <button type="button" onClick={handleRemoveMedia} className="dock-btn dock-btn--small dock-btn--danger" style={{ fontSize: 9, padding: "2px 6px" }}><Icon name="close" size={10} /></button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: "100%", padding: "16px 0", borderRadius: 6, border: "2px dashed var(--dock-border, rgba(255,255,255,0.12))", background: "transparent", color: "var(--dock-text-dim)", cursor: "pointer", fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 8 }}>
                  <Icon name="cloud_upload" size={18} />
                  {t("countdowns.uploadImage", "Upload Image")}
                </button>
              )}
              {/* Image fit */}
              {bg.type === "image" && (
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  {(["cover", "contain", "stretch"] as ImageFit[]).map((fit) => (
                    <button key={fit} type="button" onClick={() => updateBg({ imageFit: fit })} style={{ flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 10, fontWeight: 500, border: `1px solid ${bg.imageFit === fit ? "var(--dock-accent, #3b82f6)" : "var(--dock-border, rgba(255,255,255,0.08))"}`, background: bg.imageFit === fit ? "rgba(59,130,246,0.1)" : "transparent", color: bg.imageFit === fit ? "var(--dock-accent, #3b82f6)" : "var(--dock-text-dim)", cursor: "pointer", textTransform: "capitalize" }}>
                      {fit}
                    </button>
                  ))}
                </div>
              )}
              {uploadError && <div style={{ fontSize: 10, color: "#ef4444", marginBottom: 4 }}>{uploadError}</div>}
              <input ref={fileInputRef} type="file" accept={backgroundFileAccept()} onChange={handleUpload} style={{ display: "none" }} />
            </div>
          )}

          {/* Video */}
          {bg.type === "video" && (
            <div style={{ marginBottom: 12 }}>
              {hasMedia ? (
                <div style={{ position: "relative", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                  <video src={bg.videoUrl} muted loop style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="dock-btn dock-btn--small" style={{ fontSize: 9, padding: "2px 6px" }}><Icon name="swap_horiz" size={10} /> {t("countdowns.replace", "Replace")}</button>
                    <button type="button" onClick={handleRemoveMedia} className="dock-btn dock-btn--small dock-btn--danger" style={{ fontSize: 9, padding: "2px 6px" }}><Icon name="close" size={10} /></button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: "100%", padding: "16px 0", borderRadius: 6, border: "2px dashed var(--dock-border, rgba(255,255,255,0.12))", background: "transparent", color: "var(--dock-text-dim)", cursor: "pointer", fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 8 }}>
                  <Icon name="cloud_upload" size={18} />
                  {t("countdowns.uploadVideo", "Upload Video")}
                </button>
              )}
              {uploadError && <div style={{ fontSize: 10, color: "#ef4444", marginBottom: 4 }}>{uploadError}</div>}
              <input ref={fileInputRef} type="file" accept={backgroundFileAccept()} onChange={handleUpload} style={{ display: "none" }} />
            </div>
          )}

          {/* Built-in backgrounds */}
          <button type="button" onClick={() => setBuiltinOpen(!builtinOpen)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", fontSize: 11, fontWeight: 500, color: "var(--dock-text-dim)", background: "transparent", border: "none", cursor: "pointer", marginBottom: builtinOpen ? 6 : 0 }}>
            <span>{t("countdowns.builtin", "Built-in Backgrounds")}</span>
            <Icon name={builtinOpen ? "expand_less" : "expand_more"} size={14} />
          </button>
          {builtinOpen && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                {BUILTIN_CATEGORIES.map((cat) => (
                  <button key={cat.id} type="button" onClick={() => setBuiltinCat(builtinCat === cat.id ? null : cat.id)} style={{ padding: "3px 8px", borderRadius: 10, fontSize: 10, border: `1px solid ${builtinCat === cat.id ? "var(--dock-accent, #3b82f6)" : "var(--dock-border, rgba(255,255,255,0.08))"}`, background: builtinCat === cat.id ? "rgba(59,130,246,0.1)" : "transparent", color: builtinCat === cat.id ? "var(--dock-accent, #3b82f6)" : "var(--dock-text-dim)", cursor: "pointer" }}>
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
              {builtinCat && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                  {getBuiltinsByCategory(builtinCat).map((b) => (
                    <button key={b.id} type="button" onClick={() => handleBuiltinSelect(b)} style={{ height: 40, borderRadius: 4, border: bg.builtinId === b.id ? "2px solid var(--dock-accent, #3b82f6)" : "1px solid var(--dock-border, rgba(255,255,255,0.08))", background: b.thumbnail, cursor: "pointer" }} title={b.label} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Save */}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="dock-btn dock-btn--secondary" onClick={onClose} style={{ flex: 1 }}>
              {t("common.cancel")}
            </button>
            <button type="button" className="dock-btn dock-btn--primary" onClick={handleSave} style={{ flex: 1 }}>
              <Icon name="save" size={13} /> {t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--dock-text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" };
const subLabelStyle: React.CSSProperties = { fontSize: 10, color: "var(--dock-text-dim)", marginBottom: 2 };

// ── Gradient helpers ──────────────────────────────────────────────────────

function extractGradientStart(gradient: string): string {
  const match = gradient.match(/#[0-9a-fA-F]{3,8}/);
  return match ? match[0] : "#000000";
}

function extractGradientEnd(gradient: string): string {
  const colors = gradient.match(/#[0-9a-fA-F]{3,8}/g);
  return colors && colors.length > 1 ? colors[colors.length - 1] : "#ffffff";
}

function extractGradientAngle(gradient: string): number {
  const match = gradient.match(/(\d+)deg/);
  return match ? parseInt(match[1], 10) : 135;
}

// ── Countdown Card ─────────────────────────────────────────────────────────

function CountdownCard({
  cd,
  isLive,
  formattedTime,
  isRunning,
  onSelect,
  onStart,
  onPause,
  onShowObs,
  onHideObs,
  onEdit,
  onDuplicate,
  onReset,
  onDelete,
  onThemeChange,
}: {
  cd: CountdownConfig;
  isLive: boolean;
  formattedTime: string;
  isRunning: boolean;
  onSelect: () => void;
  onStart: () => void;
  onPause: () => void;
  onShowObs: () => void;
  onHideObs: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onReset: () => void;
  onDelete: () => void;
  onThemeChange: (theme: CountdownTextTheme) => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

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
      {/* Row 1: Title + Live badge or template name */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dock-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {cd.title || t("common.untitled")}
        </span>
        {isLive ? (
          <span style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(34,197,94,0.9)", borderRadius: 4, padding: "1px 6px", flexShrink: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{t("common.live")}</span>
          </span>
        ) : (
          <span style={{ fontSize: 9, color: "var(--dock-text-dim)", flexShrink: 0 }}>
            {getTemplateName(cd.templateId)}
          </span>
        )}
      </div>

      {/* Row 2: Timer */}
      <div style={{ fontSize: 28, fontFamily: timerFont, fontWeight: timerWeight, color: timerColor, textShadow: timerShadow, letterSpacing: 1, lineHeight: 1, padding: "8px 0" }}>
        {formattedTime}
      </div>

      {/* Row 3: Primary action */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
        {!isRunning && !isLive ? (
          <button
            type="button"
            className="dock-btn dock-btn--small dock-btn--success"
            onClick={(e) => { e.stopPropagation(); onShowObs(); }}
            style={{ flex: 1, fontSize: 10, padding: "5px 0" }}
          >
            <Icon name="visibility" size={11} /> {t("countdowns.showInOBS")}
          </button>
        ) : isRunning && isLive ? (
          <>
            <button
              type="button"
              className="dock-btn dock-btn--small dock-btn--warning"
              onClick={(e) => { e.stopPropagation(); onPause(); }}
              style={{ flex: 1, fontSize: 10, padding: "5px 0" }}
            >
              <Icon name="pause" size={11} /> {t("common.pause")}
            </button>
            <button
              type="button"
              className="dock-btn dock-btn--small dock-btn--danger"
              onClick={(e) => { e.stopPropagation(); onHideObs(); }}
              style={{ fontSize: 10, padding: "5px 8px" }}
            >
              <Icon name="visibility_off" size={11} /> {t("countdowns.hide")}
            </button>
          </>
        ) : isLive && !isRunning ? (
          <>
            <button
              type="button"
              className="dock-btn dock-btn--small dock-btn--primary"
              onClick={(e) => { e.stopPropagation(); onStart(); }}
              style={{ flex: 1, fontSize: 10, padding: "5px 0" }}
            >
              <Icon name="play_arrow" size={11} /> {t("common.start")}
            </button>
            <button
              type="button"
              className="dock-btn dock-btn--small dock-btn--danger"
              onClick={(e) => { e.stopPropagation(); onHideObs(); }}
              style={{ fontSize: 10, padding: "5px 8px" }}
            >
              <Icon name="visibility_off" size={11} /> {t("countdowns.hide")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="dock-btn dock-btn--small dock-btn--primary"
            onClick={(e) => { e.stopPropagation(); onStart(); }}
            style={{ flex: 1, fontSize: 10, padding: "5px 0" }}
          >
            <Icon name="play_arrow" size={11} /> {t("common.start")}
          </button>
        )}

        {/* Text Style button */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="dock-btn dock-btn--small"
            onClick={(e) => { e.stopPropagation(); setThemeOpen(!themeOpen); setMenuOpen(false); }}
            title={t("countdowns.textStyle", "Text Style")}
            style={{ fontSize: 11, fontWeight: 700, padding: "4px 7px", fontFamily: theme ? theme.fontFamily : "inherit" }}
          >
            Aa
          </button>
          {themeOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setThemeOpen(false)} />
              <div style={{ position: "absolute", right: 0, bottom: "100%", marginBottom: 4, width: 280, maxHeight: 300, overflowY: "auto", background: "var(--dock-surface, #1e1e2e)", borderRadius: 8, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", padding: 8, zIndex: 20 }}>
                <TextThemePicker
                  selectedThemeId={cd.textThemeId}
                  onSelectTheme={(theme) => { setThemeOpen(false); onThemeChange(theme); }}
                />
              </div>
            </>
          )}
        </div>

        {/* ⋯ More menu */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="dock-btn dock-btn--small"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            style={{ fontSize: 12, padding: "4px 6px", lineHeight: 1 }}
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: "absolute", right: 0, bottom: "100%", marginBottom: 4, width: 140, background: "var(--dock-surface, #1e1e2e)", borderRadius: 8, border: "1px solid var(--dock-border, rgba(255,255,255,0.1))", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", padding: 4, zIndex: 20 }}>
                <MenuItem icon="edit" label={t("common.edit")} onClick={() => { setMenuOpen(false); onEdit(); }} />
                <MenuItem icon="content_copy" label={t("common.duplicate", "Duplicate")} onClick={() => { setMenuOpen(false); onDuplicate(); }} />
                <MenuItem icon="replay" label={t("common.reset")} onClick={() => { setMenuOpen(false); onReset(); }} />
                <div style={{ height: 1, background: "var(--dock-border, rgba(255,255,255,0.08))", margin: "2px 0" }} />
                <MenuItem icon="delete" label={t("common.delete")} color="#ef4444" onClick={() => { setMenuOpen(false); onDelete(); }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, color, onClick }: { icon: string; label: string; color?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", fontSize: 11, background: "transparent", border: "none", color: color ?? "var(--dock-text)", cursor: "pointer", borderRadius: 4 }}
      onClick={onClick}
    >
      <Icon name={icon} size={12} /> {label}
    </button>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function DockCountdownsTab() {
  const { t } = useTranslation();
  const [countdowns, setCountdowns] = useState<CountdownConfig[]>([]);
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [editingCd, setEditingCd] = useState<CountdownConfig | null>(null);
  const [liveCountdownId, setLiveCountdownId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Per-card timer state: only the "active" card runs a live timer
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeCd = countdowns.find((c) => c.id === activeId) ?? null;
  const timer = useCountdownTimer(activeCd);

  // Load from IndexedDB
  useEffect(() => {
    getCountdowns().then((cds) => {
      setCountdowns(cds);
      setLoaded(true);
    });
  }, []);

  // Listen for syncs from main app
  useEffect(() => {
    const unsub = dockClient.onState((msg: DockStateMessage) => {
      if (msg.type === "state:countdowns") {
        const payload = msg.payload as { countdowns: CountdownConfig[] };
        if (Array.isArray(payload.countdowns)) {
          setCountdowns(payload.countdowns);
          setLoaded(true);
        }
      }
    });
    return unsub;
  }, []);

  // ── OBS ─────────────────────────────────────────────────────────────────

  const COUNTDOWN_SOURCE = "MCE Countdown";

  const showInObs = useCallback(async (cd: CountdownConfig) => {
    await ensureObsConnected();
    if (!dockObsClient.isConnected) return;

    try {
      const baseUrl = getOverlayBaseUrlSync();
      const payload = { config: cd, baseUrl, timestamp: Date.now() };
      const url = `${baseUrl}/countdown-overlay.html#data=${encodeURIComponent(JSON.stringify(payload))}`;

      const presentationScene = "MCE Presentation";

      const inputs = await dockObsClient.call("GetInputList", { inputKind: "browser_source" }) as { inputs: Array<{ inputName: string }> };
      const existing = inputs.inputs.find((i) => i.inputName === COUNTDOWN_SOURCE);

      if (existing) {
        await dockObsClient.call("SetInputSettings", {
          inputName: COUNTDOWN_SOURCE,
          inputSettings: { url, width: 1920, height: 1080, shutdown: false },
        });
      } else {
        await dockObsClient.call("CreateInput", {
          sceneName: presentationScene,
          inputName: COUNTDOWN_SOURCE,
          inputKind: "browser_source",
          inputSettings: { url, width: 1920, height: 1080, shutdown: false },
        });
      }

      const sceneItems = await dockObsClient.call("GetSceneItemList", { sceneName: presentationScene }) as { sceneItems: Array<{ sceneItemId: number; sourceName: string }> };
      const item = sceneItems.sceneItems.find((i) => i.sourceName === COUNTDOWN_SOURCE);

      if (item) {
        await dockObsClient.call("SetSceneItemEnabled", {
          sceneName: presentationScene,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: true,
        });

        const allItems = await dockObsClient.call("GetSceneItemList", { sceneName: presentationScene }) as { sceneItems: Array<{ sceneItemId: number }> };
        const topIndex = Math.max(0, allItems.sceneItems.length - 1);
        await dockObsClient.call("SetSceneItemIndex", {
          sceneName: presentationScene,
          sceneItemId: item.sceneItemId,
          sceneItemIndex: topIndex,
        });

        const vs = await dockObsClient.call("GetVideoSettings", {}) as any;
        await dockObsClient.call("SetSceneItemTransform", {
          sceneName: presentationScene,
          sceneItemId: item.sceneItemId,
          sceneItemTransform: {
            positionX: 0, positionY: 0,
            boundsType: "OBS_BOUNDS_STRETCH",
            boundsWidth: vs.baseWidth, boundsHeight: vs.baseHeight,
            boundsAlignment: 0,
          },
        });
      }

      setLiveCountdownId(cd.id);
    } catch (err) {
      console.warn("[DockCountdowns] Failed to show in OBS:", err);
    }
  }, []);

  const hideFromObs = useCallback(async () => {
    if (!dockObsClient.isConnected) return;
    try {
      const presentationScene = "MCE Presentation";
      const sceneItems = await dockObsClient.call("GetSceneItemList", { sceneName: presentationScene }) as { sceneItems: Array<{ sceneItemId: number; sourceName: string }> };
      const item = sceneItems.sceneItems.find((i) => i.sourceName === COUNTDOWN_SOURCE);
      if (item) {
        await dockObsClient.call("SetSceneItemEnabled", {
          sceneName: presentationScene,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: false,
        });
      }
      setLiveCountdownId(null);
    } catch (err) {
      console.warn("[DockCountdowns] Failed to hide from OBS:", err);
    }
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleShowInObs = useCallback(async (cd: CountdownConfig) => {
    await showInObs(cd);
    // Auto-start timer after showing in OBS
    setActiveId(cd.id);
    setTimeout(() => timer.start(), 50);
  }, [showInObs, timer]);

  const handleCreateQuick = useCallback(async (title: string, minutes: number) => {
    const id = nanoid();
    const cd = createDefaultCountdown("minimal", id);
    cd.title = title;
    cd.timer.durationSeconds = minutes * 60;
    await saveCountdown(cd);
    setCountdowns((prev) => [cd, ...prev]);
    setShowQuickModal(false);
    await showInObs(cd);
    // Auto-start the timer
    setActiveId(id);
    setTimeout(() => {
      setActiveId(null);
      setActiveId(id);
    }, 0);
  }, [showInObs]);

  const handleDuplicate = useCallback(async (cd: CountdownConfig) => {
    const id = nanoid();
    const dup = { ...cd, id, title: `${cd.title} (Copy)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await saveCountdown(dup);
    setCountdowns((prev) => [dup, ...prev]);
  }, []);

  const handleEditSave = useCallback(async (updated: CountdownConfig) => {
    await saveCountdown(updated);
    setCountdowns((prev) => prev.map((c) => c.id === updated.id ? updated : c));
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteCountdown(id);
    setCountdowns((prev) => {
      const next = prev.filter((cd) => cd.id !== id);
      if (activeId === id) setActiveId(null);
      if (liveCountdownId === id) setLiveCountdownId(null);
      return next;
    });
  }, [activeId, liveCountdownId]);

  const handleSelectTheme = useCallback(async (cd: CountdownConfig, theme: CountdownTextTheme) => {
    const updated = { ...cd, textThemeId: theme.id, text: applyTextTheme(theme, cd.text) };
    updated.updatedAt = new Date().toISOString();
    await saveCountdown(updated);
    setCountdowns((prev) => prev.map((c) => c.id === updated.id ? updated : c));
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="dock-tab-empty">
        <Icon name="hourglass_empty" size={24} className="dock-tab-empty__icon" />
        <p className="dock-tab-empty__text">{t("countdowns.loading")}</p>
      </div>
    );
  }

  return (
    <div className="dock-tab-content" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--dock-border, rgba(255,255,255,0.08))", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="timer" size={14} style={{ color: "var(--dock-accent, #3b82f6)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dock-text)" }}>{t("countdowns.myCountdowns")}</span>
          <span style={{ fontSize: 10, color: "var(--dock-text-dim)" }}>({countdowns.length})</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            className="dock-btn dock-btn--small dock-btn--secondary"
            onClick={() => setShowQuickModal(true)}
            style={{ fontSize: 10, padding: "3px 8px" }}
          >
            <Icon name="bolt" size={11} /> {t("countdowns.quickButton")}
          </button>
          <button
            type="button"
            className="dock-btn dock-btn--small dock-btn--primary"
            onClick={() => {
              const id = nanoid();
              const cd = createDefaultCountdown("circular", id);
              saveCountdown(cd).then(() => {
                setCountdowns((prev) => [cd, ...prev]);
              });
            }}
            style={{ fontSize: 10, padding: "3px 8px" }}
          >
            <Icon name="add" size={11} /> {t("common.new")}
          </button>
        </div>
      </div>

      {/* Countdown list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {countdowns.length === 0 ? (
          <div className="dock-tab-empty">
            <Icon name="timer" size={32} className="dock-tab-empty__icon" />
            <p className="dock-tab-empty__text">{t("countdowns.noneYet")}</p>
            <p style={{ fontSize: 11, color: "var(--dock-text-dim)", marginTop: 4 }}>
              {t("countdowns.getStarted")}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {countdowns.map((cd) => {
              const isThisLive = liveCountdownId === cd.id;
              const isThisActive = activeId === cd.id;
              const isThisRunning = isThisActive && timer.isRunning;

              // Format time: use live timer if active, otherwise static
              const timeDisplay = isThisActive ? timer.formatted : formatTimeStatic(cd);

              return (
                <CountdownCard
                  key={cd.id}
                  cd={cd}
                  isLive={isThisLive}
                  formattedTime={timeDisplay}
                  isRunning={isThisRunning}
                  onSelect={() => setActiveId(cd.id)}
                  onStart={() => { setActiveId(cd.id); setTimeout(() => timer.start(), 0); }}
                  onPause={() => timer.pause()}
                  onShowObs={() => handleShowInObs(cd)}
                  onHideObs={hideFromObs}
                  onEdit={() => setEditingCd(cd)}
                  onDuplicate={() => handleDuplicate(cd)}
                  onReset={() => { if (isThisActive) timer.reset(); }}
                  onDelete={() => handleDelete(cd.id)}
                  onThemeChange={(theme) => handleSelectTheme(cd, theme)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Quick countdown modal */}
      {showQuickModal && (
        <QuickCountdownModal
          onClose={() => setShowQuickModal(false)}
          onCreate={handleCreateQuick}
        />
      )}

      {/* Edit countdown modal */}
      {editingCd && (
        <EditCountdownModal
          cd={editingCd}
          onClose={() => setEditingCd(null)}
          onSave={handleEditSave}
        />
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
