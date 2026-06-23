import { describe, it, expect } from "vitest";
import { parseScriptureReference } from "./scriptureParser";

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
