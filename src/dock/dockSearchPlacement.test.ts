import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCK_SEARCH_PLACEMENT,
  normalizeDockSearchPlacement,
} from "./dockSearchPlacement";

describe("Dock search placement", () => {
  it("defaults to the original top position", () => {
    expect(DEFAULT_DOCK_SEARCH_PLACEMENT).toBe("top");
    expect(normalizeDockSearchPlacement(undefined)).toBe("top");
  });

  it("accepts top and bottom and migrates the removed dual mode", () => {
    expect(normalizeDockSearchPlacement("top")).toBe("top");
    expect(normalizeDockSearchPlacement("bottom")).toBe("bottom");
    expect(normalizeDockSearchPlacement("both")).toBe("top");
    expect(normalizeDockSearchPlacement("left")).toBe("top");
  });
});
