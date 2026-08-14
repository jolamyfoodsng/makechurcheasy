import { describe, expect, it } from "vitest";
import {
  buildInstalledTranslationOptions,
  resolveInstalledTranslation,
} from "./bibleTranslationAvailability";

describe("Bible translation availability", () => {
  it("builds the compare list from installed metadata only", () => {
    expect(buildInstalledTranslationOptions([
      { abbr: "asv", name: "American Standard Version", language: "English" },
      { abbr: "ASV", name: "Duplicate ASV" },
    ])).toEqual([
      { value: "KJV", label: "King James Version", language: "English" },
      { value: "ASV", label: "American Standard Version", language: "English" },
    ]);
  });

  it("falls back when a saved comparison translation is no longer installed", () => {
    const installed = buildInstalledTranslationOptions([{ abbr: "ASV", name: "American Standard Version" }]);
    expect(resolveInstalledTranslation("NIV", installed)).toBe("KJV");
    expect(resolveInstalledTranslation("ASV", installed)).toBe("ASV");
  });
});
