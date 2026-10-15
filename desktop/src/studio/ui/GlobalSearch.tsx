/**
 * GlobalSearch.tsx — type anywhere in the Studio and search everything.
 *
 * Press any letter or number (while not typing in a box), or Cmd/Ctrl+K. Results are grouped:
 *   Bible (references like "j316", "Psalm 23", words like "God so loved", "@kjv" translations),
 *   Songs (titles and lyrics), Notes, Media, Documents, Graphics (banners, logo, backdrops)
 *   and Commands (Auto mode, Clear, Black screen, listening, ...). Start with ">" to see only commands.
 *
 *   Enter          show it the way the Studio is set: Preview first -> Preview, Straight to screen -> screen
 *   Cmd/Ctrl+Enter the other way round
 *   Shift+Enter    add it to the Schedule
 *   Esc            close
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { BookOpen, CalendarPlus, Command as CommandIcon, FileText, Image as ImageIcon, Layers, Music, Search, StickyNote, X } from "lucide-react";
import { parseBibleSearch } from "../../dock/bibleSearchParser";
import { detectActiveTranslationPrompt, getTranslationDirectiveSuggestions } from "../../dock/dockBibleCatalog";
import { warmQuoteIndex } from "../../bible/quoteIndexStore";
import { searchQuoteIndex } from "../../bible/quoteIndex";
import { searchBible } from "../../bible/bibleData";
import type { Song } from "../../worship/types";
import type { DockNote } from "../../dock/dockNotesStorage";
import type { MediaItem } from "../../library/libraryTypes";
import type { StudioMixLayer } from "../studioMix";
import { mediaPath } from "../studioSlides";

export type GlobalResult =
  | { kind: "bible"; key: string; title: string; sub?: string; book: string; chapter: number; verse?: number; endVerse?: number; translation?: string }
  | { kind: "song"; key: string; title: string; sub?: string; songId: string; index: number }
  | { kind: "note"; key: string; title: string; sub?: string; noteId: string; index: number }
  | { kind: "media"; key: string; title: string; sub?: string; mediaId: string; thumb?: string }
  | { kind: "doc"; key: string; title: string; sub?: string; mediaId: string; thumb?: string }
  | { kind: "graphic"; key: string; title: string; sub?: string; layerId: string }
  | { kind: "command"; key: string; title: string; sub?: string; run: () => void };

export type GlobalRunMode = "follow" | "opposite" | "schedule";

export interface GlobalCommand {
  id: string;
  title: string;
  hint?: string;
  keywords: string;
  run: () => void;
}

export interface GlobalSearchProps {
  /** What was typed to open it (the first key). */
  initial: string;
  onClose: () => void;
  onRun: (result: GlobalResult, mode: GlobalRunMode) => void;
  book: string;
  chapter: number;
  translation: string;
  translations: string[];
  songs: Song[];
  notes: DockNote[];
  /** Library media (pictures, videos, sounds) and the pages of documents (they share one list). */
  media: MediaItem[];
  /** Where media files are served from, to draw their pictures. */
  mediaBase: string;
  mix: StudioMixLayer[];
  commands: GlobalCommand[];
  previewFirst: boolean;
}

const GROUP_LABEL: Record<GlobalResult["kind"], string> = {
  bible: "Bible",
  song: "Songs and lyrics",
  note: "Notes",
  media: "Media",
  doc: "Documents",
  graphic: "Graphics",
  command: "Commands",
};

const GROUP_ORDER: GlobalResult["kind"][] = ["bible", "command", "song", "note", "media", "doc", "graphic"];

const ICON: Record<GlobalResult["kind"], ReactElement> = {
  bible: <BookOpen size={15} />,
  song: <Music size={15} />,
  note: <StickyNote size={15} />,
  media: <ImageIcon size={15} />,
  doc: <FileText size={15} />,
  graphic: <Layers size={15} />,
  command: <CommandIcon size={15} />,
};

