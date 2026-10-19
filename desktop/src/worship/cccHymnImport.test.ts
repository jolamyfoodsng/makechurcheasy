import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractTextFromFile, normalizeExtractedLyricsText } from "./bulkImportService";
import { joinCccWrappedLines, parseCccHymnDrafts, splitCccSections } from "./cccHymnImport";
import { isMusicalLine } from "./legacy/pdfImportService";
import { formatDraftLyrics } from "./smartImportService";
import { generateSlides } from "./slideEngine";

describe("CCC hymn sections", () => {
  it("splits a language block into numbered verses and the chorus", () => {
    const sections = splitCccSections([
      "Jesu is calling you, oh come",
      "Oh sinner come",
      "",
      "2: Your load is heavy indeed oh come,",
      "Oh sinner come",
      "Chorus: Chorus: Forgive me my sins",
      "Forgive me my sins.",
    ].join("\n"));
    expect(sections.map((s) => [s.type, s.number, s.lines[0]])).toEqual([
      ["verse", "1", "Jesu is calling you, oh come"],
      ["verse", "2", "Your load is heavy indeed oh come,"],
      ["chorus", undefined, "Forgive me my sins"],
    ]);
  });

  it("joins lines the narrow column wrapped, and keeps a lone Amen on the last line", () => {
    expect(joinCccWrappedLines([
      "Jesus Christ will descend into our",
      "midst,",
      "Today you should give your mind to",
      "Him",
      "Oh sinner come",
      "Elese wa,",
      "Let all sinners ask for forgiveness.",
      "Amen",
    ])).toEqual([
      "Jesus Christ will descend into our midst,",
      "Today you should give your mind to Him",
      "Oh sinner come",
      "Elese wa,",
      "Let all sinners ask for forgiveness. Amen",
    ]);
  });

  it("drops a group heading printed after the closing Amen", () => {
    const sections = splitCccSections("1: For the glory in the end.\nAmen\nPraises Songs");
    expect(sections[0].lines).toEqual(["For the glory in the end. Amen"]);
  });

  it("recognises tonic sol-fa lines as music, not words", () => {
    expect(isMusicalLine("m : s : m : d : f : m : r:")).toBe(true);
    expect(isMusicalLine("s: s: l: s: fe: s: s")).toBe(true);
    expect(isMusicalLine("cr: s : d : r : m : r : d : r : m : r")).toBe(true);
    expect(isMusicalLine("ss- d – drm – dtl – d – s – ss: dd – r – dtd")).toBe(true);
    expect(isMusicalLine("Rest: Let us sing, sing to the Lord:")).toBe(false);
    expect(isMusicalLine("Elese wa,")).toBe(false);
  });
});

describe("CCC hymnal PDF", () => {
  it("imports every hymn with real verses, no music lines and no stray headings", { timeout: 30000 }, async () => {
    const file = new File([readFileSync(new URL("../CCC-Hymns.pdf", import.meta.url))], "CCC-Hymns.pdf");
    const drafts = parseCccHymnDrafts(normalizeExtractedLyricsText(await extractTextFromFile(file)));
    const byNumber = new Map(drafts.map((d) => [d.hymnNumber, d]));

    // "Hymn78" / "Hymn131" (no space) used to be swallowed by the hymn before.
    expect(byNumber.get("78")).toBeDefined();
    expect(byNumber.get("131")).toBeDefined();
    expect(byNumber.get("5")!.sections.map((s) => s.label)).toEqual([
      "Verse 1 (Yoruba)", "Verse 2 (Yoruba)", "Verse 3 (Yoruba)",
      "Verse 1 (English)", "Verse 2 (English)", "Verse 3 (English)",
    ]);

    const allLines = drafts.flatMap((d) => d.sections.flatMap((s) => s.content.split("\n")));
    expect(allLines.filter((line) => isMusicalLine(line))).toEqual([]);
    expect(allLines.filter((line) => /^(?:Orin|Hymn)\s*\d+$/i.test(line.trim()))).toEqual([]);
    expect(allLines.filter((line) => /^\d{1,2}\s*:/.test(line))).toEqual([]);
    expect(allLines.filter((line) => /^(?:amen|amin)\.?$/i.test(line.trim()))).toEqual([]);
    expect(drafts.some((d) => d.sections.some((s) => s.type === "chorus"))).toBe(true);
    // The Yoruba "Amin" that spills over the column line stays with the Yoruba words.
    expect(drafts.flatMap((d) => d.sections.filter((s) => s.label.endsWith("(English)")).map((s) => s.content)).some((c) => /(^|\n)Amin\s+\S/.test(c))).toBe(false);
  });

  it("keeps the verse labels when the song is opened in the editor", async () => {
    const file = new File([readFileSync(new URL("../CCC-Hymns.pdf", import.meta.url))], "CCC-Hymns.pdf");
    const hymn5 = parseCccHymnDrafts(normalizeExtractedLyricsText(await extractTextFromFile(file))).find((d) => d.hymnNumber === "5")!;
    const lyrics = formatDraftLyrics(hymn5);
    expect(lyrics).toContain("Verse 2 (Yoruba):\nBi Jesu ba de, K’awa wole,");
    const slides = generateSlides(lyrics, 2, true, { continuousLineCount: true });
    expect([...new Set(slides.filter((s) => !s.isContinuation).map((s) => s.label))]).toEqual([
      "Verse 1 (Yoruba)", "Verse 2 (Yoruba)", "Verse 3 (Yoruba)",
      "Verse 1 (English)", "Verse 2 (English)", "Verse 3 (English)",
    ]);
    expect(slides.every((s) => !/^(?:Yoruba|English):?$/m.test(s.content))).toBe(true);
  });
});
