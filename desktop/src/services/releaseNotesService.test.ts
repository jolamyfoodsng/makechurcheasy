import { describe, it, expect } from "vitest";
import {
  parseRawReleaseNotes,
  isTrivialReleaseNotes,
  getReleaseHighlights,
  stripReleaseBoilerplate,
} from "./releaseNotesService";

describe("releaseNotesService", () => {
  it("detects trivial release notes", () => {
    expect(isTrivialReleaseNotes("")).toBe(true);
    expect(isTrivialReleaseNotes("MakeChurchEasy v3.19.0")).toBe(true);
    expect(isTrivialReleaseNotes("v4.31.0")).toBe(true);
    expect(isTrivialReleaseNotes("3.19.0")).toBe(true);
    expect(isTrivialReleaseNotes("## 1. Multi-View\n- Added margin controls")).toBe(false);
  });

  it("parses raw markdown release notes into numbered highlight cards", () => {
    const markdown = `
## 1. Multi-View
- **Outer Margin:** Adjust outer margin from 0 to 200px
- **Inner Gap:** Adjust slot gaps between scenes

## 2. Voice AI Guard
- **Inactivity Check:** Modal appears after 5 minutes of silence
- **Auto-stop:** Stops after 60 seconds without confirmation

## 3. Bug Fixes
- Fixed background updating prematurely
    `.trim();

    const highlights = parseRawReleaseNotes(markdown);
    expect(highlights).toHaveLength(3);

    expect(highlights[0].title).toBe("Multi-View");
    expect(highlights[0].number).toBe(1);
    expect(highlights[0].points).toHaveLength(2);
    expect(highlights[0].points[0].lead).toBe("Outer Margin");
    expect(highlights[0].points[0].text).toBe("Adjust outer margin from 0 to 200px");

    expect(highlights[1].title).toBe("Voice AI Guard");
    expect(highlights[1].number).toBe(2);

    expect(highlights[2].title).toBe("Bug Fixes");
    expect(highlights[2].badge).toBe("fix");
  });

  it("does not show another release's curated notes when notes are trivial", () => {
    expect(getReleaseHighlights("3.19.0", "MakeChurchEasy v3.19.0")).toEqual([]);
  });

  it("ignores the generic CI release template", () => {
    const ciTemplate = [
      "## MakeChurchEasy",
      "",
      "### Downloads",
      "| Platform | File |",
      "|----------|------|",
      "| Windows | `.exe` (NSIS installer) or `.msi` |",
      "",
      "### Auto-Update",
      "Existing installations will automatically download and install this update on next launch.",
      "",
      "---",
      "_Built automatically from commit abc123_",
    ].join("\n");
    expect(stripReleaseBoilerplate(ciTemplate)).toBe("");
    expect(isTrivialReleaseNotes(ciTemplate)).toBe(true);
    expect(getReleaseHighlights("3.33.4", ciTemplate)).toEqual([]);
  });

  it("keeps the real changelog when it follows the CI template", () => {
    const notes = "## 1. Service Schedule\n- **Queue:** Plan Sunday\n\n### Downloads\n| Platform | File |\n|---|---|";
    const highlights = getReleaseHighlights("3.34.0", notes);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].title).toBe("Service Schedule");
    expect(highlights[0].points).toHaveLength(1);
  });

  it("prefers rich custom notes over fallback when provided", () => {
    const custom = "## 1. Exciting Feature\n- **Awesome:** Did something cool";
    const highlights = getReleaseHighlights("3.19.0", custom);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].title).toBe("Exciting Feature");
  });
});