const norm = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** A short piece of `text` around the first match of `needle`. */
function snippet(text: string, needle: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = norm(flat).indexOf(needle);
  if (at < 0) return flat.slice(0, 90);
  const start = Math.max(0, at - 24);
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + 100)}${start + 100 < flat.length ? "…" : ""}`;
}

export default function GlobalSearch(props: GlobalSearchProps) {
  const { songs, notes, media, mix, commands, mediaBase } = props;
  const thumbFor = (item: MediaItem): string => {
    const t = item.thumbnailUrl || (item.type === "image" ? mediaPath(item) : "");
    if (!t) return "";
    return /^(data:|https?:|blob:)/i.test(t) ? t : `${mediaBase}${t}`;
  };
  const [query, setQuery] = useState(props.initial);
  const [active, setActive] = useState(0);
  const [bibleWords, setBibleWords] = useState<GlobalResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const commandMode = query.trimStart().startsWith(">");
  const text = commandMode ? query.trimStart().slice(1).trim() : query.trim();
  const needle = norm(text);

  // Words from the Bible (not a reference): the quick keyword index first, then the word search.
  useEffect(() => {
    const words = text.split(/\s+/).filter(Boolean);
    if (commandMode || words.length < 2 || /\d/.test(text) || /[@~/]/.test(text)) {
      setBibleWords([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void warmQuoteIndex(props.translation).then(async (index) => {
        if (cancelled) return;
        let found: GlobalResult[] = [];
        if (index) {
          found = searchQuoteIndex(index, text, { limit: 5 }).map((h, i) => ({
            kind: "bible" as const, key: `bw-${i}-${h.book}-${h.chapter}-${h.verse}`, title: `${h.book} ${h.chapter}:${h.verse}`, sub: h.text,
            book: h.book, chapter: h.chapter, verse: h.verse,
          }));
        }
        if (found.length === 0) {
          const loose = await searchBible(text, props.translation, 5).catch(() => []);
          found = loose.map((h, i) => ({
            kind: "bible" as const, key: `bk-${i}-${h.book}-${h.chapter}-${h.verse}`, title: `${h.book} ${h.chapter}:${h.verse}`, sub: h.text,
            book: h.book, chapter: h.chapter, verse: h.verse,
          }));
        }
        if (!cancelled) setBibleWords(found);
      }).catch(() => undefined);
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [text, commandMode, props.translation]);

  const results = useMemo<GlobalResult[]>(() => {
    const out: GlobalResult[] = [];
    const matchCommands = (list: GlobalCommand[]) => list
      .filter((c) => !needle || norm(`${c.title} ${c.keywords}`).includes(needle))
      .slice(0, commandMode || !needle ? 12 : 4)
      .map<GlobalResult>((c) => ({ kind: "command", key: `cmd-${c.id}`, title: c.title, sub: c.hint, run: c.run }));

    if (commandMode || !text) {
      out.push(...matchCommands(commands));
      return out;
    }

    // Bible: "@kjv", "john 3:16 @amp" ask which translation; otherwise references, then words.
    try {
      const prompt = detectActiveTranslationPrompt(query.trim(), { context: { currentBook: props.book, currentChapter: props.chapter } });
      if (prompt && prompt.trigger !== "//" && prompt.trigger !== "||") {
        const options = props.translations.map((t) => ({ value: t, label: t }));
        for (const sug of getTranslationDirectiveSuggestions(prompt, options, 6)) {
          out.push({
            kind: "bible",
            key: `dir-${sug.abbr}`,
            title: sug.label,
            sub: sug.isInstalled ? sug.name : `${sug.name}: not installed on this computer`,
            book: sug.isInstalled ? (sug.baseReference?.book ?? "") : "",
            chapter: sug.isInstalled ? (sug.baseReference?.chapter ?? 0) : 0,
            verse: sug.baseReference?.verse ?? undefined,
            endVerse: sug.baseReference?.endVerse ?? undefined,
            translation: sug.isInstalled ? sug.abbr : undefined,
          });
        }
      }
    } catch { /* fall through to the other results */ }
    if (out.length === 0) {
      try {
        parseBibleSearch(query.trim(), { context: { currentBook: props.book, currentChapter: props.chapter } })
          .filter((r) => r.book && r.chapter !== null && r.action !== "clear")
          .slice(0, 4)
          .forEach((r, i) => out.push({
            kind: "bible", key: `ref-${i}-${r.label}`, title: r.label, sub: r.translationOverride ? `in ${r.translationOverride}` : props.translation,
            book: r.book, chapter: r.chapter as number, verse: r.verse ?? undefined, endVerse: r.endVerse ?? undefined,
            translation: r.translationOverride && props.translations.includes(r.translationOverride) ? r.translationOverride : undefined,
          }));
      } catch { /* not a reference */ }
      const seen = new Set(out.map((o) => (o.kind === "bible" ? `${o.book}|${o.chapter}|${o.verse ?? ""}` : "")));
      for (const hit of bibleWords) {
        if (hit.kind === "bible" && !seen.has(`${hit.book}|${hit.chapter}|${hit.verse ?? ""}`)) out.push(hit);
      }
    }

    out.push(...matchCommands(commands));

    // Songs: title, artist, hymn number, or a line of the lyrics (it opens that very slide).
    if (needle.length >= 2) {
      let songCount = 0;
      for (const song of songs) {
        if (song.archived || songCount >= 5) continue;
        const title = norm(song.metadata.title);
        const artist = norm(song.metadata.artist || "");
        const byTitle = title.includes(needle) || artist.includes(needle) || (song.metadata.hymnNumber || "") === text;
        let slideAt = -1;
        let slideText = "";
        (song.slides || []).forEach((slide, i) => {
          if (slideAt < 0 && norm(slide.content).includes(needle)) { slideAt = i; slideText = slide.content; }
        });
        if (!byTitle && slideAt < 0) continue;
        songCount += 1;
        out.push({
          kind: "song",
          key: `song-${song.id}`,
          title: song.metadata.title,
          sub: byTitle && slideAt < 0 ? [song.metadata.artist, `${song.slides?.length ?? 0} slides`].filter(Boolean).join(" · ") : snippet(slideText, needle),
          songId: song.id,
          index: Math.max(0, slideAt),
        });
      }

      // Notes: title, or a line of the text (it opens the block that has it).
      let noteCount = 0;
      for (const note of notes) {
        if (noteCount >= 4) break;
        const inTitle = norm(note.title || "").includes(needle);
        const blocks = (note.content || "").split(/\n[ \t]*\n+/).map((b) => b.trim()).filter(Boolean);
        const at = blocks.findIndex((b) => norm(b).includes(needle));
        if (!inTitle && at < 0) continue;
        noteCount += 1;
        out.push({ kind: "note", key: `note-${note.id}`, title: note.title || "Untitled note", sub: at >= 0 ? snippet(blocks[at], needle) : `${blocks.length} slides`, noteId: note.id, index: Math.max(0, at) });
      }

      // Media and documents.
      let mediaCount = 0;
      let docCount = 0;
      const seenDocs = new Set<string>();
      for (const item of media) {
        const isDoc = Boolean(item.documentId) || item.source === "document-conversion";
        const name = isDoc ? (item.documentSourceName || item.name) : item.name;
        if (!norm(name).includes(needle)) continue;
        if (isDoc) {
          const id = item.documentId || name;
          if (seenDocs.has(id) || docCount >= 4) continue;
          seenDocs.add(id);
          docCount += 1;
          // Open the first page of the document.
          const first = media
            .filter((m) => (m.documentId || m.documentSourceName || m.name) === (item.documentId || item.documentSourceName || item.name))
            .sort((a, b) => (a.documentPageNumber ?? 0) - (b.documentPageNumber ?? 0))[0] ?? item;
          out.push({ kind: "doc", key: `doc-${id}`, title: name, sub: `${item.documentPageCount ?? ""}${item.documentPageCount ? " pages" : "Document"}`, mediaId: first.id, thumb: thumbFor(first) });
        } else if (mediaCount < 8) {
          mediaCount += 1;
          out.push({ kind: "media", key: `media-${item.id}`, title: name, sub: item.type === "video" ? "Video" : item.type === "audio" ? "Sound" : "Picture", mediaId: item.id, thumb: thumbFor(item) });
        }
      }

      // Graphics: the Screen Mix layers (banners, logo, backdrops).
      let graphicCount = 0;
      for (const layer of mix) {
        if (graphicCount >= 4) break;
        const label = `${layer.name} ${layer.text ?? ""} ${layer.subtext ?? ""} ${layer.kind}`;
        if (!norm(label).includes(needle)) continue;
        graphicCount += 1;
        out.push({ kind: "graphic", key: `gfx-${layer.id}`, title: layer.name || layer.text || layer.kind, sub: `${layer.kind}${layer.shown ? " · on the screen now (Enter hides it)" : " · Enter shows it"}`, layerId: layer.id });
      }
    }

    // Keep the group order stable.
    return out.sort((a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind));
  }, [query, text, needle, commandMode, bibleWords, commands, songs, notes, media, mediaBase, mix, props.book, props.chapter, props.translation, props.translations]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [active, results.length]);

  const run = (result: GlobalResult | undefined, mode: GlobalRunMode) => {
    if (!result) return;
    if (result.kind === "bible" && !result.book && !result.translation) return; // a translation that is not installed
    props.onClose();
    props.onRun(result, mode);
  };

  const shownFirst = props.previewFirst ? "Preview" : "the screen";
  const otherWay = props.previewFirst ? "the screen" : "Preview";

  return (
    <div className="st-gs" role="dialog" aria-label="Search everything" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="st-gs__box">
        <div className="st-gs__input">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); props.onClose(); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setActive((v) => Math.min(results.length - 1, v + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((v) => Math.max(0, v - 1)); }
              else if (e.key === "Enter") {
                e.preventDefault();
                run(results[active], e.shiftKey ? "schedule" : e.metaKey || e.ctrlKey ? "opposite" : "follow");
              }
            }}
            placeholder="Search the Bible, songs, notes, media, graphics… or type > for commands"
            aria-label="Search everything"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="button" className="st-gs__x" onClick={props.onClose} aria-label="Close search"><X size={15} /></button>
        </div>
        <div className="st-gs__list" ref={listRef} role="listbox">
          {results.length === 0 && (
            <div className="st-gs__empty">
              {text ? "Nothing found. Try a Bible reference (j316), words from a verse or song, or > for commands." : "Start typing. Try j316, God so loved, @kjv, a song name, or > for commands."}
            </div>
          )}
          {results.map((r, i) => {
            const newGroup = i === 0 || results[i - 1].kind !== r.kind;
            return (
              <div key={r.key}>
                {newGroup && <div className="st-gs__group">{GROUP_LABEL[r.kind]}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  className={`st-gs__row${i === active ? " is-on" : ""}${r.kind === "bible" && !r.book && !r.translation ? " is-off" : ""}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(r, "follow")}
                >
                  {(r.kind === "media" || r.kind === "doc") && r.thumb
                    ? <span className="st-gs__thumb"><img src={r.thumb} alt="" loading="lazy" /></span>
                    : <span className="st-gs__icon">{ICON[r.kind]}</span>}
                  <span className="st-gs__text">
                    <strong>{r.title}</strong>
                    {r.sub && <span>{r.sub}</span>}
                  </span>
                  {i === active && <kbd>↵</kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="st-gs__foot" aria-hidden="true">
          <span><kbd>↵</kbd> {shownFirst}</span>
          <span><kbd>⌘</kbd><kbd>↵</kbd> {otherWay}</span>
          <span><kbd>⇧</kbd><kbd>↵</kbd> <CalendarPlus size={12} /> Schedule</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> choose</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
