import { describe, expect, it } from "vitest";
import { searchBibleRanked } from "./bibleData";

describe("Bible keyword search", () => {
  it("finds adjacent verse matches for phrase fragments", async () => {
    const results = await searchBibleRanked("all things must bow confess", "KJV", 5);
    const top = results[0];

    expect(top).toMatchObject({
      book: "Philippians",
      chapter: 2,
      verse: 10,
      endVerse: 11,
    });
  });

  it("finds exact scripture phrases without a verse-specific alias", async () => {
    const results = await searchBibleRanked("And the eyes of them both were opened.", "KJV", 5);

    expect(results[0]).toMatchObject({
      book: "Genesis",
      chapter: 3,
      verse: 7,
    });
    expect(results[0].score).toBeGreaterThanOrEqual(0.9);
  });

  it("finds KJV phrases from the corpus without a verse-specific alias", async () => {
    const results = await searchBibleRanked("Let him ask God if he lack wisdom.", "KJV", 5);

    expect(results[0]).toMatchObject({
      book: "James",
      chapter: 1,
      verse: 5,
    });
    expect(results[0].score).toBeGreaterThanOrEqual(0.9);
  });

  it("finds scripture from content words when filler words are missing", async () => {
    const results = await searchBibleRanked("eyes both opened", "KJV", 5);

    expect(results[0]).toMatchObject({
      book: "Genesis",
      chapter: 3,
      verse: 7,
    });
  });

  it("finds sermon-style fragments from distinctive verse words", async () => {
    const results = await searchBibleRanked("gift righteousness reign life", "KJV", 5);

    expect(results[0]).toMatchObject({
      book: "Romans",
      chapter: 5,
      verse: 17,
    });
  });

  it("normalizes common KJV wording during corpus search", async () => {
    const results = await searchBibleRanked("god has not given us spirit fear power love sound mind", "KJV", 5);

    expect(results[0]).toMatchObject({
      book: "2 Timothy",
      chapter: 1,
      verse: 7,
    });
  });

  it("finds partial quotes without relying on alias lookup", async () => {
    const results = await searchBibleRanked("made himself no reputation form servant likeness men", "KJV", 5);

    expect(results[0]).toMatchObject({
      book: "Philippians",
      chapter: 2,
      verse: 7,
    });
  });
});
