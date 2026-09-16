import { beforeEach, describe, expect, it, vi } from "vitest";
import { isConfidentScriptureSuggestion, resolveScriptureProjection } from "./scriptureProjection";
import { getVerse } from "../bible/bibleData";
import { loadLmSettings } from "./lmSettings";
import { readNativeDockSetting } from "./localDockSettings";
import type { VoiceBibleCandidate } from "./voiceBibleTypes";

vi.mock("../bible/bibleData", () => ({ getVerse: vi.fn() }));
vi.mock("./localDockSettings", () => ({ readNativeDockSetting: vi.fn(), writeNativeDockSetting: vi.fn() }));
vi.mock("../multiview/mvStore", () => ({ getSettings: () => ({ defaultBibleOverlayMode: "lower-third" }) }));
const candidate: VoiceBibleCandidate = { book: "John", chapter: 3, verse: 16, translation: "KJV", label: "John 3:16", snippet: "Old KJV words", source: "keyword", confidence: 1 };

beforeEach(() => vi.resetAllMocks());

describe("projection settings and verse text", () => {
  it("fetches the chosen version instead of relabelling the previous text", async () => {
    vi.mocked(getVerse).mockResolvedValue({ book: "John", chapter: 3, abbrev: "Jn", verse: 16, text: "Actual NIV verse" });
    const result = await resolveScriptureProjection(candidate, "NIV");
    expect(getVerse).toHaveBeenCalledWith("John", 3, 16, "NIV");
    expect(result).toMatchObject({ translation: "NIV", snippet: "Actual NIV verse" });
  });
  it("keeps a matched passage's label and projected text aligned", async () => {
    vi.mocked(getVerse).mockImplementation(async (_b, _c, verse) => ({ book: "John", chapter: 3, abbrev: "Jn", verse, text: `Verse ${verse}` }));
    expect(await resolveScriptureProjection({ ...candidate, endVerse: 18 })).toMatchObject({ label: "John 3:16-18", snippet: "Verse 16 Verse 17 Verse 18" });
  });
  it("reports a missing translation instead of showing different text", async () => {
    vi.mocked(getVerse).mockRejectedValue(new Error("Translation is not installed"));
    await expect(resolveScriptureProjection(candidate, "NIV")).rejects.toThrow("not installed");
  });
  it("leaves closest and low-confidence matches for manual selection", () => {
    expect(isConfidentScriptureSuggestion({ ...candidate, confidence: 0.08, source: "fuzzy" })).toBe(false);
    expect(isConfidentScriptureSuggestion({ ...candidate, confidence: 0.89, source: "embedding" })).toBe(false);
    expect(isConfidentScriptureSuggestion({ ...candidate, confidence: 0.95, source: "alias" })).toBe(true);
  });
  it("uses the same saved output mode and translation as the dock", () => {
    vi.mocked(readNativeDockSetting).mockReturnValue({ translation: " niv ", overlayMode: "lower-third", autoPushQueue: true });
    expect(loadLmSettings()).toMatchObject({ translation: "NIV", overlayMode: "lower-third", autoPushQueue: true, autoPushSuggestions: false });
  });
  it("auto-pushes detected Scripture by default while keeping quote suggestions manual", () => {
    expect(loadLmSettings()).toMatchObject({ overlayMode: "lower-third", autoPushQueue: true, autoPushSuggestions: false });
  });
  it("respects an explicit saved opt-out from automatic Scripture pushes", () => {
    vi.mocked(readNativeDockSetting).mockReturnValue({ autoPushQueue: false });
    expect(loadLmSettings()).toMatchObject({ autoPushQueue: false, autoPushSuggestions: false });
  });
});
