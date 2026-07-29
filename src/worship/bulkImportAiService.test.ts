import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  assessExtractedTextQuality,
  extractTextFromFile,
  normalizeExtractedLyricsText,
  reorderTwoColumnText,
} from "./bulkImportService";
import { parseCccHymnDrafts } from "./cccHymnImport";
import {
  parseKnownHymnalDrafts,
  parseLargeNumberedHymnalDrafts,
  processDocumentLocally,
  processDocumentWithAi,
} from "./bulkImportAiService";
import type { DocumentStructureProvider } from "./bulkImportAiService";
import type { BulkImportChunkRequest } from "./smartImportTypes";
import {
  buildFallbackDraft,
  formatDraftLyrics,
  estimateDraftSlideCount,
} from "./smartImportService";
import type { SmartImportSongDraft } from "./smartImportTypes";

// ── Helpers ──

function mockProvider(overrides?: {
  songCount?: number;
  failChunks?: Set<number>;
  transientFailures?: number;
  callCount?: Map<number, number>;
}): DocumentStructureProvider {
  const callCount = overrides?.callCount ?? new Map<number, number>();
  const transientFailures = overrides?.transientFailures ?? 0;
  const failChunks = overrides?.failChunks ?? new Set<number>();
  let globalAttempts = 0;

  return {
    name: "mock",
    async structureChunk(request: BulkImportChunkRequest): Promise<{ songs: SmartImportSongDraft[] }> {
      const idx = request.chunkIndex;
      const attempts = (callCount.get(idx) ?? 0) + 1;
      callCount.set(idx, attempts);
      globalAttempts++;

      if (failChunks.has(idx)) {
        throw new Error(`Mock failure on chunk ${idx}`);
      }

      if (transientFailures > 0 && globalAttempts <= transientFailures) {
        throw new Error("Transient mock failure");
      }

      const songs: SmartImportSongDraft[] = [];
      const songCount = overrides?.songCount ?? 1;
      for (let i = 0; i < songCount; i++) {
        songs.push({
          id: `mock-song-${idx}-${i}`,
          title: `Song ${idx * 10 + i + 1}`,
          sections: [{
            id: `mock-section-${idx}-${i}`,
            type: "verse",
            label: "Verse 1",
            content: `Lyrics for song ${idx * 10 + i + 1} from chunk ${idx}`,
            warnings: [],
          }],
          artist: "",
          language: undefined,
          hymnNumber: undefined,
          method: "ai",
          warnings: [],
          reviewNotes: [],
          rawExcerpt: "",
        });
      }
      return { songs };
    },
  };
}

// ── Phase 1: Core Import Tests ──

