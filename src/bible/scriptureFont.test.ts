import { describe, expect, it } from "vitest";
import { SCRIPTURE_FONT_FAMILY, withScriptureFontFallback } from "./scriptureFont";

describe("scripture font fallback", () => {
  it("uses the bundled African-language font first by default", () => {
    expect(SCRIPTURE_FONT_FAMILY.startsWith('"Questrial"')).toBe(true);
    expect(SCRIPTURE_FONT_FAMILY).toContain('"Charis SIL"');
    expect(SCRIPTURE_FONT_FAMILY).toContain('"Noto Sans"');
  });

  it("puts Questrial and Unicode fallbacks before legacy CMG Sans settings", () => {
    const family = withScriptureFontFallback('"CMG Sans", sans-serif');
    expect(family.startsWith('"Questrial", "Charis SIL", "Noto Sans",')).toBe(true);
    expect(family).toContain('"CMG Sans"');
  });

  it("keeps a selected font and adds Unicode fallbacks", () => {
    const family = withScriptureFontFallback('"Inter", sans-serif');
    expect(family.startsWith('"Inter", sans-serif')).toBe(true);
    expect(family).toContain('"Questrial"');
    expect(family).toContain('"Charis SIL"');
    expect(family).toContain('"Noto Sans"');
  });

  it("quotes bare admin font names before adding the fallback", () => {
    expect(withScriptureFontFallback("CMG Sans")).toBe(
      '"Questrial", "Charis SIL", "Noto Sans", "CMG Sans"',
    );
  });
});
