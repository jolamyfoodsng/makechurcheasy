/**
 * VerseAiPanel.tsx — the Verse AI tab at the bottom of the Studio.
 *
 *  Transcript   click a line to keep it in the sermon notes; right-click to edit or delete it.
 *  Queue        verses the pastor named directly. Click one to open it in Preview.
 *  Suggestions  verses the message seems to be about. "+ Queue" moves one to the Queue.
 *  Sermon notes the points kept so far. Right-click to edit, move or delete. "Convert notes
 *               to project" turns them into slides and puts them in today's schedule.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowDown, ArrowUp, Check, Mic, MicOff, Pencil, Plus, Presentation, Trash2, X } from "lucide-react";
import { loadDockNotes, saveDockNotes, type DockNote } from "../../dock/dockNotesStorage";
import type { VoiceBibleCandidate } from "../../services/voiceBibleTypes";
import type { StudioVerseAi } from "../useVerseAi";

interface VerseAiPanelProps {
  ai: StudioVerseAi;
  notes: DockNote[];
  /** Open a verse in the Studio. `live` shows it straight away. */
  onOpenVerse: (candidate: VoiceBibleCandidate, live: boolean) => void;
  /** Turn a note into slides and add it to today's schedule. */
  onConvert: (note: DockNote) => void;
}

interface MenuState {
  x: number;
  y: number;
  kind: "line" | "point";
  /** Transcript line id, or the point's index as text. */
  key: string;
}

interface EditState {
  kind: "line" | "point";
  key: string;
  text: string;
}

