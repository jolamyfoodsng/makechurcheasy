import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeDockMultilineText } from "./textLineBreaks";

const noteOverlay = readFileSync(new URL("../../public/mce-note.html", import.meta.url), "utf8");
const worshipOverlay = readFileSync(new URL("../../public/mce-worship-overlay.html", import.meta.url), "utf8");

function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`    ${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n    }", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 6);
}

describe("Dock multiline text", () => {
  it("normalizes pasted HTML break tags to real line breaks", () => {
    expect(normalizeDockMultilineText("1. First<br>2. Second<br />3. Third")).toBe(
      "1. First\n2. Second\n3. Third",
    );
  });

  it("keeps ordinary newlines and normalizes Windows line endings", () => {
    expect(normalizeDockMultilineText("1. First\r\n2. Second\r3. Third")).toBe(
      "1. First\n2. Second\n3. Third",
    );
  });

  it("configures both OBS text layers to render the preserved breaks", () => {
    for (const overlay of [noteOverlay, worshipOverlay]) {
      expect(cssBlock(overlay, "#verse-text")).toContain("white-space: pre-line;");
      expect(cssBlock(overlay, "#lt-verse-text")).toContain("white-space: pre-line;");
      expect(cssBlock(overlay, ".compare-column__verse")).toContain("white-space: pre-line;");
    }
  });
});
