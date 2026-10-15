/**
 * PreviewPanel.tsx — the "Live Output" column.
 *
 *  Header    green dot (output open), LIVE badge and how long something has been on the screen.
 *  Screen    one big monitor: what the congregation sees. "Preview" flips it to what is next.
 *  Buttons   Preview | Send to Screen (Space) with a menu (Preview first / Straight to screen, Logo,
 *            Previous / Next) | Clear | bigger view.
 *  Display   Full Screen / Lower Third tiles, and a small Options box (Fade / Cut, text size).
 *  Below     the Theme strip and the Camera card (passed in as children).
 *  Compare   (Bible) the previewed verse in every installed translation (button in the Bible bar).
 */
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, Zap, Expand, Image as ImageIcon, Minus, Monitor, MonitorOff, PanelBottom, Plus, SlidersHorizontal, Timer } from "lucide-react";
import StudioModal from "./StudioModal";
import StudioMenu, { menuAt, type StudioMenuState } from "./StudioMenu";
import type { BibleTheme } from "../../bible/types";
import type { StudioCameraLayout, StudioMode, StudioScreen, StudioSlide, StudioTransition } from "../studioEngine";

/** The camera as drawn on a monitor: the Studio's own picture, so the camera is opened only once. */
export interface CamOverlay {
  enabled: boolean;
  layout: StudioCameraLayout;
  stream: MediaStream | null;
}

function CamVideo({ cam }: { cam: CamOverlay }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    video.srcObject = cam.stream;
    if (cam.stream) void video.play().catch(() => undefined);
    return undefined;
  }, [cam.stream]);
  return (
    <div className={`st-frame__cam st-frame__cam--${cam.layout}`} aria-hidden="true">
      {cam.stream ? <video ref={ref} autoPlay muted playsInline /> : <span>CAMERA</span>}
    </div>
  );
}

/** A 1920×1080 page scaled to fit its box, so the monitor looks exactly like the screen. */
export function ScaledFrame({ src, title, cam }: { src: string; title: string; cam?: CamOverlay }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const update = () => setScale(Math.max(0.05, box.clientWidth / 1920));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const showCam = Boolean(cam && cam.enabled && cam.layout !== "hidden");
  // With a camera overlay the page is told not to open the camera itself and to stay transparent.
  const frameSrc = cam && src ? `${src}${src.includes("?") ? "&" : "?"}nocam=1` : src;
  return (
    <div ref={boxRef} className="studio-frame st-frame">
      {showCam && cam && cam.layout !== "in-front" && <CamVideo cam={cam} />}
      {frameSrc && <iframe title={title} src={frameSrc} tabIndex={-1} style={{ transform: `scale(${scale})` }} />}
      {showCam && cam && cam.layout === "in-front" && <CamVideo cam={cam} />}
      {/* Catches clicks so right-click opens the Studio menu, not the webview's "Inspect" menu. */}
      <div className="studio-frame__shield" aria-hidden="true" />
    </div>
  );
}

export type PreviewTab = "preview" | "output" | "compare";

export interface CompareRow {
  translation: string;
  text: string;
}

