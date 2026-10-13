/**
 * StudioPage.tsx — Presentation Studio: run the projector without OBS.
 *
 * Left: the real Dock (the same component as /dock.html in OBS), so Bible,
 * Worship, Notes, Media and Full / Lower third work exactly as in OBS.
 * Right: Preview | Go live | Program, and projectors on any screen.
 *
 * Whatever the Dock puts on screen comes through studioDockSink and goes to
 * Program (or to Preview first, when "Preview first" is on).
 * Modelled on OBS Studio Mode (Preview / Program, right-click → Open Projector).
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Eye,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorOff,
  MonitorPlay,
  Play,
  Radio,
  Square,
  Sun,
  Wifi,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import DockPage from "../dock/DockPage";
import { getSettings as getMvSettings } from "../multiview/mvStore";
import {
  clearProgram,
  goLiveItem,
  previewMonitorUrl,
  programFrameUrl,
  setPreviewItem,
  setProgramScreen,
  studioBaseUrl,
  type StudioItem,
  type StudioMode,
  type StudioScreen,
  type StudioTransition,
} from "../studio/studioEngine";
import { dockItemMode, studioItemFromDock, studioItemFromMedia } from "../studio/studioDockAdapter";
import { setStudioDockSink, type StudioDockEvent } from "../studio/studioDockSink";
import {
  closeAllProjectors,
  closeProjector,
  listOpenProjectors,
  listStudioMonitors,
  monitorLabel,
  onProjectorsChange,
  openProjector,
  pickDefaultMonitorKey,
  saveOutputMonitor,
  type OpenProjector,
  type ProjectorFeed,
  type StudioMonitor,
} from "../studio/studioOutputWindow";
import "./StudioPage.css";

const PREFS_KEY = "mce-studio-prefs";
const IMMERSIVE_CLASS = "studio-immersive";

interface StudioPrefs {
  transition: StudioTransition;
  previewFirst: boolean;
}

function readPrefs(): StudioPrefs {
  const fallback: StudioPrefs = { transition: "fade", previewFirst: false };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<StudioPrefs>) } : fallback;
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: StudioPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function logoUrlFromPath(path: string): string {
  const value = (path || "").trim();
  if (!value) return "";
  if (/^(data:|https?:|blob:)/i.test(value) || value.startsWith("/uploads/")) return value;
  const name = value.replace(/^file:\/\//i, "").split(/[\\/]/).pop();
  return name ? `/uploads/${encodeURIComponent(name)}` : "";
}

/** A 1920×1080 page scaled to fit its box, so the monitors look exactly like the projector. */
function ScaledFrame({ src, title }: { src: string; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setScale(Math.max(0.05, box.clientWidth / 1920));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={boxRef} className="studio-frame">
      {src && <iframe title={title} src={src} tabIndex={-1} style={{ transform: `scale(${scale})` }} />}
      {/* Catches clicks so right-click opens the Studio menu, not the webview's "Open Frame / Inspect" menu. */}
      <div className="studio-frame__shield" aria-hidden="true" />
    </div>
  );
}

