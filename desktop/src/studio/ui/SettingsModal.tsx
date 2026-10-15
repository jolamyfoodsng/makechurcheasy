/**
 * SettingsModal.tsx — Studio settings in one dialog: quick controls (what a click does, the
 * change between slides, text size) and the Output (projector / TV, Wi-Fi link, NDI).
 */
import { useState } from "react";
import { Check, Copy, Image as ImageIcon, Minus, Monitor, MonitorOff, Plus, Radio, RotateCcw, Wifi } from "lucide-react";
import type { StudioTransition } from "../studioEngine";
import { monitorLabel, type StudioMonitor } from "../studioOutputWindow";
import StudioModal from "./StudioModal";
import ShortcutsPanel from "./ShortcutsPanel";
import "./ShortcutsPanel.css";

export type SettingsTab = "general" | "shortcuts";

export interface SettingsOutputProps {
  monitors: StudioMonitor[];
  monitorKey: string;
  onMonitorKey: (key: string) => void;
  outputOpen: boolean;
  outputName: string;
  busy: boolean;
  onOpen: (target: string) => void;
  onCloseOutput: () => void;
  wifiLink: string;
  copied: boolean;
  onCopy: () => void;
}

/** What is behind the logo on the screen. */
export interface LogoBg {
  kind: "default" | "color" | "image";
  /** The colour used when kind is "color" (also the colour picker's last value). */
  color: string;
  /** A picture (data URL) used when kind is "image". */
  image: string;
}

const BG_SWATCHES: Array<{ name: string; color: string }> = [
  { name: "White", color: "#ffffff" },
  { name: "Navy", color: "#0b1f4d" },
  { name: "Blue", color: "#0a3be8" },
  { name: "Grey", color: "#1f2937" },
  { name: "Green", color: "#0f5132" },
  { name: "Maroon", color: "#6b1020" },
];

function bgStyle(bg: LogoBg): React.CSSProperties {
  if (bg.kind === "color") return { background: bg.color };
  if (bg.kind === "image" && bg.image) return { background: `center / cover no-repeat url("${bg.image}")` };
  return {};
}

export interface SettingsLogoProps {
  /** The logo shown by the Logo button ("" = none, so the MakeChurchEazy picture shows). */
  url: string;
  /** Picked here in the Studio (not the church profile logo). */
  custom: boolean;
  onPick: (file: File) => void;
  onReset: () => void;
  /** Logo size on the screen in percent (100 = normal). */
  scale: number;
  onScale: (percent: number) => void;
  /** What is behind the logo. */
  bg: LogoBg;
  onBg: (bg: LogoBg) => void;
  onPickBgImage: (file: File) => void;
}

interface SettingsModalProps {
  logo: SettingsLogoProps;
  previewFirst: boolean;
  onPreviewFirst: (value: boolean) => void;
  transition: StudioTransition;
  onTransition: (value: StudioTransition) => void;
  textScale: number;
  onTextScale: (percent: number) => void;
  onResetLayout: () => void;
  output: SettingsOutputProps;
  /** Which tab opens first (Ctrl/Cmd+/ opens the shortcuts one). */
  initialTab?: SettingsTab;
  onClose: () => void;
}

