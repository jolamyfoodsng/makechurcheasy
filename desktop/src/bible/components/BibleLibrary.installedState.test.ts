import { describe, expect, it } from "vitest";
import bibleLibrarySource from "./BibleLibrary.tsx?raw";

describe("BibleLibrary installed browse-row state", () => {
  it("does not let already-installed catalog rows fall through to install/retry buttons", () => {
    expect(bibleLibrarySource).toContain(
      "const isInst = isCatalogBibleInstalled(installed, bible.id, abbr);",
    );
    expect(bibleLibrarySource).toContain("if (/already installed/i.test(message))");
    expect(bibleLibrarySource).toContain('next.delete(catalogId);');
  });
});
