import { describe, expect, it } from "vitest";
import { localizeLowerThirdThemeAssets, normalizeOfflineThemeValues } from "./runtimeBranding";
import type { LowerThirdTheme } from "./types";

function makeTheme(variables: LowerThirdTheme["variables"]): LowerThirdTheme {
  return {
    id: "lt-offline-test",
    name: "Offline Test",
    description: "Offline normalization test theme",
    category: "general",
    icon: "subtitles",
    html: "<div></div>",
    css: "",
    variables,
    accentColor: "#2563eb",
    tags: [],
    usesTailwind: false,
  };
}

describe("normalizeOfflineThemeValues", () => {
  it("replaces the built-in remote logo fallback with the bundled local logo", () => {
    const theme = makeTheme([
      {
        key: "logoUrl",
        label: "Logo URL",
        type: "text",
        defaultValue: "https://pub-670c665df90946a6b6292589e7c83911.r2.dev/make_church_easy.png",
      },
    ]);

    const result = normalizeOfflineThemeValues(theme, {
      logoUrl: "https://pub-670c665df90946a6b6292589e7c83911.r2.dev/make_church_easy.png",
    });

    expect(result.logoUrl).toContain("/logos/make_church_easy_logo.png");
    expect(result.logoUrl).toMatch(/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/logos\/make_church_easy_logo\.png$/);
  });

  it("generates a local QR data URI instead of relying on qrserver.com", () => {
    const theme = makeTheme([
      {
        key: "url",
        label: "URL",
        type: "text",
        defaultValue: "https://yourchurch.org/give",
      },
      {
        key: "qrUrl",
        label: "QR URL",
        type: "image",
        defaultValue: "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=https://yourchurch.org/give",
      },
    ]);

    const result = normalizeOfflineThemeValues(theme, {
      url: "https://give.example.org/offline",
      qrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=https://yourchurch.org/give",
    });

    expect(result.qrUrl.startsWith("data:image/svg+xml")).toBe(true);
    expect(result.qrUrl.includes("api.qrserver.com")).toBe(false);
  });
});

describe("localizeLowerThirdThemeAssets", () => {
  it("maps remote font imports to bundled local stylesheets", () => {
    const theme = makeTheme([]);
    theme.fontImports = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
    ];

    const result = localizeLowerThirdThemeAssets(theme);

    expect(result.fontImports).toEqual([
      "/fonts/google/google-fonts.css",
      "/fonts/fontawesome/all.min.css",
    ]);
  });

  it("replaces remote sample image defaults with local placeholders", () => {
    const theme = makeTheme([
      {
        key: "image",
        label: "Speaker Image",
        type: "image",
        defaultValue: "https://lh3.googleusercontent.com/aida-public/example-image",
      },
    ]);

    const result = localizeLowerThirdThemeAssets(theme);
    const localizedDefault = String(result.variables?.[0]?.defaultValue || "");

    expect(localizedDefault.startsWith("data:image/svg+xml")).toBe(true);
    expect(localizedDefault.includes("googleusercontent")).toBe(false);
  });
});
