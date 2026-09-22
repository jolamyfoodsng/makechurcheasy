import { describe, it, expect } from "vitest";
import {
  damerauLevenshteinDistance,
  fuzzyMatch,
  fuzzyScore,
  fuzzyFilter,
} from "./fuzzySearch";

describe("fuzzySearch", () => {
  describe("damerauLevenshteinDistance", () => {
    it("handles exact match", () => {
      expect(damerauLevenshteinDistance("hello", "hello", 2)).toBe(0);
    });

    it("handles single deletion / missing character: folow -> follow", () => {
      expect(damerauLevenshteinDistance("folow", "follow", 2)).toBe(1);
    });

    it("handles single insertion / extra character: hery -> henry", () => {
      expect(damerauLevenshteinDistance("hery", "henry", 2)).toBe(1);
    });

    it("handles transposition of adjacent characters", () => {
      expect(damerauLevenshteinDistance("thier", "their", 2)).toBe(1);
      expect(damerauLevenshteinDistance("herny", "henry", 2)).toBe(1);
    });

    it("handles single substitution", () => {
      expect(damerauLevenshteinDistance("amasing", "amazing", 2)).toBe(1);
      expect(damerauLevenshteinDistance("mathew", "matthew", 2)).toBe(1);
    });

    it("early exits when distance exceeds maxDistance", () => {
      expect(damerauLevenshteinDistance("abcdef", "xyz", 2)).toBeGreaterThan(2);
    });
  });

  describe("fuzzyMatch & fuzzyScore", () => {
    it("matches exact text with highest score", () => {
      expect(fuzzyMatch("follow", "follow")).toBe(true);
      expect(fuzzyScore("follow", "follow")).toBe(1000);
    });

    it("matches prefixes with high score", () => {
      expect(fuzzyMatch("gen", "Genesis")).toBe(true);
      expect(fuzzyScore("gen", "Genesis")).toBeGreaterThanOrEqual(800);
    });

    it("matches typos: folow -> follow", () => {
      expect(fuzzyMatch("folow", "I will follow you")).toBe(true);
      expect(fuzzyScore("folow", "follow")).toBeGreaterThanOrEqual(400);
    });

    it("matches typos: hery -> henry", () => {
      expect(fuzzyMatch("hery", "Henry Francis Lyte")).toBe(true);
      expect(fuzzyScore("hery", "henry")).toBeGreaterThanOrEqual(400);
    });

    it("matches typos: amasing -> amazing", () => {
      expect(fuzzyMatch("amasing", "Amazing Grace")).toBe(true);
    });

    it("matches typos: haleluyah -> hallelujah", () => {
      expect(fuzzyMatch("haleluyah", "Hallelujah to the King")).toBe(true);
    });

    it("ranks exact matches above typo matches", () => {
      const exactScore = fuzzyScore("follow", "follow");
      const typoScore = fuzzyScore("folow", "follow");
      expect(exactScore).toBeGreaterThan(typoScore);
    });

    it("rejects completely unrelated words", () => {
      expect(fuzzyMatch("apple", "Genesis 1:1")).toBe(false);
      expect(fuzzyScore("apple", "Genesis 1:1")).toBe(0);
    });
  });

  describe("fuzzyFilter", () => {
    const songs = [
      { id: 1, title: "Amazing Grace" },
      { id: 2, title: "I Will Follow" },
      { id: 3, title: "Abide With Me (Henry Francis Lyte)" },
      { id: 4, title: "How Great Thou Art" },
    ];

    it("filters and ranks with typos", () => {
      const followResults = fuzzyFilter(songs, "folow", (s) => s.title);
      expect(followResults.length).toBeGreaterThan(0);
      expect(followResults[0].title).toBe("I Will Follow");

      const henryResults = fuzzyFilter(songs, "hery", (s) => s.title);
      expect(henryResults.length).toBeGreaterThan(0);
      expect(henryResults[0].title).toContain("Henry");

      const amazingResults = fuzzyFilter(songs, "amasing", (s) => s.title);
      expect(amazingResults.length).toBeGreaterThan(0);
      expect(amazingResults[0].title).toBe("Amazing Grace");
    });
  });
});
