import { describe, expect, it } from "vitest";
import {
  deriveBibleAbbr,
  isCatalogBibleInstalled,
  normalizeBibleAbbr,
} from "./bibleInstallService";
import type { CatalogBible, InstalledBible } from "./types";

function installed(overrides: Partial<InstalledBible>): Pick<InstalledBible, "id" | "abbr"> {
  return {
    id: overrides.id ?? "installed-id",
    abbr: overrides.abbr ?? "KJV",
  };
}

function catalog(overrides: Partial<CatalogBible>): CatalogBible {
  return {
    id: overrides.id ?? "catalog-id",
    name: overrides.name ?? "King James Version",
    language: overrides.language ?? "English",
    country: overrides.country ?? "US",
    version: overrides.version ?? "KJV",
    filename: overrides.filename ?? "kjv.xml",
    filesize: overrides.filesize ?? 1024,
    sha256: overrides.sha256 ?? "",
  };
}

describe("Bible install helpers", () => {
  it("normalizes Bible abbreviations before duplicate checks", () => {
    expect(normalizeBibleAbbr(" b ")).toBe("B");
  });

  it("treats a catalog row as installed when the abbreviation already exists", () => {
    expect(
      isCatalogBibleInstalled(
        [installed({ id: "different-catalog-id", abbr: "B" })],
        "new-catalog-id",
        " b ",
      ),
    ).toBe(true);
  });

  it("still treats a catalog row as installed when the catalog id matches", () => {
    expect(
      isCatalogBibleInstalled(
        [installed({ id: "same-catalog-id", abbr: "OTHER" })],
        "same-catalog-id",
        "B",
      ),
    ).toBe(true);
  });

  it("derives normalized abbreviations from catalog versions", () => {
    expect(deriveBibleAbbr(catalog({ version: " b " }))).toBe("B");
  });
});