describe("Phase 1: Core Import", () => {
  it("Test 1: Plain TXT file extracts and processes correctly", async () => {
    const content = [
      "Amazing Grace",
      "Verse 1",
      "Amazing grace how sweet the sound",
      "Chorus",
      "I once was lost but now am found",
    ].join("\n");

    const file = new File([content], "amazing-grace.txt", { type: "text/plain" });
    const text = await extractTextFromFile(file);
    expect(text.trim()).toBe(content);

    const result = await processDocumentWithAi(text, "amazing-grace.txt");
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].title).toBe("amazing-grace");
    expect(result.songs[0].sections.length).toBeGreaterThanOrEqual(1);
    expect(result.songs[0].sections[0].content).toBe(content);
    expect(result.needsReview).toBe(true);
    expect(result.stats.fallbackChunks).toBe(1);
    expect(result.stats.totalChunks).toBe(1);
  });

  it("Test 2: DOCX worship list extracts correctly", async () => {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const mammoth = await import("mammoth");

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: "Song One", bold: true })] }),
          new Paragraph({ text: "Verse 1" }),
          new Paragraph({ text: "Lyrics for song one" }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Song Two", bold: true })] }),
          new Paragraph({ text: "Verse 1" }),
          new Paragraph({ text: "Lyrics for song two" }),
        ],
      }],
    });

    const docxBuffer = await Packer.toBuffer(doc);
    const result = await mammoth.extractRawText({ buffer: docxBuffer });
    expect(result.value).toContain("Song One");
    expect(result.value).toContain("Song Two");
    expect(result.value).toContain("Verse 1");
    expect(result.value).toContain("Lyrics for song one");
    expect(result.value).toContain("Lyrics for song two");
  });

  it("Test 3: Small PDF extracts and processes", async () => {
    // Mock the Tauri invoke to return pre-extracted text.
    // This avoids pdfjs worker setup which is complex in a Node.js test
    // environment. The real extraction code path is: Tauri backend →
    // reorderTwoColumnText → AI. This tests the full post-extraction
    // pipeline including reorderTwoColumnText processing.
    const pdfContent = [
      "Orin 1                           Hymn 1",
      "Mo n yo ninu Oluwa               Rejoice in the Lord",
      "Orin 2                           Hymn 2",
      "Jubilate Deo                     Make a joyful noise",
    ].join("\n");

    const text = reorderTwoColumnText(pdfContent);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("Orin");
    expect(text).toContain("Hymn");
    expect(text).toContain("Rejoice in the Lord");

    const result = await processDocumentWithAi(text, "CCC-Hymns.pdf");
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].title).toBe("CCC-Hymns");
    expect(result.songs[0].sections[0].content.length).toBeGreaterThan(100);
  });

  it("imports the CCC hymns PDF as separate hymn drafts", { timeout: 30000 }, async () => {
    const bytes = readFileSync(new URL("../CCC-Hymns.pdf", import.meta.url));
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const file = new File([arrayBuffer], "CCC-Hymns.pdf", { type: "application/pdf" });

    const text = await extractTextFromFile(file);
    const quality = assessExtractedTextQuality(text);
    const drafts = parseCccHymnDrafts(text);
    const hymnNumbers = new Set(drafts.map((draft) => draft.hymnNumber).filter(Boolean));

    expect(text.length).toBeGreaterThan(20_000);
    expect(quality.usable).toBe(true);
    expect(drafts.length).toBeGreaterThanOrEqual(450);
    expect(hymnNumbers.size).toBeGreaterThanOrEqual(450);
    expect(drafts[0].title).toBe("Hymn 1");
    expect(drafts[0].hymnNumber).toBe("1");
    expect(drafts[0].sections.map((section) => section.label)).toEqual(["Yoruba", "English"]);
    expect(drafts[0].sections[0].content).toContain("Jerih mo yah mah");
    expect(drafts[0].sections[1].content).toContain("The host of Angels");
    expect(drafts.some((draft) => draft.title === "Hymn 51")).toBe(true);
    expect(drafts.some((draft) => draft.sections.some((section) => /are Reserved/i.test(section.content)))).toBe(false);
  });

  it("detects the CCC hymnal fast path before AI processing", { timeout: 30000 }, async () => {
    const bytes = readFileSync(new URL("../CCC-Hymns.pdf", import.meta.url));
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const file = new File([arrayBuffer], "CCC-Hymns.pdf", { type: "application/pdf" });

    const text = await extractTextFromFile(file);
    const drafts = parseKnownHymnalDrafts(text, "CCC-Hymns.pdf");

    expect(drafts.length).toBeGreaterThanOrEqual(450);
    expect(drafts[0].title).toBe("Hymn 1");
    expect(drafts[0].sections.map((section) => section.label)).toEqual(["Yoruba", "English"]);
  });
});

