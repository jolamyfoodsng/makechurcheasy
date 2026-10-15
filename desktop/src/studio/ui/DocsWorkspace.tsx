/**
 * DocsWorkspace.tsx — documents and sermon notes in the Studio.
 *
 *  Documents  PDF, Word and PowerPoint files, imported as one picture per page (the same way the
 *             Media page does it). Pick a document, then a page: click = Preview, double-click =
 *             Project. ‹ › step pages, − + zoom the thumbnails, Fit / Fill sets how a page fills
 *             the screen.
 *  Notes      sermon notes (from Verse AI and the Dock's Notes tab); each blank-line block is a slide.
 */
import { useMemo, useRef, useState } from "react";
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronUp, Maximize2, ChevronRight, Eye, FileText, Loader2, Minus, NotebookPen, Play, Plus, Search, Upload, X } from "lucide-react";
import type { MediaItem } from "../../library/libraryTypes";
import type { DockNote } from "../../dock/dockNotesStorage";
import type { StudioSlide } from "../studioEngine";
import StudioModal from "./StudioModal";
import StudioMenu, { menuAt, type StudioMenuState } from "./StudioMenu";

export interface StudioDocument {
  id: string;
  name: string;
  pages: MediaItem[];
  createdAt: string;
}

/** Group rendered pages into documents, newest first. */
export function groupDocuments(media: MediaItem[]): StudioDocument[] {
  const map = new Map<string, StudioDocument>();
  for (const item of media) {
    if (!item.documentId && item.source !== "document-conversion") continue;
    if (item.type !== "image") continue;
    const id = item.documentId || `doc-${item.documentSourceName || item.name}`;
    const doc = map.get(id) ?? { id, name: item.documentSourceName || item.name, pages: [], createdAt: item.createdAt };
    doc.pages.push(item);
    if (item.createdAt > doc.createdAt) doc.createdAt = item.createdAt;
    map.set(id, doc);
  }
  for (const doc of map.values()) doc.pages.sort((a, b) => (a.documentPageNumber ?? 0) - (b.documentPageNumber ?? 0));
  return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type DocsSelection = { kind: "doc"; id: string } | { kind: "note"; id: string } | null;

interface DocsWorkspaceProps {
  documents: StudioDocument[];
  notes: DockNote[];
  selection: DocsSelection;
  onSelect: (selection: DocsSelection) => void;
  /** Slides of the open document or note. */
  slides: StudioSlide[];
  selectedKey: string;
  liveKey: string;
  base: string;
  onPick: (index: number) => void;
  onProject: (index: number) => void;
  onSchedule: (index: number) => void;
  onScheduleWhole: () => void;
  fit: "contain" | "cover";
  onFit: (fit: "contain" | "cover") => void;
  onImport: (files: FileList) => void;
  importing: string;
  /** How far a page that fills the screen is scrolled, 0 (top) to 100 (bottom). */
  scroll: number;
  onScroll: (percent: number) => void;
  /** Which part to show: documents only (Docs), notes only (Text → Notes), or both. */
  mode?: "all" | "documents" | "notes";
}

const DOC_ACCEPT = ".pdf,.docx,.pptx,application/pdf";

const IMPORT_CHOICES: Array<{ label: string; sub: string; accept: string }> = [
  { label: "PDF", sub: "One picture per page", accept: ".pdf,application/pdf" },
  { label: "PowerPoint presentation", sub: ".pptx · one picture per slide", accept: ".pptx" },
  { label: "Word document", sub: ".docx · one picture per page", accept: ".docx" },
  { label: "Any of these", sub: "PDF, PowerPoint or Word, several at once", accept: DOC_ACCEPT },
];

export default function DocsWorkspace(props: DocsWorkspaceProps) {
  const { documents, notes, selection, slides, selectedKey, liveKey, base } = props;
  const mode = props.mode ?? "all";
  const showDocs = mode !== "notes";
  const showNotes = mode !== "documents";
  const searchLabel = mode === "notes" ? "Search notes" : mode === "documents" ? "Search documents" : "Search documents and notes";
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(2);
  const [menu, setMenu] = useState<StudioMenuState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMenu, setImportMenu] = useState(false);
  const [viewing, setViewing] = useState(false);
  const pickImport = (accept: string) => {
    setImportMenu(false);
    if (fileRef.current) {
      fileRef.current.accept = accept;
      fileRef.current.click();
    }
  };

  const needle = query.trim().toLowerCase();
  const docList = useMemo(() => documents.filter((d) => !needle || d.name.toLowerCase().includes(needle)), [documents, needle]);
  const noteList = useMemo(() => [...notes]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((n) => !needle || (n.title || "").toLowerCase().includes(needle) || n.content.toLowerCase().includes(needle)), [notes, needle]);

  const selectedIndex = slides.findIndex((s) => s.key === selectedKey);
  const isDoc = selection?.kind === "doc";
  const title = isDoc
    ? documents.find((d) => d.id === selection.id)?.name
    : selection?.kind === "note" ? (notes.find((n) => n.id === selection.id)?.title || "Untitled note") : "";

  const step = (delta: number) => {
    if (slides.length === 0) return;
    const next = Math.max(0, Math.min(slides.length - 1, (selectedIndex < 0 ? 0 : selectedIndex + delta)));
    props.onPick(next);
  };

  const itemMenu = (index: number, event: { clientX: number; clientY: number }) => setMenu(menuAt(event, [
    { label: "Preview", icon: <Eye size={14} />, onSelect: () => props.onPick(index) },
    { label: "Project", icon: <Play size={14} />, hint: "Double-click", onSelect: () => props.onProject(index) },
    { label: isDoc ? "Add page to Schedule" : "Add slide to Schedule", icon: <CalendarPlus size={14} />, divider: true, onSelect: () => props.onSchedule(index) },
    ...(isDoc ? [] : [{ label: "Add whole note to Schedule", icon: <CalendarPlus size={14} />, onSelect: props.onScheduleWhole }]),
  ]));

  return (
    <section className="st-split2" aria-label={mode === "notes" ? "Notes" : "Docs"}>
      <div className="st-lib">
        <div className="st-lib__top">
          <div className="st-searchbox">
            <Search size={13} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchLabel} aria-label={searchLabel} />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={12} /></button>}
          </div>
        </div>
        <div className="st-lib__list">
          {showDocs && mode === "all" && <div className="st-lib__group">Documents</div>}
          {showDocs && docList.length === 0 && <div className="st-empty st-empty--small">{documents.length ? "No document matches." : "Import a PDF, Word or PowerPoint file."}</div>}
          {showDocs && docList.map((d) => (
            <div key={d.id} className={`st-lib__row${selection?.kind === "doc" && selection.id === d.id ? " is-on" : ""}`}>
              <button type="button" className="st-lib__main" onClick={() => props.onSelect({ kind: "doc", id: d.id })}>
                <span className="st-lib__title"><FileText size={12} /> {d.name}</span>
                <span className="st-lib__sub">{d.pages.length} page{d.pages.length === 1 ? "" : "s"}</span>
              </button>
            </div>
          ))}
          {showNotes && mode === "all" && <div className="st-lib__group">Sermon notes</div>}
          {showNotes && noteList.length === 0 && <div className="st-empty st-empty--small">{notes.length ? "No note matches." : "Notes from Verse AI and the Dock show up here."}</div>}
          {showNotes && noteList.map((n) => (
            <div key={n.id} className={`st-lib__row${selection?.kind === "note" && selection.id === n.id ? " is-on" : ""}`}>
              <button type="button" className="st-lib__main" onClick={() => props.onSelect({ kind: "note", id: n.id })}>
                <span className="st-lib__title"><NotebookPen size={12} /> {n.title || "Untitled note"}</span>
                <span className="st-lib__sub">{n.content.split("\n").find((l) => l.trim()) || "Empty note"}</span>
              </button>
            </div>
          ))}
        </div>
        {showDocs && (
          <div className="st-lib__foot st-import">
            {importMenu && (
              <div className="st-import__menu" role="menu">
                {IMPORT_CHOICES.map((c) => (
                  <button key={c.label} type="button" role="menuitem" onClick={() => pickImport(c.accept)}>
                    <strong>{c.label}</strong>
                    <span>{c.sub}</span>
                  </button>
                ))}
                <p className="st-import__tip">Google Docs or Slides: choose File → Download → PDF (or Word / PowerPoint), then import that file. Keynote: Export to PowerPoint or PDF first.</p>
              </div>
            )}
            <button type="button" className="studio-btn studio-btn--primary" onClick={() => setImportMenu((v) => !v)} disabled={Boolean(props.importing)} aria-expanded={importMenu}>
              {props.importing ? <Loader2 size={13} className="st-spin" /> : <Upload size={13} />} Import Document <ChevronDown size={13} />
            </button>
            <input ref={fileRef} type="file" hidden multiple accept={DOC_ACCEPT} onChange={(e) => { if (e.target.files?.length) props.onImport(e.target.files); e.target.value = ""; }} />
          </div>
        )}
      </div>

      <div className="st-pages">
        {props.importing && <div className="st-banner" role="status">{props.importing}</div>}
        {!selection ? (
          <div className="st-empty st-empty--big"><FileText size={22} /> {mode === "notes" ? "Pick a note on the left." : mode === "documents" ? "Pick a document on the left." : "Pick a document or a note on the left."}</div>
        ) : (
          <>
            <div className="st-pages__bar">
              <h2 title={title}>{title}</h2>
              <div className="st-stepper">
                <button type="button" className="st-iconbtn" onClick={() => step(-1)} disabled={selectedIndex <= 0} aria-label="Previous page" title="Previous page"><ChevronLeft size={16} /></button>
                <span className="st-pages__count">{selectedIndex >= 0 ? selectedIndex + 1 : "–"} / {slides.length}</span>
                <button type="button" className="st-iconbtn" onClick={() => step(1)} disabled={selectedIndex >= slides.length - 1} aria-label="Next page" title="Next page"><ChevronRight size={16} /></button>
              </div>
              {isDoc && (
                <>
                  <div className="st-stepper" aria-label="Zoom">
                    <button type="button" className="st-iconbtn" onClick={() => setZoom((z) => Math.max(1, z - 1))} aria-label="Smaller pages" title="Smaller pages"><Minus size={14} /></button>
                    <button type="button" className="st-iconbtn" onClick={() => setZoom((z) => Math.min(4, z + 1))} aria-label="Bigger pages" title="Bigger pages"><Plus size={14} /></button>
                  </div>
                  <div className="st-stepper st-docscroll" role="group" aria-label="Scroll the page on the screen" title="Move a page that fills the screen up or down (also: mouse wheel over the monitor)">
                    <button type="button" className="st-iconbtn" onClick={() => props.onScroll(Math.max(0, props.scroll - 10))} disabled={props.scroll <= 0} aria-label="Scroll up" title="Scroll up"><ChevronUp size={15} /></button>
                    <input type="range" min={0} max={100} step={1} value={props.scroll} onChange={(e) => props.onScroll(Number(e.target.value))} aria-label="Page position" />
                    <button type="button" className="st-iconbtn" onClick={() => props.onScroll(Math.min(100, props.scroll + 10))} disabled={props.scroll >= 100} aria-label="Scroll down" title="Scroll down"><ChevronDown size={15} /></button>
                  </div>
                  <button type="button" className="studio-btn" onClick={() => setViewing(true)} disabled={selectedIndex < 0} title="Read this page here, and scroll it"><Maximize2 size={13} /> View</button>
                  <div className="st-seg" role="group" aria-label="Page on the screen">
                    <button type="button" className={props.fit === "contain" ? "is-on" : ""} onClick={() => props.onFit("contain")} title="Show the whole page">Fit to Screen</button>
                    <button type="button" className={props.fit === "cover" ? "is-on" : ""} onClick={() => props.onFit("cover")} title="Fill the screen (edges may be cut)">Fill</button>
                  </div>
                </>
              )}
              <button type="button" className="studio-btn" onClick={props.onScheduleWhole}><CalendarPlus size={13} /> Add to Schedule</button>
            </div>
            <div className={isDoc ? `st-pages__grid st-pages__grid--z${zoom}` : "st-pages__notes"}>
              {slides.length === 0 && <div className="st-empty">{isDoc ? "This document has no pages." : "This note is empty."}</div>}
              {slides.map((slide, i) => {
                const isSel = slide.key === selectedKey;
                const isLive = slide.key === liveKey;
                const small = (slide as StudioSlide & { thumb?: string }).thumb;
                const thumb = small && /^(data:|https?:|blob:)/i.test(small) ? small : slide.media?.url ? `${base}${small || slide.media.url}` : "";
                return (
                  <div
                    key={slide.key}
                    role="button"
                    tabIndex={0}
                    className={`${isDoc ? "st-page" : "st-section"}${isSel ? " is-selected" : ""}${isLive ? " is-live" : ""}`}
                    onClick={() => props.onPick(i)}
                    onDoubleClick={() => props.onProject(i)}
                    onKeyDown={(e) => { if (e.key === "Enter") props.onPick(i); }}
                    onContextMenu={(e) => { e.preventDefault(); itemMenu(i, e); }}
                  >
                    {isDoc ? (
                      <>
                        <span className="st-page__img">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <FileText size={20} />}</span>
                        <span className="st-page__num">{i + 1}{isLive && <span className="st-tag st-tag--live">LIVE</span>}</span>
                      </>
                    ) : (
                      <>
                        <span className="st-section__tag">SLIDE {i + 1}</span>
                        <span className="st-section__text">{slide.text}</span>
                        {isLive && <span className="st-tag st-tag--live">LIVE</span>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      {viewing && selectedIndex >= 0 && slides[selectedIndex]?.media?.url && (
        <StudioModal title={`${title} · page ${selectedIndex + 1}`} big onClose={() => setViewing(false)}
          actions={(
            <div className="st-stepper">
              <button type="button" className="st-iconbtn" onClick={() => step(-1)} disabled={selectedIndex <= 0} aria-label="Previous page"><ChevronLeft size={16} /></button>
              <span className="st-pages__count">{selectedIndex + 1} / {slides.length}</span>
              <button type="button" className="st-iconbtn" onClick={() => step(1)} disabled={selectedIndex >= slides.length - 1} aria-label="Next page"><ChevronRight size={16} /></button>
            </div>
          )}>
          <div className="st-docview">
            <img src={`${base}${slides[selectedIndex]?.media?.url ?? ""}`} alt={`Page ${selectedIndex + 1}`} />
          </div>
        </StudioModal>
      )}
      <StudioMenu menu={menu} onClose={() => setMenu(null)} />
    </section>
  );
}
