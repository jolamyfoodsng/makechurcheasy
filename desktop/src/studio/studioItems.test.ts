import { describe, expect, it } from "vitest";
import type { ServicePlanItem } from "../service-planner/types";
import type { Song } from "../worship/types";
import type { MediaItem } from "../library/libraryTypes";
import { bibleRangeSlide, bibleSlides, noteSlides } from "./studioEngine";
import { mediaSlide, songSlides } from "./studioSlides";
import { planDraftForSlide, planItemMatchesSlide, resolvePlanItem, type PlanContext } from "./studioItems";

const verses = [
  { verse: 16, text: "For God so loved the world" },
  { verse: 17, text: "For God sent not his Son" },
  { verse: 18, text: "He that believeth on him" },
];

const song: Song = {
  id: "s1",
  metadata: { title: "10,000 Reasons", artist: "Matt Redman" },
  lyrics: "",
  slides: [
    { id: "a", label: "Chorus", type: "chorus", content: "Bless the Lord", isContinuation: false },
    { id: "b", label: "Verse 1", type: "verse", content: "The sun comes up", isContinuation: false },
  ],
  createdAt: "",
  updatedAt: "",
};

const page: MediaItem = {
  id: "p2",
  name: "Sermon page 2",
  type: "image",
  url: "",
  diskFileName: "page2.png",
  createdAt: "",
  documentId: "doc-1",
  documentSourceName: "Sermon.pptx",
  documentPageNumber: 2,
  source: "document-conversion",
};

const ctx: PlanContext = {
  songs: [song],
  notes: [{ id: "n1", title: "Faith", content: "Point one\n\nPoint two", updatedAt: 1 }],
  media: [page],
  translation: "KJV",
  loadChapter: async () => verses,
};

function asPlanItem(draft: NonNullable<ReturnType<typeof planDraftForSlide>>, id = "x"): ServicePlanItem {
  return { id, type: draft.type, label: draft.label, sourceId: draft.sourceId, payloadSnapshot: draft.payloadSnapshot, createdAt: 0, updatedAt: 0 };
}

describe("schedule / history entries", () => {
  it("a Bible passage round-trips (Project again shows the same verses)", async () => {
    const slide = bibleRangeSlide("John", 3, "KJV", verses)!;
    expect(slide.reference).toBe("John 3:16-18 (KJV)");
    const item = asPlanItem(planDraftForSlide(slide, "fullscreen")!);
    expect(item.payloadSnapshot).toMatchObject({ book: "John", chapter: 3, verse: 16, verseEnd: 18 });
    const back = await resolvePlanItem(item, ctx);
    expect(back.slide?.key).toBe(slide.key);
    expect(back.slide?.text).toBe(slide.text);
    expect(back.target).toMatchObject({ section: "bible", book: "John", chapter: 3, verse: 16, endVerse: 18 });
  });

  it("uses the saved words when the Bible can't be read", async () => {
    const item: ServicePlanItem = { id: "y", type: "bible", label: "John 3:16", payloadSnapshot: { book: "John", chapter: 3, verse: 16, translation: "KJV", verseText: "For God so loved" }, createdAt: 0, updatedAt: 0 };
    const back = await resolvePlanItem(item, { ...ctx, loadChapter: async () => { throw new Error("offline"); } });
    expect(back.slide?.text).toBe("For God so loved");
  });

  it("a song section, a note slide and a document page come back to the right place", async () => {
    const section = songSlides(song)[1];
    const back = await resolvePlanItem(asPlanItem(planDraftForSlide(section, "lower-third")!), ctx);
    expect(back.slide?.key).toBe(section.key);
    expect(back.target).toEqual({ section: "worship", songId: "s1", index: 1 });

    const note = noteSlides("n1", "Faith", "Point one\n\nPoint two")[1];
    const backNote = await resolvePlanItem(asPlanItem(planDraftForSlide(note, "fullscreen")!), ctx);
    expect(backNote.slide?.text).toBe("Point two");
    expect(backNote.section).toBe("docs");

    const pageSlide = mediaSlide(page)!;
    expect(pageSlide.media?.fit).toBe("contain");
    const backPage = await resolvePlanItem(asPlanItem(planDraftForSlide(pageSlide, "fullscreen")!), ctx);
    expect(backPage.section).toBe("docs");
    expect(backPage.target).toEqual({ section: "docs", mediaId: "p2" });
  });

  it("marks the schedule item that is on the screen as LIVE", () => {
    const verse16 = bibleSlides("John", 3, "KJV", verses)[0];
    const verse18 = bibleSlides("John", 3, "KJV", verses)[2];
    const passage = asPlanItem(planDraftForSlide(bibleRangeSlide("John", 3, "KJV", verses.slice(0, 2))!, "fullscreen")!);
    expect(planItemMatchesSlide(passage, verse16, "fullscreen")).toBe(true);
    expect(planItemMatchesSlide(passage, verse18, "fullscreen")).toBe(false);

    const wholeSong: ServicePlanItem = { id: "w", type: "worship", label: "10,000 Reasons", sourceId: "s1", payloadSnapshot: { isWholeSong: true, songId: "s1" }, createdAt: 0, updatedAt: 0 };
    expect(planItemMatchesSlide(wholeSong, songSlides(song)[1], "fullscreen")).toBe(true);
  });
});
