import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractTextFromFile } from "./bulkImportService";
import { processDocumentLocally } from "./bulkImportAiService";
import { generateSlides } from "./slideEngine";

import { formatDraftLyrics } from "./smartImportService";

describe("Worship PDF Import Verification", () => {
  it("extracts and structures lyrics from a real PDF file", async () => {
    const bytes = readFileSync(new URL("../CCC-Hymns.pdf", import.meta.url));
    const file = new File([bytes], "CCC-Hymns.pdf", { type: "application/pdf" });

    // Step 1: Extract text from PDF
    const text = await extractTextFromFile(file);
    expect(text.length).toBeGreaterThan(1000);

    // Step 2: Process document into song drafts
    const result = await processDocumentLocally(text, file.name);
    expect(result.songs.length).toBeGreaterThan(0);

    const firstSong = result.songs[0];
    expect(firstSong.title).toBeTruthy();
    expect(firstSong.sections.length).toBeGreaterThan(0);

    // Verify sections have lyrics content
    for (const section of firstSong.sections) {
      expect(section.content.trim().length).toBeGreaterThan(0);
    }

    // Step 3: Format lyrics and verify slide generation
    const lyrics = formatDraftLyrics(firstSong);
    expect(lyrics.trim().length).toBeGreaterThan(0);

    console.log("PDF imported total songs:", result.songs.length);
    console.log("Sample Song 1:", {
      title: firstSong.title,
      hymnNumber: firstSong.hymnNumber,
      sectionsCount: firstSong.sections.length,
      sectionLabels: firstSong.sections.map((s) => s.label),
      firstSectionSample: firstSong.sections[0]?.content.split("\n").slice(0, 3).join(" / "),
    });

    const slides = generateSlides(lyrics, 2, true);
    console.log("Generated slides count for Song 1:", slides.length);
    console.log("Slide 1 content:", slides[0].content);

    expect(result.songs.length).toBe(455);
    expect(slides.length).toBeGreaterThan(0);
    expect(slides[0].content.trim().length).toBeGreaterThan(0);
    expect(slides[0].label).toBeTruthy();
  });

  it("extracts lyrics from a generated standard worship song PDF", async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.text("Hymn 1: Amazing Grace", 10, 10);
    doc.text("Verse 1", 10, 20);
    doc.text("Amazing grace how sweet the sound", 10, 30);
    doc.text("That saved a wretch like me", 10, 40);
    doc.text("I once was lost but now am found", 10, 50);
    doc.text("Was blind but now I see", 10, 60);

    const pdfArrayBuffer = doc.output("arraybuffer");
    const file = new File([pdfArrayBuffer], "Amazing-Grace.pdf", { type: "application/pdf" });

    // Step 1: Extract text
    const extractedText = await extractTextFromFile(file);
    expect(extractedText).toContain("Amazing grace how sweet the sound");

    // Step 2: Process document
    const result = await processDocumentLocally(extractedText, file.name);
    expect(result.songs.length).toBeGreaterThan(0);
    expect(result.songs[0].title).toContain("Amazing Grace");
    expect(result.songs[0].sections.length).toBeGreaterThan(0);
    expect(result.songs[0].sections[0].content).toContain("how sweet the sound");
  });

  it("extracts lyrics from a single unnumbered worship song PDF", async () => {
    const { jsPDF } = await import("jspdf");
    const { buildFallbackDraft } = await import("./smartImportService");
    const doc = new jsPDF();
    doc.text("Way Maker", 10, 10);
    doc.text("Verse 1", 10, 20);
    doc.text("You are here moving in our midst", 10, 30);
    doc.text("I worship You I worship You", 10, 40);
    doc.text("Chorus", 10, 55);
    doc.text("Way Maker Miracle Worker", 10, 65);
    doc.text("Promise Keeper Light in the darkness", 10, 75);

    const pdfArrayBuffer = doc.output("arraybuffer");
    const file = new File([pdfArrayBuffer], "Way-Maker.pdf", { type: "application/pdf" });

    // Step 1: Extract text
    const extractedText = await extractTextFromFile(file);
    expect(extractedText).toContain("Way Maker Miracle Worker");

    // Step 2: In desktop when local AI is unavailable, it uses buildFallbackDraft
    const fallbackDrafts = buildFallbackDraft(extractedText, file.name);
    expect(fallbackDrafts.length).toBe(1);
    expect(fallbackDrafts[0].title).toBe("Way-Maker");
    expect(fallbackDrafts[0].sections.length).toBeGreaterThanOrEqual(1);

    // Step 3: Format lyrics and generate slides
    const lyrics = formatDraftLyrics(fallbackDrafts[0]);
    expect(lyrics).toContain("Way Maker Miracle Worker");

    const slides = generateSlides(lyrics, 2, true);
    expect(slides.length).toBeGreaterThan(0);
  });

  it("completes full end-to-end import pipeline from PDF to saved worship songs with slides", async () => {
    const { jsPDF } = await import("jspdf");
    const { importSmartSongs } = await import("./smartImportService");
    const doc = new jsPDF();
    doc.text("Hymn 101: Holy Holy Holy", 10, 10);
    doc.text("Verse 1", 10, 20);
    doc.text("Holy holy holy Lord God Almighty", 10, 30);
    doc.text("Early in the morning our song shall rise to Thee", 10, 40);
    doc.text("Hymn 102: Crown Him With Many Crowns", 10, 60);
    doc.text("Verse 1", 10, 70);
    doc.text("Crown Him with many crowns the Lamb upon His throne", 10, 80);
    doc.text("Hark how the heavenly anthem drowns all music but its own", 10, 90);

    const pdfArrayBuffer = doc.output("arraybuffer");
    const file = new File([pdfArrayBuffer], "Hymnal-Selection.pdf", { type: "application/pdf" });

    // 1. Text extraction
    const text = await extractTextFromFile(file);

    // 2. Structuring
    const result = await processDocumentLocally(text, file.name);
    expect(result.songs.length).toBe(2);

    // 3. Batch import into worship store
    const savedBatch: any[] = [];
    const importedSongs = await importSmartSongs(result.songs, {
      sourceName: file.name,
      saveBatch: async (batch) => {
        savedBatch.push(...batch);
      },
      linesPerSlide: 2,
    });

    expect(importedSongs.length).toBe(2);
    expect(savedBatch.length).toBe(2);

    const song1 = savedBatch[0];
    expect(song1.metadata.title).toContain("Holy Holy Holy");
    expect(song1.metadata.hymnNumber).toBe("101");
    expect(song1.lyrics).toContain("Early in the morning");
    expect(song1.slides.length).toBeGreaterThan(0);
    expect(song1.slides[0].content).toContain("Holy holy holy");
    expect(song1.importSourceType).toBe("document");
    expect(song1.importSourceName).toBe("Hymnal-Selection.pdf");

    const song2 = savedBatch[1];
    expect(song2.metadata.title).toContain("Crown Him With Many Crowns");
    expect(song2.metadata.hymnNumber).toBe("102");
    expect(song2.lyrics).toContain("Crown Him with many crowns");
    expect(song2.slides.length).toBeGreaterThan(0);
  });
});
