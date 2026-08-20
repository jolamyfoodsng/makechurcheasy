import { describe, expect, it } from "vitest";
import dockBibleTabSource from "./DockBibleTab.tsx?raw";
import dockObsClientSource from "../dockObsClient.ts?raw";
import bibleDockUiSource from "../components/BibleDockUI.tsx?raw";
import bottomToolbarSource from "../components/DockBottomToolbar.tsx?raw";
import backgroundPickerSource from "../components/BackgroundPickerCard.tsx?raw";

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

  it("keeps the bottom trigger and the theme settings card on the same preferences", () => {
    expect(dockBibleTabSource).toContain("dock-bible-reference-popover");
    expect(dockBibleTabSource).toContain("dock-bible-reference-trigger");
    expect(dockBibleTabSource).toContain("referenceFormat={referenceFormat}");
    expect(dockBibleTabSource).toContain("referenceVersionVisible={referenceVersionVisible}");
    expect(backgroundPickerSource).toContain("ReferenceDisplaySection");
    expect(backgroundPickerSource).toContain("bible.referenceFormatFull");
    expect(backgroundPickerSource).toContain("bible.showBibleVersion");
  });

  it("groups Bible and reference size controls and supports manual save mode", () => {
    expect(dockBibleTabSource).toContain("displayedBrowserFontSettings");
    expect(dockBibleTabSource).toContain("browserQuickUpdateImmediately");
    expect(dockBibleTabSource).toContain("saveBrowserQuickSettings");
    expect(dockBibleTabSource).toContain("referenceBackgroundEnabled");
    expect(dockBibleTabSource).toContain("handleBrowserVerseLineCountChange");
    expect(dockBibleTabSource).toContain("Bible output controls");
    expect(dockBibleTabSource).toContain("Bible verse");
    expect(dockBibleTabSource).toContain("Reference background");
    expect(dockBibleTabSource).toContain("Lines per verse");
    expect(dockBibleTabSource).toContain("dock-bible-reader__font-size-field-row");
    expect((dockBibleTabSource.match(/dock-bible-reader__font-size-field-row/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(dockBibleTabSource).toContain("QuickFontSizeInput");
    expect(dockBibleTabSource).toContain("bible.sizeLg");
    expect(dockBibleTabSource).toContain("bible.sizeXl");
    expect(dockBibleTabSource).toContain("bible.sizeXxl");
    expect(dockBibleTabSource).toContain('width: "xxl"');
    expect(dockBibleTabSource).toContain('width: "xl"');
    expect(dockBibleTabSource).toContain('width: "lg"');
    expect(dockBibleTabSource).toContain("Larger text and reference; narrower text area.");
    expect(dockBibleTabSource).toContain("preset.fontSize");
    expect(dockBibleTabSource).toContain("preset.refFontSize");
    expect(dockBibleTabSource).toContain("lineHeight: preset.lineHeight");
    expect(dockBibleTabSource).toContain("refSpacing: preset.refSpacing");
    expect(dockBibleTabSource).toContain("const isFitTextMode = true;");
    expect(dockBibleTabSource).not.toContain("onClick={() => onApplyPatch({ autoFontScale: !settings.autoFontScale })}");
    expect(dockBibleTabSource).toContain("{isFitTextMode && (");
    expect(dockBibleTabSource).toContain("{!isFitTextMode && (");
    expect(dockBibleTabSource).toContain("Update Immediately");
    expect(dockBibleTabSource).toContain("hasPendingBrowserQuickChanges");
    expect(dockBibleTabSource).toContain("patch.compareVerseFontSizeLeft = nextCompareSize");
    expect(dockBibleTabSource).toContain("patch.compareVerseFontSizeRight = nextCompareSize");
    expect(dockBibleTabSource).toContain("patch.compareAutoFitMaxFontSize = nextCompareSize");
    expect(dockBibleTabSource).toContain("patch.compareReferenceFontSizeLeft = nextCompareRefSize");
    expect(dockBibleTabSource).toContain("patch.compareReferenceFontSizeRight = nextCompareRefSize");
  });

  it("carries the selected quick settings into every verse navigation path", () => {
    expect(dockBibleTabSource).toContain("const liveFullscreenThemeSettings = liveFullscreenThemeSettingsRef.current");
    expect(dockBibleTabSource).toContain("const liveLowerThirdThemeSettings = liveLowerThirdThemeSettingsRef.current");
    expect(dockBibleTabSource).toContain("bibleThemeSettings: liveThemeSettings as unknown as Record<string, unknown>");
    expect(dockBibleTabSource).toContain("liveFullscreenThemeSettingsRef.current = applyFullscreenQuickThemeSettings");
    expect(dockBibleTabSource).toContain("liveLowerThirdThemeSettingsRef.current = applyLowerThirdQuickThemeSettings");
  });

  it("uses the Bible toolbar arrows for previous and next chapter navigation", () => {
    expect(dockBibleTabSource).toContain("const handleChapterJump = useCallback");
    expect(dockBibleTabSource).toContain("selectedChapterRef.current = nextChapter");
    expect(dockBibleTabSource).toContain("persistDockBiblePreferencesNow({ selectedChapter: nextChapter })");
    expect(dockBibleTabSource).toContain("handleChapterJump(-1)");
    expect(dockBibleTabSource).toContain("handleChapterJump(1)");
    expect(dockBibleTabSource).toContain('if (event.key === "ArrowRight")');
    expect(dockBibleTabSource).toContain('} else if (event.key === "ArrowLeft")');
    expect(dockBibleTabSource).toContain('} else if (event.key === "ArrowDown")');
    expect(dockBibleTabSource).toContain('} else if (event.key === "ArrowUp")');
    expect(dockBibleTabSource).toContain('title={t("bible.previousChapter", "Previous chapter")}');
    expect(dockBibleTabSource).toContain('title={t("bible.nextChapter", "Next chapter")}');
    expect(bibleDockUiSource).toContain("dock-bible-controls__chapter-nav");
    expect(bibleDockUiSource).toContain("onPreviousChapter");
    expect(bibleDockUiSource).toContain("onNextChapter");
    expect(bottomToolbarSource).toContain("dock-btm-toolbar__center--collapsed");
  });

  it("keeps Bible keyboard navigation functional without a visible shortcut cue", () => {
    expect(dockBibleTabSource).toContain("const BIBLE_BOOK_ORDER = [...OT_BOOKS, ...NT_BOOKS]");
    expect(dockBibleTabSource).toContain("const handleBookJump = useCallback");
    expect(dockBibleTabSource).toContain("event.shiftKey && event.key === \"ArrowRight\"");
    expect(dockBibleTabSource).toContain("event.shiftKey && event.key === \"ArrowLeft\"");
    expect(dockBibleTabSource).toContain("handleBookJump(1)");
    expect(dockBibleTabSource).toContain("handleBookJump(-1)");
    expect(bibleDockUiSource).not.toContain("dock-bible-controls__keyboard-cue");
  });

  it("persists the draggable Quick handle position", () => {
    expect(dockBibleTabSource).toContain("quickActionsTop?: number");
    expect(dockBibleTabSource).toContain("quickActionsLeft?: number | null");
    expect(dockBibleTabSource).toContain("browserQuickUpdateImmediately?: boolean");
    expect(dockBibleTabSource).toContain("readDockPreference<DockBibleUiPreferences>(DOCK_BIBLE_UI_PREFS_KEY)");
    expect(dockBibleTabSource).toContain("void saveDockPreference(DOCK_BIBLE_UI_PREFS_KEY, next)");
    expect(dockBibleTabSource).toContain("clampQuickActionsTop");
    expect(dockBibleTabSource).toContain("clampQuickActionsLeft");
    expect(dockBibleTabSource).toContain("snapQuickActionsLeft");
    expect(dockBibleTabSource).toContain("getDefaultQuickActionsTop");
    expect(dockBibleTabSource).toContain("quickActionsNeedsInitialCenterRef");
    expect(dockBibleTabSource).toContain("quickActionsContainerRef");
    expect(dockBibleTabSource).toContain("useLayoutEffect");
    expect(dockBibleTabSource).toContain("handleQuickActionsPointerDown");
    expect(dockBibleTabSource).toContain("persistQuickActionsPosition(nextTop, nextLeft)");
    expect(dockBibleTabSource).toContain("saveDockBibleUiPreferencePatch({ browserQuickUpdateImmediately: checked })");
    expect(dockBibleTabSource).toContain("quickActionsLeft !== null ? { left: `${quickActionsLeft}px`, right: \"auto\" } : {}");
  });
});
