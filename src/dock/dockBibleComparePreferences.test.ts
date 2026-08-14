import { describe, expect, it } from "vitest";
import { resolveInitialDockBibleCompareEnabled } from "./dockBibleComparePreferences";

describe("Dock Bible compare defaults", () => {
  it("starts disabled when no compare preference has been saved", () => {
    expect(resolveInitialDockBibleCompareEnabled({})).toBe(false);
    expect(resolveInitialDockBibleCompareEnabled({ displayMode: "single" })).toBe(false);
  });

  it("preserves an explicit saved choice", () => {
    expect(resolveInitialDockBibleCompareEnabled({ compareEnabled: false, displayMode: "compare" })).toBe(false);
    expect(resolveInitialDockBibleCompareEnabled({ compareEnabled: true })).toBe(true);
  });

  it("keeps the legacy compare display mode for existing preferences", () => {
    expect(resolveInitialDockBibleCompareEnabled({ displayMode: "compare" })).toBe(true);
  });
});
