/**
 * pdfImportService.test.ts — Tests for bilingual hymn parser
 *
 * Verifies that the parser correctly handles both single-column
 * (pdftotext -layout) and two-column (pdftotext without layout) output.
 */

import { describe, it, expect } from "vitest";
import { parseBilingualHymns } from "./pdfImportService";

// ═══════════════════════════════════════════════════════════════════════════════
// Single-column format (each header on its own line)
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseBilingualHymns — single-column", () => {
  it("parses a simple two-hymn single-column text", () => {
    // In single-column format the Orin header is followed by Yoruba lyrics,
    // then the Hymn header, then English lyrics (like pdftotext -layout output).
    const text = [
      "Orin 1",
      "Mimo, Mimo, Mimo",
      "L'Olorun kiki Imole",
      "",
      "Hymn 1",
      "Holy, Holy, Holy",
      "Lord God Almighty",
      "Amin",
      "",
      "Orin 2",
      "Jesu Oludande",
      "Oluwa mi lo",
      "",
      "Hymn 2",
      "Jesus the Saviour",
      "My Lord is He",
      "Amin",
    ].join("\n");

    const hymns = parseBilingualHymns(text);

    expect(hymns.length).toBe(2);
    expect(hymns[0].number).toBe(1);
    expect(hymns[0].title).toBe("Hymn 1");
    expect(hymns[0].yoruba).toContain("Mimo, Mimo, Mimo");
    expect(hymns[0].english).toContain("Holy, Holy, Holy");
    expect(hymns[1].number).toBe(2);
    expect(hymns[1].yoruba).toContain("Jesu Oludande");
    expect(hymns[1].english).toContain("Jesus the Saviour");
  });

  it("skips Amin/Amen lines", () => {
    const text = [
      "Orin 3",
      "Hymn 3",
      "Yoruba line",
      "English line",
      "Amin",
    ].join("\n");

    const hymns = parseBilingualHymns(text);
    expect(hymns.length).toBe(1);
    expect(hymns[0].yoruba).not.toContain("Amin");
    expect(hymns[0].english).not.toContain("Amin");
  });

  it("parses reordered left-column then right-column text", () => {
    const text = [
      "ORIN AKOWOLE                                PROCESSIONAL HYMN",
      "Orin 1",
      "Jerih mo yah mah,",
      "Iwo Jehofa lo ye",
      "",
      "Orin 2",
      "Mimo ni Oluwa,",
      "Awa yio juba Re",
      "",
      "PROCESSIONAL HYMN",
      "Hymn 1",
      "Jerih moh Yah mah",
      "Jehovah alone is worthy",
      "",
      "Hymn 2",
      "Holy is the Lord,",
      "We shall worship Thee",
    ].join("\n");

    const hymns = parseBilingualHymns(text);

    expect(hymns.length).toBe(2);
    expect(hymns[0].sectionLabel).toBe("PROCESSIONAL HYMN");
    expect(hymns[0].yoruba).toContain("Jerih mo yah mah,");
    expect(hymns[0].english).toContain("Jerih moh Yah mah");
    expect(hymns[1].yoruba).toContain("Mimo ni Oluwa,");
    expect(hymns[1].english).toContain("Holy is the Lord,");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Two-column format (both headers on the same line)
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseBilingualHymns — two-column (merged lines)", () => {
  it("parses hymns where Orin and Hymn headers share the same line", () => {
    // Simulates pdftotext output without -layout: two columns merged
    const text = [
      "Orin 62                                  Hymn 62",
      "",
      "Jesu, emi o sin O                        Jesus I shall worship Thee",
      "L'ogo ati lase Jesu                      In glory and in honour of Jesus",
      "Oun to mo mi lo                           He that knows me is my Lord",
    ].join("\n");

    const hymns = parseBilingualHymns(text);

    expect(hymns.length).toBe(1);
    expect(hymns[0].number).toBe(62);
    expect(hymns[0].title).toBe("Hymn 62");
    // Yoruba should be the left column
    expect(hymns[0].yoruba).toContain("Jesu, emi o sin O");
    expect(hymns[0].yoruba).not.toContain("Jesus I shall worship");
    // English should be the right column
    expect(hymns[0].english).toContain("Jesus I shall worship Thee");
    expect(hymns[0].english).not.toContain("Jesu, emi o sin O");
  });

  it("parses multiple two-column hymns", () => {
    const text = [
      "Orin 62                                  Hymn 62",
      "",
      "Jesu, emi o sin O                        Jesus I shall worship Thee",
      "",
      "Orin 63                                  Hymn 63",
      "",
      "Oluwa n p'ojo re                         The Lord is preparing His day",
      "Aye n kunsin re                          The world is turning to His way",
    ].join("\n");

    const hymns = parseBilingualHymns(text);

    expect(hymns.length).toBe(2);
    expect(hymns[0].number).toBe(62);
    expect(hymns[1].number).toBe(63);
    expect(hymns[0].english).toContain("Jesus I shall worship Thee");
    expect(hymns[1].yoruba).toContain("Oluwa n p'ojo re");
    expect(hymns[1].english).toContain("The Lord is preparing His day");
  });

  it("handles two-column hymns with section labels", () => {
    const text = [
      "ORIN AKOWOLE",
      "",
      "Orin 62                                  Hymn 62",
      "",
      "Jesu, emi o sin O                        Jesus I shall worship Thee",
    ].join("\n");

    const hymns = parseBilingualHymns(text);

    expect(hymns.length).toBe(1);
    expect(hymns[0].number).toBe(62);
    expect(hymns[0].sectionLabel).toBe("ORIN AKOWOLE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseBilingualHymns — edge cases", () => {
  it("returns empty array for text with no hymns", () => {
    const hymns = parseBilingualHymns("This is just some random text.\nNothing hymn-related here.");
    expect(hymns.length).toBe(0);
  });

  it("handles Yoruba-only hymns (no English header)", () => {
    const text = [
      "Orin 99",
      "Mimo lo mimo",
      "L'Olorun wa",
    ].join("\n");

    const hymns = parseBilingualHymns(text);

    expect(hymns.length).toBe(1);
    expect(hymns[0].number).toBe(99);
    expect(hymns[0].yoruba).toContain("Mimo lo mimo");
    expect(hymns[0].english).toBe("");
  });

  it("deduplicates hymn IDs by number", () => {
    const text = [
      "Orin 5",
      "Hymn 5",
      "Yoruba 5",
      "English 5",
    ].join("\n");

    const hymns = parseBilingualHymns(text);
    expect(hymns.length).toBe(1);
    expect(hymns[0].id).toBe("hymn-5");
  });
});
