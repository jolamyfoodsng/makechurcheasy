import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import {
  parseEasyWorshipRtf,
  parseEasyWorshipSongSections,
  convertEasyWorshipRecordsToDrafts,
  type EasyWorshipRawRecord,
} from "./easyWorshipImportService";

describe("easyWorshipImportService", () => {
  it("cleans RTF formatting into plain text", () => {
    const rawRtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\pard\\plain Verse 1\\par A mighty fortress is our God\\par A bulwark never failing\\par}}`;
    const clean = parseEasyWorshipRtf(rawRtf);
    expect(clean).toContain("Verse 1");
    expect(clean).toContain("A mighty fortress is our God");
    expect(clean).toContain("A bulwark never failing");
  });

  it("parses RTF sections into structured slide drafts", () => {
    const lyrics = `Verse 1\nLine 1\nLine 2\n\nChorus 1\nChorus line 1\nChorus line 2`;
    const sections = parseEasyWorshipSongSections(lyrics);
    expect(sections.length).toBe(2);
    expect(sections[0].type).toBe("verse");
    expect(sections[0].label).toBe("Verse 1");
    expect(sections[1].type).toBe("chorus");
    expect(sections[1].label).toBe("Chorus 1");
  });

  it("imports real songs from eazyworship folder if available", () => {
    const songsDbPath = resolve(__dirname, "../../../eazyworship/Songs (1).db");
    const wordsDbPath = resolve(__dirname, "../../../eazyworship/SongWords (1).db");

    if (!existsSync(songsDbPath) || !existsSync(wordsDbPath)) {
      console.warn("Skipping real DB test: files not found at eazyworship path");
      return;
    }

    const sql = `ATTACH DATABASE "${wordsDbPath}" AS w; SELECT s.rowid, s.title, s.author, s.copyright, s.reference_number, w.words FROM song s JOIN w.word w ON s.rowid = w.song_id;`;
    const jsonStr = execFileSync("sqlite3", ["-json", songsDbPath, sql]).toString();
    const rows = JSON.parse(jsonStr) as Array<{
      rowid: number;
      title: string;
      author?: string;
      copyright?: string;
      reference_number?: string;
      words: string;
    }>;

    expect(rows.length).toBeGreaterThan(0);

    const records: EasyWorshipRawRecord[] = rows.map((r) => ({
      rowid: r.rowid,
      title: r.title,
      author: r.author,
      copyright: r.copyright,
      referenceNumber: r.reference_number,
      wordsRtf: r.words,
    }));

    const drafts = convertEasyWorshipRecordsToDrafts(records);
    expect(drafts.length).toBe(rows.length);
    expect(drafts[0].title).toBe("A Heart Like Thine");
    expect(drafts[0].artist).toBe("Judson Van DeVenter");
    expect(drafts[0].sections.length).toBeGreaterThan(0);
  });
});