describe("Fast local hymn-book mode", () => {
  it("detects large numbered hymn books and skips the AI path", async () => {
    const text = Array.from({ length: 40 }, (_, index) => {
      const hymnNumber = index + 1;
      return [
        `${hymnNumber}`,
        `Hymn ${hymnNumber}`,
        `1. Opening line for hymn ${hymnNumber} repeated for stable parsing and larger import sizing.`,
        `2. Second verse line for hymn ${hymnNumber} repeated for stable parsing and larger import sizing.`,
        "Chorus",
        `Sing the chorus for hymn ${hymnNumber} repeated for stable parsing and larger import sizing.`,
        `Bridge ${hymnNumber}`,
        `Bridge line for hymn ${hymnNumber} repeated for stable parsing and larger import sizing.`,
      ].join("\n");
    }).join("\n\n");

    const drafts = parseLargeNumberedHymnalDrafts(text);
    expect(drafts).toHaveLength(40);
    expect(drafts[0]?.hymnNumber).toBe("1");
    expect(drafts[0]?.sections.some((section) => section.type === "chorus")).toBe(true);

    const result = await processDocumentLocally(text, "Large-Hymn-Book.pdf");
    expect(result.aiUsed).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.stats.provider).toBe("numbered-local");
    expect(result.songs).toHaveLength(40);
    expect(result.warnings[0]).toContain("Large numbered hymn book detected");
  });

  it("uses index pages to choose the largest hymn block and recover wrapped first-line titles", () => {
    const filler = "Repeated filler text to simulate a real scanned hymn book import and keep the fast local path active.";
    const englishContent = Array.from({ length: 20 }, (_, index) => {
      const hymnNumber = index + 1;
      return [
        `${hymnNumber}`,
        `English hymn ${hymnNumber} opening`,
        `line for the smaller block repeated to keep the document sizable and realistic. ${filler} ${filler}`,
        `Another lyric line for English hymn ${hymnNumber} repeated to keep the document sizable and realistic. ${filler} ${filler}`,
      ].join("\n");
    }).join("\n\n");

    const englishIndex = [
      "INDEX OF FIRST LINES (ENGLISH)",
      ...Array.from({ length: 20 }, (_, index) => `English hymn ${index + 1} opening line for the smaller block ${index + 1}`),
    ].join("\n");

    const twiContent = Array.from({ length: 26 }, (_, index) => {
      const hymnNumber = index + 1;
      return [
        `${hymnNumber}`,
        `Twi hymn ${hymnNumber} wrapped opening`,
        "title for the larger block",
        `Lyric line one for Twi hymn ${hymnNumber} repeated to keep the document sizable and realistic. ${filler} ${filler}`,
        `Lyric line two for Twi hymn ${hymnNumber} repeated to keep the document sizable and realistic. ${filler} ${filler}`,
      ].join("\n");
    }).join("\n\n");

    const twiIndex = [
      "INDEX OF FIRST LINES (TWI)",
      ...Array.from({ length: 26 }, (_, index) => `Twi hymn ${index + 1} wrapped opening title for the larger block ${index + 1}`),
    ].join("\n");

    const text = [englishContent, englishIndex, twiContent, twiIndex].join("\f");
    const drafts = parseLargeNumberedHymnalDrafts(text);

    expect(drafts).toHaveLength(26);
    expect(drafts[0]?.title).toBe("Twi hymn 1 wrapped opening title for the larger block");
    expect(drafts[0]?.hymnNumber).toBe("1");
    expect(drafts[0]?.reviewNotes[0]).toContain("printed index");
  });

  it("keeps index hymns visible when one hymn body cannot be fully recovered", () => {
    const filler = "Repeated filler text to simulate a real scanned hymn book import and keep the fast local path active.";
    const content = Array.from({ length: 26 }, (_, index) => {
      const hymnNumber = index + 1;
      if (hymnNumber === 12) {
        return [
          `${hymnNumber}`,
          "",
          "",
        ].join("\n");
      }

      return [
        `${hymnNumber}`,
        `Indexed hymn ${hymnNumber} opening line`,
        `Lyric line one for indexed hymn ${hymnNumber}. ${filler} ${filler}`,
        `Lyric line two for indexed hymn ${hymnNumber}. ${filler} ${filler}`,
      ].join("\n");
    }).join("\n\n");

    const indexPage = [
      "INDEX OF FIRST LINES (TWI)",
      ...Array.from({ length: 26 }, (_, index) => `Indexed hymn ${index + 1} opening line ${index + 1}`),
    ].join("\n");

    const drafts = parseLargeNumberedHymnalDrafts([content, indexPage].join("\f"));
    const missingBodyDraft = drafts.find((draft) => draft.hymnNumber === "12");

    expect(drafts).toHaveLength(26);
    expect(missingBodyDraft).toBeTruthy();
    expect(missingBodyDraft?.warnings[0]).toContain("not fully recovered");
    expect(missingBodyDraft?.reviewNotes.some((note) => note.includes("manually"))).toBe(true);
  });

  it("keeps extra numbered hymns even when their printed index entries are missing", () => {
    const filler = "Repeated filler text to simulate a real scanned hymn book import and keep the fast local path active.";
    const content = Array.from({ length: 26 }, (_, index) => {
      const hymnNumber = index + 1;
      return [
        `${hymnNumber}`,
        `Indexed hymn ${hymnNumber} opening line`,
        `Lyric line one for indexed hymn ${hymnNumber}. ${filler} ${filler}`,
        `Lyric line two for indexed hymn ${hymnNumber}. ${filler} ${filler}`,
      ].join("\n");
    }).join("\n\n");

    const indexPage = [
      "INDEX OF FIRST LINES (TWI)",
      ...Array.from({ length: 25 }, (_, index) => `Indexed hymn ${index + 1} opening line ${index + 1}`),
    ].join("\n");

    const drafts = parseLargeNumberedHymnalDrafts([content, indexPage].join("\f"));
    const extraDraft = drafts.find((draft) => draft.hymnNumber === "26");

    expect(drafts).toHaveLength(26);
    expect(extraDraft?.title).toBe("Indexed hymn 26 opening line");
    expect(extraDraft?.warnings.some((warning) => warning.includes("printed index title"))).toBe(true);
    expect(extraDraft?.reviewNotes.some((note) => note.includes("numbered body pages"))).toBe(true);
  });

  it("infers a placeholder for a missing hymn number inside a dense numbered sequence", () => {
    const filler = "Repeated filler text to simulate a real scanned hymn book import and keep the fast local path active.";
    const content = Array.from({ length: 26 }, (_, index) => {
      const hymnNumber = index + 1;
      if (hymnNumber === 12) {
        return "";
      }

      return [
        `${hymnNumber}`,
        `Indexed hymn ${hymnNumber} opening line`,
        `Lyric line one for indexed hymn ${hymnNumber}. ${filler} ${filler}`,
        `Lyric line two for indexed hymn ${hymnNumber}. ${filler} ${filler}`,
      ].join("\n");
    }).filter(Boolean).join("\n\n");

    const indexPage = [
      "INDEX OF FIRST LINES (TWI)",
      ...Array.from({ length: 25 }, (_, index) => {
        const hymnNumber = index + 1;
        const actualNumber = hymnNumber >= 12 ? hymnNumber + 1 : hymnNumber;
        return `Indexed hymn ${actualNumber} opening line ${actualNumber}`;
      }),
    ].join("\n");

    const drafts = parseLargeNumberedHymnalDrafts([content, indexPage].join("\f"));
    const inferredDraft = drafts.find((draft) => draft.hymnNumber === "12");

    expect(drafts).toHaveLength(26);
    expect(inferredDraft?.title).toBe("Hymn 12");
    expect(inferredDraft?.warnings.some((warning) => warning.includes("not fully recovered"))).toBe(true);
    expect(inferredDraft?.reviewNotes.some((note) => note.includes("inferred from the surrounding hymn sequence"))).toBe(true);
  });
});

