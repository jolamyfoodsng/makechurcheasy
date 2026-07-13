/**
 * Tests for layoutParser.ts — bilingual hymnal detection.
 */
import { describe, it, expect } from "vitest";
import {
  detectColumns,
  reorderToReadingOrder,
  parseLayoutSongs,
  type TextElement,
} from "../layoutParser";

// Helper to create a TextElement
function el(
  text: string,
  x: number,
  y: number,
  page: number,
  fontSize = 12,
  isBold = false,
): TextElement {
  return { text, x, y, width: text.length * 6, height: fontSize * 1.2, fontSize, isBold, page };
}

describe("detectColumns", () => {
  it("detects two columns for bilingual layout", () => {
    const elements: TextElement[] = [
      // Left column (Yoruba)
      el("Orin 1", 50, 700, 1, 14, true),
      el("Gbogbo ile ayé", 50, 680, 1, 10),
      el("Ma sun", 50, 665, 1, 10),
      // Right column (English)
      el("Hymn 1", 300, 700, 1, 14, true),
      el("All people on earth", 300, 680, 1, 10),
      el("O sing", 300, 665, 1, 10),
    ];

    const columns = detectColumns(elements);
    expect(columns.length).toBe(2);
    expect(columns[0].elements.length).toBe(3); // left column
    expect(columns[1].elements.length).toBe(3); // right column
  });
});

describe("reorderToReadingOrder", () => {
  it("interleaves bilingual elements by Y position", () => {
    const leftCol = {
      xMin: 50,
      xMax: 250,
      centerX: 150,
      elements: [
        el("Orin 1", 50, 700, 1, 14, true),
        el("Gbogbo ile ayé", 50, 680, 1, 10),
        el("Orin 2", 50, 600, 1, 14, true),
        el("Oluwa ni", 50, 580, 1, 10),
      ],
    };
    const rightCol = {
      xMin: 300,
      xMax: 500,
      centerX: 400,
      elements: [
        el("Hymn 1", 300, 700, 1, 14, true),
        el("All people on earth", 300, 680, 1, 10),
        el("Hymn 2", 300, 600, 1, 14, true),
        el("The Lord is my", 300, 580, 1, 10),
      ],
    };

    const columns = [leftCol, rightCol];
    const allElements = [...leftCol.elements, ...rightCol.elements];
    const ordered = reorderToReadingOrder(allElements, columns);

    // Expect interleaved: row 700 (Orin 1, Hymn 1), row 680 (Gbogbo, All people),
    // row 600 (Orin 2, Hymn 2), row 580 (Oluwa, The Lord)
    expect(ordered[0].text).toBe("Orin 1");
    expect(ordered[1].text).toBe("Hymn 1");
    expect(ordered[2].text).toBe("Gbogbo ile ayé");
    expect(ordered[3].text).toBe("All people on earth");
    expect(ordered[4].text).toBe("Orin 2");
    expect(ordered[5].text).toBe("Hymn 2");
  });
});

describe("parseLayoutSongs — bilingual hymnal", () => {
  it("detects multiple songs from a simulated bilingual hymnal", () => {
    // Simulate a 2-page bilingual hymnal with 4 hymns (2 per page, 2 columns)
    const elements: TextElement[] = [
      // Page 1 - Row 1 (y=700)
      el("Orin 1", 50, 700, 1, 14, true),
      el("Hymn 1", 300, 700, 1, 14, true),
      el("Gbogbo ile ayé", 50, 685, 1, 10),
      el("All people on earth", 300, 685, 1, 10),
      el("Ma sun Oluwa fun", 50, 670, 1, 10),
      el("O sing to the Lord", 300, 670, 1, 10),
      el("Gbogbo orisun", 50, 655, 1, 10),
      el("All earth's creatures", 300, 655, 1, 10),

      // Page 1 - Row 2 (y=580) — bigger gap before this
      el("Orin 2", 50, 580, 1, 14, true),
      el("Hymn 2", 300, 580, 1, 14, true),
      el("Oluwa ni Baba wa", 50, 565, 1, 10),
      el("The Lord is our Father", 300, 565, 1, 10),
      el("A wa lọ́pọ̀lọ́pọ̀", 50, 550, 1, 10),
      el("We are many", 300, 550, 1, 10),

      // Page 2 - Row 1 (y=700)
      el("Orin 3", 50, 700, 2, 14, true),
      el("Hymn 3", 300, 700, 2, 14, true),
      el("Jesu Oluwa mi", 50, 685, 2, 10),
      el("Jesus my Lord", 300, 685, 2, 10),
      el("Mo n fi ọkàn", 50, 670, 2, 10),
      el("With all my heart", 300, 670, 2, 10),

      // Page 2 - Row 2 (y=580)
      el("Orin 4", 50, 580, 2, 14, true),
      el("Hymn 4", 300, 580, 2, 14, true),
      el("Ogo ni fun", 50, 565, 2, 10),
      el("Glory be to", 300, 565, 2, 10),
      el("Baba Yokaayé", 50, 550, 2, 10),
      el("The Father Almighty", 300, 550, 2, 10),
    ];

    const result = parseLayoutSongs(elements);

    // Should detect 4 songs (Orin/Hymn 1-4)
    expect(result.songs.length).toBeGreaterThanOrEqual(4);
    expect(result.columnsDetected).toBe(2);
    expect(result.overallConfidence).toBeGreaterThan(50);

    // Check that titles include the hymn numbers
    const titles = result.songs.map((s) => s.title);
    expect(titles.some((t) => /Orin\s*1|Hymn\s*1/i.test(t))).toBe(true);
    expect(titles.some((t) => /Orin\s*2|Hymn\s*2/i.test(t))).toBe(true);
    expect(titles.some((t) => /Orin\s*3|Hymn\s*3/i.test(t))).toBe(true);
    expect(titles.some((t) => /Orin\s*4|Hymn\s*4/i.test(t))).toBe(true);
  });

  it("detects single-column songs normally", () => {
    const elements: TextElement[] = [
      el("Amazing Grace", 50, 700, 1, 16, true),
      el("John Newton", 50, 685, 1, 10),
      el("Amazing grace how", 50, 665, 1, 10),
      el("sweet the sound", 50, 650, 1, 10),
      el("That saved a wretch", 50, 635, 1, 10),
      el("like me", 50, 620, 1, 10),

      el("How Great Thou Art", 50, 550, 1, 16, true),
      el("Carl Boberg", 50, 535, 1, 10),
      el("O Lord my God", 50, 515, 1, 10),
      el("when I in awesome", 50, 500, 1, 10),
      el("wonder consider", 50, 485, 1, 10),
      el("all the worlds", 50, 470, 1, 10),
    ];

    const result = parseLayoutSongs(elements);
    expect(result.songs.length).toBeGreaterThanOrEqual(2);
    expect(result.songs[0].title).toContain("Amazing Grace");
    expect(result.songs[1].title).toContain("How Great Thou Art");
  });
});
