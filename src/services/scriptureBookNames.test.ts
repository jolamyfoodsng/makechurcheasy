import { describe, expect, it, vi } from "vitest";
import { normalizeScriptureReference } from "../bible/scriptureReranker";
import { ScriptureDetectionEngine } from "./scriptureEngine";
import { createScriptureSpeechState, parseScriptureReference, resolveScriptureSpeech } from "./scriptureParser";

vi.mock("../bible/bibleEmbeddings", () => ({
  hasEmbeddings: () => false,
  loadBibleEmbeddings: async () => false,
}));

const numberedBooks = [
  ["Samuel", ["Samuel", "Sam", "Sa", "Sm"]],
  ["Kings", ["Kings", "King", "Kgs", "Ki", "K"]],
  ["Chronicles", ["Chronicles", "Chronicle", "Chron", "Chr", "Ch"]],
  ["Corinthians", ["Corinthians", "Corinthian", "Cor", "Co"]],
  ["Thessalonians", ["Thessalonians", "Thessalonian", "Thess", "Thes", "Th"]],
  ["Timothy", ["Timothy", "Tim", "Ti", "Tm"]],
  ["Peter", ["Peter", "Pet", "Pe", "Pt"]],
  ["John", ["John", "Jn", "Jo", "Joh"]],
] as const;

const ordinalForms = [
  ["1", "first", "1st", "one", "I"],
  ["2", "second", "2nd", "two", "II"],
  ["3", "third", "3rd", "three", "III"],
];
const books = numberedBooks.flatMap(([base, aliases]) =>
  (base === "John" ? [1, 2, 3] : [1, 2]).map((number) => ({
    book: `${number} ${base}`, number, aliases,
  })),
);

describe("numbered Bible book spellings", () => {
  it.each(books)("recognizes full names and abbreviations for $book", ({ book, number, aliases }) => {
    for (const prefix of ordinalForms[number - 1]) {
      for (const alias of aliases) {
        for (const separator of [" ", "", ". ", "-", ", "]) {
          // The established abbreviation Isa means Isaiah, not compact I Sa.
          if (`${prefix}${separator}${alias}`.toLowerCase() === "isa") continue;
          const transcript = `${prefix}${separator}${alias}. 1:1`;
          expect(parseScriptureReference(transcript), transcript).toMatchObject({ book, chapter: 1, verse: 1 });
          expect(normalizeScriptureReference(transcript), transcript).toBe(`${book} 1:1`);
        }
      }
    }
  });

  it.each([
    ["second 2nd cor 5:17", "2 Corinthians", 5, 17],
    ["first, 1st Cor. chapter thirteen verse four", "1 Corinthians", 13, 4],
    ["2 nd Kings 6:17", "2 Kings", 6, 17],
    ["1 st Cor 13:4", "1 Corinthians", 13, 4],
    ["3 rd Jn 1:2", "3 John", 1, 2],
    ["I-I Kings 6:17", "2 Kings", 6, 17],
    ["open firstcor chapter thirteen verse four", "1 Corinthians", 13, 4],
    ["1Cor13:4", "1 Corinthians", 13, 4],
    ["turn to John 3:16", "John", 3, 16],
  ])("handles the transcript %s", (transcript, book, chapter, verse) => {
    expect(parseScriptureReference(transcript)).toMatchObject({ book, chapter, verse });
    expect(normalizeScriptureReference(transcript)).toBe(`${book} ${chapter}:${verse}`);
  });
});