// ── Phase 2: Two-Column PDF Validation ──

describe("Phase 2: Two-Column PDF", () => {
  it("Test 4: reorderTwoColumnText fixes bilingual reading order", () => {
    const twoColumn = [
      "Orin 1                           Hymn 1",
      "Mo n yo ninu Oluwa               Rejoice in the Lord",
      "Mo n yo ninu Oluwa               Rejoice in the Lord always",
      "Mo n yo ninu Oluwa               Rejoice in the Lord",
      "",
      "Orin 2                           Hymn 2",
      "Jubilate Deo                     Make a joyful noise",
      "Jubilate Deo                     Make a joyful noise unto God",
    ].join("\n");

    const reordered = reorderTwoColumnText(twoColumn);

    const lines = reordered.split("\n").filter((l) => l.trim());
    expect(lines[0]).toContain("Orin 1");
    expect(lines[1]).toContain("Mo n yo ninu Oluwa");
    expect(lines[2]).toContain("Mo n yo ninu Oluwa");
    expect(lines[3]).toContain("Mo n yo ninu Oluwa");

    const separatorIdx = reordered.indexOf("\n\n");
    const rightSide = reordered.slice(separatorIdx + 2);
    expect(rightSide).toContain("Hymn 1");
    expect(rightSide).toContain("Rejoice in the Lord");
    expect(rightSide).toContain("Hymn 2");
    expect(rightSide).toContain("Make a joyful noise");
  });

  it("passes single-column text through unchanged", () => {
    const single = [
      "Amazing Grace",
      "Verse 1",
      "Amazing grace how sweet the sound",
    ].join("\n");
    expect(reorderTwoColumnText(single)).toBe(single);
  });

  it("passes short text through unchanged", () => {
    const short = "Line 1\nLine 2\nLine 3";
    expect(reorderTwoColumnText(short)).toBe(short);
  });

  it("reorders pdftotext layout columns before lyric reflow", () => {
    const layoutText = [
      "1                                     2. I see the signs are all",
      "1. A charge to keep I have,           around",
      "A God to glorify,                     My ear has heard a certain",
      "A never-dying soul to save,           sound",
      "And fit it for the sky                A greater rain is coming very",
      "                                      soon",
      "2. To serve the present age,          For Zion has travailed and",
      "My calling to fulfil:                 shall bring forth",
      "O may it all my powers engage         The sons of God with a word",
      "To do my Master’s will!               in their mouth",
      "                                      A greater rain is coming very",
      "3. Arm me with jealous care,          soon",
      "As in Thy sight to live;              PH. 35",
    ].join("\n");

    const normalized = normalizeExtractedLyricsText(reorderTwoColumnText(layoutText));

    expect(normalized).toContain("A charge to keep I have,");
    expect(normalized).toContain("And fit it for the sky");
    expect(normalized).toContain("2. I see the signs are all around");
    expect(normalized).toContain("A greater rain is coming very soon");
    expect(normalized).toContain("The sons of God with a word in their mouth");
    expect(normalized).not.toContain("And fit it for the sky soon");
  });

  it("keeps right-column song numbers out of left-column lyrics and preserves next-page continuations", () => {
    const layoutText = [
      "2                                     4",
      "1. A greater rain is coming           Abide under his anointing,",
      "A greater rain is coming              Abide under his control,",
      "A greater rain is coming very         Abide under his anointing,",
      "soon                                  His presence upon your soul;",
      "The early and the latter rain         Just stay in the arms of Jesus",
      "shall fall together at the time       And thou shall be fully",
      "A greater rain is coming very         whole;",
      "soon",
      "                                  1",
      "\fAbide under his anointing,           4. I fear no foe, with thee at",
      "Abide under his control,              hand to bless;",
      "PH 64                                 Ills have no weight, and tears",
      "5                                     no bitterness.",
      "1. Abide with me, fast falls          Where is death's sting?",
      "the eventide;                         Where, grave, thy victory?",
      "The darkness deepens; Lord,           I triumph still, if thou abide",
      "with me abide,                        with me.",
    ].join("\n");

    const normalized = normalizeExtractedLyricsText(reorderTwoColumnText(layoutText));

    expect(normalized).toContain("A greater rain is coming\nA greater rain is coming");
    expect(normalized).toContain("A greater rain is coming very soon");
    expect(normalized).not.toContain("A greater rain is coming 4");
    expect(normalized).toContain("4\nAbide under his anointing,");
    expect(normalized).toContain("And thou shall be fully whole;");
    expect(normalized).toContain("Abide under his anointing,\nAbide under his control,\nPH 64");
    expect(normalized).not.toContain("whole;\n\n1\n\nAbide");
  });
});

