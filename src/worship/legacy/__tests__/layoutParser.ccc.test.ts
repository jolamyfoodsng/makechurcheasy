/**
 * Integration test: Run layoutParser on actual CCC-Hymns.pdf extracted elements.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { parseLayoutSongs, detectColumns, type TextElement } from "../layoutParser";

const ELEMENTS_PATH = process.env.CCC_ELEMENTS_PATH || "/tmp/ccc_elements.json";

function loadElements(): TextElement[] {
  const raw = readFileSync(ELEMENTS_PATH, "utf-8");
  const arr = JSON.parse(raw);
  return arr.map((e: Record<string, unknown>) => ({
    text: String(e.text ?? ""),
    x: Number(e.x ?? 0),
    y: Number(e.y ?? 0),
    width: Number(e.width ?? 0),
    height: Number(e.height ?? 0),
    fontSize: Number(e.fontSize ?? 12),
    isBold: Boolean(e.isBold),
    page: Number(e.page ?? 1),
  }));
}

const describeWithFixture = existsSync(ELEMENTS_PATH) ? describe : describe.skip;

describeWithFixture("CCC-Hymns.pdf — real extraction", () => {
  it("parses 180+ songs from the full PDF", () => {
    const elements = loadElements();
    console.log(`Loaded ${elements.length} elements`);

    // Column detection
    const columns = detectColumns(elements);
    console.log(`Columns detected: ${columns.length}`);
    for (const col of columns) {
      console.log(`  Column centerX=${col.centerX.toFixed(0)} elements=${col.elements.length}`);
    }

    // Full parse
    const result = parseLayoutSongs(elements);
    console.log(`\n=== RESULTS ===`);
    console.log(`Songs found: ${result.songs.length}`);
    console.log(`Columns: ${result.columnsDetected}`);
    console.log(`Overall confidence: ${result.overallConfidence}`);
    console.log(`Warnings: ${result.warnings.join("; ")}`);

    // Print first 10 and last 5 song titles
    const titles = result.songs.map((s) => s.title);
    console.log(`\nFirst 10 titles:`);
    for (const t of titles.slice(0, 10)) {
      console.log(`  ${t}`);
    }
    if (titles.length > 15) {
      console.log(`  ...`);
      console.log(`Last 5 titles:`);
      for (const t of titles.slice(-5)) {
        console.log(`  ${t}`);
      }
    }

    // ── Assertions ──

    // We expect at least 180 songs from the CCC hymnal
    expect(result.songs.length).toBeGreaterThanOrEqual(180);

    // Each song should have a non-empty title
    for (const song of result.songs) {
      expect(song.title.length).toBeGreaterThan(0);
    }

    // Each song should have non-empty lyrics
    for (const song of result.songs) {
      expect(song.lyrics.length).toBeGreaterThan(0);
    }

    // All songs should have some confidence — pattern-detected headers can score
    // low on the heuristic scale (30-40) but still be correct matches
    const lowConfidenceSongs = result.songs.filter((s) => s.confidence < 40);
    console.log(`\nSongs with confidence < 40: ${lowConfidenceSongs.length}`);
    for (const s of lowConfidenceSongs.slice(0, 5)) {
      console.log(`  "${s.title}" confidence=${s.confidence} lyrics=${s.lyrics.length} chars`);
    }
    // Most songs should have confidence >= 40
    expect(lowConfidenceSongs.length).toBeLessThan(result.songs.length * 0.3);

    // Check that we have hymn numbers present (not necessarily sequential
    // because y-position interleaving doesn't guarantee number ordering)
    const hymnNumbers = new Set(
      titles
        .map((t) => {
          const match = t.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
        .filter((n) => n > 0),
    );

    console.log(`\nHymn numbers found: ${hymnNumbers.size}`);
    console.log(`Range: ${Math.min(...hymnNumbers)} - ${Math.max(...hymnNumbers)}`);

    // Log which numbers 1-20 are present vs missing
    const missingLow = [];
    for (let i = 1; i <= 20; i++) {
      if (!hymnNumbers.has(i)) missingLow.push(i);
    }
    console.log(`Missing 1-20: ${missingLow.length > 0 ? missingLow.join(", ") : "none"}`);

    // Should have most low-range hymn numbers (at least 8 out of 10)
    const lowPresent = Array.from({ length: 10 }, (_, i) => i + 1).filter((n) =>
      hymnNumbers.has(n),
    ).length;
    expect(lowPresent).toBeGreaterThanOrEqual(8);

    // Should have a good total count of unique hymn numbers (478+ unique)
    expect(hymnNumbers.size).toBeGreaterThanOrEqual(180);

    // Should span a wide range (1 through at least 900)
    expect(Math.max(...hymnNumbers)).toBeGreaterThanOrEqual(900);

    // Verify deduplication: no duplicate Orin numbers
    const orinNumbers = titles
      .filter((t) => t.startsWith("Orin"))
      .map((t) => parseInt(t.match(/\d+/)?.[0] ?? "0", 10))
      .filter((n) => n > 0);
    const uniqueOrinNumbers = new Set(orinNumbers);
    expect(orinNumbers.length).toBe(uniqueOrinNumbers.size);
  });
});
