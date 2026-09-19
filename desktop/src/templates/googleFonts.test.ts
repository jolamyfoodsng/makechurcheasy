import { describe, expect, it } from "vitest";
import { GOOGLE_FONT_CATALOG } from "./googleFontCatalog";
import { findGoogleFont, googleFontCssUrl, googleFontStack, primaryFontFamily } from "./googleFonts";

describe("Google Font catalogue", () => {
  it("includes the full Google Fonts family catalogue without bundling font files", () => {
    expect(GOOGLE_FONT_CATALOG.length).toBeGreaterThan(1900);
    expect(findGoogleFont("Bebas Neue")).toMatchObject({ family: "Bebas Neue" });
    expect(findGoogleFont("Playfair Display")).toMatchObject({ family: "Playfair Display" });
  });

  it("keeps a stored family usable by the editor and requests it with swap loading", () => {
    const stack = googleFontStack("Open Sans", "Sans Serif");

    expect(stack).toBe("'Open Sans', sans-serif");
    expect(primaryFontFamily(stack)).toBe("Open Sans");
    expect(googleFontCssUrl("Open Sans")).toBe("https://fonts.googleapis.com/css2?family=Open+Sans&display=swap");
  });
});
