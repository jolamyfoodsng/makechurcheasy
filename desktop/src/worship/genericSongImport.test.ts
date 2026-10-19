import { describe, expect, it } from "vitest";
import { extractRtfText, extractTextFromFile, normalizeExtractedLyricsText } from "./bulkImportService";
import { processDocumentLocally } from "./bulkImportAiService";
import { parseGenericSongDrafts } from "./genericSongImport";
import { importSmartSongs } from "./smartImportService";
import type { Song } from "./types";
import * as S from "./__fixtures__/songSamples";

/** What the import window does: read, tidy, structure, save. */
async function importFile(file: File): Promise<Song[]> {
  const text = normalizeExtractedLyricsText(await extractTextFromFile(file));
  const result = await processDocumentLocally(text, file.name);
  let saved: Song[] = [];
  await importSmartSongs(result.songs, {
    sourceName: file.name,
    autoSplit: !/\.(pptx|odp)$/i.test(file.name),
    saveBatch: async (songs) => { saved = songs; },
  });
  return saved;
}

const allLines = (songs: Song[]) => songs.flatMap((song) => song.slides.flatMap((slide) => slide.content.split("\n")));
const TITLES = S.SONGS.map((song) => song.title);
const EVERY_LYRIC_LINE: string[] = S.SONGS.flatMap((song) => song.sections.flatMap(([, lines]) => [...lines]));

describe("importing song documents of every kind, without the AI", () => {
  const cases: Array<[string, () => Promise<File>]> = [
    ["text with [Verse] labels", async () => new File([S.songsAsText("brackets")], "songs.txt")],
    ["text with Verse: labels", async () => new File([S.songsAsText("colon")], "songs.txt")],
    ["text without labels", async () => new File([S.songsAsText("plain")], "songs.txt")],
    ["text with chords and credits", async () => new File([S.songsAsText("brackets", { chords: true, credits: true })], "songs.txt")],
    ["Markdown", async () => new File([S.songsAsText("colon")], "songs.md")],
    ["Word, one line per paragraph", async () => new File([await S.songsAsDocx("plain")], "songs.docx")],
    ["Word with labels", async () => new File([await S.songsAsDocx("colon")], "songs.docx")],
    ["Word, a verse per paragraph", async () => new File([await S.songsAsDocxSoftBreaks()], "songs.docx")],
    ["OpenDocument text", async () => new File([await S.songsAsOdt()], "songs.odt")],
    ["a saved web page", async () => new File([S.songsAsHtml()], "songs.html")],
    ["a PDF with wrapped lines", async () => new File([await S.songsAsPdf()], "songs.pdf")],
    ["a numbered hymn book", async () => new File([S.hymnBookAsText()], "hymns.txt")],
  ];

  it.each(cases)("%s: every song, its title, and every lyric line whole", { timeout: 30000 }, async (_name, make) => {
    const songs = await importFile(await make());
    expect(songs.map((song) => song.metadata.title)).toEqual(TITLES);
    const lines = allLines(songs);
    // Each lyric line is on a slide exactly as written: not split, not glued to the next one.
    for (const line of EVERY_LYRIC_LINE) expect(lines).toContain(line);
    // Titles, chords and credits never reach a slide.
    expect(lines.filter((line) => TITLES.includes(line as never))).toEqual([]);
    expect(lines.filter((line) => /CCLI|©|Words and Music|^[A-G][#b]?m?(\s+[A-G][#b]?m?)+$/.test(line))).toEqual([]);
  });

  it("uses the labels when the file has them", async () => {
    const songs = await importFile(new File([S.songsAsText("brackets")], "songs.txt"));
    const firstOf = (song: Song) => song.slides.filter((s) => !s.isContinuation).map((s) => s.label);
    expect(firstOf(songs[0])).toEqual(["Verse 1", "Chorus", "Verse 2"]);
    expect(firstOf(songs[1])).toEqual(["Verse 1", "Chorus", "Bridge"]);
  });

  it("keeps the writer from the credits as the artist", async () => {
    const songs = await importFile(new File([S.songsAsText("brackets", { credits: true })], "songs.txt"));
    expect(songs[0].metadata.artist).toBe("Test Writer");
  });

  it("splits a PowerPoint deck into songs at its title slides and keeps each slide", async () => {
    const songs = await importFile(new File([await S.songsAsPptx([0, 1])], "service.pptx"));
    expect(songs.map((song) => song.metadata.title)).toEqual(["Morning Light", "River Of Grace"]);
    expect(songs[0].slides).toHaveLength(6);
    expect(songs[0].slides[0].content).toBe("Morning light is rising on the hills\nEvery heart is waking, every soul is still");
  });

  it("reads an RTF file", () => {
    const rtf = String.raw`{\rtf1\ansi{\fonttbl\f0\fswiss Helvetica;}\f0\pard Morning Light\par\par Verse 1:\par Morning light is rising on the hills\par Every heart is waking\'2c every soul is still\par}`;
    expect(extractRtfText(rtf)).toBe("Morning Light\n\nVerse 1:\nMorning light is rising on the hills\nEvery heart is waking, every soul is still");
  });

  it("explains how to import an old .doc file", async () => {
    await expect(extractTextFromFile(new File(["x"], "songs.doc"))).rejects.toThrow(/save it as Word \(\.docx\)/);
  });
});

describe("finding songs and sections from the layout", () => {
  it("calls a verse that comes back word for word the chorus", () => {
    const text = ["Morning Light", "", "Morning light is rising on the hills", "Every heart is waking", "", "We will sing, we will sing", "To the One who made the morning", "", "When the day is heavy on our backs", "You are walking with us", "", "We will sing, we will sing", "To the One who made the morning"].join("\n");
    const { songs } = parseGenericSongDrafts(text, "x.txt");
    expect(songs[0].sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
  });

  it("names a song with no title line after its file", () => {
    const { songs } = parseGenericSongDrafts("Verse 1:\nMorning light is rising\nEvery heart is waking", "Sunday Opener.txt");
    expect(songs.map((s) => s.title)).toEqual(["Sunday Opener"]);
  });

  it("does not take a short lyric line inside a song for a new song", () => {
    const text = ["Morning Light", "", "Verse 1:", "Morning light is rising on the hills", "", "Hallelujah", "", "Verse 2:", "When the day is heavy"].join("\n");
    expect(parseGenericSongDrafts(text, "x.txt").songs).toHaveLength(1);
  });
});