interface PreviewPanelProps {
  tab: PreviewTab;
  onTab: (tab: PreviewTab) => void;
  previewUrl: string;
  outputUrl: string;
  previewSlide: StudioSlide | null;
  liveSlide: StudioSlide | null;
  screen: StudioScreen;
  outputConnected: boolean;
  outputName: string;
  compare: CompareRow[] | null;
  compareLoading: boolean;
  onUseTranslation: (translation: string) => void;
  displayMode: StudioMode;
  onDisplayMode: (mode: StudioMode) => void;
  /** Bible / Worship / Notes have looks; pictures and videos don't. */
  hasLook: boolean;
  currentTheme: BibleTheme | null;
  onOpenThemes: () => void;
  transition: StudioTransition;
  onTransition: (value: StudioTransition) => void;
  textScale: number;
  onTextScale: (percent: number) => void;
  onMonitorMenu: (feed: "preview" | "program", event: React.MouseEvent<HTMLDivElement>) => void;
  /** Playback bars for the video / sound on the screen (shown under the screen). */
  playback?: React.ReactNode;
  /** A short line when something hides the words on the screen (e.g. Camera Only). */
  notice?: string;
  /** "Preview first" (check it, then Go Live) or "Straight to screen" (what you pick goes live at once). */
  previewFirst: boolean;
  onPreviewFirst: (value: boolean) => void;
  /** Go Live (big, beside Preview) and Clear (kept apart from it). */
  canGoLive: boolean;
  onGoLive: () => void;
  onClear: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Black screen stays on the B key and the right-click menu; it has no button here. */
  blackOn?: boolean;
  onBlack?: () => void;
  /** The logo on the screen (button at the top). */
  logoOn: boolean;
  onLogo: () => void;
  canSchedule: boolean;
  onSchedule: () => void;
  /** The next schedule item, shown as a one-click button ("N" key). Hidden while the Schedule is open. */
  nextLabel?: string;
  onNextItem?: () => void;
  /** The camera as arranged in Preview, and as it is on the screen now. */
  previewCam?: CamOverlay;
  liveCam?: CamOverlay;
  /** The camera card: sits under the Show Bible / Text card. */
  cameraCard?: React.ReactNode;
  /** "Show Bible / Lyrics / Text": the words are on the screen or hidden. */
  wordsOn: boolean;
  /** The camera is off, so Show Bible / Text stays on and its switch is disabled. */
  wordsLocked?: boolean;
  onWords: (on: boolean) => void;
  wordsLabel: string;
  /** More under the Display / Camera row (the theme strip). */
  children?: React.ReactNode;
  /** A document page is showing: the mouse wheel over the monitor scrolls it (deltaY in pixels). */
  onWheelScroll?: (deltaY: number) => void;
}

function slideName(slide: StudioSlide | null): string {
  if (!slide) return "";
  return slide.reference || `${slide.itemTitle}${slide.label ? ` · ${slide.label}` : ""}`;
}

