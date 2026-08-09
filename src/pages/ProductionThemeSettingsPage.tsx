import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import type { BibleTheme } from "../bible/types";
import { deleteCustomTheme } from "../bible/bibleDb";
import ThemeCreatorModal from "./ThemeCreatorModal";
import ThemePreviewSurface from "../components/ThemePreviewSurface";
import { dockBridge } from "../services/dockBridge";
import { getSettings as getMVSettings } from "../multiview/mvStore";
import { resolveOverlayAssetUrl } from "../services/overlayUrl";
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
import {
  getObsFavorites,
  setObsFavorite,
  getTickerFavorites,
  setTickerFavorite,
  hydrateFavoriteThemes,
  FAVORITE_THEMES_UPDATED_EVENT,
} from "../services/favoriteThemes";
import allThemesData from "../../lower_thirds/all_themes.json";
import { localizeLowerThirdThemeAssets } from "../lowerthirds/runtimeBranding";
import { defaultTickerThemes, type TickerTheme } from "../data/tickerThemes";
import {
  TICKER_THEMES as DOCK_TICKER_THEMES,
  generateTickerHTML,
  type TickerThemeConfig,
} from "../components/modules/tickerThemes";
import {
  REMOTE_PRODUCTION_THEMES_UPDATED_EVENT,
  fetchRemoteProductionThemes,
  getCachedRemoteProductionThemes,
  remoteThemeToLowerThird,
  remoteThemeToPermanentTickerTheme,
  remoteThemeToTickerConfig,
  type RemoteProductionTheme,
} from "../services/remoteProductionThemes";
import { checkEntitlementSync } from "../services/entitlementClient";
import { useAuth } from "../contexts/AuthContext";
import { getEffectivePlan } from "../services/licenseService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = "custom" | "obs" | "tickers";
type StatusTone = "success" | "error";
type ObsCategoryFilter = "all" | "bible" | "worship" | "general" | "speaker" | "favorites";

interface StatusMessage {
  tone: StatusTone;
  text: string;
}

