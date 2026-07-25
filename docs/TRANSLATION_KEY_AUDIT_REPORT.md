# Translation Key Audit Report

**Scope:** `/Users/pc/Desktop/Code/makechurcheasy/desktop/src/`
**Date:** 2026-04-07
**Locale files:** `dock-en.json` (1,391 keys) and `app-en.json` (4,016 keys)
**Source files scanned:** 382 `.tsx`/`.ts` files
**Unique translation keys found in code:** 972
**Total `t()` call sites:** 1,457

---

## Summary

| Category | Count |
|----------|-------|
| Keys missing from BOTH locale files | **5** (CRITICAL) |
| Keys missing from dock-en.json only | **131** |
| Keys missing from app-en.json only | **732** |
| Keys present in both locale files | 135 |

---

## 1. CRITICAL: Keys Missing from BOTH dock-en.json AND app-en.json (5)

These keys will show raw key strings to users in the dock. **All 5 must be added to `dock-en.json` immediately.**

| Key | File(s) |
|-----|---------|
| `common.duplicate` | `dock/tabs/DockMultiviewTab.tsx` |
| `common.rename` | `dock/tabs/DockMultiviewTab.tsx` |
| `liveTools.refreshLiveTools` | `dock/tabs/DockLiveToolsTab.tsx` |
| `media.images` | `dock/tabs/DockMediaTab.tsx` |
| `page.mvLayouts` | `dock/DockPage.tsx` |

---

## 2. Keys Missing from dock-en.json (but present in app-en.json): 131 keys

These are used by dock source files but the translations only exist in `app-en.json`. If the dock uses `useDockTranslation` (which loads from `dock-en.json`), these will be missing. If the dock also has access to `app-en.json` keys, they may resolve at runtime -- but this depends on the i18next namespace configuration.

### 2a. Bible (1 key)

| Key | File |
|-----|------|
| `bible.selectFavoriteTheme` | `dock/components/DockBibleThemePicker.tsx` |

### 2b. Dock Bottom Toolbar (9 keys)

| Key | File |
|-----|------|
| `dock.bottomToolbar.collapseTooltip` | `dock/components/DockBottomToolbar.tsx` |
| `dock.bottomToolbar.expandTooltip` | `dock/components/DockBottomToolbar.tsx` |
| `dock.bottomToolbar.fullLabel` | `dock/components/DockBottomToolbar.tsx` |
| `dock.bottomToolbar.fullscreenTooltip` | `dock/components/DockBottomToolbar.tsx` |
| `dock.bottomToolbar.hideBible` | `dock/components/DockBottomToolbar.tsx` |
| `dock.bottomToolbar.lowerThirdTooltip` | `dock/components/DockBottomToolbar.tsx` |
| `dock.bottomToolbar.ltLabel` | `dock/components/DockBottomToolbar.tsx` |
| `dock.bottomToolbar.moreActions` | `dock/components/DockBottomToolbar.tsx` |
| `dock.bottomToolbar.overlayModeLabel` | `dock/components/DockBottomToolbar.tsx` |

### 2c. Dock Performance Tab (22 keys)

