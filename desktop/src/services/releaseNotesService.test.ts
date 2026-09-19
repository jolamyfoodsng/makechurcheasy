import { describe, it, expect } from "vitest";
import {
  parseRawReleaseNotes,
  isTrivialReleaseNotes,
  getReleaseHighlights,
  CURATED_RELEASE_NOTES,
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

  it("returns curated release notes when raw notes are trivial or empty", () => {
    const highlights = getReleaseHighlights("3.19.0", "MakeChurchEasy v3.19.0");
    expect(highlights).toEqual(CURATED_RELEASE_NOTES.latest);
    expect(highlights.length).toBeGreaterThanOrEqual(3);
    expect(highlights[0].title).toContain("Multi-View");
    expect(highlights[1].title).toContain("Voice AI");
  });

  it("prefers rich custom notes over fallback when provided", () => {
    const custom = "## 1. Exciting Feature\n- **Awesome:** Did something cool";
    const highlights = getReleaseHighlights("3.19.0", custom);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].title).toBe("Exciting Feature");
  });
});
