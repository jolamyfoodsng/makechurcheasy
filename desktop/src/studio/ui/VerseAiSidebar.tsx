/**
 * VerseAiSidebar.tsx — Verse AI as a full-height sidebar beside the Bible.
 *
 *  Listening    Start / Stop, microphone, sensitivity, timer and a level meter.
 *  Transcript   what the pastor is saying, newest at the bottom (it follows along unless you
 *               scroll up). Search it; right-click a line to keep it as a sermon note, edit or delete.
 *  Tabs         Queue (references the pastor said, with Suggestions under it: half the height each),
 *               Transcript (what is being said), History (what was shown on the screen).
 *  Auto mode    shows detected references on the screen by itself (only certain ones).
 *
 * The » button folds it to a slim rail (mic button, counts) to give the reader more room.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronsLeft, ChevronsRight, ListOrdered, Mic, MicOff, Pencil, Plus, RefreshCw, Scissors, Search, SlidersHorizontal, Sparkles, Trash2, X, Zap } from "lucide-react";
import type { StudioVerseAi } from "../useVerseAi";
import StudioMenu, { menuAt, type StudioMenuState } from "./StudioMenu";

interface VerseAiSidebarProps {
  ai: StudioVerseAi;
  autoMode: boolean;
  onAutoMode: (on: boolean) => void;
  /** A short message from Auto mode ("Showed John 3:16 at 10:32"). */
  autoMessage: string;
  /** Open the drawer under the reader on a tab. */
  onOpenDrawer: (tab: "queue" | "suggestions") => void;
  /** Fold to the slim rail. */
  onCollapse: () => void;
  /** Open "search everything". (No longer shown in the panel; kept so callers don't break.) */
  onSearchAll?: () => void;
  /** The Queue tab: Queue on top, Suggestions under it. */
  queuePanel?: ReactNode;
  /** The History tab: what was shown on the screen. */
  historyPanel?: ReactNode;
}

type VaiTab = "queue" | "transcript" | "history";
const VAI_TAB_KEY = "mce-studio-vai-tab";
/** Fired by the Studio's shortcut (Alt+Q): show the next Verse AI tab. */
export const VAI_NEXT_TAB_EVENT = "mce-vai-next-tab";
const VAI_TABS: VaiTab[] = ["queue", "transcript", "history"];
function readVaiTab(): VaiTab {
  try {
    const v = localStorage.getItem(VAI_TAB_KEY);
    return v === "transcript" || v === "history" ? v : "queue";
  } catch {
    return "queue";
  }
}

