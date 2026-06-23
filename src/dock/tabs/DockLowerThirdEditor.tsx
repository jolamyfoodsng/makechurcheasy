/**
 * DockLowerThirdEditor.tsx — Full-featured lower-third editor for the Dock
 *
 * Dynamically generates all controls from the selected theme's JSON definition.
 * Sections: Preview, Content (variable controls), Appearance, Position,
 * Animation, Animation Presets, Theme Inspector.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  LTVariable,
  LowerThirdTheme,
} from "../../lowerthirds/types";
import {
  LT_DEFAULT_CUSTOM_STYLE,
} from "../../lowerthirds/types";
import Icon from "../DockIcon";

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
      >
        <Icon name={icon} size={12} />
        <span>{label}</span>
        <Icon name={open ? "expand_less" : "expand_more"} size={14} style={{ marginLeft: "auto" }} />
      </button>
      {open && <div className="dock-lt-editor__section-body">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variable Control — renders a single LTVariable as a form field
// ---------------------------------------------------------------------------

function VariableControl({
  variable,
  value,
  onChange,
}: {
  variable: LTVariable;
  value: string;
  onChange: (val: string) => void;
}) {
  const baseInputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--dock-surface)",
    border: "1px solid var(--dock-border)",
    borderRadius: 3,
    padding: "4px 6px",
    fontSize: 11,
    color: "var(--dock-text)",
    fontFamily: "inherit",
  };

  switch (variable.type) {
    case "color":
      return (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="color"
            value={value || "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: 24, height: 24, border: "none", background: "none", cursor: "pointer", padding: 0 }}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={variable.placeholder}
            style={{ ...baseInputStyle, flex: 1 }}
          />
        </div>
      );

    case "select":
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...baseInputStyle, cursor: "pointer" }}
        >
          {variable.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );

    case "number":
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.placeholder}
          min={0}
          style={baseInputStyle}
        />
      );

    case "toggle":
      return (
        <button
          type="button"
          onClick={() => onChange(value === "true" ? "false" : "true")}
          style={{
            ...baseInputStyle,
            background: value === "true" ? "var(--dock-accent)" : "var(--dock-surface)",
            color: value === "true" ? "#fff" : "var(--dock-text-dim)",
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          {value === "true" ? "On" : "Off"}
        </button>
      );

    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.placeholder}
          maxLength={variable.maxLength}
          style={baseInputStyle}
        />
      );
  }
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
  onUpdate,
  sending,
  size = "xl",
  live = false,
}: DockLTEditorProps) {
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
    }
  }, [theme]);

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

  // ── Group variables ──
  const groupedVars = useMemo(() => {
    const groups = new Map<string, LTVariable[]>();
    for (const v of theme.variables) {
      const g = v.group || "Content";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(v);
    }
    return groups;
  }, [theme.variables]);

  // ── Color picker row helper ──
  const colorRow = (
    label: string,
    cssVar: string,
    value: string,
    onChange: (v: string) => void,
  ) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <label style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 72 }}>{label}</label>
      <input
        type="color"
        value={value || "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 22, height: 22, border: "none", background: "none", cursor: "pointer", padding: 0 }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={cssVar}
        style={{
          flex: 1,
          background: "var(--dock-surface)",
          border: "1px solid var(--dock-border)",
          borderRadius: 3,
          padding: "3px 6px",
          fontSize: 10,
          color: "var(--dock-text)",
          fontFamily: "inherit",
        }}
      />
    </div>
  );

  return (
    <div className="dock-lt-editor">
      {/* ── Theme Selector ── */}


      {/* ── Preview ── */}


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
              Speaker detected — select a speaker below to auto-fill name &amp; role.
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
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ── Speaker Quick Select (only for speaker themes) ── */}
      {isCurrentThemeSpeaker && (
        <div style={{ padding: "0 0 6px" }}>
          <label style={{ fontSize: 10, color: "var(--dock-text-dim)", display: "block", marginBottom: 4 }}>
            Speaker
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
              No speakers configured yet. Add speakers in <strong>Ministry Settings</strong> → Pastor/Speaker list, then reload this tab.
            </div>
          )}
        </div>
      )}

      {/* ── Content: Dynamic Variable Controls ── */}
      <Section label="Content" icon="edit" open={!!openSections.content} onToggle={() => toggleSection("content")}>
        {[...groupedVars.entries()].map(([groupName, vars]) => (
          <div key={groupName} style={{ marginBottom: 8 }}>
            <div className="dock-lt-editor__group-label">{groupName}</div>
            <div className="dock-lt-editor__group-divider" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
              {vars.map((v) => (
                <div key={v.key}>
                  <label className="dock-lt-editor__field-label">{v.label}</label>
                  <VariableControl
                    variable={v}
                    value={variableValues[v.key] ?? ""}
                    onChange={(val) => setVariableValues((prev) => ({ ...prev, [v.key]: val }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      {/* ── Appearance ── */}
      <Section label="Appearance" icon="palette" open={!!openSections.appearance} onToggle={() => toggleSection("appearance")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
          {colorRow("Accent", "--accent", customStyles.accentColor, (v) => setCustomStyles((s) => ({ ...s, accentColor: v })))}
          {colorRow("Background", "--bg", customStyles.bgColor, (v) => setCustomStyles((s) => ({ ...s, bgColor: v })))}
          {colorRow("Text", "--fg", customStyles.textColor, (v) => setCustomStyles((s) => ({ ...s, textColor: v })))}
          {colorRow("Border", "--bd", customStyles.accentColor, (v) => setCustomStyles((s) => ({ ...s, accentColor: v })))}
        </div>
      </Section>

      {/* ── Animation ── */}


      {/* ── Animation Presets ── */}


      {/* ── Theme Inspector ── */}


      {/* ── Action Buttons ── */}
      <div style={{ display: "flex", gap: 6, padding: "6px 0" }}>
        <button
          type="button"
          className={`dock-btn dock-btn--sm ${sending ? "dock-btn--loading" : "dock-btn--primary"}`}
          onClick={handleSend}
          disabled={sending}
          style={{ flex: 1 }}
        >
          <Icon name="play_arrow" size={14} />
          <span>Go Live</span>
        </button>
        {onAnimateOut && (
          <button
            type="button"
            className={`dock-btn dock-btn--sm ${sending ? "dock-btn--loading" : ""}`}
            onClick={handleAnimateOut}
            disabled={sending}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid var(--dock-border)",
              color: "var(--dock-text-dim)",
            }}
          >
            <Icon name="animation" size={14} />
            <span>Animate Out</span>
          </button>
        )}

      </div>
    </div>
  );
}
