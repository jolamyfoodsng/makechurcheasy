import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import LoadingScreen from "../components/LoadingScreen";
import type { BibleTheme } from "../bible/types";
import { deleteCustomTheme } from "../bible/bibleDb";
import ThemeCreatorModal from "./ThemeCreatorModal";
import ThemePreviewSurface from "../components/ThemePreviewSurface";
import ThemeLayoutPreview from "../themes/layout/ThemeLayoutPreview";
import { getThemeLayout } from "../themes/layout/presetThemes";
import { dockBridge } from "../services/dockBridge";
import {
  type ThemeLibrary,
  addThemeToLibrary,
  isThemeInLibrary,
  loadThemeLibrary,
  removeThemeFromLibrary,
} from "../services/themeLibrary";
import { NEW_USER_THEME_IDS } from "../themes/layout/presetThemes";
import {
  type DockThemeOptOuts,
  isThemeHiddenFromDock,
  loadDockThemeOptOuts,
  setThemeHiddenFromDock,
  withThemeHidden,
} from "../services/dockThemeAvailability";
import {
  type DockProductionSettingsPayload,
  type ProductionSettings,
  getDefaultProductionSettings,
  getProductionSettings,
  loadAvailableProductionThemes,
  resolveProductionSettings,
  saveProductionSettings,
  syncProductionSettingsToDock,
} from "../services/productionSettings";
import { useThemeCreateGate } from "../hooks/useThemeCreateGate";
import { lockedThemeMessage, planLockedThemeIds } from "../themes/planLocks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusTone = "success" | "error";

