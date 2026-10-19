/**
 * MinistryWorkspace.tsx — the Dock's Ministry tools in the Studio: Ticker, Countdown and Clock.
 *
 *  Ticker     scrolling messages along the top or bottom of the screen (same themes as the Dock).
 *  Countdown  the countdown designs made in the app (and the three ready-made ones): start,
 *             pause, ± time, stop.
 *  Clock      the time of day in a corner or full screen.
 *
 * They go on the Studio output as Screen Mix layers (see ministryLayers.ts), drawn by the same
 * pages the Dock sends to OBS. Ticker and clock settings are the Dock's own saved settings, so
 * a change made here is there too.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Hourglass, Lock, Megaphone, Minus, Pause, Play, Plus, Square, Trash2 } from "../../components/icons/NativeIcons";
import { HARDCODED_COUNTDOWNS } from "../../dock/tabs/DockCountdownsTab";
import {
  DEFAULT_DOCK_TICKER_THEME_OPTION,
  getDockTickerThemeOptionsForFavorites,
  renderDockTickerThemeHtml,
  type DockTickerDivider,
  type DockTickerThemeOption,
} from "../../dock/tickerThemeCatalog";
import type { TickerThemeColors } from "../../components/modules/tickerThemes";
import { getCountdowns } from "../../countdowns/countdownStore";
import { buildCountdownContent } from "../../countdowns/countdownTime";
import { isLayoutDesign } from "../../countdowns/layoutMode";
import ThemeLayoutPreview from "../../themes/layout/ThemeLayoutPreview";
import { formatDuration, parseDuration } from "../../countdowns/rundownEngine";
import type { CountdownConfig } from "../../countdowns/types";
import type { DockTimePlacement } from "../../dock/timeOverlay";
import { applyTextCase, TEXT_CASE_CONVERSIONS } from "../../lowerthirds/textStyle";
import { normalizeBrandColor } from "../../lowerthirds/runtimeBranding";
import { getSettings } from "../../multiview/mvStore";
import { readNativeDockSetting, reloadNativeDockSettings, writeNativeDockSetting } from "../../services/localDockSettings";
import { getOverlayBaseUrlSync, resolveOverlayAssetUrl } from "../../services/overlayUrl";
import { fetchRemoteProductionThemes, getCachedRemoteProductionThemes } from "../../services/remoteProductionThemes";
import { getUserScopedKey } from "../../services/userScopedStorage";
import {
  adjustCountdown,
  clockLayer,
  countdownLayers,
  countdownRemaining,
  MINISTRY_LAYER_IDS,
  pauseCountdown,
  readClockSettings,
  resumeCountdown,
  startCountdown,
  tickerLayer,
  withTitle,
  type ClockSettings,
  type CountdownLive,
} from "../ministryLayers";
import type { StudioMixLayer } from "../studioMix";
import "./MinistryWorkspace.css";

type Tool = "ticker" | "countdown" | "clock";

interface Props {
  /** The Screen Mix now: tells which tools are on the screen. */
  mix: StudioMixLayer[];
  /** Put these layers on the screen (replacing the ones with the same id). */
  onPut: (layers: StudioMixLayer[]) => void;
  /** Take these layers off the screen. */
  onHide: (ids: string[]) => void;
  canTicker: boolean;
  canTime: boolean;
  onUpgrade: () => void;
}

const TOOL_KEY = "mce-studio-ministry-tool";
const TICKER_MESSAGES_KEY = "dock-ticker-messages";
const TICKER_SETTINGS_KEY = "dock-ticker-settings";
const TIME_SETTINGS_KEY = "dock-time-tools-v1";
const COUNTDOWN_LIVE_KEY = "mce-studio-countdown-live";
const MAX_MESSAGE = 140;

function readTool(): Tool {
  try {
    const v = localStorage.getItem(TOOL_KEY);
    return v === "countdown" || v === "clock" ? v : "ticker";
  } catch {
    return "ticker";
  }
}

// ── Ticker data (the Dock's own) ──

interface TickerMessage { id: string; text: string; active: boolean }
interface TickerSettings {
  speed: number;
  position: "top" | "bottom";
  loop: boolean;
  themeId: string;
  heading: string;
  messageSpacing: number;
  divider: DockTickerDivider;
  colors: Partial<TickerThemeColors>;
}