interface ObsTheme {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  accentColor?: string;
  tags?: string[];
  variables?: Array<Record<string, unknown>>;
  html?: string;
  css?: string;
  animation?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortThemesForDisplay(themes: BibleTheme[]): BibleTheme[] {
  return [...themes].sort((left, right) => {
    if (left.source === "custom" && right.source !== "custom") return -1;
    if (left.source !== "custom" && right.source === "custom") return 1;
    if (left.source === "custom" && right.source === "custom") {
      return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
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
  const categories = theme.categories?.length ? theme.categories : theme.category ? [theme.category] : [];
  return categories.length > 0 ? categories.join(", ") : "uncategorized";
}

function themePreviewBackground(theme: BibleTheme): string {
  const backgroundImage = theme.settings.backgroundImage?.trim();
  if (backgroundImage) {
    return `linear-gradient(180deg, rgba(7, 12, 22, 0.18), rgba(7, 12, 22, 0.58)), url(${backgroundImage}) center/cover`;
  }
  return theme.settings.backgroundColor;
}

const OBS_CATEGORY_FILTERS: { key: ObsCategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bible", label: "Bible" },
  { key: "worship", label: "Worship" },
  { key: "speaker", label: "Speaker" },
  { key: "general", label: "General" },
  { key: "favorites", label: "Favorites" },
];

function buildThemePreviewHtml(theme: ObsTheme): string {
  if (!theme.html || !theme.css) return "";
  let html = theme.html;
  const resolvedValues: Record<string, string> = {};
  if (theme.variables) {
    for (const v of theme.variables) {
      const varDef = v as Record<string, unknown>;
      if (typeof varDef.key === "string") {
        resolvedValues[varDef.key] = (varDef.defaultValue as string) ?? "";
      }
    }
  }
  for (const [key, value] of Object.entries(resolvedValues)) {
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    html = html.split(`{{${key}}}`).join(escaped);
  }
  html = html.split("{{state}}").join("in");
  const rawFontImports = theme.fontImports;
  const fontImports = Array.isArray(rawFontImports)
    ? rawFontImports
      .filter((url): url is string => typeof url === "string")
      .map((url) => `<link rel="stylesheet" href="${url}">`)
      .join("\n")
    : "";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fontImports}
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { min-width:200px; transform-origin: top left; text-align: left; }
${theme.css}
</style>
</head>
<body>
${html}
</body>
</html>`;
}

function buildTickerPreviewHtml(ticker: TickerTheme): string {
  let html = ticker.html;
  const resolvedValues: Record<string, string> = {
    badge: ticker.badge,
    tickerText: ticker.tickerText,
    speed: ticker.speed,
  };
  for (const [key, value] of Object.entries(resolvedValues)) {
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    html = html.split(`{{${key}}}`).join(escaped);
  }
  html = html.split("{{state}}").join("in");
  const fontImports = ticker.fontImports
    .map((url) => `<link rel="stylesheet" href="${url}">`)
    .join("\n");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fontImports}
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { min-width:200px; transform-origin: top left; text-align: left; }
${ticker.css}
</style>
</head>
<body>
${html}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Combined ticker type for preview
// ---------------------------------------------------------------------------

interface DockTickerPreview {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  source: "dock" | "permanent" | "remote";
  dockTheme?: TickerThemeConfig;
  permanentTheme?: TickerTheme;
}

function buildDockTickerPreviewHtml(dockTheme: TickerThemeConfig, sampleMessages: string[]): string {
  const branding = getMVSettings();
  return generateTickerHTML(
    dockTheme,
    dockTheme.defaultColors,
    dockTheme.defaultHeading,
    sampleMessages,
    50,
    "bottom",
    true,
    false,
    resolveOverlayAssetUrl(branding.brandLogoPath),
    branding.churchName || "MakeChurchEasy",
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProductionThemeSettingsPage() {
  const { user: authUser } = useAuth();
  const { t } = useTranslation();
  const effectivePlan = getEffectivePlan(authUser);
  const [activeTab, setActiveTab] = useState<TabKey>("custom");
  const [themes, setThemes] = useState<BibleTheme[]>([]);
  const [settings, setSettings] = useState<ProductionSettings>(getDefaultProductionSettings());
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [editingTheme, setEditingTheme] = useState<BibleTheme | null>(null);
  const [pendingDeleteTheme, setPendingDeleteTheme] = useState<BibleTheme | null>(null);

  // OBS Themes tab state
  const [obsFavorites, setObsFavorites] = useState<Set<string>>(new Set());
  const [tickerFavorites, setTickerFavorites] = useState<Set<string>>(new Set());
  const [obsCategoryFilter, setObsCategoryFilter] = useState<ObsCategoryFilter>("all");
  const [obsSearch, setObsSearch] = useState("");
  const [previewTheme, setPreviewTheme] = useState<ObsTheme | null>(null);
  const [previewTicker, setPreviewTicker] = useState<DockTickerPreview | null>(null);
  const [remoteProductionThemes, setRemoteProductionThemes] = useState<RemoteProductionTheme[]>(() => getCachedRemoteProductionThemes());
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const allObsThemes: ObsTheme[] = useMemo(() => {
    const bundledThemes = ((allThemesData as { themes: ObsTheme[] }).themes ?? [])
      .map((theme) => localizeLowerThirdThemeAssets(theme));
    const remoteLowerThirds = remoteProductionThemes
      .map(remoteThemeToLowerThird)
      .filter((theme): theme is NonNullable<ReturnType<typeof remoteThemeToLowerThird>> => !!theme)
      .map((theme) => localizeLowerThirdThemeAssets(theme as unknown as ObsTheme));
    const merged = new Map<string, ObsTheme>();
    for (const theme of bundledThemes) merged.set(theme.id, theme);
    for (const theme of remoteLowerThirds) merged.set(theme.id, theme);
    return [...merged.values()];
  }, [remoteProductionThemes]);

  // Combined dock + permanent tickers for the Tickers tab
  const allTickers: DockTickerPreview[] = useMemo(() => {
    const dockTickers: DockTickerPreview[] = DOCK_TICKER_THEMES.map((dt) => ({
      id: dt.id,
      name: dt.name,
      description: dt.description,
      accentColor: dt.defaultColors.accent,
      source: "dock" as const,
      dockTheme: dt,
    }));
    const permanentTickers: DockTickerPreview[] = defaultTickerThemes.map((pt) => ({
      id: pt.id,
      name: pt.name,
      description: pt.description,
      accentColor: pt.accentColor,
      source: "permanent" as const,
      permanentTheme: pt,
    }));
    const remoteTickers: DockTickerPreview[] = [];
    for (const remoteTheme of remoteProductionThemes) {
      const permanentTheme = remoteThemeToPermanentTickerTheme(remoteTheme);
      if (permanentTheme) {
        remoteTickers.push({
          id: permanentTheme.id,
          name: permanentTheme.name,
          description: permanentTheme.description,
          accentColor: permanentTheme.accentColor,
          source: "remote" as const,
          permanentTheme,
        });
        continue;
      }
      const theme = remoteThemeToTickerConfig(remoteTheme);
      if (!theme) continue;
      remoteTickers.push({
        id: theme.id,
        name: theme.name,
        description: theme.description,
        accentColor: theme.defaultColors.accent,
        source: "remote" as const,
        dockTheme: theme,
      });
    }
    const merged = new Map<string, DockTickerPreview>();
    for (const ticker of [...dockTickers, ...permanentTickers, ...remoteTickers]) {
      merged.set(ticker.id, ticker);
    }
    return [...merged.values()];
  }, [remoteProductionThemes]);

  const translatedCategoryFilters = useMemo(() => OBS_CATEGORY_FILTERS.map((f) => ({
    ...f,
    label: t(`themes.filter${f.key.charAt(0).toUpperCase() + f.key.slice(1)}`),
  })), [t]);

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
        text: t("themes.loadError"),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const syncCachedRemoteThemes = () => setRemoteProductionThemes(getCachedRemoteProductionThemes());
    syncCachedRemoteThemes();
    void fetchRemoteProductionThemes().then(setRemoteProductionThemes);
    window.addEventListener(REMOTE_PRODUCTION_THEMES_UPDATED_EVENT, syncCachedRemoteThemes);
    return () => window.removeEventListener(REMOTE_PRODUCTION_THEMES_UPDATED_EVENT, syncCachedRemoteThemes);
  }, []);

  const refreshFavoriteState = useCallback(() => {
    setObsFavorites(getObsFavorites());
    setTickerFavorites(getTickerFavorites());
  }, []);

  useEffect(() => {
    void hydrateFavoriteThemes().then(refreshFavoriteState);
  }, [refreshFavoriteState]);

  useEffect(() => {
    window.addEventListener(FAVORITE_THEMES_UPDATED_EVENT, refreshFavoriteState);
    window.addEventListener("storage", refreshFavoriteState);
    return () => {
      window.removeEventListener(FAVORITE_THEMES_UPDATED_EVENT, refreshFavoriteState);
      window.removeEventListener("storage", refreshFavoriteState);
    };
  }, [refreshFavoriteState]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 3500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const customThemes = useMemo(
    () => themes.filter((theme) => theme.source === "custom"),
    [themes],
  );

  // ---------------------------------------------------------------------------
  // OBS filtered themes
  // ---------------------------------------------------------------------------

  const obsFilteredThemes = useMemo(() => {
    let list = allObsThemes;

    if (obsCategoryFilter === "favorites") {
      list = list.filter((t) => obsFavorites.has(t.id));
    } else if (obsCategoryFilter !== "all") {
      list = list.filter((t) => t.category === obsCategoryFilter);
    }

    if (obsSearch.trim()) {
      const q = obsSearch.toLowerCase();
      list = list.filter((t) => {
        const nameMatch = t.name.toLowerCase().includes(q);
        const descMatch = t.description?.toLowerCase().includes(q) ?? false;
        const tagMatch = t.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false;
        return nameMatch || descMatch || tagMatch;
      });
    }

    return list;
  }, [allObsThemes, obsCategoryFilter, obsSearch, obsFavorites]);

  const obsFavoritesCount = useMemo(
    () => allObsThemes.filter((t) => obsFavorites.has(t.id)).length,
    [allObsThemes, obsFavorites],
  );

  // ---------------------------------------------------------------------------
  // Settings persistence (Custom tab)
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
      const nextThemes = sortThemesForDisplay([...themes.filter((item) => item.id !== theme.id), theme]);

      setThemes(nextThemes);
      setShowCreator(false);
      setEditingTheme(null);

      try {
        const nextSettings = alignSettingsToThemes(settings, nextThemes);
        await persistSettings(
          nextSettings,
          isEditing ? t("themes.themeUpdated", { name: theme.name }) : t("themes.themeCreated", { name: theme.name }),
          nextThemes,
        );
      } catch (err) {
        console.error("[ProductionThemeSettingsPage] Failed to sync production settings after theme save:", err);
        setSettings((current) => alignSettingsToThemes(current, nextThemes));
        setStatus({
          tone: "error",
          text: t("themes.themeSavedSyncFailed"),
        });
      }
    },
    [editingTheme, persistSettings, settings, themes],
  );

  const handleDeleteTheme = useCallback(
    (theme: BibleTheme) => {
      setPendingDeleteTheme(theme);
    },
    [],
  );

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
        text: err instanceof Error ? err.message : t("themes.deleteFailed"),
      });
    } finally {
      setPendingDeleteTheme(null);
    }
  }, [pendingDeleteTheme, persistSettings, settings, themes]);

  // ---------------------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------------------

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ---------------------------------------------------------------------------
  // OBS favorite toggle
  // ---------------------------------------------------------------------------

  const handleToggleObsFavorite = useCallback((themeId: string) => {
    const shouldAdd = !obsFavorites.has(themeId);
    const next = setObsFavorite(themeId, shouldAdd);
    setObsFavorites(next);
    const theme = allObsThemes.find((t) => t.id === themeId);
    const name = theme?.name ?? t("themes.defaultThemeName");
    showToast(
      shouldAdd
        ? t("themes.addedNamedToOBS", { name, defaultValue: `"${name}" added to OBS` })
        : t("themes.removedNamedFromOBS", { name, defaultValue: `"${name}" removed from OBS` }),
      "success",
    );
  }, [obsFavorites, allObsThemes, showToast, t]);

  const handleToggleTickerFavorite = useCallback((tickerId: string) => {
    const shouldAdd = !tickerFavorites.has(tickerId);
    const next = setTickerFavorite(tickerId, shouldAdd);
    setTickerFavorites(next);
    const ticker = allTickers.find((t) => t.id === tickerId);
    const name = ticker?.name ?? t("themes.defaultTickerName");
    showToast(
      shouldAdd
        ? t("themes.addedNamedToOBS", { name, defaultValue: `"${name}" added to OBS` })
        : t("themes.removedNamedFromOBS", { name, defaultValue: `"${name}" removed from OBS` }),
      "success",
    );
  }, [tickerFavorites, allTickers, showToast, t]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="app-page production-page">
        <div className="app-page__inner">
          <section className="production-panel">
            <div className="production-loading">
              <Icon name="hourglass_empty" size={18} />
              {t("themes.loading")}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page production-page">
      <div className="app-page__inner">
        <header className="app-page__header">
          <div className="app-page__header-copy">
            <p className="app-page__eyebrow">{t("themes.pageEyebrow")}</p>
            <h1 className="app-page__title">{t("themes.pageDescription")}</h1>

          </div>

          <div className="app-page__actions">
            {activeTab === "custom" && (
              <button
                className="production-btn production-btn--ghost"
                onClick={() => {
                  const { allowed } = checkEntitlementSync("themes", effectivePlan, customThemes.length);
                  if (!allowed) return;
                  setEditingTheme(null);
                  setShowCreator(true);
                }}
                title={t("themes.createTheme")}>
                <Icon name="add" size={16} />
                {t("themes.createTheme")}
              </button>
            )}
          </div>
        </header>

        {status && (
          <div className={`production-status-banner production-status-banner--${status.tone}`}>
            <Icon name={status.tone === "success" ? "check_circle" : "error_outline"} size={16} />
            <span>{status.text}</span>
          </div>
        )}

        {/* ── Tab bar ── */}
        <div className="production-tab-bar">
          <button
            className={`production-tab ${activeTab === "custom" ? "production-tab--active" : ""}`}
            onClick={() => setActiveTab("custom")}
            title={t("themes.tabCustom")}>
            {t("themes.tabCustom")}
          </button>
          <button
            className={`production-tab ${activeTab === "obs" ? "production-tab--active" : ""}`}
            onClick={() => setActiveTab("obs")}
            title={t("themes.tabObs")}>
            {t("themes.tabObs")}
          </button>
          <button
            className={`production-tab ${activeTab === "tickers" ? "production-tab--active" : ""}`}
            onClick={() => setActiveTab("tickers")}
            title={t("themes.tabTickers")}>
            {t("themes.tabTickers")}
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* Custom Themes Tab                                                   */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "custom" && (
          <section className="production-panel">
            <div className="production-card-head">
              <div>
                <h2>{t("themes.tabCustom")}</h2>
                <p>{t("themes.customDescription")}</p>
              </div>
              <span className="production-count-pill">{t("themes.customCount", { count: customThemes.length })}</span>
            </div>

            {customThemes.length === 0 ? (
              <div className="production-empty">
                <Icon name="palette" size={18} />
                <div>
                  <strong>{t("themes.noCustomThemesYet")}</strong>
                  <p>{t("themes.noCustomThemesHint")}</p>
                </div>
              </div>
            ) : (
              <div className="production-theme-card-grid">
                {sortThemesForDisplay(customThemes).map((theme) => (
                  <article key={theme.id} className="production-theme-card">
                    <ThemePreviewSurface
                      className="production-theme-card__preview"
                      videoSrc={theme.settings.backgroundVideo}
                      posterSrc={theme.settings.backgroundImage}
                      style={{
                        background: themePreviewBackground(theme),
                        color: theme.settings.fontColor,
                        fontFamily: theme.settings.fontFamily,
                      }}
                    >
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
                          {t("themes.sampleScripture")}
                        </span>
                        <span
                          className="production-theme-card__preview-ref"
                          style={{
                            color: theme.settings.refFontColor,
                            fontWeight: theme.settings.refFontWeight,
                          }}
                        >
                          {t("themes.sampleRef")}
                        </span>
                      </div>
                    </ThemePreviewSurface>

                    <div className="production-theme-card__body">
                      <div className="production-theme-card__head">
                        <div className="production-theme-card__copy">
                          <strong>{theme.name}</strong>
                          <span>{theme.description?.trim() || t("themes.customProductionTheme")}</span>
                        </div>
                        <span className="production-theme-card__type">
                          {theme.templateType === "lower-third" ? t("themes.lowerThird") : t("themes.fullscreen")}
                        </span>
                      </div>

                      <div className="production-theme-card__meta">
                        <span className="production-theme-card__meta-pill">{themeCategories(theme) === "uncategorized" ? t("themes.uncategorized") : themeCategories(theme)}</span>
                        <span className="production-theme-card__meta-pill production-theme-card__meta-pill--muted">
                          {theme.source === "custom" ? t("themes.sourceCustom") : t("themes.sourceBuiltin")}
                        </span>
                      </div>

                      <div className="production-theme-card__actions">
                        <button
                          className="production-btn production-btn--ghost"
                          onClick={() => {
                            setEditingTheme(theme);
                            setShowCreator(true);
                          }}
                          title={t("themes.edit")}>
                          <Icon name="edit" size={16} />
                          {t("themes.edit")}
                        </button>
                        <button
                          className="production-btn production-btn--danger"
                          onClick={() => handleDeleteTheme(theme)}
                          title={t("themes.delete")}>
                          <Icon name="delete" size={16} />
                          {t("themes.delete")}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* OBS Themes Tab                                                      */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "obs" && (
          <section className="production-panel">
            <div className="production-card-head">
              <div>
                <h2>{t("themes.tabObs")}</h2>
                <p>{t("themes.obsDescription")}</p>
              </div>
              <span className="production-count-pill">
                {t("themes.favoritesCount", { count: obsFavoritesCount })}
              </span>
            </div>

            {/* Search + Filters */}
            <div className="obs-themes-toolbar">
              <div className="obs-themes-search">
                <Icon name="search" size={14} />
                <input
                  type="text"
                  placeholder={t("themes.searchThemes")}
                  value={obsSearch}
                  onChange={(e) => setObsSearch(e.target.value)}
                />
                {obsSearch && (
                  <button className="obs-themes-search-clear" onClick={() => setObsSearch("")} title={t("themes.close")}>
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>

              <div className="obs-themes-filters">
                {translatedCategoryFilters.map((f) => (
                  <button
                    key={f.key}
                    className={`obs-themes-filter ${obsCategoryFilter === f.key ? "obs-themes-filter--active" : ""}`}
                    onClick={() => setObsCategoryFilter(f.key)}
                  >
                    {f.label}
                    {f.key === "favorites" && obsFavoritesCount > 0 && (
                      <span className="obs-themes-filter-count">{obsFavoritesCount}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme grid */}
            {obsFilteredThemes.length === 0 ? (
              <div className="production-empty">
                <Icon name="palette" size={18} />
                <div>
                  <strong>{t("themes.noThemesFound")}</strong>
                  <p>{obsSearch ? t("themes.tryDifferentSearch") : t("themes.noThemesMatchFilter")}</p>
                </div>
              </div>
            ) : (
              <div className="obs-theme-preview-grid">
                {obsFilteredThemes.map((theme) => {
                  const isFav = obsFavorites.has(theme.id);
                  const previewSrc = buildThemePreviewHtml(theme);
                  return (
                    <article key={theme.id} className={`obs-theme-preview-card${isFav ? " obs-theme-preview-card--added" : ""}`}>
                      <div className="obs-theme-preview-card__header">
                        <div className="obs-theme-preview-card__title">
                          <strong>{theme.name}</strong>
                          <span className="obs-theme-preview-card__category">
                            {theme.category || t("themes.uncategorized")}
                          </span>
                        </div>
                        {theme.accentColor && (
                          <span
                            className="obs-theme-card__swatch"
                            style={{ background: theme.accentColor }}
                            title={theme.accentColor}
                          />
                        )}
                      </div>

                      <div className="obs-theme-preview-card__stage">
                        {previewSrc ? (
                          <iframe
                            className="obs-theme-preview-card__iframe"
                            srcDoc={previewSrc}
                            sandbox="allow-same-origin"
                            title={theme.name}
                          />
                        ) : (
                          <div className="obs-theme-preview-card__empty">
                            <Icon name="visibility_off" size={20} />
                            <span>{t("themes.noPreview")}</span>
                          </div>
                        )}
                      </div>

                      <div className="obs-theme-preview-card__footer">
                        <span className="obs-theme-preview-card__desc">
                          {theme.description?.trim() || t("themes.lowerThirdOverlayTheme")}
                        </span>
                        <div className="obs-theme-preview-card__actions">
                          <button
                            className="production-btn production-btn--ghost production-btn--sm"
                            onClick={() => setPreviewTheme(theme)}
                            title={t("themes.open")}>
                            <Icon name="open_in_full" size={14} />
                          </button>
                          <button
                            className={`production-btn production-btn--sm ${isFav ? "production-btn--ghost" : "production-btn--primary"}`}
                            onClick={() => handleToggleObsFavorite(theme.id)}
                            title={isFav ? t("themes.removeFromOBS", "Remove from OBS") : t("themes.addToOBS")}>
                            <Icon name={isFav ? "remove_circle" : "add_circle"} size={14} />
                            <span>{isFav ? t("themes.removeFromOBS", "Remove from OBS") : t("themes.addToOBS")}</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* Tickers Tab                                                         */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "tickers" && (
          <section className="production-panel">
            <div className="production-card-head">
              <div>
                <h2>{t("themes.tabTickers")}</h2>
                <p>{t("themes.tickersDescription")}</p>
              </div>
              <span className="production-count-pill">
                {t("themes.tickerCount", { count: allTickers.length })}
              </span>
            </div>

            <div className="ticker-preview-grid">
              {allTickers.map((ticker) => {
                const isFav = tickerFavorites.has(ticker.id);
                const previewSrc =
                  (ticker.source === "dock" || ticker.source === "remote") && ticker.dockTheme
                    ? buildDockTickerPreviewHtml(ticker.dockTheme, [t("themes.sampleTicker1"), t("themes.sampleTicker2"), t("themes.sampleTicker3")])
                    : ticker.permanentTheme
                      ? buildTickerPreviewHtml(ticker.permanentTheme)
                      : "";

                return (
                  <article key={ticker.id} className={`ticker-preview-card${isFav ? " ticker-preview-card--added" : ""}`}>
                    <div className="ticker-preview-card__header">
                      <div className="ticker-preview-card__title">
                        <strong>{ticker.name}</strong>
                        <span className="ticker-preview-card__source">
                          {ticker.source === "remote"
                            ? "Admin"
                            : ticker.source === "dock"
                              ? t("themes.sourceDock")
                              : t("themes.sourcePermanent")}
                        </span>
                      </div>
                      <span
                        className="obs-theme-card__swatch"
                        style={{ background: ticker.accentColor }}
                        title={ticker.accentColor}
                      />
                    </div>

                    <div className="ticker-preview-card__stage">
                      {previewSrc ? (
                        <iframe
                          className="ticker-preview-card__iframe"
                          srcDoc={previewSrc}
                          sandbox="allow-same-origin allow-scripts"
                          title={ticker.name}
                        />
                      ) : (
                        <div className="ticker-preview-card__empty">
                          <Icon name="visibility_off" size={20} />
                          <span>{t("themes.noPreview")}</span>
                        </div>
                      )}
                    </div>

                    <div className="ticker-preview-card__footer">
                      <span className="ticker-preview-card__desc">{ticker.description}</span>
                      <div className="obs-theme-preview-card__actions">
                        <button
                          className="production-btn production-btn--ghost production-btn--sm"
                          onClick={() => setPreviewTicker(ticker)}
                          title={t("themes.open")}>
                          <Icon name="open_in_full" size={14} />
                        </button>
                        <button
                          className={`production-btn production-btn--sm ${isFav ? "production-btn--ghost" : "production-btn--primary"}`}
                          onClick={() => handleToggleTickerFavorite(ticker.id)}
                          title={isFav ? t("themes.removeFromOBS", "Remove from OBS") : t("themes.addToOBS")}>
                          <Icon name={isFav ? "remove_circle" : "add_circle"} size={14} />
                          <span>{isFav ? t("themes.removeFromOBS", "Remove from OBS") : t("themes.addToOBS")}</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

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
          <div className="production-confirm-overlay" onClick={() => setPendingDeleteTheme(null)}>
            <div className="production-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-confirm-header">
                <Icon name="warning" size={20} style={{ color: "#ff5050" }} />
                <h3>{t("themes.deleteThemeTitle")}</h3>
              </div>
              <p className="production-confirm-text">
                {t("themes.deleteThemeConfirm")} <strong>{pendingDeleteTheme.name}</strong>?
                {t("themes.deleteThemeCannotUndo")}
              </p>
              <div className="production-confirm-actions">
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => setPendingDeleteTheme(null)}
                  title={t("themes.cancel")}>
                  {t("themes.cancel")}
                </button>
                <button
                  className="production-btn production-btn--danger"
                  onClick={() => void confirmDeleteTheme()}
                  title={t("themes.delete")}>
                  <Icon name="delete" size={16} />
                  {t("themes.delete")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── OBS Theme Preview Modal ── */}
        {previewTheme && (
          <div className="production-confirm-overlay" onClick={() => setPreviewTheme(null)}>
            <div
              className="obs-preview-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="obs-preview-modal__header">
                <div>
                  <h3>{previewTheme.name}</h3>
                  <span className="obs-preview-modal__subtitle">
                    {previewTheme.category || t("themes.uncategorized")}
                    {previewTheme.tags?.length ? ` · ${previewTheme.tags.join(", ")}` : ""}
                  </span>
                </div>
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => setPreviewTheme(null)}
                  title={t("themes.close")}>
                  <Icon name="close" size={16} />
                </button>
              </div>

              <div className="obs-preview-modal__stage">
                {previewTheme.html && previewTheme.css ? (
                  <iframe
                    className="obs-preview-modal__iframe"
                    srcDoc={buildThemePreviewHtml(previewTheme)}
                    sandbox="allow-same-origin"
                    title={previewTheme.name}
                  />
                ) : (
                  <div className="obs-preview-modal__empty">
                    <Icon name="visibility_off" size={24} />
                    <span>{t("themes.noPreviewAvailable")}</span>
                  </div>
                )}
              </div>

              <div className="obs-preview-modal__footer">
                <button
                  className={`production-btn ${obsFavorites.has(previewTheme.id) ? "production-btn--ghost" : "production-btn--primary"}`}
                  onClick={() => handleToggleObsFavorite(previewTheme.id)}
                  title={obsFavorites.has(previewTheme.id) ? t("themes.removeFromOBS", "Remove from OBS") : t("themes.addToOBS")}>
                  <Icon name={obsFavorites.has(previewTheme.id) ? "remove_circle" : "add_circle"} size={16} />
                  {obsFavorites.has(previewTheme.id) ? t("themes.removeFromOBS", "Remove from OBS") : t("themes.addToOBS")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Ticker Preview Modal ── */}
        {previewTicker && (
          <div className="production-confirm-overlay" onClick={() => setPreviewTicker(null)}>
            <div
              className="obs-preview-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="obs-preview-modal__header">
                <div>
                  <h3>{previewTicker.name}</h3>
                  <span className="obs-preview-modal__subtitle">
                    {previewTicker.source === "remote"
                      ? "Admin ticker"
                      : previewTicker.source === "dock"
                        ? t("themes.dockTicker")
                        : t("themes.permanentTicker")}
                    {previewTicker.permanentTheme ? ` · ${previewTicker.permanentTheme.speed} ${t("themes.speed")}` : ""}
                  </span>
                </div>
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => setPreviewTicker(null)}
                  title={t("themes.close")}>
                  <Icon name="close" size={16} />
                </button>
              </div>

              <div className="obs-preview-modal__stage">
                <iframe
                  className="obs-preview-modal__iframe"
                  srcDoc={
                    (previewTicker.source === "dock" || previewTicker.source === "remote") && previewTicker.dockTheme
                      ? buildDockTickerPreviewHtml(previewTicker.dockTheme, [t("themes.sampleTicker1"), t("themes.sampleTicker2"), t("themes.sampleTicker3")])
                      : previewTicker.permanentTheme
                        ? buildTickerPreviewHtml(previewTicker.permanentTheme)
                        : ""
                  }
                  sandbox="allow-same-origin allow-scripts"
                  title={previewTicker.name}
                />
              </div>

              <div className="obs-preview-modal__footer">
                <button
                  className={`production-btn ${tickerFavorites.has(previewTicker.id) ? "production-btn--ghost" : "production-btn--primary"}`}
                  onClick={() => handleToggleTickerFavorite(previewTicker.id)}
                  title={tickerFavorites.has(previewTicker.id) ? t("themes.removeFromOBS", "Remove from OBS") : t("themes.addToOBS")}>
                  <Icon name={tickerFavorites.has(previewTicker.id) ? "remove_circle" : "add_circle"} size={16} />
                  {tickerFavorites.has(previewTicker.id) ? t("themes.removeFromOBS", "Remove from OBS") : t("themes.addToOBS")}
                </button>
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => setPreviewTicker(null)}
                  title={t("themes.close")}>
                  {t("themes.close")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            className="mvg-toast"
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 10001,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              borderRadius: "var(--radius)",
              background: "var(--surface)",
              border: toast.type === "success" ? "1px solid var(--success)" : "1px solid var(--error)",
              color: "var(--text-primary)",
              fontSize: 12,
              fontWeight: 500,
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              animation: "fadeIn 0.15s ease",
            }}
          >
            <Icon
              name={toast.type === "success" ? "check_circle" : "error"}
              size={18}
              style={{ color: toast.type === "success" ? "var(--success)" : "var(--error)" }}
            />
            <span>{toast.message}</span>
          </div>
        )}

      </div>
    </div>
  );
}