export default function StudioPage() {
  const initialPrefs = useState(readPrefs)[0];
  const [base, setBase] = useState("");
  const [transition, setTransition] = useState<StudioTransition>(initialPrefs.transition);
  const [previewFirst, setPreviewFirst] = useState(initialPrefs.previewFirst);
  const [message, setMessage] = useState("");
  const [immersive, setImmersive] = useState(false);

  // Preview / Program
  const [previewItem, setPreviewItemState] = useState<StudioItem | null>(null);
  const [liveItem, setLiveItem] = useState<StudioItem | null>(null);
  const [screen, setScreen] = useState<StudioScreen>("live");
  const modeRef = useRef<StudioMode>("fullscreen");

  // Outputs
  const [monitors, setMonitors] = useState<StudioMonitor[]>([]);
  const [monitorKey, setMonitorKey] = useState("");
  const [projectorList, setProjectorList] = useState<OpenProjector[]>(() => listOpenProjectors());
  const [busy, setBusy] = useState(false);
  const [outputsPanel, setOutputsPanel] = useState(false);
  const [wifiLink, setWifiLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; feed: ProjectorFeed } | null>(null);
  const outputOpen = projectorList.some((p) => p.feed === "program");

  useEffect(() => onProjectorsChange(setProjectorList), []);

  useEffect(() => {
    savePrefs({ transition, previewFirst });
  }, [transition, previewFirst]);

  const refreshMonitors = useCallback(async () => {
    try {
      const list = await listStudioMonitors();
      setMonitors(list);
      if (list.length) {
        const key = await pickDefaultMonitorKey(list);
        setMonitorKey((current) => (current && list.some((m) => m.key === current) ? current : key));
      }
    } catch {
      setMonitors([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void studioBaseUrl().then((url) => { if (!cancelled) setBase(url); });
    void refreshMonitors();
    window.addEventListener("focus", refreshMonitors);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshMonitors);
    };
  }, [refreshMonitors]);

  // ── Program / Preview ──
  const sendLive = useCallback((item: StudioItem | null) => {
    if (!item) return;
    goLiveItem(item, modeRef.current);
    setLiveItem(item);
    setScreen("live");
  }, []);

  const showInPreview = useCallback((item: StudioItem | null) => {
    setPreviewItem(item);
    setPreviewItemState(item);
  }, []);

  const handleClear = useCallback(() => {
    clearProgram(modeRef.current);
    setLiveItem(null);
    setScreen("live");
  }, []);

  // ── Follow the Dock ──
  const followRef = useRef({ previewFirst, transition, sendLive, showInPreview, handleClear, liveItem });
  followRef.current = { previewFirst, transition, sendLive, showInPreview, handleClear, liveItem };

  useEffect(() => setStudioDockSink((event: StudioDockEvent) => {
    const f = followRef.current;
    if (event.kind === "stage") {
      if (!event.item) {
        // The Dock took its item off screen.
        if (f.liveItem && f.liveItem.module !== "media") f.handleClear();
        return;
      }
      const item = studioItemFromDock(event.item, f.transition);
      if (!item) return;
      modeRef.current = dockItemMode(event.item);
      f.showInPreview(item);
      if (!f.previewFirst) f.sendLive(item);
      return;
    }
    if (event.kind === "media") {
      const item = studioItemFromMedia(event.media, event.fit);
      if (!item) return;
      f.showInPreview(item);
      if (!f.previewFirst) f.sendLive(item);
      return;
    }
    // "clear" comes from Media stop (and Countdowns / Ministry): only take media down.
    if (f.liveItem?.module === "media") f.handleClear();
  }), []);

  const toggleScreen = useCallback((next: StudioScreen) => {
    const target: StudioScreen = screen === next ? "live" : next;
    if (target === "logo") {
      const settings = getMvSettings();
      setProgramScreen("logo", { logoUrl: logoUrlFromPath(settings.brandLogoPath), churchName: settings.churchName });
    } else {
      setProgramScreen(target);
    }
    setScreen(target);
  }, [screen]);

  // ── Full screen mode (hide the sidebars and fill the screen) ──
  const toggleImmersive = useCallback(async (force?: boolean) => {
    const next = force ?? !immersive;
    document.documentElement.classList.toggle(IMMERSIVE_CLASS, next);
    setImmersive(next);
    try {
      await getCurrentWindow().setFullscreen(next);
    } catch {
      /* browser preview: the sidebars still hide */
    }
  }, [immersive]);

  // Leaving the page always brings the sidebars back.
  useEffect(() => () => {
    document.documentElement.classList.remove(IMMERSIVE_CLASS);
    void getCurrentWindow().setFullscreen(false).catch(() => undefined);
  }, []);

  // ── Keyboard: only keys the Dock doesn't use ──
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F11") {
        event.preventDefault();
        void toggleImmersive();
      } else if (event.key === "Escape" && (menu || outputsPanel)) {
        setMenu(null);
        setOutputsPanel(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleImmersive, menu, outputsPanel]);

  // ── Projectors ──
  const openProjectorOn = useCallback(async (feed: ProjectorFeed, target: string) => {
    setBusy(true);
    setMessage("");
    setMenu(null);
    try {
      if (feed === "program" && target !== "window") {
        setMonitorKey(target);
        saveOutputMonitor(target);
      }
      const opened = await openProjector(feed, target);
      const what = feed === "program" ? "Program" : "Preview";
      setMessage(opened.monitorKey
        ? `${what} projector is on ${opened.where}. Press Esc on it to close it.`
        : `${what} projector opened in a window.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't open the projector.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCloseOutput = useCallback(async (feed: ProjectorFeed = "program") => {
    setMenu(null);
    await closeAllProjectors(feed);
  }, []);

  const loadWifiLink = useCallback(async () => {
    try {
      const info = await invoke<{ baseUrl?: string }>("get_lan_overlay_info", { targetHost: null });
      const lanBase = String(info?.baseUrl || "").replace(/\/+$/, "");
      setWifiLink(lanBase ? `${lanBase}/studio-output.html` : "");
    } catch {
      setWifiLink("");
    }
  }, []);

  useEffect(() => {
    if (outputsPanel) void loadWifiLink();
  }, [outputsPanel, loadWifiLink]);

  const copyWifiLink = useCallback(async () => {
    if (!wifiLink) return;
    await navigator.clipboard.writeText(wifiLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [wifiLink]);

  const openMonitorMenu = useCallback((feed: ProjectorFeed, event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    void refreshMonitors();
    setMenu({
      feed,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 520)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 320)),
    });
  }, [refreshMonitors]);

  const programUrl = base ? programFrameUrl(base) : "";
  const previewUrl = base ? previewMonitorUrl(base) : "";
  const outputMonitorName = projectorList.find((p) => p.feed === "program")?.where ?? "";
  const previewIsLive = Boolean(previewItem && liveItem && previewItem === liveItem);

  return (
    <div className={`studio studio--dock${immersive ? " studio--immersive" : ""}`}>
      <header className="studio-bar">
        <div className="studio-bar__group">
          <MonitorPlay size={18} />
          <strong>Studio</strong>
        </div>
        <div className="studio-bar__group studio-outputs-anchor">
          <button
            type="button"
            className={`studio-btn${outputOpen ? " studio-btn--live" : " studio-btn--primary"}`}
            onClick={() => setOutputsPanel((v) => !v)}
            aria-expanded={outputsPanel}
          >
            <Monitor size={15} /> {outputOpen ? `Output: ${outputMonitorName || "on"}` : "Outputs"}
          </button>
          {outputsPanel && (
            <div className="studio-popover" role="dialog" aria-label="Outputs">
              <div className="studio-popover__section">
                <div className="studio-popover__title"><Monitor size={14} /> Projector or TV (HDMI)</div>
                <select value={monitorKey} onChange={(e) => { setMonitorKey(e.target.value); saveOutputMonitor(e.target.value); }}>
                  {monitors.length === 0 && <option value="">No screens found</option>}
                  {monitors.map((m) => (
                    <option key={m.key} value={m.key}>
                      {monitorLabel(m)}{m.isControlScreen ? " · this screen" : ""}
                    </option>
                  ))}
                </select>
                <div className="studio-popover__row">
                  <button type="button" className="studio-btn studio-btn--primary" disabled={busy || !monitorKey} onClick={() => void openProjectorOn("program", monitorKey)}>
                    <Monitor size={14} /> {outputOpen ? "Move output here" : "Open output"}
                  </button>
                  <button type="button" className="studio-btn" disabled={busy} onClick={() => void openProjectorOn("program", "window")}>
                    New window
                  </button>
                  {outputOpen && (
                    <button type="button" className="studio-btn" onClick={() => void handleCloseOutput("program")}>
                      <MonitorOff size={14} /> Close
                    </button>
                  )}
                </div>
                <p className="studio-popover__hint">Press Esc on a projector to close it. Right-click Program or Preview to open a projector, like OBS.</p>
              </div>
              <div className="studio-popover__section">
                <div className="studio-popover__title"><Wifi size={14} /> Share over Wi-Fi</div>
                {wifiLink ? (
                  <>
                    <div className="studio-link">
                      <code>{wifiLink}</code>
                      <button type="button" className="studio-btn" onClick={() => void copyWifiLink()}>
                        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="studio-popover__hint">Open this link on a smart TV, laptop or tablet on the same Wi-Fi to show the screen there.</p>
                  </>
                ) : (
                  <p className="studio-popover__hint">Connect this computer to Wi-Fi to get a link other screens can open.</p>
                )}
              </div>
              <div className="studio-popover__section studio-popover__section--soon">
                <div className="studio-popover__title"><Radio size={14} /> NDI <span className="studio-soon">Coming soon</span></div>
                <p className="studio-popover__hint">Send the screen to OBS, vMix or a switcher over your network.</p>
              </div>
            </div>
          )}
        </div>
        <div className="studio-bar__group">
          <div className="studio-seg" role="group" aria-label="Transition">
            <button type="button" className={transition === "fade" ? "is-on" : ""} onClick={() => setTransition("fade")} title="Use the theme's animation">Fade</button>
            <button type="button" className={transition === "cut" ? "is-on" : ""} onClick={() => setTransition("cut")} title="Change instantly">Cut</button>
          </div>
          <label className="studio-toggle" title="The Dock sends to Preview; press Go live to show it">
            <input type="checkbox" checked={previewFirst} onChange={(e) => setPreviewFirst(e.target.checked)} />
            <span>Preview first</span>
          </label>
        </div>
        <div className="studio-bar__group">
          <button type="button" className={`studio-btn${screen === "black" ? " studio-btn--on" : ""}`} onClick={() => toggleScreen("black")} title="Black screen">
            <Square size={14} /> Black
          </button>
          <button type="button" className="studio-btn" onClick={handleClear} title="Clear the screen">Clear</button>
          <button type="button" className={`studio-btn${screen === "logo" ? " studio-btn--on" : ""}`} onClick={() => toggleScreen("logo")} title="Church logo">
            <Sun size={14} /> Logo
          </button>
          <button
            type="button"
            className="studio-btn"
            onClick={() => void toggleImmersive()}
            title={immersive ? "Exit full screen (F11)" : "Full screen: hide the sidebars (F11)"}
          >
            {immersive ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {immersive ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      </header>

      {message && (
        <div className="studio-message" role="status">
          {message}
          <button type="button" className="studio-message__close" onClick={() => setMessage("")} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      <div className="studio-body">
        <aside className="studio-dock" aria-label="Dock">
          <DockPage presentationOutputTarget="link" hideShellHeader />
        </aside>

        <main className="studio-main">
          <section className="studio-monitors">
            <div className="studio-monitor studio-monitor--preview" onContextMenu={(e) => openMonitorMenu("preview", e)}>
              <div className="studio-monitor__label">
                Preview <span>{previewItem ? previewItem.label : previewFirst ? "the Dock sends here first" : "right-click for a projector"}</span>
              </div>
              <ScaledFrame title="Preview" src={previewUrl} />
            </div>
            <div className="studio-transition">
              <button
                type="button"
                className="studio-golive"
                disabled={!previewItem || previewIsLive}
                onClick={() => sendLive(previewItem)}
                title="Send Preview to the screen"
              >
                <Play size={16} /> Go live
              </button>
              <span className="studio-transition__hint">{transition === "cut" ? "Cut" : "Fade"}</span>
            </div>
            <div className="studio-monitor studio-monitor--program" onContextMenu={(e) => openMonitorMenu("program", e)}>
              <div className="studio-monitor__label">
                Program <span>{screen === "black" ? "black screen" : screen === "logo" ? "logo" : liveItem ? liveItem.label : "right-click to open a projector"}</span>
              </div>
              <ScaledFrame title="Program" src={programUrl} />
            </div>
          </section>
          <p className="studio-tip">
            Use the Dock on the left exactly as in OBS. {previewFirst ? "Items land in Preview; press Go live to show them." : "Items go straight to the screen."} Right-click Program or Preview for projectors.
          </p>
        </main>
      </div>

      {menu && (() => {
        const feedName = menu.feed === "program" ? "Program" : "Preview";
        const open = projectorList.filter((p) => p.feed === menu.feed);
        return (
          <>
            <div className="studio-menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
            <div className="studio-menu" style={{ left: menu.x, top: menu.y }} role="menu">
              <div className="studio-menu__item studio-menu__item--sub" role="menuitem" aria-haspopup="menu" tabIndex={0}>
                {menu.feed === "program" ? <Monitor size={14} /> : <Eye size={14} />}
                <span>Open {feedName} Projector</span>
                <ChevronRight size={14} />
                <div className="studio-menu studio-menu--flyout" role="menu">
                  {monitors.map((m) => {
                    const here = open.some((p) => p.monitorKey === m.key);
                    return (
                      <button key={m.key} type="button" role="menuitem" disabled={busy} onClick={() => void openProjectorOn(menu.feed, m.key)}>
                        <span>{monitorLabel(m)}{m.isControlScreen ? " (this screen)" : ""}</span>
                        {here && <Check size={14} />}
                      </button>
                    );
                  })}
                  {monitors.length === 0 && <div className="studio-menu__empty">No screens found</div>}
                  <div className="studio-menu__divider" />
                  <button type="button" role="menuitem" disabled={busy} onClick={() => void openProjectorOn(menu.feed, "window")}>
                    <span>New window</span>
                  </button>
                </div>
              </div>
              {open.length > 0 && (
                <>
                  <div className="studio-menu__divider" />
                  {open.map((p) => (
                    <button key={p.label} type="button" role="menuitem" onClick={() => { setMenu(null); void closeProjector(p.label); }}>
                      <X size={14} /> <span>Close {feedName} projector ({p.where})</span>
                    </button>
                  ))}
                </>
              )}
              <div className="studio-menu__divider" />
              {menu.feed === "preview" ? (
                <button type="button" role="menuitem" disabled={!previewItem || previewIsLive} onClick={() => { setMenu(null); sendLive(previewItem); }}>
                  <Play size={14} /> <span>Go live</span>
                </button>
              ) : (
                <>
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); toggleScreen("black"); }}>
                    <Square size={14} /> <span>{screen === "black" ? "Show content again" : "Black screen"}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); toggleScreen("logo"); }}>
                    <Sun size={14} /> <span>{screen === "logo" ? "Hide logo" : "Show logo"}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); handleClear(); }}>
                    <MonitorOff size={14} /> <span>Clear screen</span>
                  </button>
                  <div className="studio-menu__divider" />
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); setOutputsPanel(true); }}>
                    <Wifi size={14} /> <span>Share over Wi-Fi…</span>
                  </button>
                </>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}
