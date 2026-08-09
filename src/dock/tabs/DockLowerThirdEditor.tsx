/**
 * DockLowerThirdEditor.tsx — Full-featured lower-third editor for the Dock
 *
 * Dynamically generates all controls from the selected theme's JSON definition.
 * Sections: Preview, Content (variable controls), Appearance, Position,
 * Animation, Animation Presets, Theme Inspector.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContentSlot, SlotState } from "../../lowerthirds/contentSlots";
import {
  deleteSlot,
  loadSlots,
  renameSlot, resolveSlotState,
  saveSlot,
} from "../../lowerthirds/contentSlots";
import { buildOverlayUrl } from "../../lowerthirds/lowerThirdObsService";
import { isLogoVariable, resolveOverlayAssetUrl } from "../../lowerthirds/runtimeBranding";
import { isSpeakerTheme } from "../../lowerthirds/speakerThemeUtils";
import type {
  LTAnimationIn,
  LTCustomStyle,
  LTExitStyle,
  LTFontSize,
  LTPosition,
  LTSize,
  LowerThirdTheme,
} from "../../lowerthirds/types";
import {
  LT_DEFAULT_CUSTOM_STYLE,
} from "../../lowerthirds/types";
import type { SpeakerProfileSetting } from "../../multiview/mvStore";
import { MV_SETTINGS_UPDATED_EVENT } from "../../multiview/mvStore";
import { buildSpeakerRoleMap, ensureMinistryData, getMinistryData, refreshMinistry } from "../../services/ministryStore";
import Icon from "../DockIcon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const SPEAKER_FIRST_TIME_KEY = "ocs-dock-lt-speaker-hint-seen";
const LT_APPEARANCE_PANEL_ID = "dock-lt-appearance-panel";

interface DockLTEditorProps {
  theme: LowerThirdTheme;
  themes: LowerThirdTheme[];
  onSelectTheme: (themeId: string) => void;
  onSend: (url: string) => void;
  onBlank: (url: string) => void;
  onAnimateOut?: (url: string) => void;
  sending: boolean;
  size?: LTSize;
}

type LTAppearanceColorKey = "bgColor" | "textColor" | "accentColor";

const LT_APPEARANCE_COLOR_CONTROLS: Array<{ key: LTAppearanceColorKey; label: string; fallback: string }> = [
  { key: "bgColor", label: "Background", fallback: "#111827" },
  { key: "textColor", label: "Text", fallback: "#ffffff" },
  { key: "accentColor", label: "Accent", fallback: "#1d4ed8" },
];

function sanitizeLtColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 80);
  if (!trimmed || /[;{}<>]/.test(trimmed)) return undefined;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return trimmed;
  if (/^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(trimmed)) return trimmed;
  if (/^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(trimmed)) return trimmed;
  return undefined;
}

function ltColorInputValue(value: unknown, fallback: string): string {
  const color = sanitizeLtColor(value);
  const hex = color?.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return fallback;
  if (hex.length === 3) return `#${hex.split("").map((char) => char + char).join("")}`.toLowerCase();
  return `#${hex}`.toLowerCase();
}

function getLtAppearanceColor(styles: LTCustomStyle, key: LTAppearanceColorKey): string {
  if (key === "bgColor") return styles.bgColor || styles.bgColor1 || styles.bgColor2 || "";
  if (key === "textColor") return styles.textColor || styles.nameColor || styles.infoColor || "";
  return styles.accentColor || styles.borderColor1 || styles.borderColor2 || "";
}

function withLtAppearanceColor(styles: LTCustomStyle, key: LTAppearanceColorKey, value: string): LTCustomStyle {
  const color = sanitizeLtColor(value) ?? "";
  if (key === "bgColor") {
    return {
      ...styles,
      bgColor: color,
      bgColor1: color,
      bgColor2: color,
    };
  }
  if (key === "textColor") {
    return {
      ...styles,
      textColor: color,
      nameColor: color,
      infoColor: color,
    };
  }
  return {
    ...styles,
    accentColor: color,
    borderColor1: color,
    borderColor2: color,
  };
}

function withoutLtAppearanceColors(styles: LTCustomStyle): LTCustomStyle {
  return {
    ...styles,
    bgColor: "",
    bgColor1: "",
    bgColor2: "",
    textColor: "",
    nameColor: "",
    infoColor: "",
    accentColor: "",
    borderColor1: "",
    borderColor2: "",
  };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DockLowerThirdEditor({
  theme,
  themes: _themes,
  onSelectTheme: _onSelectTheme,
  onSend,
  onBlank: _onBlank,
  onAnimateOut,
  sending,
  size = "xl",
}: DockLTEditorProps) {
  const { t } = useTranslation();

  function loadSlot1(): SlotState | null {
    try {
      const saved = loadSlots(theme.id, "default")[0];
      if (saved) return resolveSlotState(saved);
    } catch { /* ignore */ }
    return null;
  }

  // ── Variable values ──
  const [variableValues, setVariableValues] = useState<Record<string, string>>(() => {
    const s1 = loadSlot1();
    if (s1) return { ...s1.variableValues };
    const init: Record<string, string> = {};
    for (const v of theme.variables) {
      init[v.key] = v.defaultValue ?? "";
    }
    return init;
  });

  // ── Custom style overrides ──
  const [customStyles, setCustomStyles] = useState<LTCustomStyle>(() => {
    const s1 = loadSlot1();
    if (s1) return { ...s1.customStyles };
    return { ...LT_DEFAULT_CUSTOM_STYLE };
  });

  // ── Position ──
  const [position, setPosition] = useState<LTPosition>(() => {
    const s1 = loadSlot1();
    if (s1) return s1.position;
    return "bottom-left";
  });

  // ── Animation ──
  const [animationIn, setAnimationIn] = useState<LTAnimationIn>(() => {
    const s1 = loadSlot1();
    if (s1) return s1.animationIn;
    return "slide-left";
  });
  const [exitStyle, setExitStyle] = useState<LTExitStyle>(() => {
    const s1 = loadSlot1();
    if (s1) return s1.exitStyle;
    return "fade";
  });

  // ── Preview zoom (persisted) ──
  // Currently unused — will be wired to UI controls in a follow-up

  // ── Speaker theme detection & ministry data ──
  const isCurrentThemeSpeaker = useMemo(() => isSpeakerTheme(theme), [theme]);

  // ── Logo variable detection ──
  const hasLogoVariable = useMemo(
    () => theme.variables.some(
      (v) => v.type === "image"
        || v.key.toLowerCase().includes("logo")
        || (v.label ?? "").toLowerCase().includes("logo"),
    ),
    [theme],
  );

  // ── Image variable (for interactive picker) ──
  // Matches type:"image" variables, OR type:"text" variables whose key/label contains "logo"
  const imageVariable = useMemo(
    () => theme.variables.find((v) => v.type === "image"
      || ((v.key.toLowerCase().includes("logo") || (v.label ?? "").toLowerCase().includes("logo")) && v.type === "text")) ?? null,
    [theme],
  );
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [imageHovered, setImageHovered] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);

  const handleImageFileSelect = useCallback((file: File) => {
    if (!imageVariable) return;
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setVariableValues((prev) => ({ ...prev, [imageVariable.key]: url }));
  }, [imageVariable, setVariableValues]);

  const handleImageFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageFileSelect(file);
    e.target.value = "";
  }, [handleImageFileSelect]);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setImageDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageFileSelect(file);
  }, [handleImageFileSelect]);

  const handleImageRemove = useCallback(() => {
    if (!imageVariable) return;
    // For text-type logo variables, reset to the theme's default URL; otherwise clear
    setVariableValues((prev) => ({
      ...prev,
      [imageVariable.key]: imageVariable.type === "text" ? (imageVariable.defaultValue ?? "") : "",
    }));
  }, [imageVariable, setVariableValues]);

  const [speakers, setSpeakers] = useState<SpeakerProfileSetting[]>([]);
  const [selectedSpeakerIdx, setSelectedSpeakerIdx] = useState<number | null>(null);
  const [showSpeakerHint, setShowSpeakerHint] = useState(() => {
    if (!isCurrentThemeSpeaker) return false;
    try { return localStorage.getItem(SPEAKER_FIRST_TIME_KEY) !== "1"; } catch { return false; }
  });

  // Load ministry data when theme changes (localStorage first, then API fallback)
  useEffect(() => {
    if (!isCurrentThemeSpeaker) {
      setSelectedSpeakerIdx(null);
      return;
    }
    refreshMinistry();
    const ministry = getMinistryData();
    const list = ministry.speakers.map((s) => ({
      name: s.name.trim(),
      role: (s.role || "").trim(),
      imageUrl: (s.imageUrl || "").trim(),
      isMain: s.isMain,
    }));
    setSpeakers(list);

    // Don't auto-select — user picks manually
    if (list.length === 0) {
      // localStorage empty — try fetching from the API (OBS dock context)
      ensureMinistryData().then((fetched) => {
        if (!fetched) return;
        const fresh = getMinistryData();
        const freshList = fresh.speakers.map((s) => ({
          name: s.name.trim(),
          role: (s.role || "").trim(),
          imageUrl: (s.imageUrl || "").trim(),
          isMain: s.isMain,
        }));
        setSpeakers(freshList);
      });
    }
  }, [theme.id, isCurrentThemeSpeaker]);

  // Listen for ministry settings changes
  useEffect(() => {
    if (!isCurrentThemeSpeaker) return;
    const handler = () => {
      refreshMinistry();
      const ministry = getMinistryData();
      const list = ministry.speakers.map((s) => ({
        name: s.name.trim(),
        role: (s.role || "").trim(),
        imageUrl: (s.imageUrl || "").trim(),
        isMain: s.isMain,
      }));
      setSpeakers(list);
    };
    window.addEventListener(MV_SETTINGS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(MV_SETTINGS_UPDATED_EVENT, handler);
  }, [isCurrentThemeSpeaker]);

  // Auto-populate name/title variables when speaker is selected
  useEffect(() => {
    if (!isCurrentThemeSpeaker || selectedSpeakerIdx === null) return;
    const sp = speakers[selectedSpeakerIdx];
    if (!sp) return;

    const roleMap = buildSpeakerRoleMap();
    const resolvedRole = sp.role || roleMap.get(sp.name.trim().toLowerCase()) || "";
    const ministry = getMinistryData();
    const churchName = ministry.churchName || "";
    const resolvedSpeakerImage = sp.imageUrl ? resolveOverlayAssetUrl(sp.imageUrl) : "";

    setVariableValues((prev) => {
      const next = { ...prev };
      for (const v of theme.variables) {
        const key = v.key.toLowerCase();
        const label = (v.label || "").toLowerCase();
        const hint = `${key} ${label}`;
        const logoField = isLogoVariable(v);

        const isSpeakerImageField =
          !logoField && (
            String(v.type || "").toLowerCase() === "image"
            || key === "image"
            || hint.includes("photo")
            || hint.includes("avatar")
            || hint.includes("picture")
          );

        // Name fields: exact key matches + label/hint heuristics
        const isNameField =
          !isSpeakerImageField && (
            key === "name" || key === "fullname" || key === "firstname" || key === "lastname"
            || hint.includes("name") || hint.includes("speaker") || hint.includes("pastor")
          );

        // Title/role fields: exact key matches + label/hint heuristics
        const isTitleField =
          !isSpeakerImageField && (
            key === "title" || key === "role" || key === "position" || key === "subtitle"
            || hint.includes("title") || hint.includes("role") || hint.includes("position")
          );

        // Ministry/church fields
        const isChurchField =
          !isSpeakerImageField && (
            key === "ministry" || key === "church" || key === "organization"
            || hint.includes("ministry") || hint.includes("church")
          );

        if (isNameField) {
          next[v.key] = sp.name;
        } else if (isTitleField) {
          const combined = [resolvedRole, churchName].filter(Boolean).join(", ");
          next[v.key] = combined || resolvedRole || v.defaultValue || "";
        } else if (isChurchField) {
          next[v.key] = churchName || v.defaultValue || "";
        } else if (isSpeakerImageField) {
          next[v.key] = resolvedSpeakerImage || v.defaultValue || "";
        }
      }
      return next;
    });
  }, [selectedSpeakerIdx, speakers, theme, isCurrentThemeSpeaker]);

  const dismissSpeakerHint = useCallback(() => {
    try { localStorage.setItem(SPEAKER_FIRST_TIME_KEY, "1"); } catch { /* ignore */ }
    setShowSpeakerHint(false);
  }, []);

  // ── Reset state when theme changes ──
  const prevThemeId = useRef(theme.id);
  useEffect(() => {
    if (prevThemeId.current !== theme.id) {
      // Flush pending auto-save for the OLD theme before switching
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
        if (!isSavingRef.current && activeSlotIndex !== null) {
          const fullState: SlotState = {
            variableValues: { ...variableValues },
            customStyles: { ...customStyles },
            position,
            animationIn,
            exitStyle,
          };
          saveSlot(prevThemeId.current, "default", activeSlotIndex, variableValues, theme, fullState);
        }
      }
      prevThemeId.current = theme.id;
      const init: Record<string, string> = {};
      for (const v of theme.variables) {
        init[v.key] = v.defaultValue ?? "";
      }
      setVariableValues(init);
      setCustomStyles({ ...LT_DEFAULT_CUSTOM_STYLE });
      setPosition("bottom-left");
      setAnimationIn(theme.animation?.name as LTAnimationIn || "slide-left");
      setExitStyle("fade");
      const newSlots = loadSlots(theme.id, "default");
      setSlots(newSlots);
      if (newSlots[0]) {
        const resolved = resolveSlotState(newSlots[0]);
        setVariableValues({ ...resolved.variableValues });
        setCustomStyles({ ...resolved.customStyles });
        setPosition(resolved.position);
        setAnimationIn(resolved.animationIn);
        setExitStyle(resolved.exitStyle);
      }
      setActiveSlotIndex(0);
      setCardsOpen(true);
    }
  }, [theme]);

  // ── Cards accordion state ──
  const [cardsOpen, setCardsOpen] = useState(true);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const [slots, setSlots] = useState<(ContentSlot | null)[]>(() => loadSlots(theme.id, "default"));
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(0);
  const skipFirstSaveRef = useRef(true);
  const isSavingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{ slotIndex: number; x: number; y: number } | null>(null);
  const [renamingSlotIndex, setRenamingSlotIndex] = useState<number | null>(null);
  const [renamingSlotName, setRenamingSlotName] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const reloadSlots = useCallback(() => {
    setSlots(loadSlots(theme.id, "default"));
  }, [theme.id]);

  // ── Slot handlers ──
  const handleRecallSlot = useCallback((slot: ContentSlot) => {
    const resolved = resolveSlotState(slot);
    setVariableValues({ ...resolved.variableValues });
    setCustomStyles({ ...resolved.customStyles });
    setPosition(resolved.position);
    setAnimationIn(resolved.animationIn);
    setExitStyle(resolved.exitStyle);
    setActiveSlotIndex(slot.index);
  }, []);

  const handleDeleteSlot = useCallback((index: number) => {
    deleteSlot(theme.id, "default", index);
    reloadSlots();
    if (activeSlotIndex === index) setActiveSlotIndex(0);
  }, [theme.id, reloadSlots, activeSlotIndex]);

  const handleRenameSlot = useCallback((index: number) => {
    renameSlot(theme.id, "default", index, renamingSlotName);
    reloadSlots();
    setRenamingSlotIndex(null);
    setRenamingSlotName("");
  }, [theme.id, renamingSlotName, reloadSlots]);

  // Keep a ref with the latest state so saves always write fresh data
  const latestRef = useRef({ variableValues, customStyles, position, animationIn, exitStyle, activeSlotIndex });
  latestRef.current = { variableValues, customStyles, position, animationIn, exitStyle, activeSlotIndex };

  const doSave = useCallback(() => {
    const { variableValues, customStyles, position, animationIn, exitStyle, activeSlotIndex } = latestRef.current;
    if (activeSlotIndex === null) return;
    if (isSavingRef.current) return;
    try {
      const fullState: SlotState = {
        variableValues: { ...variableValues },
        customStyles: { ...customStyles },
        position,
        animationIn,
        exitStyle,
      };
      saveSlot(theme.id, "default", activeSlotIndex, variableValues, theme, fullState);
    } catch (err) {
      console.warn("[AutoSave] saveSlot failed:", err);
    }
    reloadSlots();
  }, [theme.id]);

  // Auto-save whenever editor state changes (skip first render to avoid overwriting loaded slot data)
  useEffect(() => {
    if (skipFirstSaveRef.current) { skipFirstSaveRef.current = false; return; }
    doSave();
  }, [doSave, variableValues, customStyles, position, animationIn, exitStyle, activeSlotIndex]);

  // ── Context menu open (right-click or left-click empty slot) ──
  const openContextMenu = useCallback((slotIndex: number, x: number, y: number) => {
    setContextMenu({ slotIndex, x, y });
    setRenamingSlotIndex(null);
    setRenamingSlotName("");
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setRenamingSlotIndex(null);
    setRenamingSlotName("");
  }, []);

  // ── Slot click: flush current slot, then load clicked slot's data (or defaults for empty) ──
  const handleSlotClick = useCallback((index: number, slot: ContentSlot | null, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    // No-op: clicking the already-active slot does nothing
    if (activeSlotIndex === index) return;

    // Flush: synchronously save current slot before switching
    if (activeSlotIndex !== null) {
      isSavingRef.current = true;
      const fullState: SlotState = {
        variableValues: { ...variableValues },
        customStyles: { ...customStyles },
        position,
        animationIn,
        exitStyle,
      };
      saveSlot(theme.id, "default", activeSlotIndex, variableValues, theme, fullState);
      reloadSlots();
      isSavingRef.current = false;
    }

    if (slot) {
      // Filled slot: load its saved data into the editor
      handleRecallSlot(slot);
    } else {
      // Empty slot: select it with default values
      setActiveSlotIndex(index);
      const init: Record<string, string> = {};
      for (const v of theme.variables) {
        init[v.key] = v.defaultValue ?? "";
      }
      setVariableValues(init);
      setCustomStyles({ ...LT_DEFAULT_CUSTOM_STYLE });
      setPosition("bottom-left");
      setAnimationIn("slide-left");
      setExitStyle("fade");
    }
  }, [activeSlotIndex, variableValues, customStyles, position, animationIn, exitStyle, theme, reloadSlots, handleRecallSlot]);

  // ── Slot right-click: always open menu ──
  const handleSlotContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openContextMenu(index, rect.right + 4, rect.top);
  }, [openContextMenu]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingSlotIndex !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSlotIndex]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu, closeContextMenu]);

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [contextMenu, closeContextMenu]);

  // ── Send / Blank handlers ──
  const handleSend = useCallback(() => {
    const overlayExitStyle = exitStyle === "fade" ? undefined : exitStyle;
    const url = buildOverlayUrl(
      theme,
      variableValues,
      true,
      false,
      size,
      customStyles,
      undefined as LTFontSize | undefined,
      position,
      undefined,
      undefined,
      animationIn,
      overlayExitStyle,
    );
    onSend(url);
  }, [theme, variableValues, customStyles, position, animationIn, exitStyle, size, onSend]);

  const handleAnimateOut = useCallback(() => {
    if (!onAnimateOut) return;
    const overlayExitStyle = exitStyle === "fade" ? undefined : exitStyle;
    const url = buildOverlayUrl(
      theme,
      variableValues,
      false,
      true,
      size,
      customStyles,
      undefined as LTFontSize | undefined,
      position,
      undefined,
      undefined,
      animationIn,
      overlayExitStyle,
    );
    onAnimateOut(url);
  }, [theme, variableValues, customStyles, position, animationIn, exitStyle, size, onAnimateOut]);

  return (
    <div className="dock-lt-editor-layout">
      {/* ── Preview (fixed top) ── */}


      {/* ── Scrollable settings ── */}
      <div className="dock-lt-editor-layout__scroll">
        {isCurrentThemeSpeaker && showSpeakerHint && speakers.length > 0 && (
          <div style={{
            background: "var(--dock-accent-soft)",
            border: "1px solid var(--dock-accent-soft-border)",
            borderRadius: 3,
            padding: "6px 8px",
            marginBottom: 6,
            fontSize: 10,
            color: "var(--dock-text-dim)",
            lineHeight: 1.4,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <span style={{ flex: 1 }}>
                {t("lowerThird.speakerDetected")}
              </span>
              <button
                type="button"
                onClick={dismissSpeakerHint}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--dock-text-dim)",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 12,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
                title={t("common.close")}>
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>
        )}

        {/* ── Speaker Quick Select (only for speaker themes) ── */}
        {isCurrentThemeSpeaker && (
          <div style={{ padding: "0 0 6px" }}>
            <label style={{ fontSize: 10, color: "var(--dock-text-dim)", display: "block", marginBottom: 4 }}>
              {t("lowerThird.speaker")}
            </label>
            {speakers.length > 0 ? (
              <select
                value={selectedSpeakerIdx ?? ""}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setSelectedSpeakerIdx(Number.isNaN(idx) ? null : idx);
                }}
                style={{
                  width: "100%",
                  background: "var(--dock-surface)",
                  border: "1px solid var(--dock-border)",
                  borderRadius: 3,
                  padding: "4px 6px",
                  fontSize: 11,
                  color: "var(--dock-text)",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                <option value="">—</option>
                {speakers.map((sp, i) => (
                  <option key={`${sp.name}-${i}`} value={i}>
                    {sp.name}{sp.isMain ? " ★" : ""}{sp.role ? ` — ${sp.role}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{
                fontSize: 10,
                color: "var(--dock-text-dim)",
                background: "var(--dock-surface)",
                border: "1px solid var(--dock-border)",
                borderRadius: 3,
                padding: "6px 8px",
                lineHeight: 1.4,
              }}>
                {t("lowerThird.noSpeakers")} <strong>{t("ministry.ministrySettings")}</strong>{t("lowerThird.speakerHint")}
              </div>
            )}
          </div>
        )}

        {/* ── Lower Third Customization Card ── */}
        <div className="dock-lt-config-content">
          {/* Accordion Header */}


          {/* Hidable Content */}
          <div className={`dock-lt-hidable${cardsOpen ? " dock-lt-hidable--open" : ""}`}>
            {/* Grid Container */}


            {/* First Edit Container: Logo + Textfields */}
            <div className={`dock-lt-first-edit${hasLogoVariable ? "" : " dock-lt-first-edit--no-logo"}`}>
              {hasLogoVariable && imageVariable && (
                <>
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleImageFileInput}
                  />
                  <div
                    className={`dock-lt-logo-container dock-lt-image-picker${imageDragOver ? " dock-lt-image-picker--dragover" : ""}`}
                    onClick={() => imageFileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setImageDragOver(true); }}
                    onDragLeave={() => setImageDragOver(false)}
                    onDrop={handleImageDrop}
                    onMouseEnter={() => setImageHovered(true)}
                    onMouseLeave={() => setImageHovered(false)}
                  >
                    {variableValues[imageVariable.key] ? (
                      <>
                        <img src={variableValues[imageVariable.key]} alt="" />
                        {imageHovered && (
                          <div className="dock-lt-image-picker-overlay">
                            <button
                              type="button"
                              className="dock-lt-image-picker-action"
                              onClick={(e) => { e.stopPropagation(); imageFileInputRef.current?.click(); }}
                            >
                              <span className="material-icons" style={{ fontSize: 14 }}>photo_camera</span>
                              <span>Change</span>
                            </button>
                            <button
                              type="button"
                              className="dock-lt-image-picker-action dock-lt-image-picker-action--remove"
                              onClick={(e) => { e.stopPropagation(); handleImageRemove(); }}
                            >
                              <span className="material-icons" style={{ fontSize: 14 }}>close</span>
                              <span>Remove</span>
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="dock-lt-image-picker-empty">
                        <span className="material-icons" style={{ fontSize: 20, color: "var(--dock-text-dim)" }}>
                          add_photo_alternate
                        </span>
                        <span className="dock-lt-image-picker-empty-text">Drop image or click</span>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="dock-lt-textfields">
                {/* Dynamic fields from theme variables (text/list types, excluding image/logo variables) */}
                {theme.variables
                  .filter((v) => {
                    if (v.type !== "text" && v.type !== "list") return false;
                    // Skip variables managed by the image picker
                    const key = v.key.toLowerCase();
                    const label = (v.label ?? "").toLowerCase();
                    if (key.includes("logo") || key.includes("image") || label.includes("logo") || label.includes("image")) return false;
                    return true;
                  })
                  .map((v, idx) => {
                    void idx;
                    return (
                      <div className="dock-lt-field-row" key={v.key}>
                        <input
                          className="dock-lt-field-input"
                          type="text"
                          value={variableValues[v.key] ?? ""}
                          onChange={(e) => setVariableValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                          placeholder={v.label || v.key}
                        />

                      </div>
                    );
                  })}
                {/* Select-type variables as dropdowns (skip internal animation controls) */}
                {theme.variables
                  .filter((v) => v.type === "select" && v.key !== "state" && v.key !== "animMode")
                  .map((v) => (
                    <div className="dock-lt-field-row" key={v.key}>
                      <select
                        className="dock-lt-field-input"
                        value={variableValues[v.key] ?? ""}
                        onChange={(e) => setVariableValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                      >
                        <option value="">{v.label || v.key}</option>
                        {(v.options ?? []).map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                {/* Number-type variables */}
                {theme.variables
                  .filter((v) => v.type === "number")
                  .map((v) => (
                    <div className="dock-lt-field-row" key={v.key}>
                      <input
                        className="dock-lt-field-input"
                        type="number"
                        value={variableValues[v.key] ?? ""}
                        onChange={(e) => setVariableValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                        placeholder={v.label || v.key}
                      />
                    </div>
                  ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 6,
                padding: 8,
                border: "1px solid var(--dock-border)",
                borderRadius: 4,
                background: "var(--dock-surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 8, marginBottom: appearanceOpen ? 7 : 0 }}>
                <button
                  type="button"
                  aria-expanded={appearanceOpen}
                  aria-controls={LT_APPEARANCE_PANEL_ID}
                  onClick={() => setAppearanceOpen((open) => !open)}
                  style={{
                    display: "flex",
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    minWidth: 0,
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "var(--dock-text)", textTransform: "uppercase", letterSpacing: 0.3 }}>
                      {t("lowerThird.appearance", "Appearance")}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--dock-text-dim)", marginTop: 2 }}>
                      {t("lowerThird.appearanceDesc", "Adjust the live lower-third colors.")}
                    </div>
                  </div>
                  <Icon name={appearanceOpen ? "expand_less" : "expand_more"} size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setCustomStyles((prev) => withoutLtAppearanceColors(prev))}
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
              {appearanceOpen && (
                <div
                  id={LT_APPEARANCE_PANEL_ID}
                  role="region"
                  aria-label={t("lowerThird.appearance", "Appearance")}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}
                >
                  {LT_APPEARANCE_COLOR_CONTROLS.map((control) => {
                    const explicitColor = getLtAppearanceColor(customStyles, control.key);
                    const baseColor = control.key === "accentColor" ? theme.accentColor : control.fallback;
                    const effectiveColor = sanitizeLtColor(explicitColor) ?? sanitizeLtColor(baseColor) ?? control.fallback;
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
                          value={ltColorInputValue(explicitColor || effectiveColor, control.fallback)}
                          onChange={(event) => setCustomStyles((prev) => withLtAppearanceColor(prev, control.key, event.target.value))}
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
              )}
            </div>

            {/* Panel Bottom: Memory + Time Controls */}
            <div className="dock-lt-panel-bottom">
              <button
                type="button"
                onClick={() => {
                  const defaults: Record<string, string> = {};
                  for (const v of theme.variables) { defaults[v.key] = v.defaultValue ?? ""; }
                  setVariableValues(defaults);
                  setCustomStyles({ ...LT_DEFAULT_CUSTOM_STYLE });
                  setPosition("bottom-left");
                  setAnimationIn("slide-left");
                  setExitStyle("fade");
                }}
                style={{
                  background: "var(--dock-input-bg)",
                  border: "1px solid var(--dock-border)",
                  borderRadius: 3,
                  color: "var(--dock-text-dim)",
                  cursor: "pointer",
                  padding: "2px 6px",
                  fontSize: 10,
                  fontFamily: "inherit",
                }}
              >
                <span className="material-icons" style={{ fontSize: 12, verticalAlign: "middle", marginRight: 2 }}>
                  restart_alt
                </span>
                Clear
              </button>

              <ul className="dock-lt-memory-slots">
                {slots.map((slot, idx) => (
                  <li
                    key={idx}
                    className={`dock-lt-slot${activeSlotIndex === idx ? " dock-lt-slot--active" : ""}${slot ? " dock-lt-slot--filled" : " dock-lt-slot--empty"}`}
                    title={slot?.label}
                    onClick={(e) => handleSlotClick(idx, slot, e)}
                    onContextMenu={(e) => handleSlotContextMenu(e, idx)}
                  >
                    {idx + 1}
                  </li>
                ))}
              </ul>


            </div>
          </div>
        </div>







      </div>{/* /scroll */}

      {/* ── Action Buttons (fixed bottom) ── */}
      <div className="dock-lt-editor-layout__bar">
        <button
          type="button"
          className={`dock-btn dock-btn--sm ${sending ? "dock-btn--loading" : "dock-btn--primary"}`}
          onClick={handleSend}
          disabled={sending}
          style={{ flex: 1 }}
          title={t("lowerThird.goLive")}>
          <Icon name="play_arrow" size={14} />
          <span>{t("lowerThird.goLive")}</span>
        </button>
        {onAnimateOut && (
          <button
            type="button"
            className={`dock-btn dock-btn--sm ${sending ? "dock-btn--loading" : ""}`}
            onClick={handleAnimateOut}
            disabled={sending}
            title={t("lowerThird.animateOut")}>
            <Icon name="animation" size={14} />
            <span>{t("lowerThird.animateOut")}</span>
          </button>
        )}
      </div>

      {/* ── Slot Context Menu ── */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="dock-lt-slot-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {renamingSlotIndex === contextMenu.slotIndex ? (
            /* ── Inline rename mode ── */
            <div className="dock-lt-slot-context-rename">
              <input
                ref={renameInputRef}
                className="dock-lt-slot-rename-input"
                type="text"
                value={renamingSlotName}
                onChange={(e) => setRenamingSlotName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSlot(contextMenu.slotIndex);
                  if (e.key === "Escape") closeContextMenu();
                }}
                placeholder={t("lowerThird.slotRenamePlaceholder")}
                maxLength={30}
              />
              <div className="dock-lt-slot-rename-actions">
                <button
                  className="dock-lt-slot-context-item"
                  onClick={() => handleRenameSlot(contextMenu.slotIndex)}
                >
                  <Icon name="check" size={14} />
                  {t("common.confirm")}
                </button>
                <button
                  className="dock-lt-slot-context-item"
                  onClick={closeContextMenu}
                >
                  <Icon name="close" size={14} />
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            /* ── Normal menu ── */
            <>
              {slots[contextMenu.slotIndex] && (
                <button
                  className="dock-lt-slot-context-item"
                  onClick={() => {
                    handleRecallSlot(slots[contextMenu.slotIndex]!);
                    closeContextMenu();
                  }}
                >
                  <Icon name="open_in_new" size={14} />
                  {t("lowerThird.slotLoad")}
                </button>
              )}
              {slots[contextMenu.slotIndex] && (
                <button
                  className="dock-lt-slot-context-item"
                  onClick={() => {
                    setRenamingSlotIndex(contextMenu.slotIndex);
                    setRenamingSlotName(slots[contextMenu.slotIndex]?.label ?? "");
                  }}
                >
                  <Icon name="edit" size={14} />
                  {t("lowerThird.slotRename")}
                </button>
              )}
              {slots[contextMenu.slotIndex] && (
                <button
                  className="dock-lt-slot-context-item dock-lt-slot-context-item--danger"
                  onClick={() => {
                    handleDeleteSlot(contextMenu.slotIndex);
                    closeContextMenu();
                  }}
                >
                  <Icon name="delete" size={14} />
                  {t("lowerThird.slotClear")}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