export default function PreviewPanel(props: PreviewPanelProps) {
  const { tab, onTab, previewSlide, liveSlide, screen, displayMode, hasLook } = props;
  const [max, setMax] = useState(false);
  const [opts, setOpts] = useState(false);
  const [menu, setMenu] = useState<StudioMenuState | null>(null);
  const optsRef = useRef<HTMLDivElement>(null);

  // The small "Options" box (Fade / Cut and text size) closes on a click outside it or Esc.
  useEffect(() => {
    if (!opts) return undefined;
    const onDown = (e: PointerEvent) => { if (optsRef.current && !optsRef.current.contains(e.target as Node)) setOpts(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpts(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [opts]);

  const liveText = screen === "black" ? "Black screen" : screen === "logo" ? "Logo" : slideName(liveSlide) || "Nothing on the screen";
  const hasLive = Boolean(liveSlide) || screen !== "live";
  const onAir = hasLive || Boolean(props.liveCam?.enabled);
  // Words off: the look (Full Screen / Lower Third, Fade / Cut, text size) has nothing to do.
  const wordsOff = !props.wordsOn;
  const shown = props.wordsOn || Boolean(props.wordsLocked);
  const showFrame = tab === "preview" || tab === "output";

  // How long something has been on the screen without a break (00:00:00 when nothing is).
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setSince((current) => (onAir ? current ?? Date.now() : null)); }, [onAir]);
  useEffect(() => {
    if (since === null) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  const seconds = since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
  const clock = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n) => String(n).padStart(2, "0")).join(":");

  const openSendMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu(menuAt({ clientX: rect.right - 215, clientY: rect.bottom + 6 }, [
      { label: "Preview first", icon: props.previewFirst ? <Check size={14} /> : <Eye size={14} />, hint: props.previewFirst ? "On" : undefined, onSelect: () => props.onPreviewFirst(true) },
      { label: "Straight to screen", icon: !props.previewFirst ? <Check size={14} /> : <Zap size={14} />, hint: !props.previewFirst ? "On" : undefined, onSelect: () => props.onPreviewFirst(false) },
      { label: "Previous on the screen", icon: <ChevronLeft size={14} />, divider: true, hint: "Page Up", onSelect: props.onPrev },
      { label: "Next on the screen", icon: <ChevronRight size={14} />, hint: "Page Down", onSelect: props.onNext },
    ]));
  };

  return (
    <section className="st-preview st-lo" aria-label="Live Output">
      <div className="st-lo__head">
        <span className={`st-lo__dot${props.outputConnected ? " is-ok" : ""}`} title={props.outputConnected ? `On the screen${props.outputName ? ` · ${props.outputName}` : ""}` : "No output open yet. Press Start output at the top."} role="img" aria-label={props.outputConnected ? "Output open" : "No output open"} />
        <strong>Live Output</strong>
        <span className={`st-lo__badge${onAir ? " is-live" : ""}`}>{onAir ? "LIVE" : "OFF AIR"}</span>
        <span className="st-lo__timer" title="How long something has been on the screen"><Timer size={14} /> {clock}</span>
        <button type="button" className={`st-lo__logo${props.logoOn ? " is-on" : ""}`} onClick={props.onLogo} aria-pressed={props.logoOn} title={props.logoOn ? "Hide the church logo" : "Show the church logo on the screen"}>
          <ImageIcon size={13} /> <span>Logo</span>
        </button>
      </div>

      <div className="st-preview__stage">
        {showFrame && (
          <div className={`st-monitor${tab === "output" ? " is-output" : ""}`} onWheel={props.onWheelScroll ? (e) => props.onWheelScroll?.(e.deltaY) : undefined} onContextMenu={(e) => props.onMonitorMenu(tab === "output" ? "program" : "preview", e)}>
            <ScaledFrame title={tab === "output" ? "Output" : "Preview"} src={tab === "output" ? props.outputUrl : props.previewUrl} cam={tab === "output" ? props.liveCam : props.previewCam} />
            {tab === "output" && !hasLive && !props.liveCam?.enabled && (
              <span className="st-livemini__empty" aria-label="Nothing live yet"><MonitorOff size={22} /></span>
            )}
            <div className="st-monitor__label">
              {tab === "output" ? <span className="st-tag st-tag--live">LIVE</span> : <span className="st-tag st-tag--prev">PREVIEW</span>}
              <span className="st-monitor__name">{tab === "output" ? liveText : slideName(previewSlide) || "Click something to preview it"}</span>
              {tab === "preview" && <em className="st-monitor__hint">next · not on the screen yet</em>}
              <span className="st-monitor__tools">
                <button type="button" className="st-iconbtn st-iconbtn--sm" disabled={!props.canSchedule} onClick={props.onSchedule} title="Add to Schedule" aria-label="Add to Schedule"><CalendarPlus size={14} /></button>
                <button type="button" className="st-iconbtn st-iconbtn--sm" onClick={() => setMax(true)} title="Bigger view" aria-label="Bigger view"><Expand size={14} /></button>
              </span>
            </div>
          </div>
        )}
        {tab === "compare" && (
          <div className="st-compare">
            <div className="st-compare__top">
              <strong>Compare translations</strong>
              <button type="button" className="st-linkbtn" onClick={() => onTab("preview")}>Back to Preview</button>
            </div>
            {!previewSlide || previewSlide.module !== "bible" ? (
              <div className="st-empty">Select a Bible verse to compare it across your translations.</div>
            ) : props.compareLoading && !props.compare ? (
              <div className="st-empty">Loading translations…</div>
            ) : (
              (props.compare ?? []).map((row) => (
                <div key={row.translation} className="st-compare__row">
                  <div className="st-compare__head">
                    <strong>{row.translation}</strong>
                    <button type="button" className="st-chip" onClick={() => { props.onUseTranslation(row.translation); onTab("preview"); }}>Use</button>
                  </div>
                  <p>{row.text || <em>Not in this translation.</em>}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="st-lo__actions st-lo__actions--simple">
        <div className="st-lo__send st-lo__send--color">
          <button type="button" className="st-lo__sendmain" onClick={props.onGoLive} disabled={!props.canGoLive} title={props.previewFirst ? "Show Preview on the screen (Space)" : "Send to the screen (Space)"}>
            <Monitor size={16} /> <span>Send to Screen</span> <kbd>Space</kbd>
          </button>
          <button type="button" className="st-lo__sendmenu" onClick={openSendMenu} aria-haspopup="menu" aria-label="Send options" title={props.previewFirst ? "Preview first is on. Change it here." : "Straight to screen is on. Change it here."}>
            <ChevronDown size={15} />
          </button>
        </div>
        <button type="button" className="st-lo__clear" onClick={props.onClear} disabled={!onAir} title="Take everything off the screen (it fades out)">
          <MonitorOff size={15} /> <span>Clear</span>
        </button>
      </div>

      {max && showFrame && (
        <StudioModal
          big
          title={tab === "output" ? `On the screen · ${liveText}` : `Preview · ${slideName(previewSlide) || "nothing chosen yet"}`}
          onClose={() => setMax(false)}
        >
          <div className="st-bigview">
            <ScaledFrame title={tab === "output" ? "Output (big)" : "Preview (big)"} src={tab === "output" ? props.outputUrl : props.previewUrl} cam={tab === "output" ? props.liveCam : props.previewCam} />
          </div>
        </StudioModal>
      )}

      {props.nextLabel && props.onNextItem && (
        <button type="button" className="st-nextitem" onClick={props.onNextItem} title="Show the next item in the schedule (N)">
          <span className="st-nextitem__label">Next in schedule</span>
          <span className="st-nextitem__name">{props.nextLabel}</span>
          <kbd>N</kbd>
          <ChevronRight size={15} />
        </button>
      )}

      {props.playback}

      <div className="st-lo__stack">
        <section className="st-lo__mini st-lo__words" aria-label={props.wordsLabel}>
          <div className="st-lo__minihead">
            <strong>{props.wordsLabel}</strong>
            <div className="st-lo__headright">
              {hasLook && (
                <div className="st-lookopts" ref={optsRef}>
                  <button type="button" className={`st-lo__ib st-lo__ib--plain${opts ? " is-on" : ""}`} disabled={wordsOff} onClick={() => setOpts((v) => !v)} aria-expanded={opts} aria-label="Fade or cut, and text size" title="Fade or cut, and text size">
                    <SlidersHorizontal size={16} />
                  </button>
                  {opts && (
                    <div className="st-lookopts__pop">
                      <div className="st-lookopts__row">
                        <span>Change between slides</span>
                        <div className="st-seg" role="group" aria-label="Change between slides">
                          <button type="button" className={props.transition === "fade" ? "is-on" : ""} onClick={() => props.onTransition("fade")}>Fade</button>
                          <button type="button" className={props.transition === "cut" ? "is-on" : ""} onClick={() => props.onTransition("cut")}>Cut</button>
                        </div>
                      </div>
                      <div className="st-lookopts__row">
                        <span>Text size</span>
                        <div className="st-sizer" role="group" aria-label="Text size">
                          <button type="button" onClick={() => props.onTextScale(Math.max(70, props.textScale - 5))} aria-label="Smaller text"><Minus size={13} /></button>
                          <span>{props.textScale}%</span>
                          <button type="button" onClick={() => props.onTextScale(Math.min(160, props.textScale + 5))} aria-label="Bigger text"><Plus size={13} /></button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button type="button" className={`st-cm__btn st-cm__toggle${shown ? " is-on" : " is-off"}`} disabled={props.wordsLocked} onClick={() => props.onWords(!shown)} aria-pressed={shown} aria-label={props.wordsLabel} title={props.wordsLocked ? "The camera is off, so the words stay on. Turn the camera on to be able to hide them." : props.wordsOn ? "Hide: take the words off the screen. Click again to show them." : "Show: put the words on the screen."}>
                <span>{shown ? "Hide" : "Show"}</span>
              </button>
            </div>
          </div>
          {hasLook && (
            <div className={`st-lo__tiles2${wordsOff ? " is-dim" : ""}`} role="group" aria-label="How the words show" title={wordsOff ? "The words are hidden. Turn the switch on to use these." : undefined}>
              <button type="button" className={`st-lo__t${displayMode === "fullscreen" ? " is-on" : ""}`} disabled={wordsOff} onClick={() => props.onDisplayMode("fullscreen")} aria-pressed={displayMode === "fullscreen"} title="Full Screen: words fill the whole screen">
                <Monitor size={18} />
                <span>Full Screen</span>
              </button>
              <button type="button" className={`st-lo__t${displayMode === "lower-third" ? " is-on" : ""}`} disabled={wordsOff} onClick={() => props.onDisplayMode("lower-third")} aria-pressed={displayMode === "lower-third"} title="Lower Third: a bar across the bottom">
                <PanelBottom size={18} />
                <span>Lower Third</span>
              </button>
            </div>
          )}
        </section>
        {props.cameraCard}
      </div>

      {props.children}
      <StudioMenu menu={menu} onClose={() => setMenu(null)} />
    </section>
  );
}
