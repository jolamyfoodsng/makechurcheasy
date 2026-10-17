/**
 * LayerPanel — the right-hand panel of the Theme Editor for layer themes:
 * the layers list (top = drawn last) and an inspector for the selected layer.
 */
import { useRef, useState } from "react";
import { Eye, EyeOff, Lock, Unlock } from "../../../components/icons/NativeIcons";
import "./layerEditor.css";
import type { AnimationPreset, LayerAnimation, LayerStyle, LayerType, SegmentStyle, ThemeLayer, ThemeLayout, WarnLevel } from "../types";
import {
  addLayer,
  duplicateLayer,
  getLayer,
  moveLayer,
  removeLayer,
  COUNTDOWN_TEXT_ROLES,
  roleForContent,
  TEXT_ROLES,
  updateLayer,
  updateLayerStyle,
  type AlignHow,
} from "./layoutOps";
import { headingLayers, hasHeading, isHeadingShown } from "../heading";
import { themeMediaUrl, type MediaRef } from "./mediaUrl";
import { BACKGROUND_PATTERNS } from "../../../library/backgroundAssets";
import { PATTERN_GLOW_LAYER_ID, PATTERN_LAYER_ID } from "../backgroundPatterns";

/** A Media Library item, as much as the picker needs. */
export interface LayerMediaItem extends MediaRef {
  id: string;
  name: string;
  type: "image" | "video" | "audio";
  thumbnailUrl?: string;
}

const FONTS = [
  "Montserrat", "Inter", "Outfit", "Work Sans", "Source Sans 3", "Noto Sans", "Karla", "Sora", "Space Grotesk",
  "Roboto Condensed", "Barlow Condensed", "Oswald", "Bebas Neue", "Rajdhani", "Orbitron",
  "Libre Baskerville", "Playfair Display", "Source Serif 4", "EB Garamond", "Cormorant Garamond", "Cinzel",
  "Caveat", "Dancing Script", "Great Vibes", "Satisfy", "Arial",
];

/** Extra fonts the built-in countdown designs ship (public/fonts/countdown-fonts.css). */
const COUNTDOWN_FONTS = [...FONTS.slice(0, -1), "Anton", "Kaushan Script", "Archivo Black", "Arial"];

const WARN_DEFAULT_COLORS: Record<WarnLevel, string> = { green: "#22c55e", yellow: "#eab308", red: "#ef4444" };

const ANIMATIONS: Array<{ id: AnimationPreset; label: string }> = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide-up", label: "Slide up" },
  { id: "slide-down", label: "Slide down" },
  { id: "slide-left", label: "Slide from right" },
  { id: "slide-right", label: "Slide from left" },
  { id: "wipe-left", label: "Wipe left to right" },
  { id: "wipe-right", label: "Wipe right to left" },
  { id: "wipe-up", label: "Wipe upward" },
  { id: "wipe-down", label: "Wipe downward" },
  { id: "grow-x", label: "Grow sideways" },
  { id: "grow-y", label: "Grow up/down" },
  { id: "scale", label: "Scale" },
  { id: "pop", label: "Pop" },
  { id: "blur-in", label: "Blur in" },
  { id: "word-rise", label: "Words rise" },
  { id: "line-rise", label: "Lines rise" },
];

const TYPE_LABEL: Record<LayerType, string> = { text: "Text", box: "Box", image: "Image", divider: "Line" };

interface Props {
  layout: ThemeLayout;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (layout: ThemeLayout) => void;
  /** Media Library pictures and videos for box backgrounds. */
  mediaItems?: LayerMediaItem[];
  /** Preview address for a library item in the app. */
  mediaPreviewSrc?: (item: LayerMediaItem) => string;
  /** Save a picture or video from this computer into the Media Library (the list then refreshes). */
  onImportMedia?: (file: File) => Promise<void> | void;
  /** Move the selected layer to a side or the middle of the screen (or of the box it sits in). */
  onAlign?: (how: AlignHow) => void;
}

type BgKind = "colour" | "image" | "video" | "pattern";