function loadMessages(): TickerMessage[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(TICKER_MESSAGES_KEY));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? (parsed as TickerMessage[]).filter((m) => m && typeof m.id === "string" && typeof m.text === "string").map((m) => ({ ...m, active: m.active !== false }))
      : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: TickerMessage[]): void {
  try { localStorage.setItem(getUserScopedKey(TICKER_MESSAGES_KEY), JSON.stringify(messages)); } catch { /* ignore */ }
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const DIVIDERS: DockTickerDivider[] = ["theme", "none", "dot", "line", "diamond", "spark"];

function loadTickerSettings(): TickerSettings {
  const raw = readNativeDockSetting<unknown>(TICKER_SETTINGS_KEY);
  let p: Partial<TickerSettings> = {};
  try { p = (typeof raw === "string" ? JSON.parse(raw) : raw ?? {}) as Partial<TickerSettings>; } catch { /* defaults */ }
  const colors: Partial<TickerThemeColors> = {};
  if (p.colors && typeof p.colors === "object") {
    for (const [k, v] of Object.entries(p.colors)) if (typeof v === "string" && HEX.test(v)) (colors as Record<string, string>)[k] = v;
  }
  const themeId = typeof p.themeId === "string" && p.themeId ? p.themeId : DEFAULT_DOCK_TICKER_THEME_OPTION?.id ?? "";
  return {
    speed: typeof p.speed === "number" ? Math.max(1, Math.min(100, p.speed)) : 50,
    position: p.position === "top" ? "top" : "bottom",
    loop: typeof p.loop === "boolean" ? p.loop : true,
    themeId,
    heading: typeof p.heading === "string" && p.heading.trim() ? p.heading.slice(0, 20) : DEFAULT_DOCK_TICKER_THEME_OPTION?.defaultHeading ?? "LIVE",
    messageSpacing: typeof p.messageSpacing === "number" ? Math.max(0, Math.min(100, Math.round(p.messageSpacing))) : 0,
    divider: DIVIDERS.includes(p.divider as DockTickerDivider) ? (p.divider as DockTickerDivider) : "theme",
    colors,
  };
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Countdown live state (survives leaving the tab) ──

function readCountdownLive(): CountdownLive | null {
  try {
    const raw = localStorage.getItem(COUNTDOWN_LIVE_KEY);
    const v = raw ? (JSON.parse(raw) as CountdownLive) : null;
    return v && typeof v.designId === "string" && typeof v.remaining === "number" ? v : null;
  } catch {
    return null;
  }
}

function writeCountdownLive(live: CountdownLive | null): void {
  try {
    if (live) localStorage.setItem(COUNTDOWN_LIVE_KEY, JSON.stringify(live));
    else localStorage.removeItem(COUNTDOWN_LIVE_KEY);
  } catch { /* ignore */ }
}

function isShown(mix: StudioMixLayer[], id: string): boolean {
  return mix.some((l) => l.id === id && l.shown);
}

export default function MinistryWorkspace({ mix, onPut, onHide, canTicker, canTime, onUpgrade }: Props) {
  const [tool, setToolState] = useState<Tool>(readTool);
  const setTool = (next: Tool) => {
    setToolState(next);
    try { localStorage.setItem(TOOL_KEY, next); } catch { /* ignore */ }
  };
  const tickerOn = isShown(mix, MINISTRY_LAYER_IDS.ticker);
  const countdownOn = isShown(mix, MINISTRY_LAYER_IDS.countdown);
  const clockOn = isShown(mix, MINISTRY_LAYER_IDS.clock);

  const tabs: Array<{ id: Tool; label: string; icon: typeof Clock; on: boolean }> = [
    { id: "ticker", label: "Ticker", icon: Megaphone, on: tickerOn },
    { id: "countdown", label: "Countdown", icon: Hourglass, on: countdownOn },
    { id: "clock", label: "Clock", icon: Clock, on: clockOn },
  ];

  return (
    <div className="st-min">
      <div className="st-min__tabs" role="tablist" aria-label="Ministry tools">
        {tabs.map(({ id, label, icon: Icon, on }) => (
          <button key={id} type="button" role="tab" aria-selected={tool === id} className={tool === id ? "is-on" : ""} onClick={() => setTool(id)}>
            <Icon size={13} /> {label}
            {on && <span className="st-min__dot" title="On the screen now" aria-label="On the screen now" />}
          </button>
        ))}
      </div>
      <div className="st-min__body">
        {tool === "ticker" && (canTicker
          ? <TickerTool on={tickerOn} onPut={onPut} onHide={onHide} />
          : <Locked what="Ticker requires the Growth plan" onUpgrade={onUpgrade} />)}
        {tool === "countdown" && (canTime
          ? <CountdownTool on={countdownOn} onPut={onPut} onHide={onHide} />
          : <Locked what="Countdowns require the Growth plan" onUpgrade={onUpgrade} />)}
        {tool === "clock" && (canTime
          ? <ClockTool on={clockOn} onPut={onPut} onHide={onHide} />
          : <Locked what="The clock requires the Growth plan" onUpgrade={onUpgrade} />)}
      </div>
    </div>
  );
}

function Locked({ what, onUpgrade }: { what: string; onUpgrade: () => void }) {
  return (
    <div className="st-min__locked">
      <Lock size={16} />
      <p>{what}.</p>
      <button type="button" className="st-min__btn st-min__btn--go" onClick={onUpgrade}>See plans</button>
    </div>
  );
}

interface ToolProps {
  on: boolean;
  onPut: (layers: StudioMixLayer[]) => void;
  onHide: (ids: string[]) => void;
}

// ── Ticker ──

function TickerTool({ on, onPut, onHide }: ToolProps) {
  const [messages, setMessages] = useState<TickerMessage[]>(loadMessages);
  const [settings, setSettings] = useState<TickerSettings>(loadTickerSettings);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [remote, setRemote] = useState(getCachedRemoteProductionThemes);
  const [error, setError] = useState("");

  useEffect(() => {
    // The Dock may have changed these since the app started.
    void reloadNativeDockSettings([TICKER_SETTINGS_KEY]).then(() => setSettings(loadTickerSettings())).catch(() => undefined);
    void fetchRemoteProductionThemes().then(setRemote).catch(() => undefined);
  }, []);

  const options = useMemo(() => getDockTickerThemeOptionsForFavorites(null, remote), [remote]);
  const option: DockTickerThemeOption | undefined = options.find((o) => o.id === settings.themeId) ?? options[0];
  const active = messages.filter((m) => m.active && m.text.trim());

  const changeMessages = (next: TickerMessage[]) => {
    setMessages(next);
    saveMessages(next);
  };
  const changeSettings = (patch: Partial<TickerSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const saved = readNativeDockSetting<Record<string, unknown>>(TICKER_SETTINGS_KEY);
    void writeNativeDockSetting(TICKER_SETTINGS_KEY, { ...(saved && typeof saved === "object" ? saved : {}), ...next });
  };

  const buildHtml = useCallback((pause: boolean): string | null => {
    if (!option) return null;
    const branding = getSettings();
    const brandColor = normalizeBrandColor(branding.brandColor);
    const colors: TickerThemeColors | undefined = option.source === "dock" || option.source === "remote"
      ? { ...option.theme.defaultColors, accent: brandColor, separator: brandColor, ...settings.colors }
      : ({ ...settings.colors } as TickerThemeColors);
    return renderDockTickerThemeHtml({
      option,
      heading: settings.heading,
      messages: active.map((m) => m.text),
      speed: settings.speed,
      position: settings.position,
      loop: settings.loop,
      paused: pause,
      colors,
      brandLogoUrl: resolveOverlayAssetUrl(branding.brandLogoPath),
      brandName: branding.churchName || "",
      divider: settings.divider,
      messageSpacing: settings.messageSpacing,
    });
  }, [option, settings, active]);

  const show = useCallback((pause: boolean) => {
    if (active.length === 0) { setError("Add a message, or tick one, first."); return; }
    const html = buildHtml(pause);
    if (!html) { setError("No ticker theme is available."); return; }
    setError("");
    setPaused(pause);
    onPut([tickerLayer(html, settings.position, newId())]);
  }, [active.length, buildHtml, onPut, settings.position]);

  // While it is on the screen, changes go there too (like the Dock's live sync).
  const signature = JSON.stringify([settings, active.map((m) => m.text)]);
  const lastSig = useRef(signature);
  useEffect(() => {
    if (lastSig.current === signature) return;
    lastSig.current = signature;
    if (!on || active.length === 0) return;
    const t = window.setTimeout(() => show(paused), 350);
    return () => window.clearTimeout(t);
  }, [signature, on, paused, show, active.length]);

  const addDraft = () => {
    const text = draft.trim().slice(0, MAX_MESSAGE);
    if (!text) return;
    changeMessages([...messages, { id: newId(), text, active: true }]);
    setDraft("");
  };

  return (
    <div className="st-min__tool">
      <div className="st-min__grid">
        <label className="st-min__field">
          <span>Theme</span>
          <select
            value={option?.id ?? ""}
            onChange={(e) => {
              const picked = options.find((o) => o.id === e.target.value);
              changeSettings({ themeId: e.target.value, heading: picked?.defaultHeading.slice(0, 20) ?? settings.heading, colors: {} });
            }}
          >
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="st-min__field">
          <span>Heading</span>
          <input type="text" maxLength={20} value={settings.heading} onChange={(e) => changeSettings({ heading: e.target.value })} placeholder="LIVE" />
        </label>
        <label className="st-min__field">
          <span>Speed <em>{settings.speed < 34 ? "Slow" : settings.speed < 67 ? "Medium" : "Fast"}</em></span>
          <input type="range" min={1} max={100} value={settings.speed} onChange={(e) => changeSettings({ speed: Number(e.target.value) })} />
        </label>
        <div className="st-min__field">
          <span>Position</span>
          <div className="st-min__seg" role="group" aria-label="Ticker position">
            <button type="button" className={settings.position === "top" ? "is-on" : ""} onClick={() => changeSettings({ position: "top" })}>Top</button>
            <button type="button" className={settings.position === "bottom" ? "is-on" : ""} onClick={() => changeSettings({ position: "bottom" })}>Bottom</button>
          </div>
        </div>
        <div className="st-min__field">
          <span>Play</span>
          <div className="st-min__seg" role="group" aria-label="Ticker repeat">
            <button type="button" className={!settings.loop ? "is-on" : ""} onClick={() => changeSettings({ loop: false })}>Once</button>
            <button type="button" className={settings.loop ? "is-on" : ""} onClick={() => changeSettings({ loop: true })}>Looping</button>
          </div>
        </div>
      </div>

      <div className="st-min__section">
        <div className="st-min__label">Messages <em>{active.length} of {messages.length} on</em></div>
        <textarea
          className="st-min__textarea"
          rows={2}
          maxLength={MAX_MESSAGE}
          value={draft}
          placeholder="Type an announcement…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addDraft(); } }}
        />
        <div className="st-min__row">
          <div className="st-min__seg st-min__seg--case" role="group" aria-label="Change the case of the text">
            {TEXT_CASE_CONVERSIONS.map((c) => (
              <button key={c.value} type="button" title={c.hint} disabled={!draft} onClick={() => setDraft((d) => applyTextCase(d, c.value))}>{c.label}</button>
            ))}
          </div>
          <span className="st-min__count">{draft.length}/{MAX_MESSAGE}</span>
          <button type="button" className="st-min__btn" disabled={!draft.trim()} onClick={addDraft}><Plus size={12} /> Add message</button>
        </div>
        {messages.length === 0 ? (
          <p className="st-min__empty">No messages yet. Add one above.</p>
        ) : (
          <ul className="st-min__list">
            {messages.map((m) => (
              <li key={m.id} className={m.active ? "" : "is-off"}>
                <input type="checkbox" checked={m.active} aria-label="Show this message" onChange={() => changeMessages(messages.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)))} />
                {editing === m.id ? (
                  <input
                    className="st-min__edit"
                    autoFocus
                    maxLength={MAX_MESSAGE}
                    defaultValue={m.text}
                    onBlur={(e) => {
                      const text = e.target.value.trim();
                      if (text) changeMessages(messages.map((x) => (x.id === m.id ? { ...x, text } : x)));
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <button type="button" className="st-min__msg" title="Edit" onClick={() => setEditing(m.id)}>{m.text}</button>
                )}
                <button type="button" className="st-min__icon" aria-label="Delete message" title="Delete" onClick={() => changeMessages(messages.filter((x) => x.id !== m.id))}><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="st-min__error">{error}</p>}
      <div className="st-min__actions">
        {!on ? (
          <button type="button" className="st-min__btn st-min__btn--go" onClick={() => show(false)} disabled={active.length === 0}><Play size={13} /> Start ticker</button>
        ) : (
          <>
            <button type="button" className="st-min__btn" onClick={() => show(!paused)}>{paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}</button>
            <button type="button" className="st-min__btn st-min__btn--stop" onClick={() => { setPaused(false); onHide([MINISTRY_LAYER_IDS.ticker]); }}><Square size={12} /> Stop</button>
            <span className="st-min__live">On the screen</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Countdown ──

function CountdownTool({ on, onPut, onHide }: ToolProps) {
  const [saved, setSaved] = useState<CountdownConfig[]>([]);
  const designs = useMemo(() => [...saved, ...HARDCODED_COUNTDOWNS], [saved]);
  const [live, setLive] = useState<CountdownLive | null>(() => (on ? readCountdownLive() : null));
  const [pickedId, setPickedId] = useState<string>(() => readCountdownLive()?.designId ?? "");
  const design = designs.find((d) => d.id === pickedId) ?? designs[0];
  const [title, setTitle] = useState("");
  const [length, setLength] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");

  useEffect(() => {
    void getCountdowns().then(setSaved).catch(() => setSaved([]));
  }, []);
  // A fresh design fills in its own title and length.
  useEffect(() => {
    if (!design) return;
    setTitle(design.text?.title || design.title || "");
    setLength(formatDuration(design.timer.durationSeconds || 300));
  }, [design?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!on) { setLive(null); writeCountdownLive(null); }
  }, [on]);
  useEffect(() => {
    if (!live?.running) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [live?.running]);

  const liveDesign = live ? designs.find((d) => d.id === live.designId) : undefined;
  const send = (next: CountdownLive, reveal: boolean, d: CountdownConfig) => {
    setLive(next);
    writeCountdownLive(next);
    const layers = countdownLayers(withTitle(d, title), next, getOverlayBaseUrlSync(), { reveal });
    onPut(layers);
    // A layer design has no background page: take off the one a classic design left.
    if (!layers.some((l) => l.id === MINISTRY_LAYER_IDS.countdownBg)) onHide([MINISTRY_LAYER_IDS.countdownBg]);
  };
  const start = () => {
    if (!design) return;
    const seconds = parseDuration(length);
    if (seconds === null || seconds <= 0) { setError("Type the length as minutes, or mm:ss (for example 5 or 4:30)."); return; }
    setError("");
    send(startCountdown(design.id, seconds), true, design);
  };
  const change = (fn: (l: CountdownLive) => CountdownLive) => {
    if (!live || !liveDesign) return;
    send(fn(live), false, liveDesign);
  };
  const stop = () => {
    setLive(null);
    writeCountdownLive(null);
    onHide([MINISTRY_LAYER_IDS.countdown, MINISTRY_LAYER_IDS.countdownBg]);
  };

  const remaining = live ? Math.max(0, countdownRemaining(live, now)) : null;

  return (
    <div className="st-min__tool">
      <div className="st-min__section">
        <div className="st-min__label">Design</div>
        <div className="st-min__designs" role="listbox" aria-label="Countdown designs">
          {designs.map((d) => (
            <DesignCard
              key={d.id}
              design={d}
              picked={design?.id === d.id}
              live={live?.designId === d.id ? live : null}
              now={now}
              onPick={() => setPickedId(d.id)}
            />
          ))}
        </div>
        <p className="st-min__hint">Make and edit designs in Countdowns &amp; Timers in the app; they appear here.</p>
      </div>

      <div className="st-min__grid">
        <label className="st-min__field">
          <span>Title</span>
          <input type="text" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Service starts in" />
        </label>
        <label className="st-min__field">
          <span>Length</span>
          <input type="text" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} placeholder="5:00" onKeyDown={(e) => { if (e.key === "Enter") start(); }} />
        </label>
      </div>

      {live && remaining !== null && (
        <div className={`st-min__readout${live.running ? "" : " is-paused"}`}>
          <strong>{formatDuration(Math.ceil(remaining))}</strong>
          <span>{remaining <= 0 ? "Finished" : live.running ? "Running" : "Paused"} · {liveDesign?.title || "Countdown"}</span>
        </div>
      )}

      {error && <p className="st-min__error">{error}</p>}
      <div className="st-min__actions">
        <button type="button" className="st-min__btn st-min__btn--go" onClick={start} disabled={!design}><Play size={13} /> {live ? "Restart" : "Start countdown"}</button>
        {live && (
          <>
            <button type="button" className="st-min__btn" onClick={() => change((l) => (l.running ? pauseCountdown(l) : resumeCountdown(l)))}>
              {live.running ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
            </button>
            <button type="button" className="st-min__btn st-min__btn--stop" onClick={stop}><Square size={12} /> Stop</button>
          </>
        )}
      </div>
      {live && (
        <div className="st-min__row st-min__row--adjust" role="group" aria-label="Change the time left">
          <button type="button" className="st-min__btn" onClick={() => change((l) => adjustCountdown(l, -60))}><Minus size={12} /> 1 min</button>
          <button type="button" className="st-min__btn" onClick={() => change((l) => adjustCountdown(l, -10))}><Minus size={12} /> 10 s</button>
          <button type="button" className="st-min__btn" onClick={() => change((l) => adjustCountdown(l, 10))}><Plus size={12} /> 10 s</button>
          <button type="button" className="st-min__btn" onClick={() => change((l) => adjustCountdown(l, 60))}><Plus size={12} /> 1 min</button>
        </div>
      )}
    </div>
  );
}

/**
 * One countdown design as a card with a picture of how it really looks. Layer designs are drawn by
 * the theme renderer (as in the Dock); classic designs by their own overlay pages, scaled down.
 * The design on the screen shows its running time.
 */
function DesignCard({ design, picked, live, now, onPick }: {
  design: CountdownConfig;
  picked: boolean;
  live: CountdownLive | null;
  now: number;
  onPick: () => void;
}) {
  const seconds = live ? Math.max(0, Math.ceil(countdownRemaining(live, now))) : design.timer.durationSeconds || 0;
  const name = design.title || design.text?.title || "Countdown";
  return (
    <button type="button" role="option" aria-selected={picked} className={`st-min__card${picked ? " is-on" : ""}${live ? " is-live" : ""}`} onClick={onPick} title={name}>
      <span className="st-min__thumb">
        {isLayoutDesign(design) ? <LayerThumb design={design} seconds={seconds} /> : <PageThumb design={design} live={live} />}
        {live && <span className="st-min__badge">On screen</span>}
      </span>
      <span className="st-min__cardfoot">
        <span>{name}</span>
        <em>{formatDuration(design.timer.durationSeconds || 0)}</em>
      </span>
    </button>
  );
}

function LayerThumb({ design, seconds }: { design: CountdownConfig & { layout: NonNullable<CountdownConfig["layout"]> }; seconds: number }) {
  const content = useMemo(() => buildCountdownContent({
    kind: "countdown",
    value: seconds,
    durationSeconds: design.timer.durationSeconds,
    warnYellowSeconds: design.warnYellowSeconds ?? 0,
    warnRedSeconds: design.warnRedSeconds ?? 0,
    title: design.text.title,
    subtitle: design.text.subtitle,
    name: design.text.title,
  }), [seconds, design]);
  return <ThemeLayoutPreview layout={design.layout} content={content} />;
}

/** A classic design: its background and countdown pages at 1920 × 1080, scaled to the card. */
function PageThumb({ design, live }: { design: CountdownConfig; live: CountdownLive | null }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(0.1);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setScale(box.clientWidth / 1920 || 0.1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  // Held still (paused) unless it is the one on the screen; the pages keep time themselves.
  const urls = useMemo(() => {
    const base = getOverlayBaseUrlSync();
    const reading = live ?? { designId: design.id, remaining: design.timer.durationSeconds || 0, running: false, at: Date.now() };
    return countdownLayers(design, reading, base, { reveal: false }).map((l) => `${base}${l.pageUrl}`);
  }, [design, live]);
  return (
    <span ref={boxRef} className="st-min__pagethumb">
      {urls.map((url) => (
        <iframe key={url.split("#")[0]} src={url} title="" aria-hidden="true" tabIndex={-1} loading="lazy" style={{ transform: `scale(${scale})` }} />
      ))}
    </span>
  );
}

// ── Clock ──

const CLOCK_THEMES: Array<{ id: NonNullable<ClockSettings["theme"]>; name: string }> = [
  { id: "digital-modern", name: "Modern digital" },
  { id: "analog-wall", name: "Wall clock" },
  { id: "broadcast-pill", name: "Stream pill" },
  { id: "neon", name: "Neon" },
  { id: "elegant", name: "Elegant gold" },
];
const PLACES: Array<{ id: DockTimePlacement; label: string }> = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];

function ClockTool({ on, onPut, onHide }: ToolProps) {
  const [clock, setClock] = useState<ClockSettings>(() => readClockSettings(readNativeDockSetting(TIME_SETTINGS_KEY)));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    void reloadNativeDockSettings([TIME_SETTINGS_KEY]).then(() => setClock(readClockSettings(readNativeDockSetting(TIME_SETTINGS_KEY)))).catch(() => undefined);
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const change = (patch: Partial<ClockSettings>) => {
    const next = { ...clock, ...patch };
    setClock(next);
    const saved = readNativeDockSetting<Record<string, unknown>>(TIME_SETTINGS_KEY);
    void writeNativeDockSetting(TIME_SETTINGS_KEY, { ...(saved && typeof saved === "object" ? saved : {}), clock: next });
    // On the screen: the clock page takes the new look in place.
    if (on) onPut([clockLayer(next)]);
  };

  const reading = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...(clock.showSeconds ? { second: "2-digit" } : {}), hour12: clock.hour12 });

  return (
    <div className="st-min__tool">
      <div className="st-min__readout st-min__readout--clock" style={{ color: clock.color }}>
        <strong>{reading}</strong>
        {clock.showDate && <span>{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>}
      </div>
      <div className="st-min__grid">
        <label className="st-min__field">
          <span>Style</span>
          <select value={clock.theme} onChange={(e) => change({ theme: e.target.value as ClockSettings["theme"] })}>
            {CLOCK_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="st-min__field">
          <span>Size</span>
          <div className="st-min__seg" role="group" aria-label="Clock size">
            <button type="button" className={clock.mode === "lower-third" ? "is-on" : ""} onClick={() => change({ mode: "lower-third" })}>Corner</button>
            <button type="button" className={clock.mode === "fullscreen" ? "is-on" : ""} onClick={() => change({ mode: "fullscreen" })}>Full screen</button>
          </div>
        </div>
        {clock.mode === "lower-third" && (
          <label className="st-min__field">
            <span>Corner</span>
            <select value={clock.placement === "left" ? "bottom-left" : clock.placement === "right" ? "bottom-right" : clock.placement} onChange={(e) => change({ placement: e.target.value as DockTimePlacement })}>
              {PLACES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        )}
        <label className="st-min__field">
          <span>Colour</span>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(clock.color ?? "") ? clock.color : "#ffffff"} onChange={(e) => change({ color: e.target.value })} />
        </label>
        <label className="st-min__field">
          <span>Label <em>optional</em></span>
          <input type="text" maxLength={80} value={clock.label} onChange={(e) => change({ label: e.target.value })} placeholder="Service time" />
        </label>
        <div className="st-min__field">
          <span>Format</span>
          <div className="st-min__seg" role="group" aria-label="Clock format">
            <button type="button" className={clock.hour12 ? "is-on" : ""} onClick={() => change({ hour12: true })}>12-hour</button>
            <button type="button" className={!clock.hour12 ? "is-on" : ""} onClick={() => change({ hour12: false })}>24-hour</button>
          </div>
        </div>
      </div>
      <div className="st-min__checks">
        <label><input type="checkbox" checked={clock.showSeconds} onChange={(e) => change({ showSeconds: e.target.checked })} /> Seconds</label>
        <label><input type="checkbox" checked={clock.showDate} onChange={(e) => change({ showDate: e.target.checked })} /> Date</label>
        <label><input type="checkbox" checked={clock.transparentBg === false} onChange={(e) => change({ transparentBg: !e.target.checked })} /> Card behind</label>
      </div>
      <div className="st-min__actions">
        {!on ? (
          <button type="button" className="st-min__btn st-min__btn--go" onClick={() => onPut([clockLayer(clock)])}><Play size={13} /> Show clock</button>
        ) : (
          <>
            <button type="button" className="st-min__btn st-min__btn--stop" onClick={() => onHide([MINISTRY_LAYER_IDS.clock])}><Square size={12} /> Hide clock</button>
            <span className="st-min__live">On the screen</span>
          </>
        )}
      </div>
    </div>
  );
}
