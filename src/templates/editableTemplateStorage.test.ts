import { describe, expect, it } from "vitest";
import { EDITABLE_TEMPLATE_LIBRARY } from "./editableTemplateCatalog";
import { createDockTemplateImageSnapshot } from "./editableTemplateStorage";

describe("editable template library", () => {
  it("contains only the new Weekly Activities template after the reset", () => {
    expect(EDITABLE_TEMPLATE_LIBRARY).toHaveLength(1);
    expect(EDITABLE_TEMPLATE_LIBRARY[0]).toMatchObject({
      id: "weekly-activities",
      name: "Weekly Activities",
      background: {
        previewImageUrl: "/templates/weekly-activities-source.png",
      },
    });
    expect(EDITABLE_TEMPLATE_LIBRARY[0].layers.filter((layer) => layer.kind === "text").map((layer) => layer.id)).toEqual([
      "weekly-title",
      "weekly-subtitle",
      "weekly-ribbon-copy",
      "weekly-days-heading",
      "weekly-activity-heading",
      "weekly-time-heading",
      "weekly-venue-heading",
      "weekly-tuesday-day",
      "weekly-tuesday-activity",
      "weekly-tuesday-time",
      "weekly-tuesday-venue",
      "weekly-thursday-day",
      "weekly-thursday-activity",
      "weekly-thursday-time",
      "weekly-thursday-venue",
      "weekly-sunday-day",
      "weekly-sunday-activity",
      "weekly-sunday-time",
      "weekly-sunday-venue",
      "weekly-location",
    ]);
  });
});

describe("editable template Dock handoff", () => {
  it("shares a flattened PNG image without editable layers or template text", () => {
    const snapshot = createDockTemplateImageSnapshot([
      {
        id: "saved-template",
        name: "Saved template",
        category: "Service",
        accentColor: "#A3155C",
        imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        width: 1600,
        height: 900,
        updatedAt: "2026-08-31T12:00:00.000Z",
      },
    ], "operator-1", 1000);

    const sharedData = JSON.stringify(snapshot);

    expect(snapshot).toMatchObject({
      version: 1,
      userId: "operator-1",
      updatedAt: 1000,
      templates: [{
        id: "saved-template",
        imageUrl: expect.stringMatching(/^data:image\/png;base64,/),
      }],
    });
    expect(snapshot).not.toHaveProperty("overrides");
    expect(sharedData).not.toContain("layers");
    expect(sharedData).not.toContain("Welcome to");
  });
});
