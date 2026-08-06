import { describe, it, expect } from "vitest";
import {
  createScriptureSpeechState,
  isLikelyScriptureReferenceAttempt,
  parseScriptureIntent,
  parseScriptureReference,
  resolveScriptureSpeech,
} from "./scriptureParser";

/**
 * Helper: convert ParsedReference to a display string for easy assertion.
 */
function fmt(ref: ReturnType<typeof parseScriptureReference>): string | null {
  if (!ref) return null;
  const { book, chapter, verse } = ref;
  if (!book) return null;
  if (chapter != null && verse != null) return `${book} ${chapter}:${verse}`;
  if (chapter != null) return `${book} ${chapter}`;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nigerian speech patterns — accent variants & ASR confusion
// ─────────────────────────────────────────────────────────────────────────────

describe("Nigerian speech patterns", () => {
  describe("Romans variants", () => {
    it("romance 8 28 → Romans 8:28", () => {
      expect(fmt(parseScriptureReference("romance 8 28"))).toBe("Romans 8:28");
    });
    it("roman 8 28 → Romans 8:28", () => {
      expect(fmt(parseScriptureReference("roman 8 28"))).toBe("Romans 8:28");
    });
    it("roomans 8 28 → Romans 8:28", () => {
      expect(fmt(parseScriptureReference("roomans 8 28"))).toBe("Romans 8:28");
    });
    it("rumans 8 28 → Romans 8:28", () => {
      expect(fmt(parseScriptureReference("rumans 8 28"))).toBe("Romans 8:28");
    });
    it("romens 8 28 → Romans 8:28", () => {
      expect(fmt(parseScriptureReference("romens 8 28"))).toBe("Romans 8:28");
    });
    it("rohmans 8 28 → Romans 8:28", () => {
      expect(fmt(parseScriptureReference("rohmans 8 28"))).toBe("Romans 8:28");
    });
    it("woman 8 28 → Romans 8:28", () => {
      expect(fmt(parseScriptureReference("woman 8 28"))).toBe("Romans 8:28");
    });
    it("womans 8 28 → Romans 8:28", () => {
      expect(fmt(parseScriptureReference("womans 8 28"))).toBe("Romans 8:28");
    });
  });

  describe("Luke variants (look/luck/loop)", () => {
    it("look 15 1 → Luke 15:1", () => {
      expect(fmt(parseScriptureReference("look 15 1"))).toBe("Luke 15:1");
    });
    it("luck 15 1 → Luke 15:1", () => {
      expect(fmt(parseScriptureReference("luck 15 1"))).toBe("Luke 15:1");
    });
    it("luc 15 1 → Luke 15:1", () => {
      expect(fmt(parseScriptureReference("luc 15 1"))).toBe("Luke 15:1");
    });
    it("loop 15 1 → Luke 15:1", () => {
      expect(fmt(parseScriptureReference("loop 15 1"))).toBe("Luke 15:1");
    });
    it("louk 15 1 → Luke 15:1", () => {
      expect(fmt(parseScriptureReference("louk 15 1"))).toBe("Luke 15:1");
    });
  });

  describe("John variants", () => {
    it("jon 3 16 → John 3:16", () => {
      expect(fmt(parseScriptureReference("jon 3 16"))).toBe("John 3:16");
    });
    it("jhon 3 16 → John 3:16", () => {
      expect(fmt(parseScriptureReference("jhon 3 16"))).toBe("John 3:16");
    });
    it("johnny 3 16 → John 3:16", () => {
      expect(fmt(parseScriptureReference("johnny 3 16"))).toBe("John 3:16");
    });
    it("joan 3 16 → John 3:16", () => {
      expect(fmt(parseScriptureReference("joan 3 16"))).toBe("John 3:16");
    });
    it("jone 3 16 → John 3:16", () => {
      expect(fmt(parseScriptureReference("jone 3 16"))).toBe("John 3:16");
    });
  });

  describe("Acts variants", () => {
    it("arts 2 38 → Acts 2:38", () => {
      expect(fmt(parseScriptureReference("arts 2 38"))).toBe("Acts 2:38");
    });
    it("axe 2 38 → Acts 2:38", () => {
      expect(fmt(parseScriptureReference("axe 2 38"))).toBe("Acts 2:38");
    });
    it("hacks 2 38 → Acts 2:38", () => {
      expect(fmt(parseScriptureReference("hacks 2 38"))).toBe("Acts 2:38");
    });
  });

  describe("Hebrews variants", () => {
    it("ebrews 11 1 → Hebrews 11:1", () => {
      expect(fmt(parseScriptureReference("ebrews 11 1"))).toBe("Hebrews 11:1");
    });
    it("heebrews 11 1 → Hebrews 11:1", () => {
      expect(fmt(parseScriptureReference("heebrews 11 1"))).toBe("Hebrews 11:1");
    });
    it("hebros 11 1 → Hebrews 11:1", () => {
      expect(fmt(parseScriptureReference("hebros 11 1"))).toBe("Hebrews 11:1");
    });
    it("hebrows 11 1 → Hebrews 11:1", () => {
      expect(fmt(parseScriptureReference("hebrows 11 1"))).toBe("Hebrews 11:1");
    });
  });

  describe("Ecclesiastes variants", () => {
    it("ecclesiasties 12 1 → Ecclesiastes 12:1", () => {
      expect(fmt(parseScriptureReference("ecclesiasties 12 1"))).toBe("Ecclesiastes 12:1");
    });
    it("ecclesiates 12 1 → Ecclesiastes 12:1", () => {
      expect(fmt(parseScriptureReference("ecclesiates 12 1"))).toBe("Ecclesiastes 12:1");
    });
    it("eclesiastes 12 1 → Ecclesiastes 12:1", () => {
      expect(fmt(parseScriptureReference("eclesiastes 12 1"))).toBe("Ecclesiastes 12:1");
    });
    it("eklesiastes 12 1 → Ecclesiastes 12:1", () => {
      expect(fmt(parseScriptureReference("eklesiastes 12 1"))).toBe("Ecclesiastes 12:1");
    });
  });

  describe("Corinthians accent variants", () => {
    it("corintians 13 4 → Corinthians 13:4 (fuzzy match, no number prefix)", () => {
      expect(fmt(parseScriptureReference("corintians 13 4"))).toBe("Corinthians 13:4");
    });
    it("currentians 13 4 → null (too far for fuzzy match, distance 4 > threshold 3)", () => {
      expect(fmt(parseScriptureReference("currentians 13 4"))).toBeNull();
    });
    it("korinthians 13 4 → Corinthians 13:4 (fuzzy match)", () => {
      expect(fmt(parseScriptureReference("korinthians 13 4"))).toBe("Corinthians 13:4");
    });
  });

  describe("Thessalonians accent variants", () => {
    it("thesalonians 5 17 → Thessalonians 5:17 (fuzzy match)", () => {
      expect(fmt(parseScriptureReference("thesalonians 5 17"))).toBe("Thessalonians 5:17");
    });
    it("tesalonians 5 17 → Thessalonians 5:17 (fuzzy match)", () => {
      expect(fmt(parseScriptureReference("tesalonians 5 17"))).toBe("Thessalonians 5:17");
    });
    it("theselonians 5 17 → Thessalonians 5:17 (fuzzy match)", () => {
      expect(fmt(parseScriptureReference("theselonians 5 17"))).toBe("Thessalonians 5:17");
    });
    it("teselonians 5 17 → Thessalonians 5:17 (fuzzy match)", () => {
      expect(fmt(parseScriptureReference("teselonians 5 17"))).toBe("Thessalonians 5:17");
    });
  });

  describe("Philemon variants", () => {
    it("filemon 1 16 → Philemon 1:16", () => {
      expect(fmt(parseScriptureReference("filemon 1 16"))).toBe("Philemon 1:16");
    });
    it("filimon 1 16 → Philemon 1:16", () => {
      expect(fmt(parseScriptureReference("filimon 1 16"))).toBe("Philemon 1:16");
    });
    it("phileman 1 16 → Philemon 1:16", () => {
      expect(fmt(parseScriptureReference("phileman 1 16"))).toBe("Philemon 1:16");
    });
    it("fileman 1 16 → Philemon 1:16", () => {
      expect(fmt(parseScriptureReference("fileman 1 16"))).toBe("Philemon 1:16");
    });
  });

  describe("Philippians variants", () => {
    it("filippians 4 13 → Philippians 4:13", () => {
      expect(fmt(parseScriptureReference("filippians 4 13"))).toBe("Philippians 4:13");
    });
    it("phillipians 4 13 → Philippians 4:13", () => {
      expect(fmt(parseScriptureReference("phillipians 4 13"))).toBe("Philippians 4:13");
    });
    it("philipians 4 13 → Philippians 4:13", () => {
      expect(fmt(parseScriptureReference("philipians 4 13"))).toBe("Philippians 4:13");
    });
    it("fillipians 4 13 → Philippians 4:13", () => {
      expect(fmt(parseScriptureReference("fillipians 4 13"))).toBe("Philippians 4:13");
    });
  });

  describe("Ephesians variants", () => {
    it("efesians 2 8 → Ephesians 2:8", () => {
      expect(fmt(parseScriptureReference("efesians 2 8"))).toBe("Ephesians 2:8");
    });
    it("effesians 2 8 → Ephesians 2:8", () => {
      expect(fmt(parseScriptureReference("effesians 2 8"))).toBe("Ephesians 2:8");
    });
    it("efezians 2 8 → Ephesians 2:8", () => {
      expect(fmt(parseScriptureReference("efezians 2 8"))).toBe("Ephesians 2:8");
    });
  });

  describe("Revelation variants (plurals)", () => {
    it("revelations 1 1 → Revelation 1:1", () => {
      expect(fmt(parseScriptureReference("revelations 1 1"))).toBe("Revelation 1:1");
    });
    it("revalation 1 1 → Revelation 1:1", () => {
      expect(fmt(parseScriptureReference("revalation 1 1"))).toBe("Revelation 1:1");
    });
    it("revelaion 1 1 → Revelation 1:1", () => {
      expect(fmt(parseScriptureReference("revelaion 1 1"))).toBe("Revelation 1:1");
    });
  });

  describe("James variants", () => {
    it("jims 1 2 → James 1:2", () => {
      expect(fmt(parseScriptureReference("jims 1 2"))).toBe("James 1:2");
    });
    it("jams 1 2 → James 1:2", () => {
      expect(fmt(parseScriptureReference("jams 1 2"))).toBe("James 1:2");
    });
    it("jaymes 1 2 → James 1:2", () => {
      expect(fmt(parseScriptureReference("jaymes 1 2"))).toBe("James 1:2");
    });
  });

  describe("Jude variants", () => {
    it("judy 1 1 → Jude 1:1", () => {
      expect(fmt(parseScriptureReference("judy 1 1"))).toBe("Jude 1:1");
    });
    it("jood 1 1 → Jude 1:1", () => {
      expect(fmt(parseScriptureReference("jood 1 1"))).toBe("Jude 1:1");
    });
    it("joode 1 1 → Jude 1:1", () => {
      expect(fmt(parseScriptureReference("joode 1 1"))).toBe("Jude 1:1");
    });
  });

  describe("Song of Solomon variants", () => {
    it("songs of solomon 8 4 → Song of Solomon 8:4", () => {
      expect(fmt(parseScriptureReference("songs of solomon 8 4"))).toBe("Song of Solomon 8:4");
    });
    it("song of solomn 8 4 → Song of Solomon 8:4", () => {
      expect(fmt(parseScriptureReference("song of solomn 8 4"))).toBe("Song of Solomon 8:4");
    });
    it("solomon 8 4 → Song of Solomon 8:4", () => {
      expect(fmt(parseScriptureReference("solomon 8 4"))).toBe("Song of Solomon 8:4");
    });
  });

  describe("Psalms variants", () => {
    it("salms 23 1 → Psalms 23:1", () => {
      expect(fmt(parseScriptureReference("salms 23 1"))).toBe("Psalms 23:1");
    });
    it("salm 23 1 → Psalms 23:1", () => {
      expect(fmt(parseScriptureReference("salm 23 1"))).toBe("Psalms 23:1");
    });
    it("psams 23 1 → Psalms 23:1", () => {
      expect(fmt(parseScriptureReference("psams 23 1"))).toBe("Psalms 23:1");
    });
  });

  describe("Proverbs variants", () => {
    it("proberbs 3 5 → Proverbs 3:5", () => {
      expect(fmt(parseScriptureReference("proberbs 3 5"))).toBe("Proverbs 3:5");
    });
    it("probrs 3 5 → Proverbs 3:5", () => {
      expect(fmt(parseScriptureReference("probrs 3 5"))).toBe("Proverbs 3:5");
    });
    it("prover 3 5 → Proverbs 3:5", () => {
      expect(fmt(parseScriptureReference("prover 3 5"))).toBe("Proverbs 3:5");
    });
  });
});

describe("Speech context resolver", () => {
  it("keeps book-only and chapter-only references without guessing verse 1", () => {
    const state = createScriptureSpeechState();

    const bookOnly = resolveScriptureSpeech("John", state, 1000);
    expect(bookOnly?.kind).toBe("book_reference");
    expect(bookOnly?.book).toBe("John");
    expect(bookOnly?.chapter).toBeNull();
    expect(bookOnly?.verse).toBeNull();
    expect(bookOnly?.shouldProject).toBe(false);

    const chapterOnly = resolveScriptureSpeech("chapter 3", state, 1500);
    expect(chapterOnly?.kind).toBe("chapter_reference");
    expect(chapterOnly?.book).toBe("John");
    expect(chapterOnly?.chapter).toBe(3);
    expect(chapterOnly?.verse).toBeNull();
    expect(chapterOnly?.shouldProject).toBe(false);
  });

  it("resolves verse continuations and correction numbers from context", () => {
    const state = createScriptureSpeechState();

    const initial = resolveScriptureSpeech("John 3:14", state, 1000);
    expect(initial?.book).toBe("John");
    expect(initial?.chapter).toBe(3);
    expect(initial?.verse).toBe(14);
    expect(initial?.shouldProject).toBe(true);

    const continuation = resolveScriptureSpeech("verse 16", state, 1500);
    expect(continuation?.book).toBe("John");
    expect(continuation?.chapter).toBe(3);
    expect(continuation?.verse).toBe(16);

    const correction = resolveScriptureSpeech("sorry 17", state, 2000);
    expect(correction?.book).toBe("John");
    expect(correction?.chapter).toBe(3);
    expect(correction?.verse).toBe(17);
  });

  it("preserves verse when a chapter correction is spoken", () => {
    const state = createScriptureSpeechState();
    resolveScriptureSpeech("John 2:14", state, 1000);

    const correction = resolveScriptureSpeech("sorry chapter 3", state, 1500);
    expect(correction?.book).toBe("John");
    expect(correction?.chapter).toBe(3);
    expect(correction?.verse).toBe(14);
  });

  it("treats a bare number as the next verse when chapter context exists", () => {
    const state = createScriptureSpeechState();
    resolveScriptureSpeech("Genesis 1:2", state, 1000);

    const continuation = resolveScriptureSpeech("3", state, 1500);
    expect(continuation?.book).toBe("Genesis");
    expect(continuation?.chapter).toBe(1);
    expect(continuation?.verse).toBe(3);
    expect(continuation?.kind).toBe("verse_reference");
  });

  it("supports misspelled numbered books quickly", () => {
    expect(parseScriptureReference("firstpetter 5 7")).toMatchObject({
      book: "1 Peter",
      chapter: 5,
      verse: 7,
    });
    expect(parseScriptureReference("second timoty 1 7")).toMatchObject({
      book: "2 Timothy",
      chapter: 1,
      verse: 7,
    });
    expect(parseScriptureReference("first cors 13 4")).toMatchObject({
      book: "1 Corinthians",
      chapter: 13,
      verse: 4,
    });
  });

  it("keeps ordinals attached to every numbered book with fuzzy suffixes", () => {
    const cases = [
      ["1st samual 17 45", "1 Samuel 17:45"],
      ["second samual 22 1", "2 Samuel 22:1"],
      ["first kingz 3 9", "1 Kings 3:9"],
      ["2nd kingz 6 17", "2 Kings 6:17"],
      ["first chronicals 7 14", "1 Chronicles 7:14"],
      ["second chronicals 7 14", "2 Chronicles 7:14"],
      ["1st coritihans 13 4", "1 Corinthians 13:4"],
      ["first coritihans 13 4", "1 Corinthians 13:4"],
      ["second coritihans 5 17", "2 Corinthians 5:17"],
      ["first thesalonians 5 17", "1 Thessalonians 5:17"],
      ["second thesalonians 3 3", "2 Thessalonians 3:3"],
      ["first timoty 4 12", "1 Timothy 4:12"],
      ["second timoty 1 7", "2 Timothy 1:7"],
      ["first petter 5 7", "1 Peter 5:7"],
      ["second petter 3 9", "2 Peter 3:9"],
      ["first jhon 4 8", "1 John 4:8"],
      ["second jhon 1 6", "2 John 1:6"],
      ["third jhon 1 2", "3 John 1:2"],
    ] as const;

    for (const [input, expected] of cases) {
      expect(fmt(parseScriptureReference(input))).toBe(expected);
    }
  });
});

describe("Speech command matrix", () => {
  it("recognizes verse navigation commands", () => {
    expect(parseScriptureIntent("next verse")).toMatchObject({ type: "next-verse", count: 1 });
    expect(parseScriptureIntent("go to next verse")).toMatchObject({ type: "next-verse", count: 1 });
    expect(parseScriptureIntent("next two verses")).toMatchObject({ type: "next-verse", count: 2 });
    expect(parseScriptureIntent("previous verse")).toMatchObject({ type: "prev-verse", count: 1 });
    expect(parseScriptureIntent("go back two verses")).toMatchObject({ type: "prev-verse", count: 2 });
  });

  it("recognizes direct chapter and verse commands", () => {
    expect(parseScriptureIntent("verse 3")).toMatchObject({ type: "set-verse", verse: 3 });
    expect(parseScriptureIntent("go to verse 5")).toMatchObject({ type: "set-verse", verse: 5 });
    expect(parseScriptureIntent("chapter 4")).toMatchObject({ type: "set-chapter", chapter: 4 });
    expect(parseScriptureIntent("go to chapter 7")).toMatchObject({ type: "set-chapter", chapter: 7 });
  });

  it("recognizes open references without inventing verse 1", () => {
    expect(parseScriptureIntent("John 3")).toMatchObject({
      type: "open",
      book: "John",
      chapter: 3,
      navigationOnly: true,
    });
    expect(parseScriptureIntent("Romans 8:28")).toMatchObject({
      type: "open",
      book: "Romans",
      chapter: 8,
      verse: 28,
    });
  });
});

describe("Speech state matrix", () => {
  it("handles common sermon continuation and correction flows", () => {
    const state = createScriptureSpeechState();

    const cases = [
      {
        input: "Genesis 1",
        time: 1000,
        expected: { kind: "chapter_reference", book: "Genesis", chapter: 1, verse: null, shouldProject: false },
      },
      {
        input: "verse 2",
        time: 1500,
        expected: { kind: "verse_reference", book: "Genesis", chapter: 1, verse: 2, shouldProject: true },
      },
      {
        input: "next verse",
        time: 2000,
        expected: null,
      },
      {
        input: "Genesis 1:2",
        time: 2500,
        expected: { kind: "verse_reference", book: "Genesis", chapter: 1, verse: 2, shouldProject: true },
      },
      {
        input: "3",
        time: 3000,
        expected: { kind: "verse_reference", book: "Genesis", chapter: 1, verse: 3, shouldProject: true },
      },
      {
        input: "sorry 4",
        time: 3500,
        expected: { kind: "verse_reference", book: "Genesis", chapter: 1, verse: 4, shouldProject: true },
      },
      {
        input: "make that 5",
        time: 4000,
        expected: { kind: "verse_reference", book: "Genesis", chapter: 1, verse: 5, shouldProject: true },
      },
      {
        input: "John 2:14",
        time: 4500,
        expected: { kind: "verse_reference", book: "John", chapter: 2, verse: 14, shouldProject: true },
      },
      {
        input: "sorry chapter 3",
        time: 5000,
        expected: { kind: "verse_reference", book: "John", chapter: 3, verse: 14, shouldProject: true },
      },
      {
        input: "change that to Luke 5:5",
        time: 5500,
        expected: { kind: "verse_reference", book: "Luke", chapter: 5, verse: 5, shouldProject: true },
      },
      {
        input: "John 3:16-18",
        time: 6000,
        expected: { kind: "range_reference", book: "John", chapter: 3, verse: 16, endVerse: 18, shouldProject: true },
      },
    ] as const;

    for (const testCase of cases) {
      const result = resolveScriptureSpeech(testCase.input, state, testCase.time);
      if (testCase.expected === null) {
        expect(result).toBeNull();
        continue;
      }

      expect(result).not.toBeNull();
      expect(result).toMatchObject(testCase.expected);
    }
  });

  it("does not treat stale bare numbers as verse continuations", () => {
    const state = createScriptureSpeechState();
    resolveScriptureSpeech("Genesis 1:2", state, 1000);

    expect(resolveScriptureSpeech("3", state, 10_500)).toBeNull();
  });

  it("rejects malformed book-number-chapter speech without updating context", () => {
    const state = createScriptureSpeechState();
    const chapter = resolveScriptureSpeech("Ecclesiastes chapter 5", state, 1000);
    expect(chapter).toMatchObject({
      kind: "chapter_reference",
      book: "Ecclesiastes",
      chapter: 5,
      verse: null,
      shouldProject: false,
    });

    expect(parseScriptureReference("James 7, chapter 5")).toBeNull();
    expect(parseScriptureIntent("James 7, chapter 5")).toBeNull();
    expect(resolveScriptureSpeech("James 7, chapter 5", state, 1500)).toBeNull();
    expect(isLikelyScriptureReferenceAttempt("James 7, chapter 5")).toBe(true);

    const continuation = resolveScriptureSpeech("Verse 2", state, 2000);
    expect(continuation).toMatchObject({
      kind: "verse_reference",
      book: "Ecclesiastes",
      chapter: 5,
      verse: 2,
      shouldProject: true,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nigerian numbered book patterns — "won/too/tu/tree/free" variants
// ─────────────────────────────────────────────────────────────────────────────

describe("Nigerian numbered book patterns", () => {
  describe("Won / One / First → 1", () => {
    it("won king 3 9 → 1 Kings 3:9", () => {
      expect(fmt(parseScriptureReference("won king 3 9"))).toBe("1 Kings 3:9");
    });
    it("won samuel 17 45 → 1 Samuel 17:45", () => {
      expect(fmt(parseScriptureReference("won samuel 17 45"))).toBe("1 Samuel 17:45");
    });
    it("won corinthian 13 4 → 1 Corinthians 13:4", () => {
      expect(fmt(parseScriptureReference("won corinthian 13 4"))).toBe("1 Corinthians 13:4");
    });
    it("won thessalonian 5 17 → 1 Thessalonians 5:17", () => {
      expect(fmt(parseScriptureReference("won thessalonian 5 17"))).toBe("1 Thessalonians 5:17");
    });
    it("won timothy 4 12 → 1 Timothy 4:12", () => {
      expect(fmt(parseScriptureReference("won timothy 4 12"))).toBe("1 Timothy 4:12");
    });
    it("won peter 5 7 → 1 Peter 5:7", () => {
      expect(fmt(parseScriptureReference("won peter 5 7"))).toBe("1 Peter 5:7");
    });
    it("won john 4 8 → 1 John 4:8", () => {
      expect(fmt(parseScriptureReference("won john 4 8"))).toBe("1 John 4:8");
    });
  });

  describe("To / Too / Tu / Two → 2", () => {
    it("to king 6 17 → 2 Kings 6:17", () => {
      expect(fmt(parseScriptureReference("to king 6 17"))).toBe("2 Kings 6:17");
    });
    it("too king 6 17 → 2 Kings 6:17", () => {
      expect(fmt(parseScriptureReference("too king 6 17"))).toBe("2 Kings 6:17");
    });
    it("tu king 6 17 → 2 Kings 6:17", () => {
      expect(fmt(parseScriptureReference("tu king 6 17"))).toBe("2 Kings 6:17");
    });
    it("two king 6 17 → 2 Kings 6:17", () => {
      expect(fmt(parseScriptureReference("two king 6 17"))).toBe("2 Kings 6:17");
    });
    it("to samuel 22 1 → 2 Samuel 22:1", () => {
      expect(fmt(parseScriptureReference("to samuel 22 1"))).toBe("2 Samuel 22:1");
    });
    it("too samuel 22 1 → 2 Samuel 22:1", () => {
      expect(fmt(parseScriptureReference("too samuel 22 1"))).toBe("2 Samuel 22:1");
    });
    it("tu corinthian 5 17 → 2 Corinthians 5:17", () => {
      expect(fmt(parseScriptureReference("tu corinthian 5 17"))).toBe("2 Corinthians 5:17");
    });
    it("to thessalonian 3 3 → 2 Thessalonians 3:3", () => {
      expect(fmt(parseScriptureReference("to thessalonian 3 3"))).toBe("2 Thessalonians 3:3");
    });
    it("too timothy 1 7 → 2 Timothy 1:7", () => {
      expect(fmt(parseScriptureReference("too timothy 1 7"))).toBe("2 Timothy 1:7");
    });
    it("tu peter 3 9 → 2 Peter 3:9", () => {
      expect(fmt(parseScriptureReference("tu peter 3 9"))).toBe("2 Peter 3:9");
    });
    it("two john 1 6 → 2 John 1:6", () => {
      expect(fmt(parseScriptureReference("two john 1 6"))).toBe("2 John 1:6");
    });
  });

  describe("Tree / Free / Three → 3", () => {
    it("tree john 1 2 → 3 John 1:2", () => {
      expect(fmt(parseScriptureReference("tree john 1 2"))).toBe("3 John 1:2");
    });
    it("free john 1 2 → 3 John 1:2", () => {
      expect(fmt(parseScriptureReference("free john 1 2"))).toBe("3 John 1:2");
    });
    it("three john 1 2 → 3 John 1:2", () => {
      expect(fmt(parseScriptureReference("three john 1 2"))).toBe("3 John 1:2");
    });
  });

  describe("Colon notation after numbered books (2 Kings 2:1 bug)", () => {
    it("2 kings 2:1 → 2 Kings 2:1", () => {
      expect(fmt(parseScriptureReference("2 kings 2:1"))).toBe("2 Kings 2:1");
    });
    it("1 samuel 17:45 → 1 Samuel 17:45", () => {
      expect(fmt(parseScriptureReference("1 samuel 17:45"))).toBe("1 Samuel 17:45");
    });
    it("2 chronicles 7:14 → 2 Chronicles 7:14", () => {
      expect(fmt(parseScriptureReference("2 chronicles 7:14"))).toBe("2 Chronicles 7:14");
    });
    it("3 john 1:2 → 3 John 1:2", () => {
      expect(fmt(parseScriptureReference("3 john 1:2"))).toBe("3 John 1:2");
    });
    it("second kings 2:1 → 2 Kings 2:1", () => {
      expect(fmt(parseScriptureReference("second kings 2:1"))).toBe("2 Kings 2:1");
    });
    it("2 kings 2:1-3 → 2 Kings 2:1", () => {
      const ref = parseScriptureReference("2 kings 2:1-3");
      expect(ref?.book).toBe("2 Kings");
      expect(ref?.chapter).toBe(2);
      expect(ref?.verse).toBe(1);
      expect(ref?.endVerse).toBe(3);
    });
  });

  describe("Full phrase patterns (Nigerian pastor speech)", () => {
    it("open won king chapter 17 → 1 Kings 17", () => {
      expect(fmt(parseScriptureReference("open won king chapter 17"))).toBe("1 Kings 17");
    });
    it("open to kings chapter 4 → 2 Kings 4", () => {
      expect(fmt(parseScriptureReference("open to kings chapter 4"))).toBe("2 Kings 4");
    });
    it("open too kings chapter 4 → 2 Kings 4", () => {
      expect(fmt(parseScriptureReference("open too kings chapter 4"))).toBe("2 Kings 4");
    });
    it("open tree john chapter 1 → 3 John 1", () => {
      expect(fmt(parseScriptureReference("open tree john chapter 1"))).toBe("3 John 1");
    });
    it("open free john chapter 1 → 3 John 1", () => {
      expect(fmt(parseScriptureReference("open free john chapter 1"))).toBe("3 John 1");
    });
    it("won corinthian chapter 13 → 1 Corinthians 13", () => {
      expect(fmt(parseScriptureReference("won corinthian chapter 13"))).toBe("1 Corinthians 13");
    });
    it("tu corinthian chapter 5 → 2 Corinthians 5", () => {
      expect(fmt(parseScriptureReference("tu corinthian chapter 5"))).toBe("2 Corinthians 5");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Standard book references (via cleanTranscript + alias lookup)
// ─────────────────────────────────────────────────────────────────────────────

describe("Standard references through parser", () => {
  it("john 3 16 → John 3:16", () => {
    expect(fmt(parseScriptureReference("john 3 16"))).toBe("John 3:16");
  });
  it("genesis 1 1 → Genesis 1:1", () => {
    expect(fmt(parseScriptureReference("genesis 1 1"))).toBe("Genesis 1:1");
  });
  it("open matthew chapter 5 → Matthew 5", () => {
    expect(fmt(parseScriptureReference("open matthew chapter 5"))).toBe("Matthew 5");
  });
  it("read psalm 23 1 → Psalms 23:1", () => {
    expect(fmt(parseScriptureReference("read psalm 23 1"))).toBe("Psalms 23:1");
  });
  it("turn to romans 8 28 → Romans 8:28", () => {
    expect(fmt(parseScriptureReference("turn to romans 8 28"))).toBe("Romans 8:28");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invalid inputs return null
// ─────────────────────────────────────────────────────────────────────────────

describe("Returns null for invalid input", () => {
  it("empty string → null", () => {
    expect(parseScriptureReference("")).toBeNull();
  });
  it("random text → null", () => {
    expect(parseScriptureReference("hello world")).toBeNull();
  });
});
