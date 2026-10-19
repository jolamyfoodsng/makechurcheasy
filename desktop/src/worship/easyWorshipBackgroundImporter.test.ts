import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./worshipDb", () => ({ getAllSongs: vi.fn(async () => []), getArchivedSongs: vi.fn(async () => []), saveSongsBatch: vi.fn() }));

import { selectEasyWorshipDrafts } from "./easyWorshipBackgroundImporter";
import type { SmartImportSongDraft } from "./smartImportTypes";

const draft = (title: string, artist = ""): SmartImportSongDraft => ({
  id: title, title, artist, sections: [{ id: "s", type: "verse", label: "Verse 1", content: "words", warnings: [] }],
  method: "fallback", warnings: [], reviewNotes: [], rawExcerpt: "",
});
const song = (title: string, artist = "") => ({ metadata: { title, artist } });

describe("EasyWorship import: which songs to add", () => {
  it("skips songs already in the library (same title and artist, ignoring case and punctuation)", () => {
    const r = selectEasyWorshipDrafts(
      [draft("Way Maker", "Sinach"), draft("Amazing Grace"), draft("Holy, Holy, Holy")],
      [song("way maker", "SINACH"), song("Holy Holy Holy")],
      Infinity,
    );
    expect(r.toImport.map((d) => d.title)).toEqual(["Amazing Grace"]);
    expect(r.alreadyInLibrary).toBe(2);
    expect(r.overLimit).toBe(0);
  });

  it("keeps a song with the same title by a different artist, and drops duplicates inside EasyWorship", () => {
    const r = selectEasyWorshipDrafts([draft("Oceans", "Hillsong"), draft("Oceans", "Other"), draft("Oceans", "Hillsong")], [], Infinity);
    expect(r.toImport).toHaveLength(2);
    expect(r.alreadyInLibrary).toBe(1);
  });

  it("stops at the plan's song limit and says how many didn't fit", () => {
    const r = selectEasyWorshipDrafts([draft("A"), draft("B"), draft("C"), draft("D")], [song("A")], 2);
    expect(r.toImport.map((d) => d.title)).toEqual(["B", "C"]);
    expect(r.alreadyInLibrary).toBe(1);
    expect(r.overLimit).toBe(1);
  });
});