const MAX_LINES = 400;

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${h.toString().padStart(2, "0")}:${m}:${s}`;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export default function VerseAiSidebar(props: VerseAiSidebarProps) {
  const { ai, autoMode, onAutoMode, autoMessage, onCollapse } = props;
  const [vaiTab, setVaiTabState] = useState<VaiTab>(readVaiTab);
  const setVaiTab = (next: VaiTab) => {
    setVaiTabState(next);
    try { localStorage.setItem(VAI_TAB_KEY, next); } catch { /* not saved */ }
  };
  useEffect(() => {
    const onNext = () => setVaiTabState((cur) => {
      const next = VAI_TABS[(VAI_TABS.indexOf(cur) + 1) % VAI_TABS.length];
      try { localStorage.setItem(VAI_TAB_KEY, next); } catch { /* not saved */ }
      return next;
    });
    window.addEventListener(VAI_NEXT_TAB_EVENT, onNext);
    return () => window.removeEventListener(VAI_NEXT_TAB_EVENT, onNext);
  }, []);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [follow, setFollow] = useState(true);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [menu, setMenu] = useState<StudioMenuState | null>(null);
  const [toast, setToast] = useState("");
  // Double-click a line to pick words from it and add just those to the sermon notes.
  const [picking, setPicking] = useState<string | null>(null);
  const [picked, setPicked] = useState("");
  useEffect(() => {
    if (!picking) { setPicked(""); return undefined; }
    const read = () => {
      const sel = window.getSelection();
      const box = document.querySelector(`[data-line="${picking}"] .st-tline__text`);
      if (!sel || sel.isCollapsed || !box || !box.contains(sel.anchorNode) || !box.contains(sel.focusNode)) { setPicked(""); return; }
      setPicked(sel.toString().replace(/\s+/g, " ").trim());
    };
    read();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPicking(null); };
    document.addEventListener("selectionchange", read);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("selectionchange", read); window.removeEventListener("keydown", onKey); };
  }, [picking]);
  const [showGain, setShowGain] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(32).fill(0));
  const listRef = useRef<HTMLDivElement>(null);
  const now = useNow(Boolean(ai.startedAt));
  const [confirmStop, setConfirmStop] = useState(false);
  // The question goes away by itself, and when listening has stopped.
  useEffect(() => {
    if (!confirmStop) return undefined;
    const timer = window.setTimeout(() => setConfirmStop(false), 6000);
    return () => window.clearTimeout(timer);
  }, [confirmStop]);

  // Level meter: a short rolling history of the microphone level.
  useEffect(() => {
    setLevels((current) => [...current.slice(1), ai.listening ? Math.min(1, ai.inputLevel * 3) : 0]);
  }, [ai.inputLevel, ai.listening]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const lines = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle ? ai.lines.filter((l) => l.text.toLowerCase().includes(needle)) : ai.lines;
    return showAll || needle ? list : list.slice(-MAX_LINES);
  }, [ai.lines, query, showAll]);
  const hiddenCount = query.trim() || showAll ? 0 : Math.max(0, ai.lines.length - MAX_LINES);

  // Follow the newest line unless the operator scrolled up to read.
  useEffect(() => {
    const box = listRef.current;
    if (box && follow && !query) box.scrollTop = box.scrollHeight;
  }, [lines, follow, query, vaiTab]);

  const onScroll = () => {
    const box = listRef.current;
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 28;
    if (atBottom !== follow) setFollow(atBottom);
  };

  const keepLine = (text: string) => {
    if (ai.pushToNotes(text)) setToast("Added to sermon notes (Docs → Notes)");
  };

  const statusText = ai.starting ? "Checking…"
    : ai.status === "requesting-mic" ? "Opening the microphone…"
      : ai.status === "connecting" ? "Connecting…"
        : ai.status === "listening" ? (ai.matching ? "Listening · searching…" : "Listening…")
          : ai.status === "error" ? "Stopped" : "Not listening";
  const connection = ai.status === "listening" ? "ok" : ai.status === "connecting" || ai.status === "requesting-mic" || ai.starting ? "wait" : ai.error ? "bad" : "off";

  return (
    <aside className="st-vai" aria-label="Verse AI">
      <header className="st-vai__head">
        <span className={`st-vai__icon${ai.listening ? " is-on" : ""}`}><Mic size={18} /></span>
        <div className="st-vai__title">
          <strong>Verse AI</strong>
          <span>Real-time speech-to-scripture detection</span>
        </div>
        <span className={`st-dot st-dot--${connection}`} title={connection === "ok" ? "Speech service connected" : connection === "wait" ? "Connecting" : connection === "bad" ? "Not connected" : "Off"} />
        <button type="button" className="st-iconbtn st-iconbtn--sm" onClick={onCollapse} title="Fold Verse AI (more room for the Bible)" aria-label="Fold Verse AI"><ChevronsRight size={15} /></button>
      </header>

      {confirmStop && ai.listening ? (
        <div className="st-stopask" role="group" aria-label="Stop listening?">
          <span className="st-stopask__q">Stop listening?</span>
          <button type="button" className="st-stopask__yes" autoFocus onClick={() => { setConfirmStop(false); ai.stop(); }}>Yes, stop</button>
          <button type="button" className="st-stopask__no" onClick={() => setConfirmStop(false)}>Keep listening</button>
        </div>
      ) : (
        <button
          type="button"
          className={`st-listen${ai.listening ? " is-on" : ""}`}
          disabled={ai.starting}
          onClick={() => (ai.listening ? setConfirmStop(true) : void ai.start())}
        >
          {ai.listening ? <><MicOff size={17} /> Stop Listening</> : <><Mic size={17} /> Start Listening</>}
        </button>
      )}

      <div className="st-vai__mic">
        <select value={ai.mic} onChange={(e) => ai.setMic(e.target.value)} disabled={ai.listening} aria-label="Microphone" title={ai.listening ? "Stop listening to change the microphone" : "Microphone"}>
          {ai.mics.length === 0 && <option value="">Default microphone</option>}
          {ai.mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button type="button" className="st-iconbtn st-iconbtn--sm" onClick={() => void ai.refreshMics()} disabled={ai.refreshingMics} aria-label="Refresh microphone list" title={ai.refreshingMics ? "Refreshing microphone list…" : "Refresh microphone list"} aria-busy={ai.refreshingMics}>
          <RefreshCw size={14} className={ai.refreshingMics ? "st-spin" : undefined} />
        </button>
        <button type="button" className={`st-iconbtn${showGain ? " is-on" : ""}`} onClick={() => setShowGain((v) => !v)} aria-label="Microphone sensitivity" title="Microphone sensitivity">
          <SlidersHorizontal size={15} />
        </button>
      </div>
      {showGain && (
        <label className="st-vai__gain">
          <Mic size={13} />
          <span>Sensitivity</span>
          <input type="range" min={25} max={300} step={5} value={ai.gain} onChange={(e) => ai.setGain(Number(e.target.value))} />
          <span className="st-vai__gainval">{ai.gain}%</span>
        </label>
      )}

      <div className="st-vai__status">
        <span className={`st-vai__state${ai.listening ? " is-on" : ""}`}>
          <span className={`st-dot st-dot--${ai.listening ? "ok" : "off"}`} /> {statusText}
        </span>
        {ai.startedAt && <span className="st-vai__timer">{elapsed(now - ai.startedAt)}</span>}
      </div>
      <div className={`st-meter${ai.listening ? " is-on" : ""}`} aria-hidden="true">
        {levels.map((v, i) => <span key={i} style={{ height: `${Math.max(6, v * 100)}%` }} />)}
      </div>

      {(ai.notice || ai.error) && (
        <div className="st-alert" role="alert">
          <span>{ai.notice || ai.error}</span>
          {ai.notice && <button type="button" onClick={ai.clearNotice} aria-label="Dismiss"><X size={12} /></button>}
        </div>
      )}

      <div className="st-vai__tabs" role="tablist" aria-label="Verse AI">
        <button type="button" role="tab" aria-selected={vaiTab === "queue"} className={vaiTab === "queue" ? "is-on" : ""} onClick={() => setVaiTab("queue")}>
          <ListOrdered size={13} /> Queue <span className="st-count">{ai.queue.length + ai.suggestions.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={vaiTab === "transcript"} className={vaiTab === "transcript" ? "is-on" : ""} onClick={() => setVaiTab("transcript")}>
          <Sparkles size={13} /> Transcript
        </button>
        <button type="button" role="tab" aria-selected={vaiTab === "history"} className={vaiTab === "history" ? "is-on" : ""} onClick={() => setVaiTab("history")}>
          History
        </button>
      </div>

      {vaiTab === "queue" && <div className="st-vai__tabbody">{props.queuePanel}</div>}
      {vaiTab === "history" && <div className="st-vai__tabbody">{props.historyPanel}</div>}

      {vaiTab === "transcript" && (
      <div className="st-vai__search">
        <Search size={13} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the transcript" aria-label="Search the transcript" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={12} /></button>}
      </div>
      )}

      {vaiTab === "transcript" && (
      <div className="st-vai__body" ref={listRef} onScroll={onScroll}>
        {hiddenCount > 0 && (
          <button type="button" className="st-more" onClick={() => setShowAll(true)}>Show {hiddenCount} earlier lines</button>
        )}
        {lines.length === 0 && (
          <div className="st-empty">
            {query ? "Nothing in the transcript matches." : ai.listening ? "Listening… what is said will appear here." : "Press Start Listening and the sermon is written here as it is spoken."}
          </div>
        )}
        {lines.map((line) => (
          editing?.id === line.id ? (
            <div key={line.id} className="st-edit">
              <textarea
                autoFocus
                rows={3}
                value={editing.text}
                onChange={(e) => setEditing({ id: line.id, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ai.editLine(line.id, editing.text); setEditing(null); }
                  if (e.key === "Escape") setEditing(null);
                }}
              />
              <div className="st-edit__actions">
                <button type="button" className="studio-btn studio-btn--primary" onClick={() => { ai.editLine(line.id, editing.text); setEditing(null); }}><Check size={13} /> Save</button>
                <button type="button" className="studio-btn" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div
              key={line.id}
              data-line={line.id}
              className={`st-tline${line.finalized ? "" : " is-interim"}${picking === line.id ? " is-picking" : ""}`}
              onDoubleClick={() => { setFollow(false); setPicking(line.id); }}
              title={picking === line.id ? undefined : "Double-click to pick words for the sermon notes"}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(menuAt(e, [
                  { label: "Add to sermon notes", icon: <Plus size={14} />, onSelect: () => keepLine(line.text) },
                  { label: "Edit", icon: <Pencil size={14} />, onSelect: () => setEditing({ id: line.id, text: line.text }) },
                  { label: "Delete", icon: <Trash2 size={14} />, danger: true, divider: true, onSelect: () => ai.deleteLine(line.id) },
                ]));
              }}
            >
              <span className="st-tline__time">{clock(line.at)}</span>
              <span className="st-tline__text">{line.text}</span>
              {picking === line.id && (
                <div className="st-tline__bar" onMouseDown={(e) => e.preventDefault()} onDoubleClick={(e) => e.stopPropagation()}>
                  <span className="st-tline__hint">{picked ? `“${picked.length > 46 ? `${picked.slice(0, 46)}…` : picked}”` : "Drag over the words you want, or double-click a word."}</span>
                  <span className="st-tline__btns">
                    <button type="button" className="st-tline__add" disabled={!picked} onClick={() => { keepLine(picked); setPicking(null); }}><Scissors size={12} /> Add selection</button>
                    <button type="button" onClick={() => { keepLine(line.text); setPicking(null); }}><Plus size={12} /> Whole line</button>
                    <button type="button" onClick={() => setPicking(null)} aria-label="Done">Done</button>
                  </span>
                </div>
              )}
            </div>
          )
        ))}
      </div>

      )}

      {vaiTab === "transcript" && !follow && !query && (
        <button type="button" className="st-jump" onClick={() => setFollow(true)}>Jump to latest ↓</button>
      )}

      <footer className="st-vai__foot">
        <label className={`st-switch st-autocard${autoMode ? " is-on" : ""}`} title="Show detected references on the screen by themselves (suggestions are never shown automatically)">
          <input type="checkbox" checked={autoMode} onChange={(e) => onAutoMode(e.target.checked)} />
          <span className="st-switch__track"><span /></span>
          <span className="st-switch__text">
            <strong><Zap size={12} /> Auto mode</strong>
            <small>{autoMessage || (autoMode ? "Detected references go on the screen" : "Detected references wait in the Queue")}</small>
          </span>
        </label>
      </footer>

      {toast && <div className="st-toast" role="status">{toast}</div>}
      <StudioMenu menu={menu} onClose={() => setMenu(null)} />
    </aside>
  );
}

/** Verse AI folded: a slim rail that still starts / stops listening and shows the counts. */
export function VerseAiRail({ ai, autoMode, onExpand, onOpenDrawer }: {
  ai: StudioVerseAi;
  autoMode: boolean;
  onExpand: () => void;
  onOpenDrawer: (tab: "queue" | "suggestions") => void;
}) {
  const now = useNow(Boolean(ai.startedAt));
  const [askStop, setAskStop] = useState(false);
  useEffect(() => {
    if (!askStop) return undefined;
    const timer = window.setTimeout(() => setAskStop(false), 6000);
    return () => window.clearTimeout(timer);
  }, [askStop]);
  return (
    <aside className="st-rail" aria-label="Verse AI (folded)">
      <button type="button" className="st-iconbtn" onClick={onExpand} title="Open Verse AI" aria-label="Open Verse AI"><ChevronsLeft size={15} /></button>
      <button
        type="button"
        className={`st-rail__mic${ai.listening ? " is-on" : ""}`}
        onClick={() => (ai.listening ? setAskStop((v) => !v) : void ai.start())}
        disabled={ai.starting}
        title={ai.listening ? "Stop listening" : "Start listening"}
        aria-label={ai.listening ? "Stop listening" : "Start listening"}
      >
        {ai.listening ? <MicOff size={18} /> : <Mic size={18} />}
      </button>
      {askStop && ai.listening && (
        <div className="st-stopask st-stopask--pop" role="group" aria-label="Stop listening?">
          <span className="st-stopask__q">Stop listening?</span>
          <button type="button" className="st-stopask__yes" autoFocus onClick={() => { setAskStop(false); ai.stop(); }}>Yes, stop</button>
          <button type="button" className="st-stopask__no" onClick={() => setAskStop(false)}>Keep listening</button>
        </div>
      )}
      {ai.startedAt && <span className="st-rail__time">{elapsed(now - ai.startedAt).slice(3)}</span>}
      <button type="button" className="st-rail__count" onClick={() => onOpenDrawer("queue")} title="Queue">
        <ListOrdered size={14} /><span>{ai.queue.length}</span>
      </button>
      <button type="button" className="st-rail__count" onClick={() => onOpenDrawer("suggestions")} title="Suggestions">
        <Sparkles size={14} /><span>{ai.suggestions.length}</span>
      </button>
      {autoMode && <span className="st-rail__auto" title="Auto mode is on"><Zap size={13} /> Auto</span>}
      {(ai.error || ai.notice) && <span className="st-dot st-dot--bad" title={ai.error || ai.notice} />}
    </aside>
  );
}