export default function SettingsModal(props: SettingsModalProps) {
  const { output } = props;
  const [tab, setTab] = useState<SettingsTab>(props.initialTab ?? "general");
  const size = (delta: number) => props.onTextScale(Math.max(70, Math.min(160, props.textScale + delta)));
  return (
    <StudioModal title="Studio settings" onClose={props.onClose} wide>
      <div className="st-settabs" role="tablist" aria-label="Settings">
        <button type="button" role="tab" aria-selected={tab === "general"} className={tab === "general" ? "is-on" : ""} onClick={() => setTab("general")}>General</button>
        <button type="button" role="tab" aria-selected={tab === "shortcuts"} className={tab === "shortcuts" ? "is-on" : ""} onClick={() => setTab("shortcuts")}>Keyboard shortcuts</button>
      </div>

      {tab === "shortcuts" && <ShortcutsPanel />}

      {tab === "general" && (<>
      <section className="st-set">
        <h3>Quick controls</h3>
        <div className="st-set__row">
          <span>Clicking an item</span>
          <div className="st-seg" role="group" aria-label="Clicking an item">
            <button type="button" className={props.previewFirst ? "is-on" : ""} onClick={() => props.onPreviewFirst(true)}>Previews it</button>
            <button type="button" className={!props.previewFirst ? "is-on" : ""} onClick={() => props.onPreviewFirst(false)}>Shows it at once</button>
          </div>
        </div>
        <div className="st-set__row">
          <span>Change between slides</span>
          <div className="st-seg" role="group" aria-label="Change between slides">
            <button type="button" className={props.transition === "fade" ? "is-on" : ""} onClick={() => props.onTransition("fade")}>Fade (animated)</button>
            <button type="button" className={props.transition === "cut" ? "is-on" : ""} onClick={() => props.onTransition("cut")}>Cut</button>
          </div>
        </div>
        <div className="st-set__row">
          <span>Text size</span>
          <div className="st-stepper st-stepper--size">
            <button type="button" className="st-iconbtn" onClick={() => size(-5)} aria-label="Smaller text"><Minus size={14} /></button>
            <input
              type="range"
              min={70}
              max={160}
              step={5}
              value={props.textScale}
              onChange={(e) => props.onTextScale(Number(e.target.value))}
              aria-label="Text size"
            />
            <button type="button" className="st-iconbtn" onClick={() => size(5)} aria-label="Bigger text"><Plus size={14} /></button>
            <output>{props.textScale}%</output>
            <button type="button" className="st-iconbtn" onClick={() => props.onTextScale(100)} disabled={props.textScale === 100} aria-label="Back to the theme's size" title="Back to the theme's size"><RotateCcw size={13} /></button>
          </div>
        </div>
        <div className="st-set__row">
          <span>Panel sizes</span>
          <button type="button" className="studio-btn" onClick={props.onResetLayout}>Reset panel sizes</button>
        </div>
        <p className="st-set__hint">
          Keys for everything are in the <button type="button" className="st-linkbtn" onClick={() => setTab("shortcuts")}>Keyboard shortcuts</button> tab.
          The main ones: Space or Page Down shows the next one · Page Up goes back · Ctrl/Cmd+1 Bible · Ctrl/Cmd+2 Text · Ctrl/Cmd+K search.
        </p>
      </section>

      <section className="st-set">
        <h3><ImageIcon size={14} /> Logo on the screen</h3>
        <div className="st-logoset">
          <div className={`st-logoset__img${props.logo.bg.kind === "default" ? "" : " has-bg"}`} style={bgStyle(props.logo.bg)}>{props.logo.url ? <img src={props.logo.url} alt="Logo" /> : <span>MakeChurchEazy</span>}</div>
          <div className="st-set__buttons">
            <label className="studio-btn studio-btn--primary st-logoset__pick">
              <input type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) props.logo.onPick(file); }} />
              Choose a logo…
            </label>
            {props.logo.custom && <button type="button" className="studio-btn" onClick={props.logo.onReset}>Use my church logo</button>}
          </div>
        </div>
        <div className="st-set__row st-logosize">
          <span>Logo size</span>
          <div className="st-stepper st-stepper--size">
            <button type="button" className="st-iconbtn" onClick={() => props.logo.onScale(props.logo.scale - 10)} aria-label="Smaller logo"><Minus size={14} /></button>
            <input type="range" min={30} max={250} step={5} value={props.logo.scale} onChange={(e) => props.logo.onScale(Number(e.target.value))} aria-label="Logo size" />
            <button type="button" className="st-iconbtn" onClick={() => props.logo.onScale(props.logo.scale + 10)} aria-label="Bigger logo"><Plus size={14} /></button>
            <output>{props.logo.scale}%</output>
            <button type="button" className="st-iconbtn" onClick={() => props.logo.onScale(100)} disabled={props.logo.scale === 100} aria-label="Normal size" title="Normal size"><RotateCcw size={13} /></button>
          </div>
        </div>
        <div className="st-logobg" role="group" aria-label="Logo background">
          <span className="st-logobg__label">Background</span>
          <div className="st-logobg__row">
            <button type="button" className={`st-logobg__chip${props.logo.bg.kind === "default" ? " is-on" : ""}`} onClick={() => props.logo.onBg({ ...props.logo.bg, kind: "default" })} aria-pressed={props.logo.bg.kind === "default"}>Default</button>
            {BG_SWATCHES.map((sw) => (
              <button
                key={sw.color}
                type="button"
                className={`st-logobg__swatch${props.logo.bg.kind === "color" && props.logo.bg.color.toLowerCase() === sw.color ? " is-on" : ""}`}
                style={{ background: sw.color }}
                onClick={() => props.logo.onBg({ ...props.logo.bg, kind: "color", color: sw.color })}
                title={sw.name}
                aria-label={`${sw.name} background`}
              />
            ))}
            <label className="st-logobg__chip st-logobg__custom" title="Pick any colour">
              <input type="color" value={props.logo.bg.color} onChange={(e) => props.logo.onBg({ ...props.logo.bg, kind: "color", color: e.target.value })} aria-label="Pick a background colour" />
              <span>Any colour</span>
            </label>
            <label className={`st-logobg__chip${props.logo.bg.kind === "image" ? " is-on" : ""}`}>
              <input type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) props.logo.onPickBgImage(file); }} />
              Picture…
            </label>
          </div>
        </div>
        <p className="st-set__hint">The Logo button shows this on the screen, in the middle, over the background you pick. {props.logo.custom ? "You picked this one for the Studio." : props.logo.url ? "It comes from your church profile." : "No church logo is set yet, so the MakeChurchEazy picture shows."}</p>
      </section>

      <section className="st-set st-set--share">
        <h3><Wifi size={14} /> Share over Wi-Fi</h3>
        {output.wifiLink ? (
          <div className="studio-link">
            <code>{output.wifiLink}</code>
            <button type="button" className="studio-btn" onClick={output.onCopy}>
              {output.copied ? <Check size={14} /> : <Copy size={14} />} {output.copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <p className="st-set__hint">Connect this computer to Wi-Fi (or turn on a phone hotspot) to get a link other screens can open.</p>
        )}
        <p className="st-set__hint">
          Open this link on a smart TV, a laptop, a phone or tablet, or in OBS as a Browser Source. The other screen must be on the
          same Wi-Fi as this computer. No Wi-Fi? Turn on a phone hotspot, join it from both devices, and use the link shown here.
          The link shows what the Studio is sending, so it only works while the Studio is open.
        </p>
        <p className="st-set__hint st-set__hint--soon"><Radio size={12} /> NDI is coming soon, for video switchers and other computers on your network.</p>
      </section>

      <section className="st-set">
        <h3><Monitor size={14} /> Output · projector or TV (HDMI)</h3>
        <select value={output.monitorKey} onChange={(e) => output.onMonitorKey(e.target.value)} aria-label="Screen">
          {output.monitors.length === 0 && <option value="">No screens found</option>}
          {output.monitors.map((m) => (
            <option key={m.key} value={m.key}>{monitorLabel(m)}{m.isControlScreen ? " · this screen" : ""}</option>
          ))}
        </select>
        <div className="st-set__buttons">
          <button type="button" className="studio-btn studio-btn--primary" disabled={output.busy || !output.monitorKey} onClick={() => output.onOpen(output.monitorKey)}>
            <Monitor size={14} /> {output.outputOpen ? "Move output here" : "Open output"}
          </button>
          <button type="button" className="studio-btn" disabled={output.busy} onClick={() => output.onOpen("window")}>New window</button>
          {output.outputOpen && (
            <button type="button" className="studio-btn" onClick={output.onCloseOutput}><MonitorOff size={14} /> Close output</button>
          )}
        </div>
        <p className="st-set__hint">
          {output.outputOpen ? `Output is on ${output.outputName || "a screen"}. ` : "No output is open yet. "}
          It is drawn at 1920 × 1080. Press Esc on it to close it.
        </p>
      </section>

      </>)}
    </StudioModal>
  );
}
