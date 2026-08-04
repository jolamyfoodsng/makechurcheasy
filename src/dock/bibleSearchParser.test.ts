import { describe, expect, it } from "vitest";
import { parseBibleSearch } from "./bibleSearchParser";

describe("Bible reference search parser", () => {
  it("drops impossible compact verse candidates", () => {
    const labels = parseBibleSearch("j1633").map((result) => result.label);

    expect(labels).toEqual(["John 16:33"]);
  });

  it("drops impossible explicit verse candidates", () => {
    const labels = parseBibleSearch("John 1:633").map((result) => result.label);

    expect(labels).not.toContain("John 1:633");
  });

  it("keeps valid compact references", () => {
    const labels = parseBibleSearch("j316").map((result) => result.label);

    expect(labels).toContain("John 3:16");
  });
});
