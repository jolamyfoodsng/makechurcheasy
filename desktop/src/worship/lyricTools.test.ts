import { describe, expect, it } from "vitest";
import {
  capitalizeLyricsText,
  cleanLyricsText,
  insertSectionLabel,
  lineStats,
  removeChords,
  removeEmptyLyricsLines,
  removeVerseNumbers,
  splitSlideAt,
} from "./lyricTools";

describe("capitalizeLyricsText", () => {
  it("capitalizes plain English words", () => {
    expect(capitalizeLyricsText("HOW GREAT thou art")).toBe("How Great Thou Art");
  });
  it("does not capitalize in the middle of a word with tone marks (Yoruba)", () => {
    expect(capitalizeLyricsText("àwọn ẹni ọlọ́run")).toBe("Àwọn Ẹni Ọlọ́run");
  });
  it("keeps contractions together", () => {
    expect(capitalizeLyricsText("don't you worry, i'm here")).toBe("Don't You Worry, I'm Here");
  });
  it("capitalizes a word that starts after an opening quote", () => {
    expect(capitalizeLyricsText("'holy' is he")).toBe("'Holy' Is He");
  });
});

describe("cleanLyricsText", () => {
  it("fixes spacing around punctuation and trailing spaces", () => {
    expect(cleanLyricsText("God ,you are good .  \n\tAmen")).toBe("God, you are good.\nAmen");
  });
  it("adds the missing space after punctuation, also before non-English letters", () => {
    expect(cleanLyricsText("Ọlọ́run,ẹ ṣé")).toBe("Ọlọ́run, ẹ ṣé");
  });
  it("leaves times, numbers and U.S.A alone", () => {
    expect(cleanLyricsText("At 10:30 in the U.S.A")).toBe("At 10:30 in the U.S.A");
  });
  it("turns no-break spaces into spaces and drops zero-width characters", () => {
    expect(cleanLyricsText("Holy holy​")).toBe("Holy holy");
  });
  it("keeps blank lines", () => {
    expect(cleanLyricsText("a\n\nb")).toBe("a\n\nb");
  });
});

describe("removeEmptyLyricsLines (Trim Gaps)", () => {
  it("collapses many empty lines to one", () => {
    expect(removeEmptyLyricsLines("a\n\n\n\nb")).toBe("a\n\nb");
  });
  it("treats dividers as empty", () => {
    expect(removeEmptyLyricsLines("a\n---\n\nb")).toBe("a\n\nb");
  });
  it("never deletes lines written in other alphabets", () => {
    expect(removeEmptyLyricsLines("ẹ\n\n哈利路亚\n\nАллилуйя")).toBe("ẹ\n\n哈利路亚\n\nАллилуйя");
  });
});

describe("removeVerseNumbers", () => {
  it("removes list numbers and Verse labels", () => {
    expect(removeVerseNumbers("1. First\n2) Second\n[3] Third\n(4) Fourth\nVerse 5: Fifth")).toBe("First\nSecond\nThird\nFourth\nFifth");
  });
  it("leaves decimals and normal words alone", () => {
    expect(removeVerseNumbers("10.5 percent\n10,000 Reasons")).toBe("10.5 percent\n10,000 Reasons");
  });
});

describe("removeChords", () => {
  it("removes chord lines and inline chords but keeps labels", () => {
    const text = "[Chorus]\nG   D   Em  C\nHoly [G]holy [Am7]holy\nAmen";
    expect(removeChords(text)).toBe("[Chorus]\nHoly holy holy\nAmen");
  });
  it("keeps normal lyric lines", () => {
    expect(removeChords("A great God\nEm")).toBe("A great God");
  });
});

describe("insertSectionLabel", () => {
  it("puts a label above the cursor line with an empty line before it", () => {
    const r = insertSectionLabel("one\ntwo", 4, "Chorus");
    expect(r.text).toBe("one\n\n[Chorus]\ntwo");
    expect(r.text.slice(r.caret)).toBe("two");
  });
  it("works at the very start", () => {
    expect(insertSectionLabel("one", 0, "Verse").text).toBe("[Verse]\none");
  });
});

describe("splitSlideAt", () => {
  it("starts a new slide at the cursor", () => {
    const r = splitSlideAt("one two", 3);
    expect(r.text).toBe("one\n\ntwo");
  });
  it("does nothing at the very start or end", () => {
    expect(splitSlideAt("abc", 0).text).toBe("abc");
    expect(splitSlideAt("abc", 3).text).toBe("abc");
  });
});

describe("lineStats", () => {
  it("reports the typical lines per slide", () => {
    const s = lineStats([{ content: "a\nb" }, { content: "c\nd" }, { content: "e" }]);
    expect(s.typical).toBe(2);
    expect(s.lines).toBe(5);
    expect(s.label).toBe("2 lines per slide (1–2)");
  });
  it("handles no slides", () => {
    expect(lineStats([]).label).toBe("no slides");
  });
});
