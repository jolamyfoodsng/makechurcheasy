import { describe, expect, it } from "vitest";
import { getTextLayerLayout } from "./TemplateCanvas";
import type { TemplateTextLayer } from "./editableTemplateCatalog";

function singleLineLayer(overrides: Partial<TemplateTextLayer> = {}): TemplateTextLayer {
  return {
    id: "title",
    kind: "text",
    x: 120,
    y: 80,
    width: 180,
    height: 160,
    text: "DEEPER WATERS",
    fill: "#FFFFFF",
    fontSize: 180,
    fontFamily: "sans-serif",
    wrap: "none",
    scaleX: 1,
    ...overrides,
  };
}

describe("template canvas text layout", () => {
  it("grows a single-line text frame to its words instead of clipping them to the old width", () => {
    const layout = getTextLayerLayout(singleLineLayer());

    expect(layout.width).toBeGreaterThan(180);
    expect(layout.scaleX).toBe(1);
  });

  it("keeps long single-line titles at their natural width instead of squeezing them", () => {
    const layout = getTextLayerLayout(singleLineLayer({ x: 1080, text: "A VERY LONG SERVICE TITLE" }));

    expect(layout.scaleX).toBe(1);
    expect(layout.width).toBeGreaterThan(1600 - 1080 - 12);
  });

  it("retains a supplied condensed treatment only when the template explicitly opts in", () => {
    expect(getTextLayerLayout(singleLineLayer({ scaleX: 0.82 })).scaleX).toBe(1);
    expect(getTextLayerLayout(singleLineLayer({ scaleX: 0.82, preserveScaleX: true })).scaleX).toBe(0.82);
  });
});