| Key | File |
|-----|------|
| `dock.performanceTab.active` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.backgroundPolling` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.backgroundPollingDesc` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.bibleEmbeddings` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.bibleEmbeddingsDesc` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.disableAnimations` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.disableLivePreviews` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.domNodeCount` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.domNodes` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.fps` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.fpsTrend` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.heapTrend` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.heapUsed` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.lowPower` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.memoryStatsUnavailable` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.minimum` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.normal` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.performanceMode` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.pollingSpeed` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.reactRoots` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.reducesCpuHint` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.slower` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.systemMetrics` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.title` | `dock/tabs/DockPerformanceTab.tsx` |
| `dock.performanceTab.topResourceConsumers` | `dock/tabs/DockPerformanceTab.tsx` |

### 2d. Tutorial Keys (99 keys across 7 tutorial systems)

These are used by main-app pages (not dock), but were detected as used in code that imports `useTranslation`. They are present in `app-en.json` but absent from `dock-en.json`.

**Dashboard Tutorial (dt.*):** 12 keys -- `pages/ProductionHomePage.tsx`, `pages/DashboardTutorial.tsx`

**Detail Tutorial (detailTutorial.*):** 7 keys -- `pages/TranscriptDetailPage.tsx`, `pages/TranscriptDetailTutorial.tsx`

**MultiView Gallery Tutorial (mgt.*):** 12 keys -- `pages/MultiViewGalleryPage.tsx`, `pages/MultiViewGalleryTutorial.tsx`

**Resources Tutorial (rt.*):** 12 keys -- `pages/ResourcesPage.tsx`, `pages/ResourcesTutorial.tsx`

**Service Planner Tutorial (spt.*):** 12 keys -- `pages/ServicePlannerPage.tsx`, `pages/ServicePlannerTutorial.tsx`

**Speech to Scripture Tutorial (stt.*):** 12 keys -- `pages/SpeechToScripturePage.tsx`, `pages/SpeechToScriptureTutorial.tsx`

**Theme Settings Tour (themeSettings.tour.*):** 8 keys -- `pages/ProductionThemeSettingsPage.tsx`, `pages/ThemeSettingsTour.tsx`

**Transcript Tutorial (tutorial.*):** 13 keys -- `pages/TranscriptLibraryPage.tsx`, `pages/TranscriptTutorial.tsx`

---

## 3. Keys Missing from app-en.json (but present in dock-en.json): 732 keys

These are dock-specific feature keys that exist in `dock-en.json` but not in `app-en.json`. If any main-app page (using `useTranslation`) tries to use these keys, they will be missing. The 732 keys break down as follows:

| Prefix | Count | Primary File(s) |
|--------|-------|-----------------|
| `auth.*` | 4 | `dock/DockAuthGate.tsx` |
| `bgPicker.*` | 52 | `dock/components/BackgroundPickerCard.tsx` |
| `bible.*` | 4 | `dock/tabs/DockBibleTab.tsx` |
| `common.*` | 29 | Multiple dock tabs |
| `countdowns.*` | 11 | `dock/tabs/DockCountdownsTab.tsx` |
| `dock.*` | 88 | `dock/DockPage.tsx` and dock tabs |
| `drop.*` | 3 | `dock/tabs/DockMediaTab.tsx` |
| `event.*` | 11 | `dock/tabs/DockEventTab.tsx` |
| `growth.*` | 18 | `dock/tabs/DockGrowthTab.tsx` |
| `liveTools.*` | 11 | `dock/tabs/DockLiveToolsTab.tsx` |
| `lowerThird.*` | 4 | `dock/tabs/DockLiveToolsTab.tsx` |
| `media.*` | 82 | `dock/tabs/DockMediaTab.tsx` |
| `ministry.*` | 54 | `dock/tabs/DockMinistryTab.tsx`, `dock/DockPage.tsx` |
| `multiview.*` | 29 | `dock/tabs/DockMultiviewTab.tsx` |
| `page.*` | 42 | `dock/DockPage.tsx` |
| `planner.*` | 31 | `dock/tabs/DockPlannerTab.tsx` |
| `sermon.*` | 124 | `dock/tabs/DockSermonTab.tsx` |
| `service.*` | 5 | `dock/tabs/DockServiceTab.tsx` |
| `themes.*` | 8 | `dock/components/DockThemeBrowserModal.tsx`, `dock/components/DockLTThemePicker.tsx` |
| `upgrade.*` | 3 | `dock/components/DockUpgradeModal.tsx` |
| `worship.*` | 63 | `dock/tabs/DockWorshipTab.tsx`, `dock/components/DockThemeSettingsModal.tsx` |

---

## 4. Template Literal Key Patterns (all verified safe)

Three dynamic `t()` patterns were found. All resolve to keys that exist in the locale files:

| Pattern | Source File | Resolves To |
|---------|-------------|-------------|
| `` t(`common.${align}`) `` | `BackgroundPickerCard.tsx` | `common.left`, `common.center`, `common.right`, etc. -- all exist in `dock-en.json` |
| `` t(`common.${a}`) `` | `DockMediaTab.tsx` | `common.sort`, `common.filter`, `common.pattern` -- all exist in `dock-en.json` |
| `` t(`dock.fullscreenThemeQuickSettings.preset${...}`) `` | `DockPage.tsx` | `dock.fullscreenThemeQuickSettings.preset1` through `preset8` -- all exist in `dock-en.json` |

No concatenated key patterns (`t(key + ".suffix")`) or alternative `i18n.t()` patterns were found.

---

## 5. Recommendations

### Immediate (blocks user-facing bugs)

1. **Add the 5 CRITICAL keys to `dock-en.json`:**
   - `common.duplicate` = "Duplicate"
   - `common.rename` = "Rename"
   - `liveTools.refreshLiveTools` = "Refresh Live Tools"
   - `media.images` = "Images"
   - `page.mvLayouts` = "Multi-View Layouts"

### Short-term

2. **Add the 25 `dock.bottomToolbar.*` and `dock.performanceTab.*` keys to `dock-en.json`** -- these are used by dock components that use `useDockTranslation`.

3. **Add `bible.selectFavoriteTheme` to `dock-en.json`** -- used by `DockBibleThemePicker.tsx`.

### Decision needed

4. **The 99 tutorial keys (dt.*, mgt.*, rt.*, spt.*, stt.*, tutorial.*, detailTutorial.*, themeSettings.tour.*)** are only used by main-app pages (not dock). They already exist in `app-en.json`. No action needed unless these pages also need to work in dock context.

5. **The 732 keys missing from app-en.json** are dock-only feature keys. They already exist in `dock-en.json`. No action needed unless main-app pages ever need to reference them.