// ── Phase 2b: PDF lyric reflow ──

describe("Phase 2b: PDF lyric reflow", () => {
  it("joins soft-wrapped lyric lines from exported PDFs", () => {
    const raw = [
      "2. I see the signs are all",
      "around",
      "My ear has heard a certain",
      "sound",
      "A greater rain is coming very",
      "soon",
      "For Zion has travailed and",
      "shall bring forth",
      "The sons of God with a word",
      "in their mouth",
      "",
      "PH. 35",
    ].join("\n");

    const normalized = normalizeExtractedLyricsText(raw);

    expect(normalized).toContain("2. I see the signs are all around");
    expect(normalized).toContain("My ear has heard a certain sound");
    expect(normalized).toContain("A greater rain is coming very soon");
    expect(normalized).toContain("For Zion has travailed and shall bring forth");
    expect(normalized).toContain("The sons of God with a word in their mouth");
    expect(normalized).toContain("\n\nPH. 35");
  });

  it("preserves hymn markers and section labels while reflowing wrapped lines", () => {
    const raw = [
      "Hymn 5",
      "",
      "Verse 1",
      "Where shall we await Jesus that we",
      "might all see Him,",
      "In the Holy Church shall we see Jesus.",
      "",
      "Chorus",
      "I once was lost",
      "but now am found",
    ].join("\n");

    const normalized = normalizeExtractedLyricsText(raw);

    expect(normalized).toContain("Hymn 5\n\nVerse 1");
    expect(normalized).toContain("Where shall we await Jesus that we might all see Him,");
    expect(normalized).toContain("In the Holy Church shall we see Jesus.");
    expect(normalized).toContain("\n\nChorus\nI once was lost but now am found");
  });

  it("does not join clear separate hymn lines after soft punctuation", () => {
    const raw = [
      "A charge to keep I have,",
      "A God to glorify,",
      "A never-dying soul to save,",
      "And fit it for the sky",
    ].join("\n");

    const normalized = normalizeExtractedLyricsText(raw);

    expect(normalized).toContain("A charge to keep I have,\nA God to glorify,");
    expect(normalized).toContain("A never-dying soul to save,\nAnd fit it for the sky");
  });

  it("scores readable extraction as usable and noisy extraction as unusable", () => {
    const readable = assessExtractedTextQuality([
      "Amazing grace how sweet the sound",
      "That saved a wretch like me",
      "I once was lost but now am found",
      "Was blind but now I see",
    ].join("\n"));
    const noisy = assessExtractedTextQuality("a | b | c | d | [] [] []");

    expect(readable.usable).toBe(true);
    expect(noisy.usable).toBe(false);
  });
});

