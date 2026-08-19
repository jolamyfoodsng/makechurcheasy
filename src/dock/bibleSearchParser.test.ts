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

  it.each([
    ["john55", "John 5:5"],
    ["joh 55", "John 5:5"],
    ["2john 55", "2 John 1:55"],
    ["2jhn 55", "2 John 1:55"],
  ])("keeps numbered John references distinct for %s", (query, expected) => {
    expect(parseBibleSearch(query)[0]?.label).toBe(expected);
  });

  it.each([
    ["1 Kings", "1 Kings"],
    ["1kings", "1 Kings"],
    ["I Kings", "1 Kings"],
    ["ikings", "1 Kings"],
    ["II Kings", "2 Kings"],
    ["I-I Kings", "2 Kings"],
    ["iikings", "2 Kings"],
  ])("recognizes numbered book form %s", (query, expectedBook) => {
    expect(parseBibleSearch(query)[0]?.label).toBe(expectedBook);
  });

  it.each([
    ["kings", ["1 Kings", "2 Kings"]],
    ["chronicles", ["1 Chronicles", "2 Chronicles"]],
    ["corinthians", ["1 Corinthians", "2 Corinthians"]],
  ])("suggests both numbered books for %s", (query, expectedBooks) => {
    expect(parseBibleSearch(query).map((result) => result.label)).toEqual(expectedBooks);
  });
});
