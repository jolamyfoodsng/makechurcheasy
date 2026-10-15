/**
 * studioItems.ts — turns Studio slides into schedule / history entries and back again, so any
 * item in Schedule or History can be opened or projected again from any Studio section.
 *
 * The entries use the same payload keys the Dock writes (book/chapter/verse, songId/sectionIdx,
 * noteId/slideIndex, filePath), so Dock and Studio read each other's schedules.
 */
import type { ServicePlanItem } from "../service-planner/types";
import type { Song } from "../worship/types";
import type { DockNote } from "../dock/dockNotesStorage";
import type { MediaItem } from "../library/libraryTypes";
import { bibleRangeSlide, noteSlides, type StudioMode, type StudioSlide } from "./studioEngine";
import { mediaPath, mediaSlide, songSlides } from "./studioSlides";
import type { StudioSection } from "./studioLayout";

export interface PlanItemDraft {
  type: ServicePlanItem["type"];
  label: string;
  subtitle?: string;
  sourceId?: string;
  sourceKind?: ServicePlanItem["sourceKind"];
  notes?: string;
  payloadSnapshot: Record<string, unknown>;
  overlayMode?: StudioMode;
}

function firstLines(text: string, count = 2): string {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, count).join(" / ");
}

/** Schedule / history entry for a slide (null when the slide can't be found again). */
export function planDraftForSlide(slide: StudioSlide, mode: StudioMode): PlanItemDraft | null {
  const o = slide.origin;
  if (slide.module === "bible") {
    const book = o?.book;
    const chapter = o?.chapter;
    const verse = o?.verse ?? slide.verse;
    if (!book || !chapter || !verse) return null;
    const endVerse = o?.endVerse && o.endVerse > verse ? o.endVerse : undefined;
    return {
      type: "bible",
      sourceKind: "bible-reference",
      label: slide.reference || `${book} ${chapter}:${verse}`,
      subtitle: slide.text.replace(/\[\d+\]\s*/g, "").slice(0, 120),
      notes: o?.translation,
      overlayMode: mode,
      payloadSnapshot: {
        book,
        chapter,
        verse,
        verseEnd: endVerse,
        verseRange: endVerse ? `${verse}-${endVerse}` : String(verse),
        translation: o?.translation,
        verseText: slide.text,
        referenceLabel: slide.reference,
        overlayMode: mode,
      },
    };
  }
  if (slide.module === "worship") {
    return {
      type: "worship",
      sourceKind: "worship-song-section",
      sourceId: o?.id,
      label: `${slide.itemTitle} · ${slide.label}`,
      subtitle: firstLines(slide.text),
      overlayMode: mode,
      payloadSnapshot: {
        songId: o?.id,
        songTitle: slide.itemTitle,
        sectionLabel: slide.label,
        sectionText: slide.text,
        sectionIdx: o?.index ?? 0,
        overlayMode: mode,
      },
    };
  }
  if (slide.module === "notes") {
    return {
      type: "sermon",
      sourceKind: "sermon-point",
      sourceId: o?.id,
      label: `${slide.itemTitle} · ${slide.label}`,
      subtitle: firstLines(slide.text),
      overlayMode: mode,
      payloadSnapshot: {
        isNoteSlide: true,
        noteId: o?.id,
        noteTitle: slide.itemTitle,
        slideText: slide.text,
        slideIndex: o?.index ?? 0,
        overlayMode: mode,
      },
    };
  }
  if (slide.module === "media" && slide.media) {
    const isDoc = o?.kind === "doc";
    return {
      type: "media",
      sourceKind: "media-library-item",
      sourceId: o?.id,
      label: isDoc ? `${slide.itemTitle} · ${slide.label}` : slide.itemTitle,
      subtitle: isDoc ? "Document page" : slide.media.kind === "video" ? "Video media" : slide.media.kind === "audio" ? "Sound" : "Picture media",
      payloadSnapshot: {
        filePath: slide.media.url,
        fileName: slide.itemTitle,
        mediaType: slide.media.kind,
        mediaId: o?.id,
        isDocumentPage: isDoc || undefined,
        thumbnailUrl: (slide as { thumb?: string }).thumb,
      },
    };
  }
  return null;
}

/** What to open in the Studio for an entry (the section, and the item inside it). */
export type PlanTarget =
  | { section: "bible"; book: string; chapter: number; verse: number; endVerse?: number; translation?: string }
  | { section: "worship"; songId: string; index: number }
  | { section: "docs"; noteId: string; index: number }
  | { section: "docs" | "media"; mediaId: string };

export interface PlanContext {
  songs: Song[];
  notes: DockNote[];
  media: MediaItem[];
  /** Translation to use when the entry has none. */
  translation: string;
  /** Loads a chapter's verses (the Bible database). */
  loadChapter: (book: string, chapter: number, translation: string) => Promise<Array<{ verse: number; text: string }>>;
}

export interface ResolvedPlanItem {
  slide: StudioSlide | null;
  target: PlanTarget | null;
  section: StudioSection;
}

