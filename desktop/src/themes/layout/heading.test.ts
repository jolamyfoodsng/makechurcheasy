import { describe, expect, it } from "vitest";
import { hasHeading, headingLayers, isHeadingShown } from "./heading";
import type { ThemeLayer, ThemeLayout } from "./types";

const none = { preset: "none" as const, duration: 0, delay: 0, easing: "out-cubic" as const };
const layer = (l: Partial<ThemeLayer> & Pick<ThemeLayer, "id" | "type">): ThemeLayer => ({
  name: l.id, anchor: "top-left", x: 0, y: 0, w: 100, h: 50, style: {}, in: none, out: none, ...l,
});
const layout = (layers: ThemeLayer[], extra: Partial<ThemeLayout> = {}): ThemeLayout => ({ version: 1, format: "lower-third", layers, ...extra });

describe("headingLayers", () => {
  it("auto-detects non-verse token text as the heading", () => {
    const h = headingLayers(layout([
      layer({ id: "box", type: "box" }),
      layer({ id: "ref", type: "text", content: "{reference}" }),
      layer({ id: "verse", type: "text", content: "{text}" }),
      layer({ id: "fixed", type: "text", content: "Welcome" }),
    ]));
    expect([...h.text]).toEqual(["ref"]);
    expect([...h.decor]).toEqual([]);
  });

  it("uses the flags when any layer is flagged, including boxes", () => {
    const h = headingLayers(layout([
      layer({ id: "label-box", type: "box", heading: true }),
      layer({ id: "label", type: "text", content: "{reference}", heading: true, parentId: "label-box" }),
      layer({ id: "book", type: "text", content: "{book}" }),
      layer({ id: "verse", type: "text", content: "{text}" }),
    ]));
    expect([...h.text]).toEqual(["label"]);
    expect([...h.decor]).toEqual(["label-box"]);
  });

  it("heading: false opts a token text out of the automatic heading", () => {
    const l = layout([layer({ id: "ref", type: "text", content: "{reference}", heading: false })]);
    expect(headingLayers(l).text.size).toBe(0);
    expect(hasHeading(l)).toBe(false);
  });

  it("showHeading defaults to shown", () => {
    expect(isHeadingShown(layout([]))).toBe(true);
    expect(isHeadingShown(layout([], { showHeading: false }))).toBe(false);
  });
});
