import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dockCss = readFileSync(new URL("./dock.css", import.meta.url), "utf8");

function cssBlock(selector: string): string {
  const start = dockCss.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = dockCss.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return dockCss.slice(start, end + 2);
}

describe("dock shared styles", () => {
  it("keeps the lyrics toolbar controls readable in light mode", () => {
    const toolbar = cssBlock(".dock-lyrics-toolbar {");
    const button = cssBlock(".dock-lyrics-toolbar__btn {");
    const accent = cssBlock(".dock-lyrics-toolbar__btn--accent {");
    const caseButton = cssBlock(".dock-lyrics-toolbar__btn--case {");

    expect(toolbar).toContain("background: var(--dock-surface-alt");
    expect(toolbar).toContain("border: 1px solid var(--dock-border-soft");
    expect(toolbar).toContain("align-items: flex-start");
    expect(toolbar).toContain("justify-content: flex-start");
    expect(button).toContain("background: var(--dock-surface");
    expect(button).toContain("color: var(--dock-text-secondary");
    expect(accent).toContain("color: var(--dock-accent");
    expect(caseButton).toContain("color: var(--dock-text-secondary");
    expect(cssBlock(".dock-lyrics-toolbar__group {")).toContain("margin-left: 0");
    expect(button).not.toContain("--dock-secondary-text");
    expect(button).not.toContain("--dock-primary");
  });
});