const num = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Rebuild the slide for a schedule / history entry, reading the Bible and library afresh. */
export async function resolvePlanItem(item: ServicePlanItem, ctx: PlanContext): Promise<ResolvedPlanItem> {
  const p = item.payloadSnapshot || {};
  if (item.type === "bible") {
    const book = String(p.book || "");
    const chapter = num(p.chapter);
    const verse = num(p.verse) ?? 1;
    const endVerse = num(p.verseEnd);
    const translation = String(p.translation || ctx.translation || "KJV");
    if (!book || !chapter) return { slide: null, target: null, section: "bible" };
    const target: PlanTarget = { section: "bible", book, chapter, verse, endVerse, translation };
    let slide: StudioSlide | null = null;
    try {
      const verses = await ctx.loadChapter(book, chapter, translation);
      const last = endVerse && endVerse > verse ? endVerse : verse;
      const picked = verses.filter((v) => v.verse >= verse && v.verse <= last);
      slide = picked.length ? bibleRangeSlide(book, chapter, translation, picked) : null;
    } catch {
      slide = null;
    }
    if (!slide && typeof p.verseText === "string" && p.verseText.trim()) {
      const range = endVerse && endVerse > verse ? `${verse}-${endVerse}` : String(verse);
      slide = {
        key: `bible:${book}:${chapter}:${range}:${translation}`,
        module: "bible",
        label: range,
        verse,
        text: p.verseText,
        reference: `${book} ${chapter}:${range} (${translation})`,
        itemTitle: `${book} ${chapter}`,
        origin: { kind: "bible", book, chapter, verse, endVerse, translation },
      };
    }
    return { slide, target, section: "bible" };
  }

  if (item.type === "worship") {
    const songId = String(p.songId || item.sourceId || "");
    const index = Math.max(0, Number(p.sectionIdx) || 0);
    const song = ctx.songs.find((s) => s.id === songId)
      ?? ctx.songs.find((s) => s.metadata.title === p.songTitle);
    if (song) {
      const slides = songSlides(song);
      return { slide: slides[Math.min(index, slides.length - 1)] ?? null, target: { section: "worship", songId: song.id, index }, section: "worship" };
    }
    const text = String(p.sectionText || "");
    if (!text.trim()) return { slide: null, target: null, section: "worship" };
    return {
      slide: {
        key: `schedule:${item.id}`,
        module: "worship",
        label: String(p.sectionLabel || "Lyrics"),
        text,
        reference: "",
        itemTitle: String(p.songTitle || item.label),
      },
      target: null,
      section: "worship",
    };
  }

  if (item.type === "sermon") {
    const noteId = String(p.noteId || item.sourceId || "");
    const index = Math.max(0, Number(p.slideIndex) || 0);
    const note = ctx.notes.find((n) => n.id === noteId);
    if (note) {
      const slides = noteSlides(note.id, note.title || "Note", note.content);
      return { slide: slides[Math.min(index, slides.length - 1)] ?? null, target: { section: "docs", noteId: note.id, index }, section: "docs" };
    }
    const text = String(p.slideText || p.text || "").split(/\n[ \t]*\n+/)[0]?.trim() ?? "";
    if (!text) return { slide: null, target: null, section: "docs" };
    return {
      slide: { key: `schedule:${item.id}`, module: "notes", label: "Slide 1", text, reference: "", itemTitle: String(p.noteTitle || item.label) },
      target: null,
      section: "docs",
    };
  }

  // Media and document pages.
  const mediaId = String(p.mediaId || item.sourceId || "");
  const filePath = String(p.filePath || "");
  const found = ctx.media.find((m) => m.id === mediaId)
    ?? (filePath ? ctx.media.find((m) => mediaPath(m) === filePath || m.filePath === filePath) : undefined);
  if (found) {
    const section: StudioSection = found.documentId ? "docs" : "media";
    return { slide: mediaSlide(found), target: { section, mediaId: found.id }, section };
  }
  if (/^\/uploads\//.test(filePath)) {
    const kind = p.mediaType === "video" ? "video" : p.mediaType === "audio" ? "audio" : "image";
    return {
      slide: {
        key: `schedule:${item.id}`,
        module: "media",
        label: kind === "video" ? "Video" : kind === "audio" ? "Sound" : "Picture",
        text: "",
        reference: "",
        itemTitle: item.label,
        media: { kind, url: filePath, fit: p.isDocumentPage ? "contain" : "cover", loop: kind !== "audio", muted: false },
      },
      target: null,
      section: p.isDocumentPage ? "docs" : "media",
    };
  }
  return { slide: null, target: null, section: "media" };
}

/** Does this entry stand for the slide that is on the screen? (marks LIVE in Schedule) */
export function planItemMatchesSlide(item: ServicePlanItem, slide: StudioSlide | null, mode: StudioMode): boolean {
  if (!slide) return false;
  const draft = planDraftForSlide(slide, mode);
  if (!draft || draft.type !== item.type) return false;
  const p = item.payloadSnapshot || {};
  if (item.type === "bible") {
    const o = slide.origin;
    if (!o) return false;
    const start = num(p.verse) ?? 1;
    const end = num(p.verseEnd) ?? start;
    return String(p.book) === o.book && num(p.chapter) === o.chapter && (o.verse ?? 0) >= start && (o.verse ?? 0) <= end;
  }
  if (item.type === "worship") {
    const songId = String(p.songId || item.sourceId || "");
    if (p.isWholeSong) return Boolean(songId) && songId === slide.origin?.id;
    return songId === slide.origin?.id && (Number(p.sectionIdx) || 0) === (slide.origin?.index ?? -1);
  }
  if (item.type === "sermon") {
    const noteId = String(p.noteId || item.sourceId || "");
    if (p.isWholeNote) return Boolean(noteId) && noteId === slide.origin?.id;
    return noteId === slide.origin?.id && (Number(p.slideIndex) || 0) === (slide.origin?.index ?? -1);
  }
  const mediaId = String(p.mediaId || item.sourceId || "");
  return (Boolean(mediaId) && mediaId === slide.origin?.id) || (Boolean(p.filePath) && p.filePath === slide.media?.url);
}
