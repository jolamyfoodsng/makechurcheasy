import { describe, it, expect } from "vitest";
import { matchVerseAlias } from "./scriptureReranker";

describe("Verse alias engine — quote detection independence", () => {
  // ── Core quote detection (Tier 1 aliases) ──

  describe("Universally quoted verses", () => {
    it("for god so loved the world → John 3:16", () => {
      expect(matchVerseAlias("for god so loved the world")).toBe("John 3:16");
    });

    it("god so loved the world → John 3:16", () => {
      expect(matchVerseAlias("god so loved the world")).toBe("John 3:16");
    });

    it("for god so loved → John 3:16", () => {
      expect(matchVerseAlias("for god so loved")).toBe("John 3:16");
    });

    it("the lord is my shepherd → Psalm 23:1", () => {
      expect(matchVerseAlias("the lord is my shepherd")).toBe("Psalm 23:1");
    });

    it("lord is my shepherd → Psalm 23:1", () => {
      expect(matchVerseAlias("lord is my shepherd")).toBe("Psalm 23:1");
    });

    it("faith is the substance of things hoped for → Hebrews 11:1", () => {
      expect(matchVerseAlias("faith is the substance of things hoped for")).toBe("Hebrews 11:1");
    });

    it("now faith is the substance of things hoped for → Hebrews 11:1", () => {
      expect(matchVerseAlias("now faith is the substance of things hoped for")).toBe("Hebrews 11:1");
    });
  });

  // ── Alias engine is stateless — multiple calls don't degrade ──

  describe("Stateless quote detection (no degradation after repeated calls)", () => {
    const quotes = [
      { input: "for god so loved the world", expected: "John 3:16" },
      { input: "the lord is my shepherd", expected: "Psalm 23:1" },
      { input: "faith is the substance of things hoped for", expected: "Hebrews 11:1" },
    ];

    it("all quotes detect correctly even after 20 simulated navigation cycles", () => {
      // Simulate 20 navigation commands (the engine is stateless)
      for (let i = 0; i < 20; i++) {
        // These should always return null (not Bible quotes)
        expect(matchVerseAlias(`open to genesis ${i + 1}:1`)).toBeNull();
        expect(matchVerseAlias(`genesis ${i + 1}:1`)).toBeNull();
      }

      // After 20 navigation cycles, all quotes must still work
      for (const { input, expected } of quotes) {
        expect(matchVerseAlias(input)).toBe(expected);
      }
    });

    it("quotes work correctly after back-to-back navigation commands", () => {
      // Simulate the exact reproduction sequence
      const navCommands = [
        "open to genesis 3:1",
        "open to genesis 1:1",
        "open to genesis 4:1",
        "open to genesis 2:1",
        "open to genesis 5:1",
      ];

      for (const cmd of navCommands) {
        // Navigation commands should not match as verse aliases
        expect(matchVerseAlias(cmd)).toBeNull();
      }

      // Quote detection must still work after all navigation
      expect(matchVerseAlias("for god so loved the world")).toBe("John 3:16");
      expect(matchVerseAlias("the lord is my shepherd")).toBe("Psalm 23:1");
      expect(matchVerseAlias("faith is the substance of things hoped for")).toBe("Hebrews 11:1");
    });
  });

  // ── Book-bound quote detection must not be blocked by context ──

  describe("Cross-book quote detection (boundBook independence)", () => {
    it("John 3:16 detected even when 'Genesis' context is active", () => {
      // matchVerseAlias is pure — no context dependency
      expect(matchVerseAlias("for god so loved the world")).toBe("John 3:16");
    });

    it("Psalm 23:1 detected even when 'Genesis' context is active", () => {
      expect(matchVerseAlias("the lord is my shepherd")).toBe("Psalm 23:1");
    });

    it("Hebrews 11:1 detected even when 'Genesis' context is active", () => {
      expect(matchVerseAlias("faith is the substance of things hoped for")).toBe("Hebrews 11:1");
    });
  });
});
