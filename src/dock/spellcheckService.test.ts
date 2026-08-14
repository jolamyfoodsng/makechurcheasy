import { describe, expect, it } from "vitest";
import {
  findDockSpellingErrors,
  getCaseMatchedSuggestion,
  replaceDockSpellingErrors,
} from "./spellcheckService";

describe("dock spellcheck", () => {
  it("finds uppercase typos and suggests the correctly cased word", async () => {
    const errors = await findDockSpellingErrors("EXANPLE is on the screen.");

    expect(errors).toHaveLength(1);
    expect(errors[0]?.word).toBe("EXANPLE");
    expect(getCaseMatchedSuggestion(errors[0]!)).toBe("EXAMPLE");
  });

  it("replaces all suggested errors without changing correct words", async () => {
    const text = "This is an exanple for the church.";
    const errors = await findDockSpellingErrors(text);

    expect(replaceDockSpellingErrors(text, errors)).toBe("This is an example for the church.");
  });

  it("honors ignored words for lyrics and non-English names", async () => {
    const errors = await findDockSpellingErrors("Exanple Ọlọ́run", new Set(["exanple", "ọlọ́run"]));

    expect(errors).toEqual([]);
  });
});