describe("Bible abbreviations", () => {
  it.each([
    ["Gen", "Genesis"], ["Ex", "Exodus"], ["Lev", "Leviticus"], ["Num", "Numbers"],
    ["Deut", "Deuteronomy"], ["Josh", "Joshua"], ["Judg", "Judges"], ["Ru", "Ruth"],
    ["Ezr", "Ezra"], ["Neh", "Nehemiah"], ["Esth", "Esther"], ["Jb", "Job"],
    ["Ps", "Psalms"], ["Prov", "Proverbs"], ["Eccl", "Ecclesiastes"], ["Song", "Song of Solomon"],
    ["Isa", "Isaiah"], ["Jer", "Jeremiah"], ["Lam", "Lamentations"], ["Ezek", "Ezekiel"],
    ["Dan", "Daniel"], ["Hos", "Hosea"], ["Jl", "Joel"], ["Am", "Amos"], ["Obad", "Obadiah"],
    ["Jonah", "Jonah"], ["Mic", "Micah"], ["Nah", "Nahum"], ["Hab", "Habakkuk"],
    ["Zeph", "Zephaniah"], ["Hag", "Haggai"], ["Zech", "Zechariah"], ["Mal", "Malachi"],
    ["Matt", "Matthew"], ["Mk", "Mark"], ["Lk", "Luke"], ["Jn", "John"], ["Ac", "Acts"],
    ["Rom", "Romans"], ["Gal", "Galatians"], ["Eph", "Ephesians"], ["Phil", "Philippians"],
    ["Col", "Colossians"], ["Tit", "Titus"], ["Phlm", "Philemon"], ["Heb", "Hebrews"],
    ["Jas", "James"], ["Jude", "Jude"], ["Rev", "Revelation"],
  ])("recognizes %s as %s", (alias, book) => {
    expect(parseScriptureReference(`${alias}. 1:1`)).toMatchObject({ book, chapter: 1, verse: 1 });
    expect(normalizeScriptureReference(`${alias}. 1:1`)).toBe(`${book} 1:1`);
  });
});

describe("numbered books split across transcription turns", () => {
  it.each(books)("retains the ordinal before $book", async ({ book, number, aliases }) => {
    for (const prefix of ordinalForms[number - 1].slice(1, 3)) {
      const engine = new ScriptureDetectionEngine();
      await engine.processChunk("Genesis 2:3", true);
      const ordinal = await engine.processChunk(`Open to ${prefix}.`, true);
      expect(ordinal.matches, prefix).toEqual([]);
      expect(ordinal.handledReference, prefix).toBe(true);
      expect((await engine.processChunk(aliases[2], true)).matches).toEqual([]);
      expect((await engine.processChunk("chapter one", true)).matches).toEqual([]);
      const result = await engine.processChunk("verse one", true);
      expect(result.matches[0]?.candidate, `${prefix} / ${aliases[2]}`).toMatchObject({ book, chapter: 1, verse: 1 });
    }
  });

  it("retains a split ordinal when the next chunk includes chapter and verse", async () => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk("second", true);
    expect((await engine.processChunk("Cor five seventeen", true)).matches[0]?.candidate.label).toBe("2 Corinthians 5:17");
  });

  it("does not attach an expired ordinal to a later book", () => {
    const state = createScriptureSpeechState();
    resolveScriptureSpeech("first", state, 1000);
    expect(resolveScriptureSpeech("John 3:16", state, 20_000)?.book).toBe("John");
  });

  it("does not remember an ordinal from a discarded interim transcription", async () => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk("first", false);
    expect((await engine.processChunk("John 3:16", true)).matches[0]?.candidate.label).toBe("John 3:16");
  });

  it("keeps a finalized ordinal through interim revisions of the book", async () => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk("second", true);
    await engine.processChunk("Cor", false);
    await engine.processChunk("Cor five", false);
    expect((await engine.processChunk("Cor five seventeen", true)).matches[0]?.candidate.label).toBe("2 Corinthians 5:17");
  });

  it("discards an ordinal after unrelated intervening speech", () => {
    const state = createScriptureSpeechState();
    resolveScriptureSpeech("second", state, 1000);
    resolveScriptureSpeech("we are going to pray", state, 1500);
    expect(resolveScriptureSpeech("John 3:16", state, 2000)?.book).toBe("John");
  });
});
