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

  it("gives Notes output text a real width so long words can wrap in OBS", () => {
    expect(cssBlock(noteOverlay, "#verse-text")).toContain("width: 100%;");
    expect(cssBlock(noteOverlay, "#verse-text")).toContain("overflow-wrap: anywhere;");
    expect(cssBlock(noteOverlay, "#lt-verse-text")).toContain("width: 100%;");
    expect(cssBlock(noteOverlay, "#lt-verse-text")).toContain("overflow-wrap: anywhere;");
    expect(cssBlock(noteOverlay, ".compare-column__verse")).toContain("min-width: 0;");
  });

  it("narrows fullscreen Worship text as the requested size grows", () => {
    expect(cssBlock(worshipOverlay, "#verse-container")).toContain(
      "max-width: var(--fullscreen-text-max-width, 100%);",
    );
    expect(worshipOverlay).toContain("function resolveFullscreenTextMaxWidth(fontSize)");
    expect(worshipOverlay).toContain("if (size >= 144) return 1720;");
    expect(worshipOverlay).toContain("if (size >= 112) return 1740;");
    expect(worshipOverlay).toContain("if (size >= 80) return 1760;");
    expect(worshipOverlay).toContain("if (size >= 48) return 1780;");
    expect(worshipOverlay).toContain(
      "root.style.setProperty('--fullscreen-text-max-width', resolveFullscreenTextMaxWidth(baseFontSize) + 'px');",
    );
  });

  it("keeps Worship fit-to-frame output readable", () => {
    expect(worshipOverlay).toContain("const AUTO_FIT_MIN_FONT_SIZE = 28;");
    expect(worshipOverlay).toContain("const LOWER_THIRD_FIT_MIN_FONT_SIZE = 45;");
    expect(worshipOverlay).toContain("const LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE = 16;");
    expect(worshipOverlay).toContain("function isFitVisible(node)");
    expect(worshipOverlay).toContain("function getLayoutRect(node)");
    expect(worshipOverlay).toContain("function getLayoutContentSize(node, rect)");
    expect(worshipOverlay).not.toContain("function getVisualScale(node, rect)");
    expect(worshipOverlay).not.toContain("stableLowerThirdTextSize");
    expect(worshipOverlay).toContain(
      "data.timestamp ?? data.revision ?? 0",
    );
    expect(worshipOverlay).toContain(
      "const allowed = ['fade', 'reveal-bg-then-text'];",
    );
    expect(worshipOverlay).toContain(
      "root.style.setProperty('--text-transition-duration', Math.min(180, ead) + 'ms');",
    );
    expect(worshipOverlay).not.toContain('await waitForOverlayAnimation');
    expect(worshipOverlay).toContain(
      "return isOverflowing(verseContainer, targetWidth, targetHeight);",
    );
    expect(worshipOverlay).toContain("const applyTextSize = (nextSize) =>");
    expect(worshipOverlay).toContain("while (low <= high)");
    expect(worshipOverlay).not.toContain("guard < 240");
  });
});
