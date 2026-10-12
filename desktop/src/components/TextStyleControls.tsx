/**
 * TextStyleControls — small styling row under a text box in the graphics editors
 * (Broadcast Graphics → Customize, and the Dock's lower-third editor).
 *
 * Letter case is always available. Size, weight, italic and letter spacing show only
 * when the graphic can apply them (HTML templates and graphic packages); Motion straps
 * take the case only. The value is the "<key>__style" string from textStyle.ts.
 */
import { useState, type CSSProperties } from "react";
import {
  DEFAULT_TEXT_STYLE,
  isDefaultTextStyle,
  parseTextStyle,
  serializeTextStyle,
  TEXT_CASE_OPTIONS,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_STEP,
  TEXT_SPACING_OPTIONS,
  TEXT_WEIGHT_OPTIONS,
  type TextStyle,
} from "../lowerthirds/textStyle";

export type TextStyleCapability = "full" | "case";

interface Props {
  value: string | undefined;
  onChange: (next: string) => void;
  capability?: TextStyleCapability;
  /** Smaller sizing for the Dock. */
  compact?: boolean;
}

export default function TextStyleControls({ value, onChange, capability = "full", compact = false }: Props) {
  const style = parseTextStyle(value);
  const hasExtras = style.size !== 100 || style.weight !== "default" || style.italic || style.spacing !== "default";
  const [open, setOpen] = useState(hasExtras);
  const set = (patch: Partial<TextStyle>) => onChange(serializeTextStyle({ ...style, ...patch }));

  const fs = compact ? 10 : 11;
  const pad = compact ? "2px 6px" : "3px 8px";
  const border = "1px solid var(--dock-border, rgba(148,163,184,.35))";
  const activeBorder = "1px solid var(--dock-accent, #6366f1)";
  const activeBg = "color-mix(in srgb, var(--dock-accent, #6366f1) 22%, transparent)";
  const chip = (active: boolean): CSSProperties => ({
    padding: pad,
    minWidth: compact ? 24 : 28,
    borderRadius: 4,
    fontSize: fs,
    fontWeight: 700,
    lineHeight: 1.2,
    cursor: "pointer",
    border: active ? activeBorder : border,
    background: active ? activeBg : "transparent",
    color: "inherit",
  });
  const selectStyle: CSSProperties = {
    fontSize: fs,
    padding: compact ? "1px 4px" : "2px 6px",
    borderRadius: 4,
    border,
    background: "transparent",
    color: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, opacity: 0.95 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <div role="group" aria-label="Letter case" style={{ display: "flex", gap: 3 }}>
          {TEXT_CASE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              title={o.hint}
              aria-pressed={style.case === o.value}
              style={chip(style.case === o.value)}
              onClick={() => set({ case: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
        {capability === "full" && (
          <button
            type="button"
            style={{ ...chip(open || hasExtras), fontWeight: 600 }}
            title="Size, weight, italic and spacing"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Less" : "More"}
          </button>
        )}
        {!isDefaultTextStyle(style) && (
          <button
            type="button"
            style={{ ...chip(false), border: "none", fontWeight: 500, textDecoration: "underline", opacity: 0.8 }}
            title="Back to the design's own style"
            onClick={() => onChange(serializeTextStyle(DEFAULT_TEXT_STYLE))}
          >
            Clear style
          </button>
        )}
      </div>

      {capability === "full" && open && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }} title="Text size">
            <button
              type="button"
              style={chip(false)}
              aria-label="Smaller text"
              disabled={style.size <= TEXT_SIZE_MIN}
              onClick={() => set({ size: Math.max(TEXT_SIZE_MIN, style.size - TEXT_SIZE_STEP) })}
            >
              A−
            </button>
            <span style={{ fontSize: fs, minWidth: 34, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{style.size}%</span>
            <button
              type="button"
              style={chip(false)}
              aria-label="Bigger text"
              disabled={style.size >= TEXT_SIZE_MAX}
              onClick={() => set({ size: Math.min(TEXT_SIZE_MAX, style.size + TEXT_SIZE_STEP) })}
            >
              A+
            </button>
          </div>
          <select
            aria-label="Text weight"
            style={selectStyle}
            value={style.weight}
            onChange={(e) => set({ weight: e.target.value as TextStyle["weight"] })}
          >
            {TEXT_WEIGHT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            title="Italic"
            aria-pressed={style.italic}
            style={{ ...chip(style.italic), fontStyle: "italic", fontFamily: "Georgia, serif" }}
            onClick={() => set({ italic: !style.italic })}
          >
            I
          </button>
          <select
            aria-label="Letter spacing"
            style={selectStyle}
            value={style.spacing}
            onChange={(e) => set({ spacing: e.target.value as TextStyle["spacing"] })}
          >
            {TEXT_SPACING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
