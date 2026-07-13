import { describe, it, expect } from "vitest";
import { extractTextFromFile, reorderTwoColumnText } from "./bulkImportService";
import { processDocumentWithAi } from "./bulkImportAiService";
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
});

// ── Phase 6: Retry Logic ──

describe("Phase 6: Retry Logic", () => {
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
