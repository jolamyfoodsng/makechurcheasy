import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleTranslateUrl,
  GOOGLE_TRANSLATE_LANGUAGES,
  translateWithGoogleWeb,
} from "./googleTranslateWeb";

describe("googleTranslateWeb", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps African target languages in the local picker", () => {
    expect(GOOGLE_TRANSLATE_LANGUAGES).toEqual(expect.arrayContaining([
      { code: "ak", label: "Twi (Akan)" },
      { code: "yo", label: "Yoruba" },
      { code: "ig", label: "Igbo" },
    ]));
  });

  it("builds a Google Translate web URL with the lyric text filled in", () => {
    const url = new URL(buildGoogleTranslateUrl("Jesu Kristi wa pelu mi", "yo"));
    expect(url.hostname).toBe("translate.google.com");
    expect(url.searchParams.get("tl")).toBe("yo");
    expect(url.searchParams.get("text")).toBe("Jesu Kristi wa pelu mi");
    expect(url.searchParams.get("op")).toBe("translate");
  });

  it("reads translated segments from Google's public web response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[
        ["Jesu Kristi wa pelu mi", "Jesus Christ is with me"],
        [".", "."],
      ]],
    }));

    await expect(translateWithGoogleWeb("Jesus Christ is with me.", "yo"))
      .resolves.toBe("Jesu Kristi wa pelu mi.");
  });
});
