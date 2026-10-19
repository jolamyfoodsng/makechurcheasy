/**
 * TextSettingsCard.tsx — "Text Settings" card of the Studio controls: size, style (bold, italic,
 * alignment), colour, shadow and background for the words on the screen. They sit on top of any theme.
 */
import { useEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Italic, Bold, Minus, Plus, RotateCcw, Type } from "../../components/icons/NativeIcons";
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN } from "./QuickText";
import {
  isDefaultTextLook,
  nextTextAlign,
  TEXT_BACKGROUNDS,
  textBackgroundPreset,
  type StudioTextLook,
  type TextBackgroundPreset,
} from "../textLook";
import type { StudioTransition } from "../studioEngine";

const COLOR_FALLBACK = "#ffffff";

interface Props {
  textScale: number;
  onTextScale: (percent: number) => void;
  bold: boolean;
  italic: boolean;
  onBold: (on: boolean) => void;
  onItalic: (on: boolean) => void;
  look: StudioTextLook;
  onLook: (patch: Partial<StudioTextLook>) => void;
  transition: StudioTransition;
  onTransition: (value: StudioTransition) => void;
  disabled?: boolean;
}

function swatch(preset: TextBackgroundPreset): string {
  return preset.from === preset.to ? preset.from : `linear-gradient(135deg, ${preset.from}, ${preset.to})`;
}

export default function TextSettingsCard(props: Props) {
  const { look } = props;
  const [bgOpen, setBgOpen] = useState(false);
  const bgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bgOpen) return undefined;
    const onDown = (e: PointerEvent) => { if (bgRef.current && !bgRef.current.contains(e.target as Node)) setBgOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBgOpen(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [bgOpen]);

  const changed = props.textScale !== 100 || props.bold || props.italic || !isDefaultTextLook(look);
  const background = textBackgroundPreset(look.background) ?? TEXT_BACKGROUNDS[0];
  const shadowOn = look.shadow !== "off";
  const AlignIcon = look.align === "left" ? AlignLeft : look.align === "right" ? AlignRight : AlignCenter;
  const alignHint = look.align === "theme" ? "Alignment: as the theme (click to change)" : `Alignment: ${look.align} (click to change)`;

  return (
    <section className={`st-lo__mini st-textcard${props.disabled ? " is-disabled" : ""}`} aria-label="Text Settings">
      <div className="st-lo__minihead">
        <strong><Type size={15} /> Text Settings</strong>
        <button type="button" className="st-lo__ib st-lo__ib--plain" disabled={!changed} onClick={() => { props.onTextScale(100); props.onBold(false); props.onItalic(false); props.onLook({ color: "", shadow: "theme", align: "theme", background: "theme" }); }} aria-label="Back to the theme's look" title="Back to the theme's own look">
          <RotateCcw size={13} />
        </button>
      </div>

      <div className="st-textcard__row">
        <span className="st-textcard__label">Size</span>
        <div className="st-textcard__step" role="group" aria-label="Text size">
          <button type="button" onClick={() => props.onTextScale(Math.max(TEXT_SCALE_MIN, props.textScale - 10))} disabled={props.disabled || props.textScale <= TEXT_SCALE_MIN} aria-label="Smaller text" title="Smaller text (Ctrl/Cmd -)"><Minus size={14} /></button>
          <span title="Text size compared to the theme">{props.textScale}%</span>
          <button type="button" onClick={() => props.onTextScale(Math.min(TEXT_SCALE_MAX, props.textScale + 10))} disabled={props.disabled || props.textScale >= TEXT_SCALE_MAX} aria-label="Bigger text" title="Bigger text (Ctrl/Cmd +)"><Plus size={14} /></button>
        </div>
      </div>

      <div className="st-textcard__row">
        <span className="st-textcard__label">Style</span>
        <div className="st-textcard__seg" role="group" aria-label="Text style">
          <button type="button" className={props.bold ? "is-on" : ""} onClick={() => props.onBold(!props.bold)} aria-pressed={props.bold} disabled={props.disabled} aria-label="Bold" title="Bolder text"><Bold size={14} /></button>
          <button type="button" className={props.italic ? "is-on" : ""} onClick={() => props.onItalic(!props.italic)} aria-pressed={props.italic} disabled={props.disabled} aria-label="Italic" title="Italic text"><Italic size={14} /></button>
          <button type="button" className={look.align !== "theme" ? "is-on" : ""} onClick={() => props.onLook({ align: nextTextAlign(look.align) })} disabled={props.disabled} aria-label="Alignment" title={alignHint}><AlignIcon size={14} /></button>
        </div>
      </div>

      <div className="st-textcard__row">
        <span className="st-textcard__label">Color</span>
        <label className={`st-textcard__color${look.color ? "" : " is-theme"}`} title={look.color ? "Text colour (right-click to go back to the theme's)" : "Text colour: as the theme. Pick one to change it."} onContextMenu={(e) => { if (look.color) { e.preventDefault(); props.onLook({ color: "" }); } }}>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(look.color) ? look.color : COLOR_FALLBACK} onChange={(e) => props.onLook({ color: e.target.value })} disabled={props.disabled} aria-label="Text colour" />
          <i style={{ background: look.color || COLOR_FALLBACK }} />
        </label>
      </div>

      <div className="st-textcard__row">
        <span className="st-textcard__label">Shadow</span>
        <button type="button" role="switch" aria-checked={shadowOn} className={`st-textcard__switch${shadowOn ? " is-on" : ""}`} onClick={() => props.onLook({ shadow: shadowOn ? "off" : "on" })} disabled={props.disabled} aria-label="Text shadow" title={shadowOn ? "Shadow on. Click to remove it." : "Shadow off. Click to add it."}>
          <i />
        </button>
      </div>

      <div className="st-textcard__row">
        <span className="st-textcard__label">Background</span>
        <div className="st-textcard__bg" ref={bgRef}>
          <button type="button" className="st-textcard__bgbtn" onClick={() => setBgOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={bgOpen} aria-label={`Background: ${background.label}`} title={`Background: ${background.label}`}>
            <i style={{ background: swatch(background) }} />
            <ChevronDown size={14} />
          </button>
          {bgOpen && (
            <ul className="st-textcard__bgmenu" role="listbox" aria-label="Background">
              {TEXT_BACKGROUNDS.map((preset) => (
                <li key={preset.id}>
                  <button type="button" role="option" aria-selected={look.background === preset.id} className={look.background === preset.id ? "is-on" : ""} onClick={() => { props.onLook({ background: preset.id }); setBgOpen(false); }}>
                    <i style={{ background: swatch(preset) }} />
                    <span>{preset.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="st-textcard__row">
        <span className="st-textcard__label">Change</span>
        <div className="st-textcard__seg" role="group" aria-label="Change between slides">
          <button type="button" className={props.transition === "fade" ? "is-on" : ""} onClick={() => props.onTransition("fade")}>Fade</button>
          <button type="button" className={props.transition === "cut" ? "is-on" : ""} onClick={() => props.onTransition("cut")}>Cut</button>
        </div>
      </div>
    </section>
  );
}
