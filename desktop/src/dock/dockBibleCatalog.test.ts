import { describe, expect, it } from "vitest";
import {
  detectActiveTranslationPrompt,
  getTranslationDirectiveSuggestions,
} from "./dockBibleCatalog";

describe("dockBibleCatalog — Active translation directive detection", () => {
  it("detects trailing @ trigger", () => {
    const prompt = detectActiveTranslationPrompt("jn3:16 @");
    expect(prompt).not.toBeNull();
    expect(prompt?.trigger).toBe("@");
    expect(prompt?.partial).toBe("");
    expect(prompt?.baseQuery).toBe("jn3:16");
    expect(prompt?.parsedBase?.book).toBe("John");
    expect(prompt?.parsedBase?.chapter).toBe(3);
    expect(prompt?.parsedBase?.verse).toBe(16);
  });

  it("detects glued @ trigger (j3.16@amp)", () => {
    const prompt = detectActiveTranslationPrompt("j3.16@amp");
    expect(prompt).not.toBeNull();
    expect(prompt?.trigger).toBe("@");
    expect(prompt?.partial).toBe("AMP");
    expect(prompt?.baseQuery).toBe("j3.16");
    expect(prompt?.parsedBase?.book).toBe("John");
    expect(prompt?.parsedBase?.chapter).toBe(3);
    expect(prompt?.parsedBase?.verse).toBe(16);
  });

  it("detects glued slash trigger (ps23/kjv)", () => {
    const prompt = detectActiveTranslationPrompt("ps23/kjv");
    expect(prompt).not.toBeNull();
    expect(prompt?.trigger).toBe("/");
    expect(prompt?.partial).toBe("KJV");
    expect(prompt?.baseQuery).toBe("ps23");
    expect(prompt?.parsedBase?.book).toBe("Psalms");

    const promptSpace = detectActiveTranslationPrompt("ps 23/kjv");
    expect(promptSpace?.parsedBase?.book).toBe("Psalms");
    expect(promptSpace?.parsedBase?.chapter).toBe(23);
  });

  it("detects trailing slash trigger (ps23/)", () => {
    const prompt = detectActiveTranslationPrompt("ps23/");
    expect(prompt).not.toBeNull();
    expect(prompt?.trigger).toBe("/");
    expect(prompt?.partial).toBe("");
    expect(prompt?.baseQuery).toBe("ps23");
    expect(prompt?.parsedBase?.book).toBe("Psalms");
  });

  it("detects tilde hot-swap trigger (rom 8:28 ~nlt)", () => {
    const prompt = detectActiveTranslationPrompt("rom 8:28 ~nlt");
    expect(prompt).not.toBeNull();
    expect(prompt?.trigger).toBe("~");
    expect(prompt?.partial).toBe("NLT");
    expect(prompt?.baseQuery).toBe("rom 8:28");
    expect(prompt?.parsedBase?.book).toBe("Romans");
    expect(prompt?.parsedBase?.chapter).toBe(8);
    expect(prompt?.parsedBase?.verse).toBe(28);
  });

  it("detects quick compare triggers (jn 3:16 // and jn 3:16 // msg)", () => {
    const emptyPrompt = detectActiveTranslationPrompt("jn 3:16 //");
    expect(emptyPrompt).not.toBeNull();
    expect(emptyPrompt?.trigger).toBe("//");
    expect(emptyPrompt?.partial).toBe("");

    const partialPrompt = detectActiveTranslationPrompt("jn 3:16 // msg");
    expect(partialPrompt).not.toBeNull();
    expect(partialPrompt?.trigger).toBe("//");
    expect(partialPrompt?.partial).toBe("MSG");
  });

  it("detects standalone directive triggers (@amp, ~msg, /esv)", () => {
    const atPrompt = detectActiveTranslationPrompt("@amp");
    expect(atPrompt).not.toBeNull();
    expect(atPrompt?.trigger).toBe("@");
    expect(atPrompt?.partial).toBe("AMP");
    expect(atPrompt?.baseQuery).toBe("");

    const tildePrompt = detectActiveTranslationPrompt("~msg");
    expect(tildePrompt?.trigger).toBe("~");
    expect(tildePrompt?.partial).toBe("MSG");

    const slashPrompt = detectActiveTranslationPrompt("/esv");
    expect(slashPrompt?.trigger).toBe("/");
    expect(slashPrompt?.partial).toBe("ESV");
  });

  it("returns null for non-directive scripture queries", () => {
    expect(detectActiveTranslationPrompt("jn 3:16")).toBeNull();
    expect(detectActiveTranslationPrompt("romans 8:28")).toBeNull();
    expect(detectActiveTranslationPrompt("psalm 23")).toBeNull();
  });
});

describe("dockBibleCatalog — getTranslationDirectiveSuggestions", () => {
  const installed = [
    { value: "KJV", label: "King James Version", language: "English" },
    { value: "NKJV", label: "New King James Version", language: "English" },
  ];

  it("ranks installed translations first followed by downloadable catalog translations", () => {
    const prompt = detectActiveTranslationPrompt("jn 3:16 @")!;
    const suggestions = getTranslationDirectiveSuggestions(prompt, installed, 6);

    expect(suggestions.length).toBeGreaterThanOrEqual(4);
    // Installed items first
    expect(suggestions[0].abbr).toBe("KJV");
    expect(suggestions[0].isInstalled).toBe(true);
    expect(suggestions[0].isDownloadable).toBe(false);

    expect(suggestions[1].abbr).toBe("NKJV");
    expect(suggestions[1].isInstalled).toBe(true);

    // Downloadable items follow
    const downloadable = suggestions.filter((s) => s.isDownloadable);
    expect(downloadable.length).toBeGreaterThan(0);
    expect(downloadable.some((d) => d.abbr === "AMP" || d.abbr === "NIV" || d.abbr === "NLT")).toBe(true);
  });

  it("filters suggestions by partial match (e.g. @a matches AMP, AMPC, ASV)", () => {
    const prompt = detectActiveTranslationPrompt("jn 3:16 @a")!;
    const suggestions = getTranslationDirectiveSuggestions(prompt, installed, 10);

    const abbrs = suggestions.map((s) => s.abbr);
    expect(abbrs).toContain("AMP");
    expect(abbrs).toContain("AMPC");
    expect(abbrs).toContain("ASV");
    expect(abbrs).not.toContain("MSG");
    expect(abbrs).not.toContain("KJV");
  });

  it("formats prompt label cleanly with canonical book name if resolved", () => {
    const prompt = detectActiveTranslationPrompt("j3.16@amp")!;
    const suggestions = getTranslationDirectiveSuggestions(prompt, installed, 5);

    const amp = suggestions.find((s) => s.abbr === "AMP");
    expect(amp).toBeDefined();
    expect(amp?.label).toBe("John 3:16 @amp");
  });
});
