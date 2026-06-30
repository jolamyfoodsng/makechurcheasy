/**
 * unicodePreservation.test.ts — Verify Unicode characters survive import, storage,
 * search normalization, and slide generation without corruption.
 *
 * Specific regression: ɛ→1 and ɔ→4 must NEVER happen.
 */

import { describe, it, expect } from "vitest";
import { generateSlides, parseWorshipLyricSections } from "./slideEngine";
import {
  unicodeSearchNormalize,
  unicodeStripDiacritics,
  unicodeTokenize,
} from "./unicodeUtils";

// ── Test strings that must survive unchanged ─────────────────────────────────

const UNICODE_SAMPLES = {
  twi: "Kyerɛ yɛn W'anuonyam,\nOwura;\nKyerɛ yɛn W'anuonyam,\nOwura\nMa ɔsoro obosu mmrɛ\nyɛn ahodwo,\nNa kyerɛ yɛn W'anuonyam\nbio",
  french: "Jésus est fidèle à jamais",
  yoruba: "Jésù ńfẹ́ rẹ, Ọlọ́run dára",
  igbo: "Ụbọchị ịma mmọọ",
  spanish: "Jesús es mi refugio",
  german: "Jesus, ich bin dein",
  portuguese: "Jesus, eu sou teu",
  chinese: "耶稣基督",
  japanese: "イエス・キリスト",
  arabic: "يسوع المسيح",
  korean: "예수 그리스도",
  emoji: "✝️🎶🙌",
  mixed: "Kyerɛ yɛn W'anuonyam — Jésus est fidèle — Ọlọ́run dára",
};

// ── Unicode normalization tests ──────────────────────────────────────────────

describe("Unicode NFC normalization", () => {
  it("preserves Twi characters ɛ and ɔ through NFC", () => {
    const input = "Kyerɛ yɛn W\u2019anuonyam, ɔsoro mmrɛ";
    const normalized = input.normalize("NFC");
    expect(normalized).toBe(input);
    expect(normalized).toContain("ɛ");
    expect(normalized).toContain("ɔ");
    expect(normalized).not.toContain("1");
    expect(normalized).not.toContain("4");
  });

  it("preserves French accents through NFC", () => {
    const input = "Jésus est fidèle à jamais";
    const normalized = input.normalize("NFC");
    expect(normalized).toBe(input);
    expect(normalized).toContain("é");
    expect(normalized).toContain("è");
    expect(normalized).toContain("à");
  });

  it("preserves Yoruba diacritics through NFC", () => {
    const input = "Ọlọ́run dára";
    const normalized = input.normalize("NFC");
    expect(normalized).toContain("Ọ");
    expect(normalized).toContain("ọ");
    expect(normalized).toContain("á");
  });

  it("never converts ɛ to 1", () => {
    for (const sample of Object.values(UNICODE_SAMPLES)) {
      expect(sample).not.toMatch(/1/);
      const normalized = sample.normalize("NFC");
      if (sample.includes("ɛ")) {
        expect(normalized).toContain("ɛ");
        expect(normalized.charCodeAt(normalized.indexOf("ɛ"))).toBe(0x025b);
      }
    }
  });

  it("never converts ɔ to 4", () => {
    for (const sample of Object.values(UNICODE_SAMPLES)) {
      if (sample.includes("ɔ")) {
        const normalized = sample.normalize("NFC");
        expect(normalized).toContain("ɔ");
        expect(normalized.charCodeAt(normalized.indexOf("ɔ"))).toBe(0x0254);
      }
    }
  });
});

// ── Slide engine Unicode preservation ────────────────────────────────────────

describe("parseWorshipLyricSections preserves Unicode", () => {
  it("preserves Twi ɛ and ɔ through section parsing", () => {
    const sections = parseWorshipLyricSections(UNICODE_SAMPLES.twi, 2);
    const allLines = sections.flatMap((s) => s.lines).join("\n");
    expect(allLines).toContain("ɛ");
    expect(allLines).toContain("ɔ");
    expect(allLines).toContain("Kyerɛ");
    expect(allLines).toContain("ɔsoro");
    expect(allLines).toContain("mmrɛ");
    expect(allLines).not.toMatch(/\bKyer1\b/);
    expect(allLines).not.toMatch(/\b4soro\b/);
  });

  it("preserves French accents through section parsing", () => {
    const lyrics = "Verse 1:\nJésus est fidèle à jamais\n\nChorus:\nLouez le Seigneur";
    const sections = parseWorshipLyricSections(lyrics, 2);
    const allLines = sections.flatMap((s) => s.lines).join("\n");
    expect(allLines).toContain("Jésus");
    expect(allLines).toContain("fidèle");
    expect(allLines).toContain("à");
    expect(allLines).toContain("Louez");
  });

  it("preserves Yoruba diacritics through section parsing", () => {
    const lyrics = "Verse 1:\nJésù ńfẹ́ rẹ\n\nChorus:\nỌlọ́run dára";
    const sections = parseWorshipLyricSections(lyrics, 2);
    const allLines = sections.flatMap((s) => s.lines).join("\n");
    expect(allLines).toContain("Jésù");
    expect(allLines).toContain("ńfẹ́");
    expect(allLines).toContain("Ọlọ́run");
  });

  it("preserves CJK characters through section parsing", () => {
    const lyrics = "Verse 1:\n耶稣基督\n\nChorus:\n赞美主";
    const sections = parseWorshipLyricSections(lyrics, 2);
    const allLines = sections.flatMap((s) => s.lines).join("\n");
    expect(allLines).toContain("耶稣基督");
    expect(allLines).toContain("赞美主");
  });

  it("preserves Arabic characters through section parsing", () => {
    const lyrics = "Verse 1:\nيسوع المسيح\n\nChorus:\n哈利路亚";
    const sections = parseWorshipLyricSections(lyrics, 2);
    const allLines = sections.flatMap((s) => s.lines).join("\n");
    expect(allLines).toContain("يسوع المسيح");
  });
});

