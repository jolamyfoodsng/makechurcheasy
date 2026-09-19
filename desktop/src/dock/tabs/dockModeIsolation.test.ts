import { describe, expect, it } from "vitest";
import dockBibleTabSource from "./DockBibleTab.tsx?raw";
import dockWorshipTabSource from "./DockWorshipTab.tsx?raw";
import dockNotesTabSource from "./DockNotesTab.tsx?raw";

describe("Dock Overlay Mode Isolation (Bible, Worship, Notes)", () => {
  describe("DockBibleTab", () => {
    it("never links lower third quick theme settings to fullscreen in effective resolution", () => {
      // effectiveLowerThirdQuickThemeSettings must normalize lowerThirdQuickThemeSettings directly
      expect(dockBibleTabSource).toContain("const effectiveLowerThirdQuickThemeSettings = useMemo(() => {");
      expect(dockBibleTabSource).toContain("return normalizeLowerThirdFitSettings(\n      lowerThirdQuickThemeSettings ?? defaultLowerThirdQuickThemeSettings,\n    );");
      // Must not contain buildLinkedLowerThirdQuickThemeSettings
      expect(dockBibleTabSource).not.toContain("buildLinkedLowerThirdQuickThemeSettings");
    });

    it("does not null out lower third quick settings on initial load or hydration", () => {
      expect(dockBibleTabSource).toContain("const initialLowerThirdQuickThemeSettings = initialRawLowerThirdQuickThemeSettings;");
      expect(dockBibleTabSource).toContain("const storedLowerThirdQuickSettings = rawStoredLowerThirdQuickSettings;");
      expect(dockBibleTabSource).not.toContain("areQuickThemeSettingsEquivalent(initialFullscreenQuickThemeSettings, initialRawLowerThirdQuickThemeSettings)");
      expect(dockBibleTabSource).not.toContain("areQuickThemeSettingsEquivalent(storedQuickSettings, rawStoredLowerThirdQuickSettings)");
    });

    it("does not overwrite lower third settings when saving fullscreen quick theme", () => {
      const handleSaveFullscreenStart = dockBibleTabSource.indexOf("const handleSaveFullscreenQuickThemeSettings");
      const handleSaveFullscreenEnd = dockBibleTabSource.indexOf("const handleSaveLowerThirdQuickThemeSettings", handleSaveFullscreenStart);
      const handleSaveFullscreenBlock = dockBibleTabSource.slice(handleSaveFullscreenStart, handleSaveFullscreenEnd);

      expect(handleSaveFullscreenBlock).toContain("lowerThirdQuickThemeSettings: savedLowerThirdQuickThemeSettings");
      expect(handleSaveFullscreenBlock).not.toContain("setLowerThirdQuickThemeSettings(null)");
      expect(handleSaveFullscreenBlock).not.toContain("setSavedLowerThirdQuickThemeSettings(null)");
    });

    it("does not cross-copy backgrounds or erase font sizes on overlay mode change", () => {
      const handleModeChangeStart = dockBibleTabSource.indexOf("const handleOverlayModeChange = useCallback((nextMode: OverlayMode)");
      const handleModeChangeEnd = dockBibleTabSource.indexOf("saveDockBibleOverlayMode(nextMode);", handleModeChangeStart);
      const handleModeChangeBlock = dockBibleTabSource.slice(handleModeChangeStart, handleModeChangeEnd + 50);

      expect(handleModeChangeBlock).not.toContain("mergeQuickThemeBackground");
      expect(handleModeChangeBlock).toContain("setDraftBrowserQuickThemeSettings(null)");
      expect(handleModeChangeBlock).toContain("setDraftBrowserVerseLineCount(null)");
      expect(handleModeChangeBlock).toContain("setOverlayMode(nextMode)");
    });
  });

  describe("DockWorshipTab", () => {
    it("modifies only the active mode in handleWorshipQuickCommit", () => {
      const commitStart = dockWorshipTabSource.indexOf("const handleWorshipQuickCommit = useCallback(");
      const commitEnd = dockWorshipTabSource.indexOf("if (nextLineMode !== undefined", commitStart);
      const commitBlock = dockWorshipTabSource.slice(commitStart, commitEnd);

      expect(commitBlock).toContain("const isFullscreen = fullscreenOnlyMode || overlayMode === \"fullscreen\";");
      expect(commitBlock).toContain("if (isFullscreen) {");
      expect(commitBlock).toContain("setSavedFullscreenQuickThemeSettings(nextFullscreenSettings);");
      expect(commitBlock).toContain("setFullscreenQuickThemeSettings(nextFullscreenSettings);");
      expect(commitBlock).toContain("setSavedLowerThirdQuickThemeSettings(nextLowerThirdSettings);");
      expect(commitBlock).toContain("setLowerThirdQuickThemeSettings(nextLowerThirdSettings);");
    });

    it("never links lower third quick theme settings to fullscreen in effective resolution", () => {
      expect(dockWorshipTabSource).toContain("const effectiveLowerThirdQuickThemeSettings = useMemo(() => {");
      expect(dockWorshipTabSource).toContain("return normalizeLowerThirdFitSettings(\n      lowerThirdQuickThemeSettings ?? defaultLowerThirdQuickThemeSettings,\n    );");
      expect(dockWorshipTabSource).not.toContain("buildLinkedLowerThirdQuickThemeSettings");
    });

    it("does not null out lower third quick settings on hydration", () => {
      expect(dockWorshipTabSource).toContain("const storedLowerThirdQuickSettings = sanitizeQuickThemeSettings(");
      expect(dockWorshipTabSource).not.toContain("areQuickThemeSettingsEquivalent(storedFullscreenQuickSettings, rawStoredLowerThirdQuickSettings)");
    });

    it("does not overwrite lower third settings when saving fullscreen quick theme", () => {
      const handleSaveFullscreenStart = dockWorshipTabSource.indexOf("const handleSaveFullscreenQuickThemeSettings");
      const handleSaveFullscreenEnd = dockWorshipTabSource.indexOf("const handleSaveLowerThirdQuickThemeSettings", handleSaveFullscreenStart);
      const handleSaveFullscreenBlock = dockWorshipTabSource.slice(handleSaveFullscreenStart, handleSaveFullscreenEnd);

      expect(handleSaveFullscreenBlock).not.toContain("setSavedLowerThirdQuickThemeSettings(null)");
      expect(handleSaveFullscreenBlock).not.toContain("setLowerThirdQuickThemeSettings(null)");
    });

    it("does not cross-copy backgrounds or erase font sizes on overlay mode change", () => {
      const handleModeChangeStart = dockWorshipTabSource.indexOf("const handleOverlayModeChange = useCallback((nextMode: OverlayMode)");
      const handleModeChangeEnd = dockWorshipTabSource.indexOf("saveDockWorshipOverlayMode(nextMode);", handleModeChangeStart);
      const handleModeChangeBlock = dockWorshipTabSource.slice(handleModeChangeStart, handleModeChangeEnd + 300);

      expect(handleModeChangeBlock).not.toContain("mergeQuickThemeBackground");
      expect(handleModeChangeBlock).toContain("setOverlayMode(nextMode)");
      expect(handleModeChangeBlock).toContain("pendingQuickSettingsRefreshRef.current = true;");
    });
  });

  describe("DockNotesTab", () => {
    it("modifies only the active mode in handleNotesQuickCommit", () => {
      const commitStart = dockNotesTabSource.indexOf("const handleNotesQuickCommit = useCallback(");
      const commitEnd = dockNotesTabSource.indexOf("if (nextLineMode !== undefined", commitStart);
      const commitBlock = dockNotesTabSource.slice(commitStart, commitEnd);

      expect(commitBlock).toContain("const isFullscreen = overlayMode === \"fullscreen\";");
      expect(commitBlock).toContain("if (isFullscreen) {");
      expect(commitBlock).toContain("setFullscreenQuickSettings(nextFullscreenSettings);");
      expect(commitBlock).toContain("setLowerThirdQuickSettings(nextLowerThirdSettings);");
    });

    it("triggers live refresh on overlay mode change when a slide is active", () => {
      const handleModeChangeStart = dockNotesTabSource.indexOf("const handleOverlayModeChange = useCallback((nextMode: OverlayMode)");
      const handleModeChangeEnd = dockNotesTabSource.indexOf("saveDockNotesPreferences(prefs);", handleModeChangeStart);
      const handleModeChangeBlock = dockNotesTabSource.slice(handleModeChangeStart, handleModeChangeEnd + 300);

      expect(handleModeChangeBlock).toContain("if (overlayVisible && activeSlideIndex !== null) {");
      expect(handleModeChangeBlock).toContain("pendingQuickSettingsRefreshRef.current = true;");
      expect(handleModeChangeBlock).toContain("setQuickSettingsRefreshNonce((current) => current + 1);");
    });
  });
});