interface StatusMessage {
  tone: StatusTone;
  text: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortThemesForDisplay(themes: BibleTheme[]): BibleTheme[] {
  return [...themes].sort((left, right) => {
    if (left.source === "custom" && right.source !== "custom") return -1;
    if (left.source !== "custom" && right.source === "custom") return 1;
    if (left.source === "custom" && right.source === "custom") {
      return (
        new Date(right.updatedAt || right.createdAt).getTime() -
        new Date(left.updatedAt || left.createdAt).getTime()
      );
    }
    return left.name.localeCompare(right.name);
  });
}

function toPlainSettings(payload: DockProductionSettingsPayload): ProductionSettings {
  return {
    updatedAt: payload.updatedAt,
    bible: {
      defaultMode: payload.bible.defaultMode,
      fullscreenThemeId: payload.bible.fullscreenTheme.id,
      lowerThirdThemeId: payload.bible.lowerThirdTheme.id,
    },
    worship: {
      defaultMode: payload.worship.defaultMode,
      fullscreenThemeId: payload.worship.fullscreenTheme.id,
      lowerThirdThemeId: payload.worship.lowerThirdTheme.id,
    },
    notes: {
      defaultMode: (payload.notes ?? payload.worship).defaultMode,
      fullscreenThemeId: (payload.notes ?? payload.worship).fullscreenTheme.id,
      lowerThirdThemeId: (payload.notes ?? payload.worship).lowerThirdTheme.id,
    },
  };
}

type ThemeTarget = "bible" | "worship" | "notes";
const THEME_TARGETS: ThemeTarget[] = ["bible", "worship", "notes"];
type ThemeSort = "newest" | "oldest" | "name" | "in-use";

function themeTime(theme: BibleTheme): number {
  const time = new Date(theme.createdAt || theme.updatedAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function matchesThemeSearch(theme: BibleTheme, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [theme.name, theme.description ?? "", ...(theme.categories ?? [])]
    .some((value) => value.toLowerCase().includes(q));
}

function alignSettingsToThemes(
  settings: ProductionSettings,
  themes: BibleTheme[],
): ProductionSettings {
  return toPlainSettings(resolveProductionSettings(settings, themes));
}

/** Lower third or full screen, also for layout themes (their layout says which). */
function themeFormat(theme: BibleTheme): "lower-third" | "fullscreen" {
  const layout = getThemeLayout(theme);
  if (layout) return layout.format;
  return theme.templateType === "lower-third" ? "lower-third" : "fullscreen";
}

type ThemeLook = "lower-third" | "fullscreen";
type ThemeSlot = "lowerThirdThemeId" | "fullscreenThemeId";

/** True when the theme has both a full-screen and a lower-third look. */
function hasBothLooks(theme: BibleTheme): boolean {
  return Boolean(theme.variants?.fullscreen && theme.variants?.lowerThird);
}

/** Can this theme be shown in the given look? */
function themeHasLook(theme: BibleTheme, look: ThemeLook): boolean {
  return hasBothLooks(theme) || themeFormat(theme) === look;
}

/** The layout to preview for a look (layout themes only). */
function themeLayoutFor(theme: BibleTheme, look: ThemeLook) {
  const variant = look === "fullscreen" ? theme.variants?.fullscreen : theme.variants?.lowerThird;
  return variant?.settings?.layout ?? getThemeLayout(theme);
}

/** Settings slots a theme fills when picked: both looks when it has them. */
function themeSlots(theme: BibleTheme): ThemeSlot[] {
  if (hasBothLooks(theme)) return ["lowerThirdThemeId", "fullscreenThemeId"];
  return [themeFormat(theme) === "lower-third" ? "lowerThirdThemeId" : "fullscreenThemeId"];
}

function themePreviewBackground(theme: BibleTheme): string {
  const backgroundImage = theme.settings.backgroundImage?.trim();
  if (backgroundImage) {
    return `rgba(7, 12, 22, 0.4) url(${backgroundImage}) center/cover`;
  }
  return theme.settings.backgroundColor;
}

export default function ProductionThemeSettingsPage() {
  const { t } = useTranslation();
  const themeGate = useThemeCreateGate();

  const [loading, setLoading] = useState(true);
  const [themes, setThemes] = useState<BibleTheme[]>([]);
  const [settings, setSettings] = useState<ProductionSettings>(getDefaultProductionSettings);
  const [editingTheme, setEditingTheme] = useState<BibleTheme | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [pendingDeleteTheme, setPendingDeleteTheme] = useState<BibleTheme | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [storedSettings, availableThemes] = await Promise.all([
        getProductionSettings(),
        loadAvailableProductionThemes(),
      ]);

      setThemes(availableThemes);
      setSettings(alignSettingsToThemes(storedSettings, availableThemes));
    } catch (err) {
      console.error("[ProductionThemeSettingsPage] Failed to load production settings:", err);
      setStatus({
        tone: "error",
        text: t("themes.loadError", "Failed to load themes"),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 3500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const customThemes = useMemo(
    () => themes.filter((theme) => theme.source === "custom"),
    [themes],
  );

  // Every built-in theme: the layout lower thirds (Chapter Number, Caption Rule,
  // Scripture Tab…) first, then the classic ones.
  const builtinThemes = useMemo(() => {
    const builtins = themes.filter((theme) => theme.source !== "custom");
    const layout = builtins.filter((theme) => Boolean(getThemeLayout(theme)));
    const classic = builtins.filter((theme) => !getThemeLayout(theme));
    return [...layout, ...classic];
  }, [themes]);

  // Every ready-made theme has both looks; this only picks which one the cards show.
  const [previewLook, setPreviewLook] = useState<ThemeLook>("lower-third");

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ThemeSort>("newest");
  // Your own themes are in the Dock's Bible, Worship and Notes tabs from the moment they exist.
  // Nothing to switch on: this only holds the ones someone chose to hide.
  const [dockOptOuts, setDockOptOuts] = useState<DockThemeOptOuts>({});
  useEffect(() => {
    let cancelled = false;
    void loadDockThemeOptOuts().then((stored) => {
      if (!cancelled) setDockOptOuts(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // New accounts start with three ready-made themes; the rest wait in the Theme Library until added.
  // `null` = nothing stored yet (everything is shown, as before the library existed).
  const [library, setLibrary] = useState<ThemeLibrary | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadThemeLibrary().then((stored) => {
      if (!cancelled) setLibrary(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeLibrary = useCallback(
    async (themeId: string, add: boolean) => {
      try {
        setLibrary(await (add ? addThemeToLibrary(themeId) : removeThemeFromLibrary(themeId)));
      } catch (err) {
        console.error("[ProductionThemeSettingsPage] Failed to change the theme library:", err);
        setLibrary(await loadThemeLibrary());
        setStatus({
          tone: "error",
          text: t("themes.libraryChangeFailed", "Could not change your themes"),
        });
      }
    },
    [t],
  );

  const setHiddenFromDock = useCallback(
    async (themeId: string, hidden: boolean) => {
      // Show the change at once; the saved list replaces it when the write finishes.
      setDockOptOuts((current) => withThemeHidden(current, themeId, hidden));
      try {
        setDockOptOuts(await setThemeHiddenFromDock(themeId, hidden));
      } catch (err) {
        console.error("[ProductionThemeSettingsPage] Failed to save Dock theme visibility:", err);
        setDockOptOuts(await loadDockThemeOptOuts());
        setStatus({
          tone: "error",
          text: t("themes.dockVisibilityFailed", "Could not change whether this theme shows in the Dock"),
        });
      }
    },
    [t],
  );

  const isThemeInUse = (theme: BibleTheme, target: ThemeTarget): boolean =>
    themeSlots(theme).every((slot) => settings[target]?.[slot] === theme.id);

  // Ready-made themes past the plan's allowance are locked (the first N stay open); a theme that is
  // already in use stays usable. Your own themes are never locked.
  const lockedThemeIds = planLockedThemeIds(
    themes,
    themeGate.themeLimit,
    themes.filter((theme) => THEME_TARGETS.some((target) => isThemeInUse(theme, target))).map((theme) => theme.id),
  );

  const sortThemes = (list: BibleTheme[]): BibleTheme[] => {
    // Array.sort is stable, so ties keep the curated order.
    const sorted = [...list];
    if (sortBy === "newest") sorted.sort((a, b) => themeTime(b) - themeTime(a));
    else if (sortBy === "oldest") sorted.sort((a, b) => themeTime(a) - themeTime(b));
    else if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else {
      const used = (theme: BibleTheme) => THEME_TARGETS.some((target) => isThemeInUse(theme, target)) ? 0 : 1;
      sorted.sort((a, b) => used(a) - used(b));
    }
    return sorted;
  };

  // A theme that is selected for Bible, Worship or Notes always stays in My Themes.
  const isThemeUsedAnywhere = (theme: BibleTheme): boolean => THEME_TARGETS.some((target) => isThemeInUse(theme, target));
  const isInMyThemes = (theme: BibleTheme): boolean => isThemeInLibrary(library, theme.id) || isThemeUsedAnywhere(theme);
  const libraryActive = library?.mode === "curated";
  const visibleBuiltinThemes = sortThemes(
    builtinThemes.filter((theme) => isInMyThemes(theme) && themeHasLook(theme, previewLook) && matchesThemeSearch(theme, searchQuery)),
  );
  const libraryThemes = sortThemes(
    builtinThemes.filter((theme) => !isInMyThemes(theme) && themeHasLook(theme, previewLook) && matchesThemeSearch(theme, searchQuery)),
  );
  const visibleCustomThemes = sortThemes(
    customThemes.filter((theme) => matchesThemeSearch(theme, searchQuery)),
  );

  // ---------------------------------------------------------------------------
  // Settings persistence
  // ---------------------------------------------------------------------------

  const persistSettings = useCallback(
    async (nextSettings: ProductionSettings, successText: string, themePool = themes) => {
      const aligned = alignSettingsToThemes(nextSettings, themePool);
      const saved = await saveProductionSettings(aligned);
      const dockPayload = await syncProductionSettingsToDock(saved);
      dockBridge.sendFullState({ productionSettings: dockPayload });
      setSettings(saved);
      setStatus({ tone: "success", text: successText });
    },
    [themes],
  );

  const handleThemeSaved = useCallback(
    async (theme: BibleTheme) => {
      const isEditing = Boolean(editingTheme);
      const nextThemes = sortThemesForDisplay([
        ...themes.filter((item) => item.id !== theme.id),
        theme,
      ]);

      setThemes(nextThemes);
      setShowCreator(false);
      setEditingTheme(null);

      try {
        const nextSettings = alignSettingsToThemes(settings, nextThemes);
        await persistSettings(
          nextSettings,
          isEditing
            ? t("themes.themeUpdated", { name: theme.name })
            : t("themes.themeCreated", { name: theme.name }),
          nextThemes,
        );
      } catch (err) {
        console.error(
          "[ProductionThemeSettingsPage] Failed to sync production settings after theme save:",
          err,
        );
        setSettings((current) => alignSettingsToThemes(current, nextThemes));
        setStatus({
          tone: "error",
          text: t("themes.themeSavedSyncFailed", "Theme saved, but failed to sync"),
        });
      }
    },
    [editingTheme, persistSettings, settings, themes, t],
  );

  const handleDeleteTheme = useCallback((theme: BibleTheme) => {
    setPendingDeleteTheme(theme);
  }, []);

  const confirmDeleteTheme = useCallback(async () => {
    const theme = pendingDeleteTheme;
    if (!theme) return;

    try {
      await deleteCustomTheme(theme.id);
      const nextThemes = themes.filter((item) => item.id !== theme.id);
      setThemes(nextThemes);
      const nextSettings = alignSettingsToThemes(settings, nextThemes);
      await persistSettings(
        nextSettings,
        t("themes.themeDeleted", { name: theme.name }),
        nextThemes,
      );
    } catch (err) {
      console.error("[ProductionThemeSettingsPage] Failed to delete custom theme:", err);
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : t("themes.deleteFailed", "Failed to delete theme"),
      });
    } finally {
      setPendingDeleteTheme(null);
    }
  }, [pendingDeleteTheme, persistSettings, settings, themes, t]);

  const startCustomising = async (theme: BibleTheme) => {
    if (lockedThemeIds.has(theme.id)) {
      themeGate.promptLocked(lockedThemeMessage(themeGate.themeLimit));
      return;
    }
    if (!(await themeGate.guard())) return;
    setEditingTheme({
      ...theme,
      id: `custom-${theme.id}-${Date.now().toString(36)}`,
      name: t("themes.copyName", { name: theme.name, defaultValue: `${theme.name} (my copy)` }),
      source: "custom",
    });
    setShowCreator(true);
  };

  const renderThemeCard = (theme: BibleTheme, fromLibrary = false) => {
    const look: ThemeLook = themeHasLook(theme, previewLook) ? previewLook : themeFormat(theme);
    const layout = themeLayoutFor(theme, look);
    const inUse = THEME_TARGETS.filter((target) => isThemeInUse(theme, target));
    const planLocked = lockedThemeIds.has(theme.id);
    return (
      <article key={theme.id} className={`production-theme-card${planLocked ? " production-theme-card--locked" : ""}`}>
        <ThemePreviewSurface
          className="production-theme-card__preview"
          videoSrc={theme.settings.backgroundVideo}
          posterSrc={theme.settings.backgroundImage}
          style={{
            background: layout
              ? "linear-gradient(135deg, #273246 0%, #10151f 100%)"
              : themePreviewBackground(theme),
            color: theme.settings.fontColor,
            fontFamily: theme.settings.fontFamily,
          }}
        >
          {layout ? (
            <ThemeLayoutPreview layout={layout} style={{ position: "absolute", inset: 0 }} />
          ) : (
            <>
              <div className="production-theme-card__preview-overlay" />
              <div className="production-theme-card__preview-copy">
                <span
                  className="production-theme-card__preview-text"
                  style={{
                    fontWeight: theme.settings.fontWeight,
                    textTransform: theme.settings.textTransform,
                    textShadow: theme.settings.textShadow,
                  }}
                >
                  {t("themes.sampleScripture", "For God so loved the world...")}
                </span>
                <span
                  className="production-theme-card__preview-ref"
                  style={{
                    color: theme.settings.refFontColor,
                    fontWeight: theme.settings.refFontWeight,
                  }}
                >
                  {t("themes.sampleRef", "John 3:16")}
                </span>
              </div>
            </>
          )}
        </ThemePreviewSurface>

        <div className="production-theme-card__body">
          <div className="production-theme-card__head">
            <div className="production-theme-card__copy">
              <strong>{theme.name}</strong>
              <span>
                {theme.description?.trim() ||
                  t("themes.customProductionTheme", "Bible & Worship Theme")}
              </span>
            </div>
            <span className="production-theme-card__type">
              {hasBothLooks(theme)
                ? t("themes.bothLooks", "Full Screen + Lower Third")
                : themeFormat(theme) === "lower-third"
                ? t("themes.lowerThird", "Lower Third")
                : t("themes.fullscreen", "Full Screen")}
            </span>
          </div>

          <div className="production-theme-card__meta">
            {inUse.map((target) => (
              <span key={target} className="production-theme-card__meta-pill production-theme-card__meta-pill--inuse">
                <Icon name="check" size={14} />{" "}
                {target === "bible"
                  ? t("themes.inUseBible", "Bible")
                  : target === "worship"
                  ? t("themes.inUseWorship", "Worship")
                  : t("themes.inUseNotes", "Notes")}
              </span>
            ))}
            {isThemeHiddenFromDock(dockOptOuts, theme.id) && (
              <span className="production-theme-card__meta-pill production-theme-card__meta-pill--hidden">
                <Icon name="visibility_off" size={14} />{" "}
                {t("themes.hiddenFromDock", "Hidden from Dock")}
              </span>
            )}
            {planLocked && (
              <span
                className="production-theme-card__meta-pill production-theme-card__meta-pill--locked"
                title={t("themes.upgradeToUnlock", "Upgrade your plan to unlock this theme")}
              >
                <Icon name="lock" size={14} />{" "}
                {t("themes.locked", "Locked")}
              </span>
            )}
            <span className="production-theme-card__meta-pill production-theme-card__meta-pill--muted">
              {theme.source === "custom"
                ? t("themes.sourceCustom", "Custom")
                : t("themes.sourceBuiltin", "Built-in")}
            </span>
          </div>

          {fromLibrary ? (
          <div className="production-theme-card__actions production-theme-card__actions--wrap">
            <button
              className="production-btn production-btn--primary"
              onClick={() => void changeLibrary(theme.id, true)}
              title={t("themes.addToMyThemesHint", "Add this theme to your themes and the Dock")}
            >
              <Icon name="add" size={16} />
              {t("themes.addToMyThemes", "Add to my themes")}
            </button>
          </div>
          ) : (
          <div className="production-theme-card__actions production-theme-card__actions--wrap">
            <button
              className="production-btn production-btn--ghost"
              onClick={() => void setHiddenFromDock(theme.id, !isThemeHiddenFromDock(dockOptOuts, theme.id))}
              title={
                isThemeHiddenFromDock(dockOptOuts, theme.id)
                  ? t("themes.unhideFromDockHint", "This theme is hidden from the Dock. Click to show it there again.")
                  : t("themes.hideFromDockHint", "Every theme shows in the Dock (Bible, Worship, Notes). Click to hide this one from the Dock.")
              }
            >
              <Icon name={isThemeHiddenFromDock(dockOptOuts, theme.id) ? "visibility" : "visibility_off"} size={16} />
              {isThemeHiddenFromDock(dockOptOuts, theme.id)
                ? t("themes.unhideFromDock", "Unhide")
                : t("themes.hideFromDock", "Hide from Dock")}
            </button>
            {theme.source === "custom" ? (
              <>
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => {
                    setEditingTheme(theme);
                    setShowCreator(true);
                  }}
                  title={t("themes.edit", "Edit")}
                >
                  <Icon name="edit" size={16} />
                  {t("themes.edit", "Edit")}
                </button>
                <button
                  className="production-btn production-btn--danger"
                  onClick={() => handleDeleteTheme(theme)}
                  title={t("themes.delete", "Delete")}
                >
                  <Icon name="delete" size={16} />
                  {t("themes.delete", "Delete")}
                </button>
              </>
            ) : (
              <button
                className="production-btn production-btn--ghost"
                onClick={() => startCustomising(theme)}
                title={planLocked
                  ? t("themes.upgradeToUnlock", "Upgrade your plan to unlock this theme")
                  : t("themes.customizeHint", "Make your own copy of this theme to edit")}
              >
                <Icon name={planLocked ? "lock" : "tune"} size={16} />
                {planLocked ? t("themes.unlock", "Unlock") : t("themes.customize", "Customize")}
              </button>
            )}
            {libraryActive && theme.source !== "custom" && library?.added.includes(theme.id) && !NEW_USER_THEME_IDS.includes(theme.id) && (
              <button
                className="production-btn production-btn--ghost"
                onClick={() => void changeLibrary(theme.id, false)}
                title={t("themes.removeFromMyThemesHint", "Move this theme back to the Theme Library")}
              >
                <Icon name="remove_circle_outline" size={16} />
                {t("themes.removeFromMyThemes", "Remove")}
              </button>
            )}
          </div>
          )}
        </div>
      </article>
    );
  };

  if (loading) {
    return <LoadingScreen variant="page" label={t("themes.loading", "Loading themes...")} />;
  }

  return (
    <div className="app-page production-page">
      <div className="app-page__inner">
        <header className="app-page__header">
          <div className="app-page__header-copy">
            <h1 className="app-page__title">{t("themes.pageEyebrow", "Themes")}</h1>
            <p className="app-page__subtitle">
              {t(
                "themes.pageDescription",
                "Customize Bible verse and worship lyric themes for your livestream and church displays.",
              )}
            </p>
          </div>

          <div className="app-page__actions">
            <button
              className="production-btn production-btn--primary"
              onClick={() => {
                void themeGate.guard().then((ok) => {
                  if (!ok) return;
                  setEditingTheme(null);
                  setShowCreator(true);
                });
              }}
              title={t("themes.createTheme", "+ Create Theme")}
            >
              <Icon name="add" size={16} />
              <span>{t("themes.createTheme", "+ Create Theme")}</span>
            </button>
          </div>
        </header>

        {status && (
          <div className={`production-status-banner production-status-banner--${status.tone}`}>
            <Icon
              name={status.tone === "success" ? "check_circle" : "error_outline"}
              size={16}
            />
            <span>{status.text}</span>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* Ready-made themes — every built-in, so people can go live without   */}
        {/* designing anything, then My Themes (their own and customised ones). */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <section className="production-panel production-theme-toolbar">
          <label className="production-theme-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              className="production-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("themes.searchPlaceholder", "Search themes…")}
              aria-label={t("themes.searchPlaceholder", "Search themes…")}
            />
          </label>

          <label className="production-theme-sort">
            <span>{t("themes.sortLabel", "Sort")}</span>
            <select
              className="production-input"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as ThemeSort)}
            >
              <option value="newest">{t("themes.sortNewest", "Just created")}</option>
              <option value="oldest">{t("themes.sortOldest", "Oldest first")}</option>
              <option value="name">{t("themes.sortName", "Name A–Z")}</option>
              <option value="in-use">{t("themes.sortInUse", "In use first")}</option>
            </select>
          </label>
        </section>

        <section className="production-panel">
          <div className="production-card-head">
            <div>
              <h2>{t("themes.readyMadeTitle", "Ready-made themes")}</h2>
              <p>
                {t(
                  "themes.readyMadeDescription",
                  libraryActive
                    ? "These themes show in the Dock (Bible, Worship, Notes). Open the Theme Library below to add more, Hide from Dock on any you don't want there, or Customize to make your own copy."
                    : "Every theme here shows in the Dock (Bible, Worship, Notes). Click Hide from Dock on any you don't want there, or Customize to make your own copy.",
                )}
              </p>
            </div>
            <span className="production-count-pill">
              {t("themes.customCount", {
                count: visibleBuiltinThemes.length,
                defaultValue: `${visibleBuiltinThemes.length} Themes`,
              })}
            </span>
          </div>

          <div className="production-filter-chips" role="group" aria-label={t("themes.previewLookLabel", "Preview look")}>
            {(["lower-third", "fullscreen"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`production-filter-chip${previewLook === key ? " production-filter-chip--active" : ""}`}
                aria-pressed={previewLook === key}
                onClick={() => setPreviewLook(key)}
              >
                {key === "lower-third"
                  ? t("themes.previewLowerThird", "Preview lower third")
                  : t("themes.previewFullscreen", "Preview full screen")}
              </button>
            ))}
          </div>

          {visibleBuiltinThemes.length === 0 ? (
            <div className="production-empty">
              <Icon name="search_off" size={18} />
              <div>
                <strong>{t("themes.noSearchMatches", "No themes match your search")}</strong>
              </div>
            </div>
          ) : (
            <div className="production-theme-card-grid">
              {visibleBuiltinThemes.map((theme) => renderThemeCard(theme))}
            </div>
          )}
        </section>

        {libraryActive && (
          <section className="production-panel">
            <div className="production-card-head">
              <div>
                <h2>{t("themes.libraryTitle", "Theme Library")}</h2>
                <p>
                  {t(
                    "themes.libraryDescription",
                    "More ready-made themes. Add one and it shows here and in the Dock (Bible, Worship, Notes).",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="production-btn production-btn--ghost"
                aria-expanded={showLibrary}
                onClick={() => setShowLibrary((open) => !open)}
              >
                <Icon name={showLibrary ? "expand_less" : "expand_more"} size={16} />
                {showLibrary
                  ? t("themes.hideLibrary", "Hide library")
                  : t("themes.browseLibrary", { count: libraryThemes.length, defaultValue: `Browse ${libraryThemes.length} more themes` })}
              </button>
            </div>

            {showLibrary &&
              (libraryThemes.length === 0 ? (
                <div className="production-empty">
                  <Icon name="search_off" size={18} />
                  <div>
                    <strong>{t("themes.libraryEmpty", "No more themes to add")}</strong>
                  </div>
                </div>
              ) : (
                <div className="production-theme-card-grid">
                  {libraryThemes.map((theme) => renderThemeCard(theme, true))}
                </div>
              ))}
          </section>
        )}

        <section className="production-panel">
          <div className="production-card-head">
            <div>
              <h2>{t("themes.myThemesTitle", "My Themes")}</h2>
              <p>
                {t(
                  "themes.myThemesDescription",
                  "Themes you created or customised. Edit them any time.",
                )}
              </p>
            </div>
            <span className="production-count-pill">
              {t("themes.customCount", {
                count: customThemes.length,
                defaultValue: `${customThemes.length} Themes`,
              })}
            </span>
          </div>

          {customThemes.length > 0 && visibleCustomThemes.length === 0 ? (
            <div className="production-empty">
              <Icon name="search_off" size={18} />
              <div>
                <strong>{t("themes.noSearchMatches", "No themes match your search")}</strong>
              </div>
            </div>
          ) : customThemes.length === 0 ? (
            <div className="production-empty">
              <Icon name="palette" size={18} />
              <div>
                <strong>{t("themes.startFromReadyMade", "Start from one of the ready-made themes")}</strong>
                <p>
                  {t(
                    "themes.startFromReadyMadeHint",
                    "Click Customise on any theme above to make your own copy, or + Create Theme to start from scratch.",
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="production-theme-card-grid">
              {visibleCustomThemes.map((theme) => renderThemeCard(theme))}
            </div>
          )}
        </section>

        {/* ── Modals ── */}
        {themeGate.modal}
        {showCreator && (
          <ThemeCreatorModal
            editTheme={editingTheme}
            onClose={() => {
              setShowCreator(false);
              setEditingTheme(null);
            }}
            onSaved={(theme) => void handleThemeSaved(theme)}
          />
        )}

        {pendingDeleteTheme && (
          <div
            className="production-confirm-overlay"
            onClick={() => setPendingDeleteTheme(null)}
          >
            <div className="production-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-confirm-header">
                <Icon name="warning" size={20} style={{ color: "#ff5050" }} />
                <h3>{t("themes.deleteThemeTitle", "Delete Theme")}</h3>
              </div>
              <p className="production-confirm-text">
                {t("themes.deleteThemeConfirm", "Are you sure you want to delete")}{" "}
                <strong>{pendingDeleteTheme.name}</strong>?{" "}
                {t(
                  "themes.deleteThemeCannotUndo",
                  "This action cannot be undone.",
                )}
              </p>
              <div className="production-confirm-actions">
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => setPendingDeleteTheme(null)}
                  title={t("themes.cancel", "Cancel")}
                >
                  {t("themes.cancel", "Cancel")}
                </button>
                <button
                  className="production-btn production-btn--danger"
                  onClick={() => void confirmDeleteTheme()}
                  title={t("themes.delete", "Delete")}
                >
                  <Icon name="delete" size={16} />
                  {t("themes.delete", "Delete")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
