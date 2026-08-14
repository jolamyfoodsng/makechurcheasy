import { describe, expect, it } from "vitest";
import { getAutoAdvanceIndex } from "./DockAutoAdvanceControl";

describe("dock auto-advance queue", () => {
  it("advances until the last item, then stops", () => {
    expect(getAutoAdvanceIndex(0, 3, "stop")).toBe(1);
    expect(getAutoAdvanceIndex(1, 3, "stop")).toBe(2);
    expect(getAutoAdvanceIndex(2, 3, "stop")).toBeNull();
  });

  it("wraps around when looping is enabled", () => {
    expect(getAutoAdvanceIndex(2, 3, "loop")).toBe(0);
    expect(getAutoAdvanceIndex(1, 3, "loop", 4)).toBe(2);
  });

  it("rejects an invalid queue position", () => {
    expect(getAutoAdvanceIndex(-1, 3, "stop")).toBeNull();
    expect(getAutoAdvanceIndex(3, 3, "loop")).toBeNull();
    expect(getAutoAdvanceIndex(0, 0, "loop")).toBeNull();
  });
});