/** A note is a list of points separated by blank lines (each one becomes a slide). */
function pointsOf(note: DockNote | undefined): string[] {
  if (!note) return [];
  return note.content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function saveNotePoints(noteId: string, points: string[]): void {
  const all = loadDockNotes();
  saveDockNotes(all.map((n) => (n.id === noteId ? { ...n, content: points.join("\n\n"), updatedAt: Date.now() } : n)));
}

export default function VerseAiPanel({ ai, notes, onOpenVerse, onConvert }: VerseAiPanelProps) {
  const [noteId, setNoteId] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes]);
  const note = sorted.find((n) => n.id === noteId) ?? sorted[0];
  const points = pointsOf(note);

  // Keep the newest transcript line in view.
  useEffect(() => {
    const box = transcriptRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [ai.lines.length]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const keepLine = (text: string) => {
    const id = ai.pushToNotes(text);
    if (id) {
      setNoteId(id);
      setToast("Added to sermon notes");
    }
  };

  const openMenu = (kind: MenuState["kind"], key: string, event: ReactMouseEvent) => {
    event.preventDefault();
    setMenu({ kind, key, x: Math.min(event.clientX, window.innerWidth - 200), y: Math.min(event.clientY, window.innerHeight - 190) });
  };

  const startEdit = (kind: EditState["kind"], key: string, text: string) => {
    setMenu(null);
    setEditing({ kind, key, text });
  };

  const commitEdit = () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (text) {
      if (editing.kind === "line") ai.editLine(editing.key, text);
      else if (note) {
        const next = [...points];
        next[Number(editing.key)] = text;
        saveNotePoints(note.id, next);
      }
    }
    setEditing(null);
  };

  const movePoint = (index: number, delta: -1 | 1) => {
    setMenu(null);
    if (!note) return;
    const target = index + delta;
    if (target < 0 || target >= points.length) return;
    const next = [...points];
    [next[index], next[target]] = [next[target], next[index]];
    saveNotePoints(note.id, next);
  };

  const deletePoint = (index: number) => {
    setMenu(null);
    if (!note) return;
    saveNotePoints(note.id, points.filter((_, i) => i !== index));
  };

  const addPoint = () => {
    const text = draft.trim();
    if (!text) return;
    if (note) {
      saveNotePoints(note.id, [...points, text]);
    } else {
      const id = ai.pushToNotes(text);
      if (id) setNoteId(id);
    }
    setDraft("");
  };

  const lineById = (id: string) => ai.lines.find((l) => l.id === id);
  const menuLine = menu?.kind === "line" ? lineById(menu.key) : undefined;
  const menuIndex = menu?.kind === "point" ? Number(menu.key) : -1;

  const statusText = ai.starting ? "Checking…"
    : ai.status === "requesting-mic" ? "Opening the microphone…"
      : ai.status === "connecting" ? "Connecting…"
        : ai.status === "listening" ? (ai.matching ? "Listening · matching…" : "Listening")
          : "Not listening";

  const renderEdit = () => (
    <div className="sx-edit">
      <textarea
        autoFocus
        value={editing?.text ?? ""}
        onChange={(e) => setEditing((cur) => (cur ? { ...cur, text: e.target.value } : cur))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); }
          if (e.key === "Escape") setEditing(null);
        }}
        rows={3}
      />
      <div className="sx-edit__actions">
        <button type="button" className="studio-btn studio-btn--primary" onClick={commitEdit}><Check size={13} /> Save</button>
        <button type="button" className="studio-btn" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </div>
  );

  const renderVerse = (c: VoiceBibleCandidate, kind: "queue" | "suggestion") => (
    <div key={`${kind}-${c.book}-${c.chapter}-${c.verse}-${c.endVerse ?? ""}`} className="sx-vrow">
      <button type="button" className="sx-vrow__main" onClick={() => onOpenVerse(c, false)} onDoubleClick={() => onOpenVerse(c, true)} title="Click = Preview · double-click = Live">
        <span className="sx-vrow__ref">{c.label}</span>
        <span className="sx-vrow__text">{c.snippet}</span>
      </button>
      {kind === "suggestion" ? (
        <>
          <span className="sx-vrow__conf">{Math.round(c.confidence * 100)}%</span>
          <button type="button" className="sx-mini" onClick={() => ai.addToQueue(c)}><Plus size={12} /> Queue</button>
        </>
      ) : (
        <button type="button" className="sx-mini sx-mini--icon" onClick={() => ai.removeFromQueue(c)} aria-label={`Remove ${c.label}`}><X size={12} /></button>
      )}
    </div>
  );

  return (
    <div className="sx-vai">
      <div className="sx-vai__bar">
        <button
          type="button"
          className={`studio-btn ${ai.listening ? "studio-btn--live" : "studio-btn--primary"}`}
          disabled={ai.starting}
          onClick={() => (ai.listening ? ai.stop() : void ai.start())}
        >
          {ai.listening ? <><MicOff size={14} /> Stop listening</> : <><Mic size={14} /> Start listening</>}
        </button>
        {!ai.listening && ai.mics.length > 1 && (
          <select value={ai.mic} onChange={(e) => ai.setMic(e.target.value)} aria-label="Microphone">
            {ai.mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
        <span className={`sx-vai__status${ai.listening ? " is-on" : ""}`}>{statusText}</span>
        {(ai.notice || ai.error) && (
          <span className="sx-vai__warn" role="alert">
            {ai.notice || ai.error}
            {ai.notice && <button type="button" onClick={ai.clearNotice} aria-label="Dismiss"><X size={12} /></button>}
          </span>
        )}
        {toast && <span className="sx-vai__toast">{toast}</span>}
      </div>

      <div className="sx-vai__cols">
        <section className="sx-vcol" aria-label="Transcript">
          <header><strong>Transcript</strong><span>click a line to keep it · right-click to edit</span></header>
          <div className="sx-vcol__body" ref={transcriptRef}>
            {ai.lines.length === 0 && (
              <div className="sx-empty">{ai.listening ? "Listening… what is said will appear here." : "Press Start listening and the message is written here as it is spoken."}</div>
            )}
            {ai.lines.map((line) => (
              editing?.kind === "line" && editing.key === line.id ? (
                <div key={line.id}>{renderEdit()}</div>
              ) : (
                <button
                  key={line.id}
                  type="button"
                  className={`sx-tline${line.finalized ? "" : " is-interim"}`}
                  onClick={() => keepLine(line.text)}
                  onContextMenu={(e) => openMenu("line", line.id, e)}
                  title="Click to keep this in the sermon notes"
                >
                  {line.text}
                </button>
              )
            ))}
          </div>
        </section>

        <section className="sx-vcol" aria-label="Sermon notes">
          <header>
            <strong>Sermon notes</strong>
            {sorted.length > 1 ? (
              <select value={note?.id ?? ""} onChange={(e) => setNoteId(e.target.value)} aria-label="Note">
                {sorted.map((n) => <option key={n.id} value={n.id}>{n.title || "Untitled note"}</option>)}
              </select>
            ) : (
              <span>{note?.title || "no note yet"}</span>
            )}
          </header>
          <div className="sx-vcol__body">
            {points.length === 0 && <div className="sx-empty">Click a transcript line, or type a point below, to start the sermon notes.</div>}
            {points.map((point, index) => (
              editing?.kind === "point" && editing.key === String(index) ? (
                <div key={`${note?.id}-${index}`}>{renderEdit()}</div>
              ) : (
                <div key={`${note?.id}-${index}`} className="sx-point" onContextMenu={(e) => openMenu("point", String(index), e)}>
                  <span className="sx-point__n">{index + 1}</span>
                  <span className="sx-point__text">{point}</span>
                </div>
              )
            ))}
          </div>
          <div className="sx-vcol__foot">
            <input
              value={draft}
              placeholder="Type a point and press Enter"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addPoint(); }}
              aria-label="Add a point"
            />
            <button
              type="button"
              className="studio-btn studio-btn--primary"
              disabled={!note || points.length === 0}
              onClick={() => note && onConvert(note)}
              title="Make slides from these notes and add them to today's schedule"
            >
              <Presentation size={14} /> Convert notes to project
            </button>
          </div>
        </section>

        <section className="sx-vcol" aria-label="Verses">
          <header><strong>Queue</strong><span>verses named directly</span></header>
          <div className="sx-vcol__body sx-vcol__body--half">
            {ai.queue.length === 0 && <div className="sx-empty">When the pastor says a reference like “John 3:16”, it lands here.</div>}
            {ai.queue.map((c) => renderVerse(c, "queue"))}
          </div>
          <header><strong>Suggestions</strong><span>verses the message seems to be about</span></header>
          <div className="sx-vcol__body sx-vcol__body--half">
            {ai.suggestions.length === 0 && <div className="sx-empty">Verses that match what is being preached show up here.</div>}
            {ai.suggestions.map((c) => renderVerse(c, "suggestion"))}
          </div>
        </section>
      </div>

      {menu && (
        <>
          <div className="studio-menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="studio-menu" style={{ left: menu.x, top: menu.y }} role="menu">
            {menu.kind === "line" && menuLine && (
              <>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); keepLine(menuLine.text); }}><Plus size={14} /> <span>Add to sermon notes</span></button>
                <button type="button" role="menuitem" onClick={() => startEdit("line", menuLine.id, menuLine.text)}><Pencil size={14} /> <span>Edit</span></button>
                <div className="studio-menu__divider" />
                <button type="button" role="menuitem" onClick={() => { setMenu(null); ai.deleteLine(menuLine.id); }}><Trash2 size={14} /> <span>Delete</span></button>
              </>
            )}
            {menu.kind === "point" && menuIndex >= 0 && (
              <>
                <button type="button" role="menuitem" onClick={() => startEdit("point", menu.key, points[menuIndex] ?? "")}><Pencil size={14} /> <span>Edit</span></button>
                <button type="button" role="menuitem" disabled={menuIndex === 0} onClick={() => movePoint(menuIndex, -1)}><ArrowUp size={14} /> <span>Move up</span></button>
                <button type="button" role="menuitem" disabled={menuIndex >= points.length - 1} onClick={() => movePoint(menuIndex, 1)}><ArrowDown size={14} /> <span>Move down</span></button>
                <div className="studio-menu__divider" />
                <button type="button" role="menuitem" onClick={() => deletePoint(menuIndex)}><Trash2 size={14} /> <span>Delete</span></button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
