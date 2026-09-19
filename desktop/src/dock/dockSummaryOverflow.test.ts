import { describe, expect, it } from "vitest";
import notesTabSource from "./tabs/DockNotesTab.tsx?raw";
import worshipTabSource from "./tabs/DockWorshipTab.tsx?raw";
import translationControlsSource from "./components/DockTranslationControls.tsx?raw";
import autoAdvanceSource from "./components/DockAutoAdvanceControl.tsx?raw";

describe("Worship and Notes summary overflow", () => {
  it("closes the overflow and nested panels as one interaction", () => {
    for (const source of [notesTabSource, worshipTabSource]) {
      expect(source).toContain("showCompactSummaryActions && (");
      expect(source).not.toContain("hidden={!showCompactSummaryActions}");
      expect(source).toContain("document.addEventListener(\"pointerdown\"");
      expect(source).toContain("[data-dock-keep-overflow-open='true']");
      expect(source).toContain("onClose={handleCompactSummaryChildClose}");
    }

    expect(translationControlsSource).toContain("onClose?: () => void;");
    expect(translationControlsSource).toContain("onClose?.();");
    expect(autoAdvanceSource).toContain("onClose?: () => void;");
    expect(autoAdvanceSource).toContain("onClose?.();");
  });
});
