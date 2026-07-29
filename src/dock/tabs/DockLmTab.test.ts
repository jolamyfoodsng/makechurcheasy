import { describe, expect, it } from "vitest";
import { isLmAutoPushSuppressed, normalizeLmOverlayMode } from "./DockLmTab";

describe("DockLmTab settings helpers", () => {
  it("normalizes overlay mode values", () => {
    expect(normalizeLmOverlayMode("lower-third")).toBe("lower-third");
    expect(normalizeLmOverlayMode("fullscreen")).toBe("fullscreen");
    expect(normalizeLmOverlayMode("bad-mode", "lower-third")).toBe("lower-third");
  });

  it("suppresses repeated auto-pushes only inside the configured window", () => {
    expect(isLmAutoPushSuppressed(undefined, 10_000, 15)).toBe(false);
    expect(isLmAutoPushSuppressed(1_000, 10_000, 15)).toBe(true);
    expect(isLmAutoPushSuppressed(1_000, 20_000, 15)).toBe(false);
    expect(isLmAutoPushSuppressed(1_000, 10_000, 0)).toBe(false);
  });
});