const BG_KIND_LABEL: Record<BgKind, string> = { colour: "Colour", image: "Picture", video: "Video", pattern: "Pattern" };

/** The theme's own background: the first big box that is not the animated pattern or glow. */
export function findThemeBackground(layout: ThemeLayout): ThemeLayer | null {
  return layout.layers.find((l) => (
    l.type === "box"
    && !l.parentId
    && l.id !== PATTERN_LAYER_ID
    && l.id !== PATTERN_GLOW_LAYER_ID
    && l.w >= 1728
    && typeof l.h === "number" && l.h >= 972
    && Boolean(l.style.fill || l.style.gradient || l.style.src || l.style.videoSrc)
  )) ?? null;
}

/** Colour / picture / video / pattern and darkness for a box — e.g. the theme background. */
function BoxBackground({ layer, onStyle, mediaItems, mediaPreviewSrc, onImportMedia }: {
  layer: ThemeLayer;
  onStyle: (patch: Partial<ThemeLayer["style"]>) => void;
  mediaItems: LayerMediaItem[];
  mediaPreviewSrc: (item: LayerMediaItem) => string;
  onImportMedia?: (file: File) => Promise<void> | void;
}) {
  const s = layer.style;
  const isPattern = Boolean(s.src) && !s.videoSrc && BACKGROUND_PATTERNS.some((p) => p.src === s.src);
  const kind: BgKind = s.videoSrc ? "video" : isPattern ? "pattern" : s.src ? "image" : "colour";
  const [picking, setPicking] = useState<BgKind | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown: BgKind = picking ?? kind;
  const items = mediaItems.filter((m) => m.type === (shown === "video" ? "video" : "image"));
  const current = shown === "video" ? s.videoSrc : s.src;
  const importFile = async (file: File | undefined) => {
    if (!file || !onImportMedia) return;
    setImporting(true);
    try { await onImportMedia(file); } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  return (
    <>
      <div className="le-chips">
        {(["colour", "image", "video", "pattern"] as BgKind[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`le-chip${shown === k ? " le-chip--on" : ""}`}
            onClick={() => {
              setPicking(k === kind ? null : k);
              if (k === "colour") { onStyle({ src: undefined, videoSrc: undefined, dim: undefined }); setPicking(null); }
            }}
          >
            {BG_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <ColorField label={shown === "colour" ? "Fill" : "Colour under it"} value={s.gradient ? undefined : s.fill} allowNone onChange={(v) => onStyle({ fill: v, gradient: undefined })} />
      {s.gradient && <p className="le-hint">This layer uses a gradient. Picking a fill colour replaces it.</p>}
      {shown === "pattern" && (
        <>
          <div className="le-field"><span>Patterns</span></div>
          <div className="le-media-grid">
            {BACKGROUND_PATTERNS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`le-media${s.src === p.src && !s.videoSrc ? " le-media--on" : ""}`}
                title={p.label}
                onClick={() => { setPicking(null); onStyle({ src: p.src, videoSrc: undefined, fit: "cover" }); }}
              >
                <img src={p.src} alt={p.label} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {(shown === "image" || shown === "video") && (
        <>
          <div className="le-field"><span>From your Media Library</span></div>
          {items.length === 0 ? (
            <p className="le-hint">No {shown === "video" ? "videos" : "pictures"} in your Media Library yet.{onImportMedia ? " Add one with the button below." : " Add some in Library → Media, then come back."}</p>
          ) : (
            <div className="le-media-grid">
              {items.map((item) => {
                const url = themeMediaUrl(item);
                const on = current === url;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`le-media${on ? " le-media--on" : ""}`}
                    title={item.name}
                    onClick={() => {
                      setPicking(null);
                      onStyle(shown === "video" ? { videoSrc: url, src: undefined, fit: s.fit ?? "cover" } : { src: url, videoSrc: undefined, fit: s.fit ?? "cover" });
                    }}
                  >
                    {item.type === "video" && !item.thumbnailUrl ? (
                      <video src={mediaPreviewSrc(item)} muted preload="metadata" />
                    ) : (
                      <img src={item.thumbnailUrl || mediaPreviewSrc(item)} alt={item.name} />
                    )}
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          {onImportMedia && (
            <>
              <button type="button" className="le-btn" disabled={importing} onClick={() => fileRef.current?.click()}>
                {importing ? "Adding…" : shown === "video" ? "Add a video from this computer" : "Add a picture from this computer"}
              </button>
              <input ref={fileRef} type="file" accept={shown === "video" ? "video/*" : "image/*"} style={{ display: "none" }} onChange={(e) => void importFile(e.target.files?.[0])} />
            </>
          )}
          {shown === "image" && (
            <label className="le-field">
              <span>Or a picture address</span>
              <input className="tc-input" value={isPattern ? "" : s.src ?? ""} placeholder="https://…" onChange={(e) => { setPicking(null); onStyle({ src: e.target.value.trim() || undefined, videoSrc: undefined }); }} />
            </label>
          )}
        </>
      )}
      {shown !== "colour" && kind !== "colour" && (
        <>
          <div className="le-chips">
            {(["cover", "contain", "fill"] as const).map((f) => (
              <button key={f} type="button" className={`le-chip${(s.fit ?? "cover") === f ? " le-chip--on" : ""}`} onClick={() => onStyle({ fit: f })}>{f === "cover" ? "Fill area" : f === "contain" ? "Fit inside" : "Stretch"}</button>
            ))}
          </div>
          <label className="le-field">
            <span>Darkness {Math.round(s.dim ?? 0)}%</span>
            <input type="range" min={0} max={90} step={5} value={s.dim ?? 0} onChange={(e) => onStyle({ dim: Number(e.target.value) || undefined })} />
          </label>
        </>
      )}
    </>
  );
}

function Num({ label, value, onChange, step = 1, min, max }: { label: string; value: number | undefined; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="le-field">
      <span>{label}</span>
      <input
        className="tc-input"
        type="number"
        step={step}
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

function toHex(value: string | undefined): string {
  const v = (value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  return "#ffffff";
}

/** Keeps the alpha of an rgba() value when the colour picker changes the hue. */
function withAlphaOf(prev: string | undefined, hex: string): string {
  const m = (prev || "").match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/i);
  if (!m) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${m[1]})`;
}

function ColorField({ label, value, onChange, allowNone }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; allowNone?: boolean }) {
  return (
    <div className="le-field le-field--color">
      <span>{label}</span>
      <div className="le-color">
        <label className="le-swatch" style={{ background: value || "transparent" }}>
          <input type="color" value={toHex(value)} onChange={(e) => onChange(withAlphaOf(value, e.target.value))} />
        </label>
        <input
          className="tc-input"
          value={value ?? ""}
          placeholder={allowNone ? "none" : "#ffffff"}
          onChange={(e) => onChange(e.target.value.trim() || undefined)}
        />
      </div>
    </div>
  );
}

function AnimField({ label, value, onChange }: { label: string; value: LayerAnimation; onChange: (v: LayerAnimation) => void }) {
  return (
    <div className="le-anim">
      <label className="le-field">
        <span>{label}</span>
        <select className="tc-input tc-select" value={value.preset} onChange={(e) => onChange({ ...value, preset: e.target.value as AnimationPreset, duration: value.duration || 400 })}>
          {ANIMATIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </label>
      {value.preset !== "none" && (
        <div className="le-grid-2">
          <Num label="Length (ms)" value={value.duration} step={50} min={0} onChange={(v) => onChange({ ...value, duration: v })} />
          <Num label="Delay (ms)" value={value.delay} step={50} min={0} onChange={(v) => onChange({ ...value, delay: v })} />
        </div>
      )}
    </div>
  );
}

type StylePatch = (patch: Partial<LayerStyle>) => void;

/** Colour that follows the timer's green / yellow / red level. */
function WarnControls({ s, onStyle, targets }: { s: LayerStyle; onStyle: StylePatch; targets: Array<"text" | "fill" | "border"> }) {
  const labels = { text: "Text colour", fill: "Fill colour", border: "Border colour" } as const;
  return (
    <>
      <label className="le-field">
        <span>Follows timer level</span>
        <select className="tc-input tc-select" value={s.warn ?? ""} onChange={(e) => onStyle({ warn: (e.target.value || undefined) as LayerStyle["warn"] })}>
          <option value="">No (fixed colour)</option>
          {targets.map((t) => <option key={t} value={t}>{labels[t]}</option>)}
        </select>
      </label>
      {s.warn && (
        <>
          {(["green", "yellow", "red"] as WarnLevel[]).map((lvl) => (
            <ColorField
              key={lvl}
              label={lvl === "green" ? "Normal (green)" : lvl === "yellow" ? "Warning (yellow)" : "Time almost up (red)"}
              value={s.warnColors?.[lvl] ?? WARN_DEFAULT_COLORS[lvl]}
              onChange={(v) => onStyle({ warnColors: { ...s.warnColors, [lvl]: v ?? WARN_DEFAULT_COLORS[lvl] } })}
            />
          ))}
          <p className="le-hint">Set the yellow and red times in the Timer tab. With no times set, the colour stays green.</p>
        </>
      )}
    </>
  );
}

const DEFAULT_SEGMENT: SegmentStyle = { thickness: 12, gap: 2.4, spacing: 18, slant: 0, offOpacity: 0.1, glow: 0 };

/** Seven-segment, flip, one-line and distressed controls for time digits. */
function TimerTextControls({ s, onStyle }: { s: LayerStyle; onStyle: StylePatch }) {
  const seg = s.segment;
  const setSeg = (patch: Partial<SegmentStyle>) => onStyle({ segment: { ...DEFAULT_SEGMENT, ...seg, ...patch } });
  return (
    <>
      <div className="le-subtitle">Timer digits</div>
      <div className="le-chips">
        <button type="button" className={`le-chip${s.nowrap ? " le-chip--on" : ""}`} title="Keep on one line and shrink to fit the width" onClick={() => onStyle({ nowrap: !s.nowrap })}>One line</button>
        <button type="button" className={`le-chip${s.flip ? " le-chip--on" : ""}`} title="Flip animation each time the number changes" onClick={() => onStyle({ flip: !s.flip })}>Flip on change</button>
        <button type="button" className={`le-chip${seg ? " le-chip--on" : ""}`} title="Draw the digits as a seven-segment display" onClick={() => onStyle({ segment: seg ? undefined : { ...DEFAULT_SEGMENT } })}>7-segment</button>
      </div>
      {seg && (
        <div className="le-grid-2">
          <Num label="Thickness %" value={seg.thickness ?? 12} min={4} max={30} onChange={(v) => setSeg({ thickness: v })} />
          <Num label="Segment gap" value={seg.gap ?? 2.4} step={0.2} min={0} onChange={(v) => setSeg({ gap: v })} />
          <Num label="Digit spacing %" value={seg.spacing ?? 18} min={0} onChange={(v) => setSeg({ spacing: v })} />
          <Num label="Lean (deg)" value={seg.slant ?? 0} min={0} max={25} onChange={(v) => setSeg({ slant: v })} />
          <Num label="Unlit opacity" value={seg.offOpacity ?? 0} step={0.02} min={0} max={1} onChange={(v) => setSeg({ offOpacity: v })} />
          <Num label="Glow (px)" value={seg.glow ?? 0} min={0} max={60} onChange={(v) => setSeg({ glow: v })} />
        </div>
      )}
      <Num label="Rough edges (0–10)" value={s.roughen ?? 0} min={0} max={10} onChange={(v) => onStyle({ roughen: v || undefined })} />
      <WarnControls s={s} onStyle={onStyle} targets={["text"]} />
    </>
  );
}

/** Progress bar / marker / zones for box layers in a countdown design. */
function TimerBoxControls({ s, onStyle }: { s: LayerStyle; onStyle: StylePatch }) {
  return (
    <>
      <div className="le-subtitle">Timer bar</div>
      <label className="le-field">
        <span>Behaves as</span>
        <select className="tc-input tc-select" value={s.progress ?? ""} onChange={(e) => onStyle({ progress: (e.target.value || undefined) as LayerStyle["progress"] })}>
          <option value="">Normal box</option>
          <option value="elapsed">Progress bar — fills as time passes</option>
          <option value="remaining">Progress bar — shrinks as time passes</option>
          <option value="marker">Marker — slides along its parent</option>
          <option value="zones">Zones — green / yellow / red stretches</option>
        </select>
      </label>
      {s.progress === "marker" && <p className="le-hint">Put this layer inside a wide box (Parent) and it slides across it as time passes.</p>}
      <WarnControls s={s} onStyle={onStyle} targets={["fill", "border"]} />
    </>
  );
}

export default function LayerPanel({ layout, selectedId, onSelect, onChange, mediaItems = [], mediaPreviewSrc = (item) => item.url || "", onImportMedia, onAlign }: Props) {
  const isCountdown = layout.kind === "countdown";
  const roles = isCountdown ? COUNTDOWN_TEXT_ROLES : TEXT_ROLES;
  const fonts = isCountdown ? COUNTDOWN_FONTS : FONTS;
  const [addOpen, setAddOpen] = useState(false);
  const layer = getLayer(layout, selectedId);
  const themeBg = findThemeBackground(layout);
  const ordered = [...layout.layers].reverse(); // top of the list = drawn on top
  const set = (patch: Partial<ThemeLayer>) => layer && onChange(updateLayer(layout, layer.id, patch));
  const style = (patch: Partial<ThemeLayer["style"]>) => layer && onChange(updateLayerStyle(layout, layer.id, patch));
  const s = layer?.style ?? {};
  const role = layer?.type === "text" ? roleForContent(layer.content, roles) : "";
  const parentName = (id?: string) => layout.layers.find((l) => l.id === id)?.name;
  const heading = headingLayers(layout);
  const isHeadingLayer = (id: string) => heading.text.has(id) || heading.decor.has(id);
  /** Flag / unflag a layer as heading. The first flag also flags the auto-detected label text. */
  const setHeading = (id: string, on: boolean) => {
    const anyFlag = layout.layers.some((l) => l.heading);
    onChange({
      ...layout,
      layers: layout.layers.map((l) => {
        if (l.id === id) return { ...l, heading: on };
        if (!anyFlag && on && heading.text.has(l.id)) return { ...l, heading: true };
        if (!anyFlag && !on && heading.text.has(l.id)) return { ...l, heading: true };
        return l;
      }),
    });
  };

  return (
    <div className="le-panel">
      {themeBg && (
        <div className="le-section le-themebg">
          <span className="tc-inspector-section-title" style={{ margin: 0 }}>THEME BACKGROUND</span>
          <p className="le-hint">What is behind the words: a colour, a picture, a video or a pattern.</p>
          <BoxBackground
            key={themeBg.id}
            layer={themeBg}
            onStyle={(patch) => onChange(updateLayerStyle(layout, themeBg.id, patch))}
            mediaItems={mediaItems}
            mediaPreviewSrc={mediaPreviewSrc}
            onImportMedia={onImportMedia}
          />
        </div>
      )}
      <div className="le-section">
        <div className="le-section-head">
          <span className="tc-inspector-section-title" style={{ margin: 0 }}>LAYERS</span>
          <div className="le-add">
            <button type="button" className="le-btn" onClick={() => setAddOpen((v) => !v)}>+ Add</button>
            {addOpen && (
              <div className="le-menu" onMouseLeave={() => setAddOpen(false)}>
                {(["text", "box", "image", "divider"] as LayerType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const r = addLayer(layout, t);
                      onChange(r.layout);
                      onSelect(r.id);
                      setAddOpen(false);
                    }}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {hasHeading(layout) && (
          <div className="le-heading-toggle">
            <span>Heading (reference / label)</span>
            <div className="le-chips">
              <button type="button" className={`le-chip${isHeadingShown(layout) ? " le-chip--on" : ""}`} onClick={() => onChange({ ...layout, showHeading: undefined })}>Show</button>
              <button type="button" className={`le-chip${!isHeadingShown(layout) ? " le-chip--on" : ""}`} onClick={() => onChange({ ...layout, showHeading: false })}>Hide</button>
            </div>
          </div>
        )}
        <ul className="le-layers">
          {ordered.map((l) => (
            <li
              key={l.id}
              className={`le-layer${l.id === selectedId ? " le-layer--selected" : ""}${l.hidden ? " le-layer--hidden" : ""}`}
              style={{ paddingLeft: l.parentId ? 22 : 8 }}
              onClick={() => onSelect(l.id)}
            >
              <span className="le-layer-type">{TYPE_LABEL[l.type]}</span>
              <span className="le-layer-name">{l.name}{isHeadingLayer(l.id) && <span className="le-layer-tag" title="Part of the heading">H</span>}</span>
              <button
                type="button"
                className="le-icon-btn"
                title={l.hidden ? "Show" : "Hide"}
                onClick={(e) => { e.stopPropagation(); onChange(updateLayer(layout, l.id, { hidden: !l.hidden })); }}
              >
                {l.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                type="button"
                className="le-icon-btn"
                title={l.locked ? "Unlock" : "Lock position"}
                onClick={(e) => { e.stopPropagation(); onChange(updateLayer(layout, l.id, { locked: !l.locked })); }}
              >
                {l.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
            </li>
          ))}
        </ul>
        {layer && (
          <div className="le-layer-actions">
            <button type="button" className="le-btn" title="Bring forward" onClick={() => onChange(moveLayer(layout, layer.id, "up"))}>↑</button>
            <button type="button" className="le-btn" title="Send backward" onClick={() => onChange(moveLayer(layout, layer.id, "down"))}>↓</button>
            <button
              type="button"
              className="le-btn"
              onClick={() => {
                const r = duplicateLayer(layout, layer.id);
                onChange(r.layout);
                onSelect(r.id);
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="le-btn le-btn--danger"
              onClick={() => {
                onChange(removeLayer(layout, layer.id));
                onSelect(null);
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {!layer ? (
        <p className="le-hint">Click a part of the theme on the canvas, or a layer above, to change it. Drag to move; drag the corner to resize. Hold Shift to move straight, Alt to turn off snapping.</p>
      ) : (
        <div className="le-section">
          <div className="tc-inspector-section-title">{TYPE_LABEL[layer.type].toUpperCase()} · {layer.name.toUpperCase()}</div>
          <label className="le-field">
            <span>Name</span>
            <input className="tc-input" value={layer.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          {layer.parentId && <p className="le-hint">Inside “{parentName(layer.parentId)}”: positions are measured from its top-left corner.</p>}
          {!isCountdown && layer.type !== "image" && !(layer.type === "text" && roleForContent(layer.content) === "verse") && (
            <label className="le-check" title="Heading layers hide together when the heading is switched off, or when Worship / Notes send no label.">
              <input type="checkbox" checked={isHeadingLayer(layer.id)} onChange={(e) => setHeading(layer.id, e.target.checked)} />
              <span>Part of the heading</span>
            </label>
          )}

          {layer.type === "text" && (
            <>
              <label className="le-field">
                <span>Shows</span>
                <select
                  className="tc-input tc-select"
                  value={role}
                  onChange={(e) => {
                    const r = roles.find((x) => x.id === e.target.value);
                    if (r) set({ content: r.content });
                    else set({ content: layer.content && roleForContent(layer.content, roles) === "custom" ? layer.content : "Your text" });
                  }}
                >
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  <option value="custom">Fixed text (type it below)</option>
                </select>
              </label>
              {role === "custom" && (
                <label className="le-field">
                  <span>Text</span>
                  <input className="tc-input" value={layer.content ?? ""} onChange={(e) => set({ content: e.target.value })} />
                </label>
              )}
            </>
          )}

          <div className="le-subtitle">Position & size</div>
          {onAlign && !layer.locked && (
            <div className="le-align" role="group" aria-label="Align">
              {([["left", "Left"], ["center", "Center"], ["right", "Right"], ["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]] as const).map(([how, label]) => (
                <button key={how} type="button" className="le-btn" title={`Align ${label.toLowerCase()}`} onClick={() => onAlign(how)}>{label}</button>
              ))}
            </div>
          )}
          <div className="le-grid-2">
            <Num label="X" value={layer.x} onChange={(v) => set({ x: v })} />
            <Num label="Y" value={layer.y} onChange={(v) => set({ y: v })} />
            <Num label="Width" value={layer.w} min={1} onChange={(v) => set({ w: v })} />
            {layer.h === "auto" ? (
              <label className="le-field"><span>Height</span><input className="tc-input" value="Fits text" disabled /></label>
            ) : (
              <Num label="Height" value={layer.h} min={1} onChange={(v) => set({ h: v })} />
            )}
          </div>
          <Num label="Opacity (0–1)" value={layer.opacity ?? 1} step={0.05} min={0} max={1} onChange={(v) => set({ opacity: Math.min(1, Math.max(0, v)) })} />

          {layer.type === "text" && (
            <>
              <div className="le-subtitle">Text</div>
              <label className="le-field">
                <span>Font</span>
                <select className="tc-input tc-select" value={s.fontFamily ?? "Montserrat"} onChange={(e) => style({ fontFamily: e.target.value })}>
                  {fonts.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                </select>
              </label>
              <div className="le-grid-2">
                <Num label="Size" value={s.fontSize} min={8} onChange={(v) => style({ fontSize: v })} />
                <Num label="Smallest size" value={s.minFontSize} min={8} onChange={(v) => style({ minFontSize: v })} />
                <label className="le-field">
                  <span>Weight</span>
                  <select className="tc-input tc-select" value={String(s.fontWeight ?? 400)} onChange={(e) => style({ fontWeight: Number(e.target.value) })}>
                    {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </label>
                <Num label="Max lines" value={s.maxLines} min={1} onChange={(v) => style({ maxLines: v })} />
                <Num label="Line height" value={s.lineHeight ?? 1.3} step={0.05} min={0.8} onChange={(v) => style({ lineHeight: v })} />
                <Num label="Letter spacing" value={s.letterSpacing ?? 0} step={0.1} onChange={(v) => style({ letterSpacing: v })} />
              </div>
              <ColorField label="Colour" value={s.color} onChange={(v) => style({ color: v })} />
              <div className="le-chips">
                {(["left", "center", "right"] as const).map((a) => (
                  <button key={a} type="button" className={`le-chip${(s.align ?? "left") === a ? " le-chip--on" : ""}`} onClick={() => style({ align: a })}>{a === "center" ? "Centre" : a[0].toUpperCase() + a.slice(1)}</button>
                ))}
                {(["top", "middle", "bottom"] as const).map((a) => (
                  <button key={a} type="button" className={`le-chip${(s.verticalAlign ?? "middle") === a ? " le-chip--on" : ""}`} onClick={() => style({ verticalAlign: a })}>{a[0].toUpperCase() + a.slice(1)}</button>
                ))}
              </div>
              <div className="le-chips">
                {(["none", "uppercase", "capitalize"] as const).map((t) => (
                  <button key={t} type="button" className={`le-chip${(s.textTransform ?? "none") === t ? " le-chip--on" : ""}`} onClick={() => style({ textTransform: t })}>{t === "none" ? "Aa" : t === "uppercase" ? "AA" : "Title"}</button>
                ))}
                <button type="button" className={`le-chip${s.italic ? " le-chip--on" : ""}`} onClick={() => style({ italic: !s.italic })}><i>Italic</i></button>
                <button type="button" className={`le-chip${s.underline ? " le-chip--on" : ""}`} onClick={() => style({ underline: !s.underline })}><u>Underline</u></button>
                <button type="button" className={`le-chip${s.textShadow ? " le-chip--on" : ""}`} onClick={() => style({ textShadow: s.textShadow ? undefined : "0 2px 8px rgba(0,0,0,0.6)" })}>Shadow</button>
                <button type="button" className={`le-chip${s.hug ? " le-chip--on" : ""}`} title="Background hugs the words (for tabs and labels)" onClick={() => style({ hug: !s.hug })}>Hug text</button>
              </div>
              {role === "verse" && (
                <ColorField label="Verse number colour" value={s.verseNumberColor} onChange={(v) => style({ verseNumberColor: v })} />
              )}
              {(role === "verse" || layer.content === "{text}") && (
                <ColorField label="Important words colour (*words*)" value={s.emphasisColor} onChange={(v) => style({ emphasisColor: v })} />
              )}
              {isCountdown && <TimerTextControls s={s} onStyle={style} />}
            </>
          )}

          {layer.type === "image" && (
            <>
              <div className="le-subtitle">Image</div>
              <label className="le-field">
                <span>Image address</span>
                <input className="tc-input" value={s.src ?? ""} placeholder="https://… or data:image/…" onChange={(e) => style({ src: e.target.value })} />
              </label>
              <label className="le-field">
                <span>Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => typeof reader.result === "string" && style({ src: reader.result });
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              <div className="le-chips">
                {(["contain", "cover", "fill"] as const).map((f) => (
                  <button key={f} type="button" className={`le-chip${(s.fit ?? "cover") === f ? " le-chip--on" : ""}`} onClick={() => style({ fit: f })}>{f[0].toUpperCase() + f.slice(1)}</button>
                ))}
              </div>
            </>
          )}

          {layer.type !== "image" && (
            <>
              <div className="le-subtitle">{layer.type === "text" ? "Background behind the text" : layer.type === "box" ? "Background" : "Fill"}</div>
              {layer.type === "box" && themeBg && layer.id === themeBg.id ? (
                <p className="le-hint">This is the theme background. Change it in the Theme background box at the top.</p>
              ) : layer.type === "box" ? (
                <BoxBackground layer={layer} onStyle={style} mediaItems={mediaItems} mediaPreviewSrc={mediaPreviewSrc} onImportMedia={onImportMedia} />
              ) : (
                <>
                  <ColorField label="Fill" value={s.gradient ? undefined : s.fill} allowNone onChange={(v) => style({ fill: v, gradient: undefined })} />
                  {s.gradient && <p className="le-hint">This layer uses a gradient. Picking a fill colour replaces it.</p>}
                </>
              )}
              {isCountdown && layer.type === "box" && <TimerBoxControls s={s} onStyle={style} />}
              <div className="le-grid-2">
                <Num label="Corners" value={s.radius ?? 0} min={0} onChange={(v) => style({ radius: v })} />
                <Num label="Border" value={s.borderWidth ?? 0} min={0} onChange={(v) => style({ borderWidth: v })} />
              </div>
              {(s.borderWidth ?? 0) > 0 && <ColorField label="Border colour" value={s.borderColor} onChange={(v) => style({ borderColor: v })} />}
              {layer.type === "text" && (
                <div className="le-grid-2">
                  <Num label="Padding top/bottom" value={s.padding?.[0] ?? 0} min={0} onChange={(v) => { const p = s.padding ?? [0, 0, 0, 0]; style({ padding: [v, p[1], v, p[3]] }); }} />
                  <Num label="Padding sides" value={s.padding?.[1] ?? 0} min={0} onChange={(v) => { const p = s.padding ?? [0, 0, 0, 0]; style({ padding: [p[0], v, p[2], v] }); }} />
                </div>
              )}
              <div className="le-chips">
                <button type="button" className={`le-chip${s.shadow ? " le-chip--on" : ""}`} onClick={() => style({ shadow: s.shadow ? undefined : "0 12px 30px rgba(0,0,0,0.35)" })}>Drop shadow</button>
                <button type="button" className={`le-chip${s.backdropBlur ? " le-chip--on" : ""}`} title="Frosted glass. Heavier for OBS; use on one layer at most." onClick={() => style({ backdropBlur: s.backdropBlur ? undefined : 12 })}>Glass blur</button>
              </div>
            </>
          )}

          <div className="le-subtitle">Animation</div>
          <AnimField label="Animate in" value={layer.in} onChange={(v) => set({ in: v })} />
          <AnimField label="Animate out" value={layer.out} onChange={(v) => set({ out: v })} />
        </div>
      )}
    </div>
  );
}
