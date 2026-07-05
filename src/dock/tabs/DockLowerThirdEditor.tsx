/**
 * DockLowerThirdEditor.tsx — Full-featured lower-third editor for the Dock
 *
 * Dynamically generates all controls from the selected theme's JSON definition.
 * Sections: Preview, Content (variable controls), Appearance, Position,
 * Animation, Animation Presets, Theme Inspector.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildOverlayUrl } from "../../lowerthirds/lowerThirdObsService";
import { isSpeakerTheme } from "../../lowerthirds/speakerThemeUtils";
import { getMinistryData, buildSpeakerRoleMap, refreshMinistry, ensureMinistryData } from "../../services/ministryStore";
import { MV_SETTINGS_UPDATED_EVENT } from "../../multiview/mvStore";
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
  LT_POSITIONS,
  LT_POSITION_LABELS,
  LT_POSITION_ICONS,
  LT_ANIMATIONS_IN,
  LT_ANIMATION_LABELS,
  LT_ANIMATION_ICONS,
  LT_EXIT_STYLES,
  LT_EXIT_STYLE_LABELS,
} from "../../lowerthirds/types";
import Icon from "../DockIcon";
import {
  loadSlots, saveSlot, deleteSlot,
} from "../../lowerthirds/contentSlots";
import type { ContentSlot } from "../../lowerthirds/contentSlots";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const SPEAKER_FIRST_TIME_KEY = "ocs-dock-lt-speaker-hint-seen";

interface DockLTEditorProps {
  theme: LowerThirdTheme;
  themes: LowerThirdTheme[];
  onSelectTheme: (themeId: string) => void;
  onSend: (url: string) => void;
  onBlank: (url: string) => void;
  onAnimateOut?: (url: string) => void;
  onUpdate?: (url: string) => void;
  sending: boolean;
  size?: LTSize;
  live?: boolean;
}

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function Section({
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="dock-lt-editor__section">
      <button
        type="button"
        className="dock-lt-editor__section-header"
        onClick={onToggle}
        title="expand_less">
        <Icon name={icon} size={12} />
        <span>{label}</span>
        <Icon name={open ? "expand_less" : "expand_more"} size={14} style={{ marginLeft: "auto" }} />
      </button>
      {open && <div className="dock-lt-editor__section-body">{children}</div>}
    </div>
  );
}
// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DockLowerThirdEditor({
  theme,
  themes,
  onSelectTheme,
  onSend,
  onBlank: _onBlank,
  onAnimateOut,
  onUpdate,
  sending,
  size = "xl",
  live = false,
}: DockLTEditorProps) {
  const { t } = useTranslation();
  // ── Variable values ──
  const [variableValues, setVariableValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of theme.variables) {
      init[v.key] = v.defaultValue ?? "";
    }
    return init;
  });

  // ── Custom style overrides ──
  const [customStyles, setCustomStyles] = useState<LTCustomStyle>({ ...LT_DEFAULT_CUSTOM_STYLE });

  // ── Position ──
  const [position, setPosition] = useState<LTPosition>("bottom-left");

  // ── Animation ──
  const [animationIn, setAnimationIn] = useState<LTAnimationIn>("slide-left");
  const [exitStyle, setExitStyle] = useState<LTExitStyle>("fade");

  // ── Collapsible sections ──
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    theme: false,
    preview: true,
    content: true,
    appearance: false,
    position: false,
    animation: false,
    presets: false,
    inspector: false,
  });

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Speaker theme detection & ministry data ──
  const isCurrentThemeSpeaker = useMemo(() => isSpeakerTheme(theme), [theme]);
  const [speakers, setSpeakers] = useState<Array<{ name: string; role: string; isMain?: boolean }>>([]);
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
    const list = ministry.speakers.map((s) => ({ name: s.name.trim(), role: (s.role || "").trim(), isMain: s.isMain }));
    setSpeakers(list);

    // Auto-select main pastor
    if (list.length > 0) {
      const mainIdx = list.findIndex((s) => s.isMain || s.name.trim().toLowerCase() === ministry.mainPastorName.toLowerCase());
      setSelectedSpeakerIdx(mainIdx >= 0 ? mainIdx : 0);
    } else {
      // localStorage empty — try fetching from the API (OBS dock context)
      ensureMinistryData().then((fetched) => {
        if (!fetched) return;
        const fresh = getMinistryData();
        const freshList = fresh.speakers.map((s) => ({ name: s.name.trim(), role: (s.role || "").trim(), isMain: s.isMain }));
        setSpeakers(freshList);
        if (freshList.length > 0) {
          const mainIdx = freshList.findIndex((s) => s.isMain || s.name.trim().toLowerCase() === fresh.mainPastorName.toLowerCase());
          setSelectedSpeakerIdx(mainIdx >= 0 ? mainIdx : 0);
        }
      });
    }
  }, [theme.id, isCurrentThemeSpeaker]);

  // Listen for ministry settings changes
  useEffect(() => {
    if (!isCurrentThemeSpeaker) return;
    const handler = () => {
      refreshMinistry();
      const ministry = getMinistryData();
      const list = ministry.speakers.map((s) => ({ name: s.name.trim(), role: (s.role || "").trim(), isMain: s.isMain }));
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

    setVariableValues((prev) => {
      const next = { ...prev };
      for (const v of theme.variables) {
        const key = v.key.toLowerCase();
        const label = (v.label || "").toLowerCase();
        const hint = `${key} ${label}`;

        // Name fields: exact key matches + label/hint heuristics
        const isNameField =
          key === "name" || key === "fullname" || key === "firstname" || key === "lastname" ||
          hint.includes("name") || hint.includes("speaker") || hint.includes("pastor");

        // Title/role fields: exact key matches + label/hint heuristics
        const isTitleField =
          key === "title" || key === "role" || key === "position" || key === "subtitle" ||
          hint.includes("title") || hint.includes("role") || hint.includes("position");

        // Ministry/church fields
        const isChurchField =
          key === "ministry" || key === "church" || key === "organization" ||
          hint.includes("ministry") || hint.includes("church");

        if (isNameField) {
          next[v.key] = sp.name;
        } else if (isTitleField) {
          const combined = [resolvedRole, churchName].filter(Boolean).join(", ");
          next[v.key] = combined || resolvedRole || v.defaultValue || "";
        } else if (isChurchField) {
          next[v.key] = churchName || v.defaultValue || "";
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
      setSlots(loadSlots(theme.id, "default"));
      setActiveSlotIndex(null);
      setCardsOpen(true);
    }
  }, [theme]);

  // ── Cards accordion state ──
  const [cardsOpen, setCardsOpen] = useState(true);

  const [slots, setSlots] = useState<(ContentSlot | null)[]>(() => loadSlots(theme.id, "default"));
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const reloadSlots = useCallback(() => {
    setSlots(loadSlots(theme.id, "default"));
  }, [theme.id]);

  // ── Slot handlers ──
  const handleSaveSlot = useCallback((index: number) => {
    saveSlot(theme.id, "default", index, variableValues, theme);
    reloadSlots();
    setActiveSlotIndex(index);
  }, [theme.id, theme, variableValues, reloadSlots]);

  const handleRecallSlot = useCallback((slot: ContentSlot) => {
    setVariableValues({ ...slot.values });
    setActiveSlotIndex(slot.index);
  }, []);

  const handleDeleteSlot = useCallback((index: number) => {
    deleteSlot(theme.id, "default", index);
    reloadSlots();
    if (activeSlotIndex === index) setActiveSlotIndex(null);
  }, [theme.id, reloadSlots, activeSlotIndex]);

  const handleSlotPointerDown = useCallback((index: number) => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      handleDeleteSlot(index);
    }, 600);
  }, [handleDeleteSlot]);

  const handleSlotPointerUp = useCallback((index: number, slot: ContentSlot | null) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressTriggeredRef.current) return;
    if (slot) {
      handleRecallSlot(slot);
    } else {
      handleSaveSlot(index);
    }
  }, [handleRecallSlot, handleSaveSlot]);

  // ── Push update to OBS (position/content changes while live) ──
  const pushUpdate = useCallback(() => {
    if (!live || !onUpdate) return;
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
      exitStyle,
    );
    onUpdate(url);
  }, [live, onUpdate, theme, variableValues, customStyles, position, animationIn, exitStyle, size]);

  // Auto-push when live and relevant settings change
  const prevLiveRef = useRef(live);
  const hasPushedLiveRef = useRef(false);
  useEffect(() => {
    const wasLive = prevLiveRef.current;
    prevLiveRef.current = live;
    if (live && !hasPushedLiveRef.current) {
      // Just went live — don't auto-push on the transition (onSend already did it)
      hasPushedLiveRef.current = true;
      return;
    }
    if (!live) {
      hasPushedLiveRef.current = false;
      return;
    }
    if (live && wasLive) {
      pushUpdate();
    }
  }, [position, animationIn, exitStyle, customStyles, variableValues]);

  // ── Send / Blank handlers ──
  const handleSend = useCallback(() => {
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
      exitStyle,
    );
    onSend(url);
  }, [theme, variableValues, customStyles, position, animationIn, exitStyle, size, onSend]);

  const handleAnimateOut = useCallback(() => {
    if (!onAnimateOut) return;
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
      exitStyle,
    );
    onAnimateOut(url);
  }, [theme, variableValues, customStyles, position, animationIn, exitStyle, size, onAnimateOut]);

  // ── Theme categories for the selector ──
  const categories = useMemo(() => {
    const map = new Map<string, LowerThirdTheme[]>();
    for (const th of themes) {
      const cat = th.category || "general";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(th);
    }
    return map;
  }, [themes]);

  // ── Preview URL ──
  const previewUrl = useMemo(() => buildOverlayUrl(
    theme, variableValues, false, false, size, customStyles,
    undefined as LTFontSize | undefined, position,
    undefined, undefined, animationIn, exitStyle,
  ), [theme, variableValues, size, customStyles, position, animationIn, exitStyle]);

  const baseSelect: React.CSSProperties = {
    width: "100%",
    background: "var(--dock-surface)",
    border: "1px solid var(--dock-border)",
    borderRadius: 3,
    padding: "4px 6px",
    fontSize: 11,
    color: "var(--dock-text)",
    fontFamily: "inherit",
    cursor: "pointer",
  };

  return (
    <div className="dock-lt-editor-layout">
      {/* ── Preview (fixed top) ── */}
      <div className="dock-lt-editor-layout__preview">
        <iframe
          src={previewUrl}
          title="lt-preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>

      {/* ── Scrollable settings ── */}
      <div className="dock-lt-editor-layout__scroll">
        {/* ── Theme Selector ── */}
        <Section label={t("lowerThird.selectTheme")} icon="palette" open={!!openSections.theme} onToggle={() => toggleSection("theme")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {[...categories.entries()].map(([cat, catThemes]) => (
              <div key={cat}>
                <div className="dock-lt-editor__group-label">{cat}</div>
                <div className="dock-lt-editor__group-divider" />
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {catThemes.map((th) => (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => onSelectTheme(th.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 6px",
                        background: th.id === theme.id ? "var(--dock-accent-soft)" : "transparent",
                        border: `1px solid ${th.id === theme.id ? "var(--dock-accent)" : "var(--dock-border)"}`,
                        borderRadius: 3,
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                        color: th.id === theme.id ? "var(--dock-accent)" : "var(--dock-text-secondary)",
                        fontSize: 11,
                        transition: "all 0.1s ease",
                      }}
                    >
                      <Icon name={th.icon} size={14} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.name}</span>
                      {th.id === theme.id && <Icon name="check" size={12} style={{ color: "var(--dock-accent)", flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Speaker First-Time Hint ── */}
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
            <div className="dock-lt-first-edit">
              <div className="dock-lt-logo-container">
                <span className="material-icons" style={{ fontSize: 24, color: "var(--dock-text-dim)" }}>
                  image
                </span>
              </div>
              <div className="dock-lt-textfields">
                {/* Name Field */}
                <input
                  type="text"
                  value={variableValues["name"] ?? ""}
                  onChange={(e) => setVariableValues((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Name"
                />
                <div className="dock-lt-textfield-appearance">
                  <label className="dock-lt-app-btn">
                    <input
                      type="checkbox"
                      checked={customStyles.nameUpper}
                      onChange={(e) => setCustomStyles((p) => ({ ...p, nameUpper: e.target.checked }))}
                    />
                    <span className="material-icons">text_fields</span>
                  </label>
                  <label className="dock-lt-app-btn">
                    <input
                      type="checkbox"
                      checked={customStyles.nameBold}
                      onChange={(e) => setCustomStyles((p) => ({ ...p, nameBold: e.target.checked }))}
                    />
                    <span className="material-icons">format_bold</span>
                  </label>
                  <input
                    type="color"
                    value={customStyles.nameColor}
                    onChange={(e) => setCustomStyles((p) => ({ ...p, nameColor: e.target.value }))}
                  />
                </div>

                {/* Info Field */}
                <input
                  type="text"
                  value={variableValues["info"] ?? ""}
                  onChange={(e) => setVariableValues((prev) => ({ ...prev, info: e.target.value }))}
                  placeholder="Info"
                />
                <div className="dock-lt-textfield-appearance">
                  <label className="dock-lt-app-btn">
                    <input
                      type="checkbox"
                      checked={customStyles.infoUpper}
                      onChange={(e) => setCustomStyles((p) => ({ ...p, infoUpper: e.target.checked }))}
                    />
                    <span className="material-icons">text_fields</span>
                  </label>
                  <label className="dock-lt-app-btn">
                    <input
                      type="checkbox"
                      checked={customStyles.infoBold}
                      onChange={(e) => setCustomStyles((p) => ({ ...p, infoBold: e.target.checked }))}
                    />
                    <span className="material-icons">format_bold</span>
                  </label>
                  <input
                    type="color"
                    value={customStyles.infoColor}
                    onChange={(e) => setCustomStyles((p) => ({ ...p, infoColor: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Panel Bottom: Memory + Time Controls */}
            <div className="dock-lt-panel-bottom">
              <button
                type="button"
                onClick={() => setCustomStyles({ ...LT_DEFAULT_CUSTOM_STYLE })}
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
                    className={`${activeSlotIndex === idx ? " li--active" : ""}${slot ? " li--filled" : ""}`}
                    onPointerDown={() => handleSlotPointerDown(idx)}
                    onPointerUp={() => handleSlotPointerUp(idx, slot)}
                    onPointerLeave={() => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                  >
                    <span className="dock-lt-slot-number">{idx + 1}</span>
                    {slot && (
                      <span className="dock-lt-slot-tooltip">{slot.label}</span>
                    )}
                  </li>
                ))}
              </ul>

              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <select
                  value={animationIn}
                  onChange={(e) => setAnimationIn(e.target.value as LTAnimationIn)}
                  style={{
                    height: 23,
                    background: "var(--dock-input-bg)",
                    border: "1px solid var(--dock-border)",
                    borderRadius: 3,
                    color: "var(--dock-text)",
                    fontSize: 10,
                    fontFamily: "inherit",
                    padding: "0 16px 0 4px",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  {LT_ANIMATIONS_IN.map((anim) => (
                    <option key={anim} value={anim}>{LT_ANIMATION_LABELS[anim]}</option>
                  ))}
                </select>
                <select
                  value={exitStyle}
                  onChange={(e) => setExitStyle(e.target.value as LTExitStyle)}
                  style={{
                    height: 23,
                    background: "var(--dock-input-bg)",
                    border: "1px solid var(--dock-border)",
                    borderRadius: 3,
                    color: "var(--dock-text)",
                    fontSize: 10,
                    fontFamily: "inherit",
                    padding: "0 16px 0 4px",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  {LT_EXIT_STYLES.map((es) => (
                    <option key={es} value={es}>{LT_EXIT_STYLE_LABELS[es]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
        {/* ── Position ── */}
        <Section label={t("lowerThird.position")} icon="open_with" open={!!openSections.position} onToggle={() => toggleSection("position")}>
          <div className="dock-lt-editor__pos-grid">
            {LT_POSITIONS.map((pos) => (
              <button
                key={pos}
                type="button"
                className={`dock-lt-editor__pos-btn${position === pos ? " dock-lt-editor__pos-btn--active" : ""}`}
                onClick={() => setPosition(pos)}
                title={LT_POSITION_LABELS[pos]}
              >
                <Icon name={LT_POSITION_ICONS[pos]} size={16} />
                <span style={{ fontSize: 9 }}>{LT_POSITION_LABELS[pos]}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Animation ── */}
        <Section label={t("lowerThird.animation")} icon="animation" open={!!openSections.animation} onToggle={() => toggleSection("animation")}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: "var(--dock-text-dim)", display: "block", marginBottom: 4 }}>
              {t("lowerThird.animationIn")}
            </label>
            <select
              value={animationIn}
              onChange={(e) => setAnimationIn(e.target.value as LTAnimationIn)}
              style={baseSelect}
            >
              {LT_ANIMATIONS_IN.map((anim) => (
                <option key={anim} value={anim}>{LT_ANIMATION_LABELS[anim]}</option>
              ))}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Icon name={LT_ANIMATION_ICONS[animationIn]} size={14} style={{ color: "var(--dock-accent)" }} />
              <span style={{ fontSize: 10, color: "var(--dock-text-secondary)" }}>{LT_ANIMATION_LABELS[animationIn]}</span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 10, color: "var(--dock-text-dim)", display: "block", marginBottom: 4 }}>
              {t("lowerThird.exitStyle")}
            </label>
            <select
              value={exitStyle}
              onChange={(e) => setExitStyle(e.target.value as LTExitStyle)}
              style={baseSelect}
            >
              {LT_EXIT_STYLES.map((es) => (
                <option key={es} value={es}>{LT_EXIT_STYLE_LABELS[es]}</option>
              ))}
            </select>
          </div>
        </Section>


        {/* ── Theme Inspector ── */}
        <Section label={t("lowerThird.inspector")} icon="info" open={!!openSections.inspector} onToggle={() => toggleSection("inspector")}>
          <div className="dock-lt-editor__inspector">
            <div className="dock-lt-editor__inspector-row">
              <span className="dock-lt-editor__inspector-key">{t("lowerThird.themeId")}</span>
              <span className="dock-lt-editor__inspector-val">{theme.id}</span>
            </div>
            <div className="dock-lt-editor__inspector-row">
              <span className="dock-lt-editor__inspector-key">{t("lowerThird.category")}</span>
              <span className="dock-lt-editor__inspector-val">{theme.category}</span>
            </div>
            <div className="dock-lt-editor__inspector-row">
              <span className="dock-lt-editor__inspector-key">{t("lowerThird.variableCount")}</span>
              <span className="dock-lt-editor__inspector-val">{theme.variables.length}</span>
            </div>
            {theme.animation && (
              <div className="dock-lt-editor__inspector-row">
                <span className="dock-lt-editor__inspector-key">{t("lowerThird.animation")}</span>
                <span className="dock-lt-editor__inspector-val">{theme.animation.name} ({theme.animation.duration}ms)</span>
              </div>
            )}
            {theme.exitAnimation && (
              <div className="dock-lt-editor__inspector-row">
                <span className="dock-lt-editor__inspector-key">{t("lowerThird.animateOut")}</span>
                <span className="dock-lt-editor__inspector-val">{theme.exitAnimation.name} ({theme.exitAnimation.duration}ms)</span>
              </div>
            )}
            <div className="dock-lt-editor__inspector-row">
              <span className="dock-lt-editor__inspector-key">{t("lowerThird.usesTailwind")}</span>
              <span className="dock-lt-editor__inspector-val">{theme.usesTailwind ? t("lowerThird.yes") : t("lowerThird.no")}</span>
            </div>
            {theme.fontImports && theme.fontImports.length > 0 && (
              <div className="dock-lt-editor__inspector-row">
                <span className="dock-lt-editor__inspector-key">{t("lowerThird.fontImports")}</span>
                <span className="dock-lt-editor__inspector-val">{theme.fontImports.length}</span>
              </div>
            )}
          </div>
        </Section>

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
    </div>
  );
}
