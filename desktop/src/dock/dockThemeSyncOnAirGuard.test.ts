import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(__dirname, file), "utf8");

/**
 * Quick edits default to "apply to all tabs and modes", so every save fires
 * DOCK_THEME_SYNC_EVENT at Bible, Worship and Notes. Worship and Notes share
 * one OBS source: a tab that only *thinks* it is visible (its flag starts as
 * true and the restored song/note is only selected) must not re-publish its
 * old content over the one that is really on air.
 */
describe("theme sync only refreshes content that is really on air", () => {
  it("exposes the shared-source check to the tabs", () => {
    expect(read("dockObsClient.ts")).toMatch(
      /^\s+isSharedWorshipNotesSourceHeldByOther\(module: "worship" \| "notes"\): boolean \{/m,
    );
  });

  it("Worship re-sends a section only when projected here and not held by Notes", () => {
    const src = read("tabs/DockWorshipTab.tsx");
    const block = src.slice(src.indexOf("const worshipIsOnAir"), src.indexOf("const worshipIsOnAir") + 400);
    expect(block).toContain("visibleIdx !== null");
    expect(block).toContain('isSharedWorshipNotesSourceHeldByOther("worship")');
    expect(src).toContain("if (worshipIsOnAir) {");
  });

  it("Notes re-sends a slide only when projected here and not held by Worship", () => {
    const src = read("tabs/DockNotesTab.tsx");
    const block = src.slice(src.indexOf("const notesIsOnAir"), src.indexOf("const notesIsOnAir") + 400);
    expect(block).toContain("visibleSlideIdx !== null");
    expect(block).toContain('isSharedWorshipNotesSourceHeldByOther("notes")');
    expect(src).toContain("if (notesIsOnAir) {");
  });
});
