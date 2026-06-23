import { describe, it, expect } from "vitest";
import { normalizeScriptureReference } from "./scriptureReranker";

// ─────────────────────────────────────────────────────────────────────────────
// Samuel
// ─────────────────────────────────────────────────────────────────────────────

describe("Samuel", () => {
  describe("1 Samuel", () => {
    it("1 Samuel 17:45", () => {
      expect(normalizeScriptureReference("1 Samuel 17:45")).toBe("1 Samuel 17:45");
    });
    it("1 samuel 17:45", () => {
      expect(normalizeScriptureReference("1 samuel 17:45")).toBe("1 Samuel 17:45");
    });
    it("I Samuel 17:45", () => {
      expect(normalizeScriptureReference("I Samuel 17:45")).toBe("1 Samuel 17:45");
    });
    it("1 samuel 17 45", () => {
      expect(normalizeScriptureReference("1 samuel 17 45")).toBe("1 Samuel 17:45");
    });
    it("1 Samuel 17", () => {
      expect(normalizeScriptureReference("1 Samuel 17")).toBe("1 Samuel 17");
    });
    it("1st Samuel 17:45", () => {
      expect(normalizeScriptureReference("1st Samuel 17:45")).toBe("1 Samuel 17:45");
    });
    it("first Samuel 17:45", () => {
      expect(normalizeScriptureReference("first Samuel 17:45")).toBe("1 Samuel 17:45");
    });
    it("one Samuel 17:45", () => {
      expect(normalizeScriptureReference("one Samuel 17:45")).toBe("1 Samuel 17:45");
    });
  });

  describe("2 Samuel", () => {
    it("2 Samuel 11:1", () => {
      expect(normalizeScriptureReference("2 Samuel 11:1")).toBe("2 Samuel 11:1");
    });
    it("2 samuel 11:1", () => {
      expect(normalizeScriptureReference("2 samuel 11:1")).toBe("2 Samuel 11:1");
    });
    it("II Samuel 11:1", () => {
      expect(normalizeScriptureReference("II Samuel 11:1")).toBe("2 Samuel 11:1");
    });
    it("2 samuel 11 1", () => {
      expect(normalizeScriptureReference("2 samuel 11 1")).toBe("2 Samuel 11:1");
    });
    it("2nd Samuel 11:1", () => {
      expect(normalizeScriptureReference("2nd Samuel 11:1")).toBe("2 Samuel 11:1");
    });
    it("second Samuel 11:1", () => {
      expect(normalizeScriptureReference("second Samuel 11:1")).toBe("2 Samuel 11:1");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Kings
// ─────────────────────────────────────────────────────────────────────────────

describe("Kings", () => {
  describe("1 Kings", () => {
    it("1 Kings 19:11", () => {
      expect(normalizeScriptureReference("1 Kings 19:11")).toBe("1 Kings 19:11");
    });
    it("1 kings 19:11", () => {
      expect(normalizeScriptureReference("1 kings 19:11")).toBe("1 Kings 19:11");
    });
    it("1 kings 19 11", () => {
      expect(normalizeScriptureReference("1 kings 19 11")).toBe("1 Kings 19:11");
    });
    it("1st Kings 19:11", () => {
      expect(normalizeScriptureReference("1st Kings 19:11")).toBe("1 Kings 19:11");
    });
  });

  describe("2 Kings", () => {
    it("2 Kings 6:17", () => {
      expect(normalizeScriptureReference("2 Kings 6:17")).toBe("2 Kings 6:17");
    });
    it("2 kings 6:17", () => {
      expect(normalizeScriptureReference("2 kings 6:17")).toBe("2 Kings 6:17");
    });
    it("2nd Kings 6:17", () => {
      expect(normalizeScriptureReference("2nd Kings 6:17")).toBe("2 Kings 6:17");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Chronicles
// ─────────────────────────────────────────────────────────────────────────────

describe("Chronicles", () => {
  describe("1 Chronicles", () => {
    it("1 Chronicles 16:11", () => {
      expect(normalizeScriptureReference("1 Chronicles 16:11")).toBe("1 Chronicles 16:11");
    });
    it("1 chronicles 16:11", () => {
      expect(normalizeScriptureReference("1 chronicles 16:11")).toBe("1 Chronicles 16:11");
    });
    it("1 chronicles 16 11", () => {
      expect(normalizeScriptureReference("1 chronicles 16 11")).toBe("1 Chronicles 16:11");
    });
  });

  describe("2 Chronicles", () => {
    it("2 Chronicles 7:14", () => {
      expect(normalizeScriptureReference("2 Chronicles 7:14")).toBe("2 Chronicles 7:14");
    });
    it("2 chronicles 7:14", () => {
      expect(normalizeScriptureReference("2 chronicles 7:14")).toBe("2 Chronicles 7:14");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Corinthians
// ─────────────────────────────────────────────────────────────────────────────

describe("Corinthians", () => {
  describe("1 Corinthians", () => {
    it("1 Corinthians 13:4", () => {
      expect(normalizeScriptureReference("1 Corinthians 13:4")).toBe("1 Corinthians 13:4");
    });
    it("1 corinthians 13:4", () => {
      expect(normalizeScriptureReference("1 corinthians 13:4")).toBe("1 Corinthians 13:4");
    });
    it("1 corinthians 13 4", () => {
      expect(normalizeScriptureReference("1 corinthians 13 4")).toBe("1 Corinthians 13:4");
    });
    it("I Corinthians 13:4", () => {
      expect(normalizeScriptureReference("I Corinthians 13:4")).toBe("1 Corinthians 13:4");
    });
    it("1st Corinthians 13:4", () => {
      expect(normalizeScriptureReference("1st Corinthians 13:4")).toBe("1 Corinthians 13:4");
    });
  });

  describe("2 Corinthians", () => {
    it("2 Corinthians 5:17", () => {
      expect(normalizeScriptureReference("2 Corinthians 5:17")).toBe("2 Corinthians 5:17");
    });
    it("2 corinthians 5:17", () => {
      expect(normalizeScriptureReference("2 corinthians 5:17")).toBe("2 Corinthians 5:17");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Thessalonians
// ─────────────────────────────────────────────────────────────────────────────

describe("Thessalonians", () => {
  describe("1 Thessalonians", () => {
    it("1 Thessalonians 5:17", () => {
      expect(normalizeScriptureReference("1 Thessalonians 5:17")).toBe("1 Thessalonians 5:17");
    });
    it("1 thessalonians 5:17", () => {
      expect(normalizeScriptureReference("1 thessalonians 5:17")).toBe("1 Thessalonians 5:17");
    });
    it("1 thessalonians 5 17", () => {
      expect(normalizeScriptureReference("1 thessalonians 5 17")).toBe("1 Thessalonians 5:17");
    });
  });

  describe("2 Thessalonians", () => {
    it("2 Thessalonians 3:3", () => {
      expect(normalizeScriptureReference("2 Thessalonians 3:3")).toBe("2 Thessalonians 3:3");
    });
    it("2 thessalonians 3:3", () => {
      expect(normalizeScriptureReference("2 thessalonians 3:3")).toBe("2 Thessalonians 3:3");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Timothy
// ─────────────────────────────────────────────────────────────────────────────

describe("Timothy", () => {
  describe("1 Timothy", () => {
    it("1 Timothy 4:12", () => {
      expect(normalizeScriptureReference("1 Timothy 4:12")).toBe("1 Timothy 4:12");
    });
    it("1 timothy 4:12", () => {
      expect(normalizeScriptureReference("1 timothy 4:12")).toBe("1 Timothy 4:12");
    });
    it("1 timothy 4 12", () => {
      expect(normalizeScriptureReference("1 timothy 4 12")).toBe("1 Timothy 4:12");
    });
  });

  describe("2 Timothy", () => {
    it("2 Timothy 1:7", () => {
      expect(normalizeScriptureReference("2 Timothy 1:7")).toBe("2 Timothy 1:7");
    });
    it("2 timothy 1:7", () => {
      expect(normalizeScriptureReference("2 timothy 1:7")).toBe("2 Timothy 1:7");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Peter
// ─────────────────────────────────────────────────────────────────────────────

describe("Peter", () => {
  describe("1 Peter", () => {
    it("1 Peter 5:7", () => {
      expect(normalizeScriptureReference("1 Peter 5:7")).toBe("1 Peter 5:7");
    });
    it("1 peter 5:7", () => {
      expect(normalizeScriptureReference("1 peter 5:7")).toBe("1 Peter 5:7");
    });
    it("1 peter 5 7", () => {
      expect(normalizeScriptureReference("1 peter 5 7")).toBe("1 Peter 5:7");
    });
  });

  describe("2 Peter", () => {
    it("2 Peter 3:9", () => {
      expect(normalizeScriptureReference("2 Peter 3:9")).toBe("2 Peter 3:9");
    });
    it("2 peter 3:9", () => {
      expect(normalizeScriptureReference("2 peter 3:9")).toBe("2 Peter 3:9");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// John
// ─────────────────────────────────────────────────────────────────────────────

describe("John", () => {
  describe("1 John", () => {
    it("1 John 4:8", () => {
      expect(normalizeScriptureReference("1 John 4:8")).toBe("1 John 4:8");
    });
    it("1 john 4:8", () => {
      expect(normalizeScriptureReference("1 john 4:8")).toBe("1 John 4:8");
    });
    it("1 john 4 8", () => {
      expect(normalizeScriptureReference("1 john 4 8")).toBe("1 John 4:8");
    });
  });

  describe("2 John", () => {
    it("2 John 1:6", () => {
      expect(normalizeScriptureReference("2 John 1:6")).toBe("2 John 1:6");
    });
    it("2 john 1:6", () => {
      expect(normalizeScriptureReference("2 john 1:6")).toBe("2 John 1:6");
    });
  });

  describe("3 John", () => {
    it("3 John 1:2", () => {
      expect(normalizeScriptureReference("3 John 1:2")).toBe("3 John 1:2");
    });
    it("3 john 1:2", () => {
      expect(normalizeScriptureReference("3 john 1:2")).toBe("3 John 1:2");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Non-numbered books (Fuse.js-powered matching for all 66 books)
// ─────────────────────────────────────────────────────────────────────────────

describe("Non-numbered books", () => {
  it("Genesis 1:1 → Genesis 1:1", () => {
    expect(normalizeScriptureReference("Genesis 1:1")).toBe("Genesis 1:1");
  });
  it("genesis 1:1 → Genesis 1:1", () => {
    expect(normalizeScriptureReference("genesis 1:1")).toBe("Genesis 1:1");
  });
  it("Matthew 5:3 → Matthew 5:3", () => {
    expect(normalizeScriptureReference("Matthew 5:3")).toBe("Matthew 5:3");
  });
  it("Romans 8:28 → Romans 8:28", () => {
    expect(normalizeScriptureReference("Romans 8:28")).toBe("Romans 8:28");
  });
  it("romance 8:28 → Romans 8:28 (STT misrecognition)", () => {
    expect(normalizeScriptureReference("romance 8:28")).toBe("Romans 8:28");
  });
  it("John 3:16 → John 3:16", () => {
    expect(normalizeScriptureReference("John 3:16")).toBe("John 3:16");
  });
  it("Revelation 1:1 → Revelation 1:1", () => {
    expect(normalizeScriptureReference("Revelation 1:1")).toBe("Revelation 1:1");
  });
  it("revelations 21:1 → Revelation 21:1 (plural form)", () => {
    expect(normalizeScriptureReference("revelations 21:1")).toBe("Revelation 21:1");
  });
  it("hebrews 11:1 → Hebrews 11:1", () => {
    expect(normalizeScriptureReference("hebrews 11:1")).toBe("Hebrews 11:1");
  });
  it("psalm 23:1 → Psalms 23:1", () => {
    expect(normalizeScriptureReference("psalm 23:1")).toBe("Psalms 23:1");
  });
  it("deuteronomy 6:4 → Deuteronomy 6:4", () => {
    expect(normalizeScriptureReference("deuteronomy 6:4")).toBe("Deuteronomy 6:4");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases — chapter-only references
// ─────────────────────────────────────────────────────────────────────────────

describe("Chapter-only references", () => {
  it("1 Samuel 17 (no verse)", () => {
    expect(normalizeScriptureReference("1 Samuel 17")).toBe("1 Samuel 17");
  });
  it("2 Kings 6 (no verse)", () => {
    expect(normalizeScriptureReference("2 Kings 6")).toBe("2 Kings 6");
  });
  it("1 Corinthians 13 (no verse)", () => {
    expect(normalizeScriptureReference("1 Corinthians 13")).toBe("1 Corinthians 13");
  });
  it("2 Timothy 1 (no verse)", () => {
    expect(normalizeScriptureReference("2 Timothy 1")).toBe("2 Timothy 1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ordinal number variants (first/second/third, 1st/2nd/3rd)
// ─────────────────────────────────────────────────────────────────────────────

describe("Ordinal number variants", () => {
  it("first Samuel 17:45 → 1 Samuel 17:45", () => {
    expect(normalizeScriptureReference("first Samuel 17:45")).toBe("1 Samuel 17:45");
  });
  it("second Kings 6:17 → 2 Kings 6:17", () => {
    expect(normalizeScriptureReference("second Kings 6:17")).toBe("2 Kings 6:17");
  });
  it("third John 1:2 → 3 John 1:2", () => {
    expect(normalizeScriptureReference("third John 1:2")).toBe("3 John 1:2");
  });
  it("1st Peter 5:7 → 1 Peter 5:7", () => {
    expect(normalizeScriptureReference("1st Peter 5:7")).toBe("1 Peter 5:7");
  });
  it("2nd Corinthians 5:17 → 2 Corinthians 5:17", () => {
    expect(normalizeScriptureReference("2nd Corinthians 5:17")).toBe("2 Corinthians 5:17");
  });
  it("3rd John 1:2 → 3 John 1:2", () => {
    expect(normalizeScriptureReference("3rd John 1:2")).toBe("3 John 1:2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Word number variants (one/two/three)
// ─────────────────────────────────────────────────────────────────────────────

describe("Word number variants", () => {
  it("one Samuel 17:45 → 1 Samuel 17:45", () => {
    expect(normalizeScriptureReference("one Samuel 17:45")).toBe("1 Samuel 17:45");
  });
  it("two Kings 6:17 → 2 Kings 6:17", () => {
    expect(normalizeScriptureReference("two Kings 6:17")).toBe("2 Kings 6:17");
  });
  it("three John 1:2 → 3 John 1:2", () => {
    expect(normalizeScriptureReference("three John 1:2")).toBe("3 John 1:2");
  });
  it("one Corinthians 13:4 → 1 Corinthians 13:4", () => {
    expect(normalizeScriptureReference("one Corinthians 13:4")).toBe("1 Corinthians 13:4");
  });
  it("two Thessalonians 3:3 → 2 Thessalonians 3:3", () => {
    expect(normalizeScriptureReference("two Thessalonians 3:3")).toBe("2 Thessalonians 3:3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// "chapter" and "verse" keyword stripping
// ─────────────────────────────────────────────────────────────────────────────

describe("Chapter/verse keyword stripping", () => {
  it("1 Samuel chapter 17 → 1 Samuel 17", () => {
    expect(normalizeScriptureReference("1 Samuel chapter 17")).toBe("1 Samuel 17");
  });
  it("1 Samuel chapter 17 verse 45 → 1 Samuel 17:45", () => {
    expect(normalizeScriptureReference("1 Samuel chapter 17 verse 45")).toBe("1 Samuel 17:45");
  });
  it("1 Kings chapter 6 → 1 Kings 6", () => {
    expect(normalizeScriptureReference("1 Kings chapter 6")).toBe("1 Kings 6");
  });
  it("2 Timothy chapter 1 verse 7 → 2 Timothy 1:7", () => {
    expect(normalizeScriptureReference("2 Timothy chapter 1 verse 7")).toBe("2 Timothy 1:7");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case insensitivity and whitespace edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Case insensitivity and whitespace edge cases", () => {
  it("SECOND SAMUEL 13:4 → 2 Samuel 13:4", () => {
    expect(normalizeScriptureReference("SECOND SAMUEL 13:4")).toBe("2 Samuel 13:4");
  });
  it("second samuel 13 4 → 2 Samuel 13:4", () => {
    expect(normalizeScriptureReference("second samuel 13 4")).toBe("2 Samuel 13:4");
  });
  it("Second SAMUEL 13:4 → 2 Samuel 13:4", () => {
    expect(normalizeScriptureReference("Second SAMUEL 13:4")).toBe("2 Samuel 13:4");
  });
  it("extra whitespace: Second   Samuel   13   4 → 2 Samuel 13:4", () => {
    expect(normalizeScriptureReference("  Second   Samuel   13   4  ")).toBe("2 Samuel 13:4");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invalid / non-matching inputs
// ─────────────────────────────────────────────────────────────────────────────

describe("Returns null for invalid input", () => {
  it("empty string → null", () => {
    expect(normalizeScriptureReference("")).toBeNull();
  });
  it("random text → null", () => {
    expect(normalizeScriptureReference("hello world")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nigerian church speech-to-text variants
// ─────────────────────────────────────────────────────────────────────────────

describe("Nigerian speech variants", () => {
  // Won = 1
  it("won samuel 17:45 → 1 Samuel 17:45", () => {
    expect(normalizeScriptureReference("won samuel 17:45")).toBe("1 Samuel 17:45");
  });
  it("won kings 19:11 → 1 Kings 19:11", () => {
    expect(normalizeScriptureReference("won kings 19:11")).toBe("1 Kings 19:11");
  });
  it("won king 19:11 → 1 Kings 19:11 (singular)", () => {
    expect(normalizeScriptureReference("won king 19:11")).toBe("1 Kings 19:11");
  });
  it("won john 4:8 → 1 John 4:8", () => {
    expect(normalizeScriptureReference("won john 4:8")).toBe("1 John 4:8");
  });
  it("won peter 5:7 → 1 Peter 5:7", () => {
    expect(normalizeScriptureReference("won peter 5:7")).toBe("1 Peter 5:7");
  });

  // To / Too / Tu = 2
  it("to samuel 11:1 → 2 Samuel 11:1", () => {
    expect(normalizeScriptureReference("to samuel 11:1")).toBe("2 Samuel 11:1");
  });
  it("too kings 6:17 → 2 Kings 6:17", () => {
    expect(normalizeScriptureReference("too kings 6:17")).toBe("2 Kings 6:17");
  });
  it("tu corinthians 5:17 → 2 Corinthians 5:17", () => {
    expect(normalizeScriptureReference("tu corinthians 5:17")).toBe("2 Corinthians 5:17");
  });
  it("to peter 3:9 → 2 Peter 3:9", () => {
    expect(normalizeScriptureReference("to peter 3:9")).toBe("2 Peter 3:9");
  });

  // Tree / Free = 3
  it("tree john 1:2 → 3 John 1:2", () => {
    expect(normalizeScriptureReference("tree john 1:2")).toBe("3 John 1:2");
  });
  it("free john 1:2 → 3 John 1:2", () => {
    expect(normalizeScriptureReference("free john 1:2")).toBe("3 John 1:2");
  });

  // Chapter-only with Nigerian variants
  it("won samuel 17 → 1 Samuel 17 (chapter only)", () => {
    expect(normalizeScriptureReference("won samuel 17")).toBe("1 Samuel 17");
  });
  it("to corinthians 13 → 2 Corinthians 13 (chapter only)", () => {
    expect(normalizeScriptureReference("to corinthians 13")).toBe("2 Corinthians 13");
  });
});
