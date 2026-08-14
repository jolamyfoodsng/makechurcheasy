import { describe, expect, it } from "vitest";
import { SCRIPTURE_FONT_FAMILY, withScriptureFontFallback } from "./scriptureFont";

describe("scripture font fallback", () => {
  it("uses the bundled CMG Sans Black font first by default", () => {
    expect(SCRIPTURE_FONT_FAMILY.startsWith('"CMG Sans Black"')).toBe(true);
    expect(SCRIPTURE_FONT_FAMILY).toContain('"Charis SIL"');
    expect(SCRIPTURE_FONT_FAMILY).toContain('"Noto Sans"');
  });

  it("keeps CMG Sans selected before its Unicode fallbacks", () => {
    const family = withScriptureFontFallback('"CMG Sans", sans-serif');
    expect(family.startsWith('"CMG Sans", "Charis SIL", "Noto Sans",')).toBe(true);
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
      '"CMG Sans", "Charis SIL", "Noto Sans"',
    );
  });
});
