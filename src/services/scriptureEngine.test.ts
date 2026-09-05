import { describe, expect, it, vi } from "vitest";
import { BOOK_CHAPTERS } from "../dock/dockTypes";
import { ScriptureDetectionEngine } from "./scriptureEngine";
import { parseNumberWord, parseScriptureIntent, parseScriptureReference, resolveScriptureSpeech, createScriptureSpeechState } from "./scriptureParser";

// Keep the regression suite offline; exercise the actual bundled Bible corpus.
vi.mock("../bible/bibleEmbeddings", () => ({
  hasEmbeddings: () => false,
  loadBibleEmbeddings: async () => false,
}));

describe("transcribed reference regressions", () => {
  it.each(Object.entries(BOOK_CHAPTERS))("preserves canonical references and the final chapter of %s", (book, maxChapter) => {
    expect(parseScriptureIntent(`${book} 1:1`)).toMatchObject({ type: "open", book, chapter: 1, verse: 1 });
    expect(parseScriptureIntent(`${book} chapter ${maxChapter}`)).toMatchObject({ type: "open", book, chapter: maxChapter, navigationOnly: true });
  });

  it.each([
    ["Psalm 23", "Psalms", 23, undefined],
    ["Romans chapter 11", "Romans", 11, undefined],
    ["Turn to John three sixteen.", "John", 3, 16],
    ["Romans chapter eight verse twenty eight.", "Romans", 8, 28],
    ["Second Corinthians chapter five verse twenty one.", "2 Corinthians", 5, 21],
    ["Psalm one hundred and nineteen verse one hundred and five", "Psalms", 119, 105],
    ["Song of Solomon two verse one", "Song of Solomon", 2, 1],
    ["Jude verse twenty four", "Jude", 1, 24],
    ["2 John verse six", "2 John", 1, 6],
    ["1 John 4:8.", "1 John", 4, 8],
  ])("resolves %s", (text, book, chapter, verse) => {
    expect(parseScriptureIntent(text)).toMatchObject({ type: "open", book, chapter, verse });
  });

  it.each(["John 3:16 to 18", "John chapter three verses sixteen through eighteen", "John 3 verses 16-18"])("preserves range %s", (text) => {
    expect(parseScriptureReference(text)).toMatchObject({ book: "John", chapter: 3, verse: 16, endVerse: 18 });
  });

  it("does not consume arbitrary number prefixes as verse commands", () => {
    expect(parseNumberWord("19 people came today")).toBeNull();
    expect(parseNumberWord("3:16")).toBeNull();
  });

  it("keeps a new book free of the previous chapter", () => {
    const state = createScriptureSpeechState();
    resolveScriptureSpeech("John 3:16", state, 1000);
    resolveScriptureSpeech("Genesis", state, 1500);
    expect(resolveScriptureSpeech("verse seven", state, 2000)?.shouldProject ?? false).toBe(false);
    expect(state.lastChapter).toBeNull();
  });

  it.each([
    "For God so loved the world that he gave his only begotten son",
    "And the eyes of them both were opened",
    "He has given us all things that pertain to life and godliness",
    "The race is not to the swift",
    "Let us look at what the Lord has done",
  ])("does not classify a quotation as a book reference: %s", (text) => {
    expect(parseScriptureReference(text)).toBeNull();
  });
});

describe("scripture engine conversations", () => {
  it.each([
    ["John 3:16", "Genesis chapter 4", "verse 7", "Genesis", 4, 7],
    ["John 3:16", "Genesis", "chapter 4 verse 7", "Genesis", 4, 7],
    ["John 3:16", "sorry chapter four", "next verse", "John", 4, 17],
    ["John 3:16", "next chapter", "sorry verse seven", "John", 4, 7],
  ])("uses current context after %s / %s / %s", async (first, second, third, book, chapter, verse) => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk(first, true);
    await engine.processChunk(second, true);
    const result = await engine.processChunk(third, true);
    expect(result.matches[0]?.candidate).toMatchObject({ book, chapter, verse });
  });

  it("supports a book, chapter command, and verse command in separate turns", async () => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk("John", true);
    await engine.processChunk("chapter three", true);
    expect((await engine.processChunk("verse sixteen", true)).matches[0]?.candidate.label).toBe("John 3:16");
  });

  it("uses the correction at the end of the same audio turn", async () => {
    const engine = new ScriptureDetectionEngine();
    const result = await engine.processChunk("John 3:16, sorry verse seventeen", true);
    expect(result.matches[0]?.candidate.label).toBe("John 3:17");
  });

  it("holds book and chapter context across separate finalized chunks", async () => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk("John", true);
    await engine.processChunk("three", true);
    const result = await engine.processChunk("sixteen.", true);
    expect(result.matches[0]?.candidate).toMatchObject({ book: "John", chapter: 3, verse: 16 });
  });

  it("does not apply an interim relative command twice", async () => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk("John 3:16", true);
    await engine.processChunk("next verse", false);
    const result = await engine.processChunk("next verse", true);
    expect(result.matches[0]?.candidate).toMatchObject({ book: "John", chapter: 3, verse: 17 });
  });

  it("does not project commentary that starts with a number", async () => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk("John 3:16", true);
    const result = await engine.processChunk("19 people came today", true);
    expect(result.matches).toEqual([]);
  });

  it("does not reuse the previous verse after a book-only transition", async () => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk("John 3:16", true);
    await engine.processChunk("Genesis", true);
    expect((await engine.processChunk("verse 7", true)).matches).toEqual([]);
  });

  it("finds the eyes quotation then navigates within that passage", async () => {
    const engine = new ScriptureDetectionEngine();
    await engine.processChunk("John 3:16", true);
    const matches = await engine.searchQuotesWithText("And the eyes of them both were opened.");
    expect(matches[0]?.candidate).toMatchObject({ book: "Genesis", chapter: 3, verse: 7 });
    expect((await engine.processChunk("next verse", true)).matches[0]?.candidate).toMatchObject({ book: "Genesis", chapter: 3, verse: 8 });
  });

  it.each([
    ["For God so loved the world that he gave his only begotten son", "John", 3, 16],
    ["the race is not to the swift", "Ecclesiastes", 9, 11],
    ["eyes both opened", "Genesis", 3, 7],
  ])("finds quoted words from the actual corpus: %s", async (text, book, chapter, verse) => {
    const engine = new ScriptureDetectionEngine();
    expect((await engine.searchQuotesWithText(text))[0]?.candidate).toMatchObject({ book, chapter, verse });
  });
});