describe("generateSlides preserves Unicode", () => {
  it("preserves Twi characters in generated slides", () => {
    const slides = generateSlides(UNICODE_SAMPLES.twi, 2, true);
    const allContent = slides.map((s) => s.content).join("\n");
    expect(allContent).toContain("Kyerɛ");
    expect(allContent).toContain("ɔsoro");
    expect(allContent).toContain("mmrɛ");
    expect(allContent).not.toMatch(/Kyer1/);
    expect(allContent).not.toMatch(/4soro/);
  });

  it("preserves mixed Unicode in generated slides", () => {
    const slides = generateSlides(UNICODE_SAMPLES.mixed, 2, true);
    const allContent = slides.map((s) => s.content).join("\n");
    expect(allContent).toContain("Kyerɛ");
    expect(allContent).toContain("Jésus");
    expect(allContent).toContain("Ọlọ́run");
  });

  it("preserves line breaks in Twi lyrics", () => {
    const lyrics = "Kyerɛ yɛn W\u2019anuonyam,\nOwura;\nKyerɛ yɛn W\u2019anuonyam,\nOwura";
    const slides = generateSlides(lyrics, 2, false);
    expect(slides.length).toBeGreaterThanOrEqual(1);
    const allContent = slides.map((s) => s.content).join("\n");
    expect(allContent).toContain("Kyerɛ");
    expect(allContent).toContain("Owura");
  });
});

// ── Search normalization Unicode tests ───────────────────────────────────────

describe("unicodeSearchNormalize", () => {
  it("normalizes Twi search terms — ɛ→e, ɔ→o for matching", () => {
    expect(unicodeSearchNormalize("Kyerɛ")).toBe("kyere");
    expect(unicodeSearchNormalize("ɔsoro")).toBe("osoro");
    expect(unicodeSearchNormalize("mmrɛ")).toBe("mmre");
  });

  it("normalizes French search terms correctly", () => {
    expect(unicodeSearchNormalize("Jésus")).toBe("jesus");
    expect(unicodeSearchNormalize("fidèle")).toBe("fidele");
  });

  it("normalizes Yoruba search terms — ọ decomposes via NFD → o", () => {
    expect(unicodeSearchNormalize("Ọlọ́run")).toBe("olorun");
  });

  it("never produces digits from Unicode characters", () => {
    const testStrings = ["Kyerɛ", "ɔsoro", "mmrɛ", "Jésus", "fidèle", "Ọlọ́run"];
    for (const str of testStrings) {
      const normalized = unicodeSearchNormalize(str);
      expect(normalized).not.toMatch(/\d/);
    }
  });

  it("enables diacritic-insensitive search for all languages", () => {
    expect(unicodeSearchNormalize("Kyerɛ")).toBe(unicodeSearchNormalize("kyere"));
    expect(unicodeSearchNormalize("Jésus")).toBe(unicodeSearchNormalize("jesus"));
    expect(unicodeSearchNormalize("Ọlọ́run")).toBe(unicodeSearchNormalize("olorun"));
    expect(unicodeSearchNormalize("ɔsoro")).toBe(unicodeSearchNormalize("osoro"));
  });
});

// ── Tokenizer Unicode tests ─────────────────────────────────────────────────

describe("unicodeTokenize", () => {
  it("tokenizes Twi text — ɛ maps to e for search tokens", () => {
    const tokens = unicodeTokenize("Kyerɛ yɛn W'anuonyam");
    expect(tokens).toContain("kyere");
    expect(tokens).toContain("yen");
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("tokenizes French text into meaningful tokens", () => {
    const tokens = unicodeTokenize("Jésus est fidèle à jamais");
    expect(tokens).toContain("jesus");
    expect(tokens).toContain("fidele");
  });

  it("never produces digit tokens from Unicode characters", () => {
    const tokens = unicodeTokenize("Kyerɛ yɛn ɔsoro mmrɛ");
    expect(tokens).not.toContain("1");
    expect(tokens).not.toContain("4");
  });
});

// ── Dock fuzzyMatch Unicode tests ───────────────────────────────────────────

describe("unicodeStripDiacritics + fuzzyMatch", () => {
  function fuzzyMatch(query: string, target: string): boolean {
    const q = unicodeStripDiacritics(query);
    const t = unicodeStripDiacritics(target);
    if (t.includes(q)) return true;
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) qi++;
    }
    return qi === q.length;
  }

  it("matches Twi song titles", () => {
    expect(fuzzyMatch("Kyerɛ", "Kyerɛ yɛn W'anuonyam")).toBe(true);
    expect(fuzzyMatch("kyere", "Kyerɛ yɛn W'anuonyam")).toBe(true);
  });

  it("matches French song titles", () => {
    expect(fuzzyMatch("Jesus", "Jésus est fidèle")).toBe(true);
    expect(fuzzyMatch("Jésus", "Jesus est fidèle")).toBe(true);
  });

  it("matches Yoruba song titles", () => {
    expect(fuzzyMatch("Olorun", "Ọlọ́run dára")).toBe(true);
  });

  it("matches Twi ɔ→o in song titles", () => {
    expect(fuzzyMatch("osoro", "ɔsoro obosu")).toBe(true);
    expect(fuzzyMatch("ɔsoro", "osoro")).toBe(true);
  });
});
