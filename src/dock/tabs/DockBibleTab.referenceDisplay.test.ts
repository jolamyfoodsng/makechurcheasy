import { describe, expect, it } from "vitest";
import dockBibleTabSource from "./DockBibleTab.tsx?raw";
import dockObsClientSource from "../dockObsClient.ts?raw";

describe("DockBibleTab reference display", () => {
  it("stores reference display controls in the dock and sends one label to every Bible overlay path", () => {
    expect(dockBibleTabSource).toContain('type BibleReferenceFormat = "full" | "short" | "hidden"');
    expect(dockBibleTabSource).toContain("referenceFormat?: BibleReferenceFormat");
    expect(dockBibleTabSource).toContain("referenceVersionVisible?: boolean");
    expect(dockBibleTabSource).toContain("buildBibleReferenceDisplayLabel");
    expect(dockBibleTabSource).toContain("bible.referenceDisplay");

    expect(dockBibleTabSource).toContain("displayReferenceLabel: referenceLabel");
    expect(dockBibleTabSource).toContain("referenceText: stageData.displayReferenceLabel as string | undefined");
    expect(dockObsClientSource).toContain("formatBibleReferenceDisplayText");
    expect(dockObsClientSource).toContain("data.displayReferenceLabel");
    expect(dockObsClientSource).toContain("displayReferenceLabel: refText");
  });

  it("does not put reference format controls inside the background picker", () => {
    expect(dockBibleTabSource).toContain("dock-bible-reference-popover");
    expect(dockBibleTabSource).toContain("dock-bible-reference-trigger");
    expect(dockBibleTabSource).not.toContain("<BackgroundPickerCard");
  });
});
