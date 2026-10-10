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
  type DockProductionSettingsPayload,
  type ProductionSettings,
  getDefaultProductionSettings,
  getProductionSettings,
  loadAvailableProductionThemes,
  resolveProductionSettings,
  saveProductionSettings,
  syncProductionSettingsToDock,
} from "../services/productionSettings";
import { checkEntitlementSync } from "../services/entitlementClient";
import { useAuth } from "../contexts/AuthContext";
import { getEffectivePlan } from "../services/licenseService";

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
  };
}

function alignSettingsToThemes(
  settings: ProductionSettings,
  themes: BibleTheme[],
): ProductionSettings {
  return toPlainSettings(resolveProductionSettings(settings, themes));
}

function themeCategories(theme: BibleTheme): string {
  const categories = theme.categories?.length
    ? theme.categories
    : theme.category
    ? [theme.category]
    : [];
  return categories.length > 0 ? categories.join(", ") : "uncategorized";
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
  const { user } = useAuth();
  const effectivePlan = getEffectivePlan(user);

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

  // Built-in layout lower thirds (Chapter Number, Caption Rule, Accent Card…)
  const builtinLayoutThemes = useMemo(
    () => themes.filter((theme) => theme.source !== "custom" && Boolean(getThemeLayout(theme))),
    [themes],
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
                const { allowed } = checkEntitlementSync(
                  "themes",
                  effectivePlan,
                  customThemes.length,
                );
                if (!allowed) return;
                setEditingTheme(null);
                setShowCreator(true);
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
        {/* Bible & Worship Themes                                              */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <section className="production-panel">
          <div className="production-card-head">
            <div>
              <h2>{t("themes.tabCustom", "Bible & Worship Themes")}</h2>
              <p>
                {t(
                  "themes.customDescription",
                  "Themes used to display scriptures and worship songs across full screens and lower thirds.",
                )}
              </p>
            </div>
            <span className="production-count-pill">
              {t("themes.customCount", {
                count: customThemes.length + builtinLayoutThemes.length,
                defaultValue: `${customThemes.length + builtinLayoutThemes.length} Themes`,
              })}
            </span>
          </div>

          {customThemes.length === 0 && builtinLayoutThemes.length === 0 ? (
            <div className="production-empty">
              <Icon name="palette" size={18} />
              <div>
                <strong>{t("themes.noCustomThemesYet", "No themes yet")}</strong>
                <p>
                  {t(
                    "themes.noCustomThemesHint",
                    "Click + Create Theme above to create your first Bible or worship theme.",
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="production-theme-card-grid">
              {[...sortThemesForDisplay(customThemes), ...builtinLayoutThemes].map((theme) => (
                <article key={theme.id} className="production-theme-card">
                  <ThemePreviewSurface
                    className="production-theme-card__preview"
                    videoSrc={theme.settings.backgroundVideo}
                    posterSrc={theme.settings.backgroundImage}
                    style={{
                      background: getThemeLayout(theme)
                        ? "linear-gradient(135deg, #273246 0%, #10151f 100%)"
                        : themePreviewBackground(theme),
                      color: theme.settings.fontColor,
                      fontFamily: theme.settings.fontFamily,
                    }}
                  >
                    {getThemeLayout(theme) ? (
                      <ThemeLayoutPreview
                        layout={getThemeLayout(theme)!}
                        style={{ position: "absolute", inset: 0 }}
                      />
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
                        {theme.templateType === "lower-third"
                          ? t("themes.lowerThird", "Lower Third")
                          : t("themes.fullscreen", "Full Screen")}
                      </span>
                    </div>

                    <div className="production-theme-card__meta">
                      <span className="production-theme-card__meta-pill">
                        {themeCategories(theme) === "uncategorized"
                          ? t("themes.uncategorized", "General")
                          : themeCategories(theme)}
                      </span>
                      <span className="production-theme-card__meta-pill production-theme-card__meta-pill--muted">
                        {theme.source === "custom"
                          ? t("themes.sourceCustom", "Custom")
                          : t("themes.sourceBuiltin", "Built-in")}
                      </span>
                    </div>

                    <div className="production-theme-card__actions">
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
                          onClick={() => {
                            const { allowed } = checkEntitlementSync(
                              "themes",
                              effectivePlan,
                              customThemes.length,
                            );
                            if (!allowed) return;
                            setEditingTheme({
                              ...theme,
                              id: `custom-${theme.id}-${Date.now().toString(36)}`,
                              source: "custom",
                            });
                            setShowCreator(true);
                          }}
                          title={t("themes.customize", "Customize")}
                        >
                          <Icon name="edit" size={16} />
                          {t("themes.customize", "Customize")}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ── Modals ── */}
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
