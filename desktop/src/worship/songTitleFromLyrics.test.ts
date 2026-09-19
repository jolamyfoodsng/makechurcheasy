import { describe, expect, it } from "vitest";
import { deriveSongTitleFromLyrics, extractFirstLineAsTitle } from "./songTitleFromLyrics";
import { isDummyTitle, nextAutoSongTitle, nextAutoNoteTitle } from "./songTitleAutoGen";

describe("deriveSongTitleFromLyrics", () => {
  it("uses the first non-empty lyric line", () => {
    expect(deriveSongTitleFromLyrics("\nAmazing Grace\nVerse one line")).toBe("Amazing Grace");
  });

  it("supports bracketed hymn titles", () => {
    expect(deriveSongTitleFromLyrics("[Orin 969]\n2: Jesu Kristi wa pelu mi")).toBe("Orin 969");
  });

  it("does not mistake a section heading for a title", () => {
    expect(deriveSongTitleFromLyrics("Verse 1:\nAmazing grace")).toBe("");
  });

  it("preserves Unicode song titles", () => {
    expect(deriveSongTitleFromLyrics("Kyerɛ yɛn W'anuonyam\nOwura")).toBe("Kyerɛ yɛn W'anuonyam");
  });
});

describe("extractFirstLineAsTitle", () => {
  it("extracts the first line for notes and worship", () => {
    expect(extractFirstLineAsTitle("Welcome to Service\nAnnouncements follow")).toBe("Welcome to Service");
    expect(extractFirstLineAsTitle("\n\nGreat is Thy Faithfulness\nO God my Father")).toBe("Great is Thy Faithfulness");
  });

  it("strips bullet points and numbering prefixes", () => {
    expect(extractFirstLineAsTitle("1. Youth Choir Meeting\nSaturday at 4pm")).toBe("Youth Choir Meeting");
    expect(extractFirstLineAsTitle("- Opening Prayer\nPastor David")).toBe("Opening Prayer");
    expect(extractFirstLineAsTitle("• Announcements\nChurch picnic")).toBe("Announcements");
    expect(extractFirstLineAsTitle("# Sermon Title\nScripture reading")).toBe("Sermon Title");
  });

  it("extracts bracketed structured titles", () => {
    expect(extractFirstLineAsTitle("[Sunday Announcements]\nService at 9am")).toBe("Sunday Announcements");
    expect(extractFirstLineAsTitle("[Hymn 42]\nAmazing grace")).toBe("Hymn 42");
  });

  it("handles section labels by taking the first lyric line", () => {
    expect(extractFirstLineAsTitle("Verse 1:\nAmazing grace how sweet the sound")).toBe("Amazing grace how sweet the sound");
    expect(extractFirstLineAsTitle("[Chorus]\nHow great is our God")).toBe("How great is our God");
  });

  it("returns empty string on empty or blank input", () => {
    expect(extractFirstLineAsTitle("")).toBe("");
    expect(extractFirstLineAsTitle("   \n\n  \t  ")).toBe("");
  });
});

describe("songTitleAutoGen", () => {
  it("generates sequential titles in Title 1, Title 2 format", () => {
    const songTitle = nextAutoSongTitle();
    expect(songTitle).toMatch(/^Title \d+$/);

    const noteTitle = nextAutoNoteTitle();
    expect(noteTitle).toMatch(/^Title \d+$/);
  });

  it("recognizes dummy titles accurately", () => {
    expect(isDummyTitle("")).toBe(true);
    expect(isDummyTitle(null)).toBe(true);
    expect(isDummyTitle("Title 1")).toBe(true);
    expect(isDummyTitle("Title 25")).toBe(true);
    expect(isDummyTitle("Title")).toBe(true);
    expect(isDummyTitle("Song001")).toBe(true);
    expect(isDummyTitle("Song 1")).toBe(true);
    expect(isDummyTitle("Song")).toBe(true);

    expect(isDummyTitle("Amazing Grace")).toBe(false);
    expect(isDummyTitle("Youth Announcements")).toBe(false);
  });
});