// ── Phase 3: Large Documents ──

describe("Phase 3: Large Documents", () => {
  it("Test 5: 100+ page equivalent chunks into multiple pieces", async () => {
    const line = "Amazing Grace Verse 1 Amazing grace how sweet the sound that saved a wretch like me\n";
    const text = line.repeat(3500);
    expect(text.length).toBeGreaterThan(15000);

    const provider = mockProvider();
    const result = await processDocumentWithAi(text, "large.txt", provider);
    expect(result.stats.totalChunks).toBeGreaterThan(1);
    expect(result.stats.totalChunks).toBe(result.stats.aiChunks + result.stats.fallbackChunks);
  });

  it("Test 6: Very large document processes without crashing", async () => {
    const text = "Test line for hymn book import validation\n".repeat(20000);
    expect(text.length).toBeGreaterThan(100000);

    const provider = mockProvider();
    const result = await processDocumentWithAi(text, "huge.txt", provider);
    expect(result.stats.totalChunks).toBeGreaterThan(5);
    expect(result.songs.length).toBeGreaterThan(0);
    expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("empty text returns empty result", async () => {
    const result = await processDocumentWithAi("", "empty.txt");
    expect(result.songs).toHaveLength(0);
    expect(result.stats.totalChunks).toBe(0);
  });
});

// ── Phase 4: Chunk Boundary ──

describe("Phase 4: Chunk Boundary", () => {
  it("song continuing across chunks is not duplicated", async () => {
    const provider = mockProvider({
      songCount: 1,
      failChunks: new Set(),
    });

    const line = "Same Song Verse 1 These are the lyrics for the song that crosses chunk boundaries\n";
    const text = line.repeat(2000);

    const result = await processDocumentWithAi(text, "boundary.txt", provider);
    expect(result.songs.length).toBeGreaterThan(0);

    const titles = result.songs.map((s) => s.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(titles.length);
  });
});

// ── Phase 5: Fallback Recovery ──

describe("Phase 5: Fallback Recovery", () => {
  it("Test 7: per-chunk fallback on partial failure", { timeout: 15000 }, async () => {
    const callCount = new Map<number, number>();
    const provider = mockProvider({
      failChunks: new Set([2]),
      callCount,
    });

    const line = "Song chunk verse lyrics here for testing\n";
    const text = line.repeat(5000);

    const result = await processDocumentWithAi(text, "partial.txt", provider);

    expect(result.stats.fallbackChunks).toBe(1);
    expect(result.stats.aiChunks).toBe(result.stats.totalChunks - 1);
    expect(result.needsReview).toBe(true);
    expect(result.songs.length).toBeGreaterThan(0);
  });

  it("Test 8: all AI fails returns fallback draft", { timeout: 15000 }, async () => {
    const text = "All AI fails test\n".repeat(100);
    const provider = mockProvider({ failChunks: new Set([0]) });

    const result = await processDocumentWithAi(text, "fallback.txt", provider);
    expect(result.stats.fallbackChunks).toBe(result.stats.totalChunks);
    expect(result.stats.aiChunks).toBe(0);
    expect(result.needsReview).toBe(true);
    expect(result.songs.length).toBeGreaterThan(0);
  });

  it("falls back instead of hanging when local structuring stalls", { timeout: 10000 }, async () => {
    vi.useFakeTimers();
    try {
      const provider: DocumentStructureProvider = {
        name: "stalled",
        structureChunk: () => new Promise(() => {}),
      };

      const resultPromise = processDocumentWithAi(
        "Stalled provider lyrics\n".repeat(300),
        "stalled.txt",
        provider,
      );

      await vi.runOnlyPendingTimersAsync();
      await vi.runOnlyPendingTimersAsync();
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.runOnlyPendingTimersAsync();

      const result = await resultPromise;
      expect(result.stats.fallbackChunks).toBe(1);
      expect(result.stats.aiChunks).toBe(0);
      expect(result.needsReview).toBe(true);
      expect(result.songs.length).toBeGreaterThan(0);
      expect(result.warnings.some((warning) => warning.includes("timed out"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── Phase 6: Retry Logic ──

describe("Phase 6: Retry Logic", () => {
  it("uses larger batches so medium documents stay within a few AI requests", async () => {
    const text = "Batch sizing validation line\n".repeat(4000);
    const provider = mockProvider();

    const result = await processDocumentWithAi(text, "batch-sizing.txt", provider);
    expect(result.stats.totalChunks).toBeLessThanOrEqual(3);
  });

  it("Test 9: transient failure recovers on retry", async () => {
    const provider = mockProvider({
      transientFailures: 1,
    });

    const text = "Retry test lyrics for transient failure recovery\n".repeat(500);
    const result = await processDocumentWithAi(text, "retry.txt", provider);

    expect(result.stats.fallbackChunks).toBe(0);
    expect(result.stats.aiChunks).toBe(result.stats.totalChunks);
    expect(result.needsReview).toBe(false);
  });

  it("Test 10: permanent failure after max retries creates fallback", { timeout: 15000 }, async () => {
    const callCount = new Map<number, number>();
    const provider = mockProvider({
      failChunks: new Set([0]),
      callCount,
    });

    const text = "Permanent failure test\n".repeat(500);
    const result = await processDocumentWithAi(text, "perm-fail.txt", provider);

    expect(result.stats.fallbackChunks).toBe(1);
    expect(result.needsReview).toBe(true);
  });

  it("surfaces rate limit fallbacks clearly", { timeout: 15000 }, async () => {
    const provider: DocumentStructureProvider = {
      name: "rate-limit",
      async structureChunk() {
        throw new Error('OpenCode API returned 429: {"type":"error","error":{"type":"FreeUsageLimitError","message":"Rate limit exceeded. Please try again later."},"metadata":{}}');
      },
    };

    const text = "Rate limit test\n".repeat(500);
    const result = await processDocumentWithAi(text, "rate-limit.txt", provider);

    expect(result.stats.fallbackChunks).toBe(1);
    expect(result.needsReview).toBe(true);
    expect(result.warnings[0]).toBe("1 section fell back because the AI provider rate limit was exceeded. Retry later.");
    expect(result.warnings[1]).toContain("Chunk 1: OpenCode API returned 429");
  });
});

// ── Phase 7: Deduplication ──

describe("Phase 7: Deduplication", () => {
  it("Test 11: duplicate songs from chunk overlap are merged", async () => {
    const provider: DocumentStructureProvider = {
      name: "overlap-test",
      async structureChunk(request: BulkImportChunkRequest) {
        const idx = request.chunkIndex;
        const songs: SmartImportSongDraft[] = [];

        if (idx === 0) {
          songs.push({
            id: "song-1",
            title: "Amazing Grace",
            sections: [{ id: "s1", type: "verse", label: "Verse 1", content: "Amazing grace how sweet the sound", warnings: [] }],
            artist: "", language: undefined, hymnNumber: undefined, method: "ai",
            warnings: [], reviewNotes: [], rawExcerpt: "",
          });
          songs.push({
            id: "song-2",
            title: "How Great Thou Art",
            sections: [{ id: "s2", type: "verse", label: "Verse 1", content: "O Lord my God when I in awesome wonder", warnings: [] }],
            artist: "", language: undefined, hymnNumber: undefined, method: "ai",
            warnings: [], reviewNotes: [], rawExcerpt: "",
          });
        }

        if (idx === 1) {
          songs.push({
            id: "song-2-dupe",
            title: "How Great Thou Art",
            sections: [{ id: "s2b", type: "verse", label: "Verse 1", content: "O Lord my God when I in awesome wonder", warnings: [] }],
            artist: "", language: undefined, hymnNumber: undefined, method: "ai",
            warnings: [], reviewNotes: [], rawExcerpt: "",
          });
          songs.push({
            id: "song-3",
            title: "It Is Well",
            sections: [{ id: "s3", type: "verse", label: "Verse 1", content: "When peace like a river attendeth my way", warnings: [] }],
            artist: "", language: undefined, hymnNumber: undefined, method: "ai",
            warnings: [], reviewNotes: [], rawExcerpt: "",
          });
        }

        return { songs };
      },
    };

    // Create text that produces 2 chunks
    const line = "Test\n";
    const text = line.repeat(18000);

    const result = await processDocumentWithAi(text, "dedup.txt", provider);
    expect(result.songs).toHaveLength(3);

    const titles = result.songs.map((s) => s.title);
    expect(titles).toContain("Amazing Grace");
    expect(titles).toContain("How Great Thou Art");
    expect(titles).toContain("It Is Well");

    const graceCount = titles.filter((t) => t === "Amazing Grace").length;
    const howGreatCount = titles.filter((t) => t === "How Great Thou Art").length;
    expect(graceCount).toBe(1);
    expect(howGreatCount).toBe(1);
  });
});

// ── buildFallbackDraft ──

describe("buildFallbackDraft", () => {
  it("creates a single draft song from raw text", () => {
    const text = "Amazing Grace\nVerse 1\nAmazing grace how sweet the sound";
    const songs = buildFallbackDraft(text, "test.txt");
    expect(songs).toHaveLength(1);
    expect(songs[0].title).toBe("test");
    expect(songs[0].sections[0].content).toBe(text);
    expect(songs[0].method).toBe("fallback");
    expect(songs[0].reviewNotes.length).toBeGreaterThan(0);
  });

  it("returns empty array for empty text", () => {
    expect(buildFallbackDraft("", "empty.txt")).toHaveLength(0);
    expect(buildFallbackDraft("  ", "spaces.txt")).toHaveLength(0);
  });

  it("strips extension from title", () => {
    const songs = buildFallbackDraft("content", "my-hymnal.pdf");
    expect(songs[0].title).toBe("my-hymnal");
  });
});

// ── formatDraftLyrics roundtrip ──

describe("formatDraftLyrics", () => {
  it("formats song sections back into text", () => {
    const song: SmartImportSongDraft = {
      id: "test-1",
      title: "Amazing Grace",
      sections: [
        { id: "s1", type: "verse", label: "Verse 1", content: "Amazing grace how sweet the sound", number: "1", warnings: [] },
        { id: "s2", type: "chorus", label: "Chorus", content: "I once was lost but now am found", warnings: [] },
      ],
      artist: "", language: undefined, hymnNumber: undefined, method: "fallback",
      warnings: [], reviewNotes: [], rawExcerpt: "",
    };

    const formatted = formatDraftLyrics(song);
    expect(formatted).toContain("Amazing grace how sweet the sound");
    expect(formatted).toContain("I once was lost but now am found");
  });
});

// ── estimateDraftSlideCount ──

describe("estimateDraftSlideCount", () => {
  it("estimates slide count from song content", () => {
    const song: SmartImportSongDraft = {
      id: "test-1",
      title: "Test Song",
      sections: [
        { id: "s1", type: "verse", label: "Verse 1", content: "Line 1\nLine 2\nLine 3\nLine 4", number: "1", warnings: [] },
        { id: "s2", type: "chorus", label: "Chorus", content: "Line 1\nLine 2\nLine 3\nLine 4", warnings: [] },
      ],
      artist: "", language: undefined, hymnNumber: undefined, method: "fallback",
      warnings: [], reviewNotes: [], rawExcerpt: "",
    };

    const count = estimateDraftSlideCount(song, { linesPerSlide: 2, autoSplit: true });
    expect(count).toBeGreaterThan(0);
  });
});
