import { describe, expect, it } from "vitest";

import {
  getDockTickerThemeOptionsForFavorites,
  renderDockTickerThemeHtml,
  resolveDockTickerThemeOption,
} from "./tickerThemeCatalog";

describe("tickerThemeCatalog", () => {
  it("includes permanent ticker themes when they are favorited", () => {
    const options = getDockTickerThemeOptionsForFavorites(new Set(["ticker-social-footer"]));

    expect(options.map((option) => option.id)).toContain("ticker-social-footer");
    expect(options.find((option) => option.id === "ticker-social-footer")?.source).toBe("permanent");
  });

  it("renders permanent ticker themes with live ticker controls", () => {
    const option = resolveDockTickerThemeOption("ticker-bottom");
    expect(option?.source).toBe("permanent");

    const html = renderDockTickerThemeHtml({
      option: option!,
      heading: "Updates",
      messages: ["Alpha", "Beta"],
      speed: 88,
      position: "top",
      loop: false,
      paused: true,
    });

    expect(html).toContain("Updates");
    expect(html).toContain("Alpha   •   Beta");
    expect(html).toContain("top: 0 !important; bottom: auto !important;");
    expect(html).toContain("animation-iteration-count: 1 !important;");
    expect(html).toContain("animation-play-state: paused !important;");
  });

  it("renders dock-native ticker themes with override colors", () => {
    const option = resolveDockTickerThemeOption("ticker-fresh");
    expect(option?.source).toBe("dock");
    if (!option || option.source !== "dock") {
      throw new Error("Expected dock ticker theme");
    }

    const html = renderDockTickerThemeHtml({
      option,
      heading: "Live",
      messages: ["Welcome"],
      speed: 50,
      position: "bottom",
      loop: true,
      paused: false,
      colors: {
        ...option.theme.defaultColors,
        accent: "#123456",
        separator: "#123456",
      },
    });

    expect(html).toContain("#123456");
    expect(html).toContain("Welcome");
  });
});
