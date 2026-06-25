import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import type { BibleTheme } from "../bible/types";
import { deleteCustomTheme } from "../bible/bibleDb";
import ThemeCreatorModal from "./ThemeCreatorModal";
import ThemePreviewSurface from "../components/ThemePreviewSurface";
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
import {
  getObsFavorites,
  toggleObsFavorite,
  getTickerFavorites,
  toggleTickerFavorite,
  hydrateFavoriteThemes,
} from "../services/favoriteThemes";
import allThemesData from "../../lower_thirds/all_themes.json";
import { defaultTickerThemes, type TickerTheme } from "../data/tickerThemes";
import {
  TICKER_THEMES as DOCK_TICKER_THEMES,
  generateTickerHTML,
  type TickerThemeConfig,
} from "../components/modules/tickerThemes";
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
  source: "dock" | "permanent";
  dockTheme?: TickerThemeConfig;
  permanentTheme?: TickerTheme;
}

function buildDockTickerPreviewHtml(dockTheme: TickerThemeConfig): string {
  const sampleMessages = [
    "Prayer Meeting Tuesday 6:30 PM",
    "Youth Night Friday 7:00 PM",
    "New Members Class next Sunday",
  ];
  return generateTickerHTML(
    dockTheme,
    dockTheme.defaultColors,
    dockTheme.defaultHeading,
    sampleMessages,
    50,
    "bottom",
    true,
    false,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProductionThemeSettingsPage() {
  const { user: authUser } = useAuth();
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
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const allObsThemes: ObsTheme[] = useMemo(
    () => (allThemesData as { themes: ObsTheme[] }).themes ?? [],
    [],
  );

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
    return [...dockTickers, ...permanentTickers];
  }, []);

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
        text: "Could not load production theme settings.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void hydrateFavoriteThemes().then(() => {
      setObsFavorites(getObsFavorites());
      setTickerFavorites(getTickerFavorites());
    });
  }, []);

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
          isEditing ? `"${theme.name}" updated.` : `"${theme.name}" created.`,
          nextThemes,
        );
      } catch (err) {
        console.error("[ProductionThemeSettingsPage] Failed to sync production settings after theme save:", err);
        setSettings((current) => alignSettingsToThemes(current, nextThemes));
        setStatus({
          tone: "error",
          text: "Theme saved, but dock defaults could not be refreshed automatically.",
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
        `"${theme.name}" deleted and defaults refreshed.`,
        nextThemes,
      );
    } catch (err) {
      console.error("[ProductionThemeSettingsPage] Failed to delete custom theme:", err);
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to delete theme.",
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
    const wasFav = obsFavorites.has(themeId);
    const next = toggleObsFavorite(themeId);
    setObsFavorites(next);
    if (!wasFav) {
      const theme = allObsThemes.find((t) => t.id === themeId);
      showToast(`"${theme?.name ?? "Theme"}" added to dock`, "success");
    }
  }, [obsFavorites, allObsThemes, showToast]);

  const handleToggleTickerFavorite = useCallback((tickerId: string) => {
    const wasFav = tickerFavorites.has(tickerId);
    const next = toggleTickerFavorite(tickerId);
    setTickerFavorites(next);
    if (!wasFav) {
      const ticker = allTickers.find((t) => t.id === tickerId);
      showToast(`"${ticker?.name ?? "Ticker"}" added to dock`, "success");
    }
  }, [tickerFavorites, allTickers, showToast]);

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
              Loading production theme settings...
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
            <p className="app-page__eyebrow">Production Themes</p>
            <h1 className="app-page__title">Set the defaults the MakeChurchEasy Dock should use for Bible and Worship.</h1>

          </div>

          {activeTab === "custom" && (
            <div className="app-page__actions">
              <button
                className="production-btn production-btn--ghost"
                onClick={() => {
                  const { allowed } = checkEntitlementSync("themes", effectivePlan, customThemes.length);
                  if (!allowed) return;
                  setEditingTheme(null);
                  setShowCreator(true);
                }}
              >
                <Icon name="add" size={16} />
                Create Theme
              </button>

            </div>
          )}
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
          >
            Custom Themes
          </button>
          <button
            className={`production-tab ${activeTab === "obs" ? "production-tab--active" : ""}`}
            onClick={() => setActiveTab("obs")}
          >
            OBS Themes
          </button>
          <button
            className={`production-tab ${activeTab === "tickers" ? "production-tab--active" : ""}`}
            onClick={() => setActiveTab("tickers")}
          >
            Tickers
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* Custom Themes Tab                                                   */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "custom" && (
          <section className="production-panel">
            <div className="production-card-head">
              <div>
                <h2>Custom Themes</h2>
                <p>Create and maintain the custom fullscreen and lower-third looks used in production mode.</p>
              </div>
              <span className="production-count-pill">{customThemes.length} custom</span>
            </div>

            {customThemes.length === 0 ? (
              <div className="production-empty">
                <Icon name="palette" size={18} />
                <div>
                  <strong>No custom themes yet.</strong>
                  <p>Create one here and then assign it above as a Bible or Worship default.</p>
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
                          For with God nothing shall be impossible
                        </span>
                        <span
                          className="production-theme-card__preview-ref"
                          style={{
                            color: theme.settings.refFontColor,
                            fontWeight: theme.settings.refFontWeight,
                          }}
                        >
                          Luke 1:37
                        </span>
                      </div>
                    </ThemePreviewSurface>

                    <div className="production-theme-card__body">
                      <div className="production-theme-card__head">
                        <div className="production-theme-card__copy">
                          <strong>{theme.name}</strong>
                          <span>{theme.description?.trim() || "Custom production theme"}</span>
                        </div>
                        <span className="production-theme-card__type">
                          {theme.templateType === "lower-third" ? "Lower Third" : "Fullscreen"}
                        </span>
                      </div>

                      <div className="production-theme-card__meta">
                        <span className="production-theme-card__meta-pill">{themeCategories(theme)}</span>
                        <span className="production-theme-card__meta-pill production-theme-card__meta-pill--muted">
                          {theme.source === "custom" ? "Custom" : "Built-in"}
                        </span>
                      </div>

                      <div className="production-theme-card__actions">
                        <button
                          className="production-btn production-btn--ghost"
                          onClick={() => {
                            setEditingTheme(theme);
                            setShowCreator(true);
                          }}
                        >
                          <Icon name="edit" size={16} />
                          Edit
                        </button>
                        <button
                          className="production-btn production-btn--danger"
                          onClick={() => handleDeleteTheme(theme)}
                        >
                          <Icon name="delete" size={16} />
                          Delete
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
                <h2>OBS Themes</h2>
                <p>Browse lower-third themes from the built-in library. Mark favorites to make them available in OBS.</p>
              </div>
              <span className="production-count-pill">
                {obsFavoritesCount} favorite{obsFavoritesCount !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Search + Filters */}
            <div className="obs-themes-toolbar">
              <div className="obs-themes-search">
                <Icon name="search" size={14} />
                <input
                  type="text"
                  placeholder="Search themes..."
                  value={obsSearch}
                  onChange={(e) => setObsSearch(e.target.value)}
                />
                {obsSearch && (
                  <button className="obs-themes-search-clear" onClick={() => setObsSearch("")}>
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>

              <div className="obs-themes-filters">
                {OBS_CATEGORY_FILTERS.map((f) => (
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
                  <strong>No themes found.</strong>
                  <p>{obsSearch ? "Try a different search term." : "No themes match this filter."}</p>
                </div>
              </div>
            ) : (
              <div className="obs-theme-preview-grid">
                {obsFilteredThemes.map((theme) => {
                  const isFav = obsFavorites.has(theme.id);
                  const previewSrc = buildThemePreviewHtml(theme);
                  return (
                    <article key={theme.id} className="obs-theme-preview-card">
                      <div className="obs-theme-preview-card__header">
                        <div className="obs-theme-preview-card__title">
                          <strong>{theme.name}</strong>
                          <span className="obs-theme-preview-card__category">
                            {theme.category || "general"}
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
                            <span>No preview</span>
                          </div>
                        )}
                      </div>

                      <div className="obs-theme-preview-card__footer">
                        <span className="obs-theme-preview-card__desc">
                          {theme.description?.trim() || "Lower-third overlay theme"}
                        </span>
                        <div className="obs-theme-preview-card__actions">
                          <button
                            className="production-btn production-btn--ghost production-btn--sm"
                            onClick={() => setPreviewTheme(theme)}
                          >
                            <Icon name="open_in_full" size={14} />
                          </button>
                          <button
                            className={`production-btn production-btn--sm ${isFav ? "production-btn--primary" : "production-btn--ghost"}`}
                            onClick={() => handleToggleObsFavorite(theme.id)}
                          >
                            <Icon name={isFav ? "star" : "star_border"} size={14} />
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
                <h2>Tickers</h2>
                <p>Dock and permanent scrolling tickers for church updates, announcements, and contact info.</p>
              </div>
              <span className="production-count-pill">
                {allTickers.length} ticker{allTickers.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="ticker-preview-grid">
              {allTickers.map((ticker) => {
                const previewSrc =
                  ticker.source === "dock" && ticker.dockTheme
                    ? buildDockTickerPreviewHtml(ticker.dockTheme)
                    : ticker.permanentTheme
                      ? buildTickerPreviewHtml(ticker.permanentTheme)
                      : "";

                return (
                  <article key={ticker.id} className="ticker-preview-card">
                    <div className="ticker-preview-card__header">
                      <div className="ticker-preview-card__title">
                        <strong>{ticker.name}</strong>
                        <span className="ticker-preview-card__source">
                          {ticker.source === "dock" ? "Dock" : "Permanent"}
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
                          sandbox="allow-same-origin"
                          title={ticker.name}
                        />
                      ) : (
                        <div className="ticker-preview-card__empty">
                          <Icon name="visibility_off" size={20} />
                          <span>No preview</span>
                        </div>
                      )}
                    </div>

                    <div className="ticker-preview-card__footer">
                      <span className="ticker-preview-card__desc">{ticker.description}</span>
                      <div className="obs-theme-preview-card__actions">
                        <button
                          className="production-btn production-btn--ghost production-btn--sm"
                          onClick={() => setPreviewTicker(ticker)}
                        >
                          <Icon name="open_in_full" size={14} />
                        </button>
                        <button
                          className={`production-btn production-btn--sm ${tickerFavorites.has(ticker.id) ? "production-btn--primary" : "production-btn--ghost"}`}
                          onClick={() => handleToggleTickerFavorite(ticker.id)}
                        >
                          <Icon name={tickerFavorites.has(ticker.id) ? "star" : "star_border"} size={14} />
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
                <h3>Delete Theme</h3>
              </div>
              <p className="production-confirm-text">
                Are you sure you want to delete <strong>{pendingDeleteTheme.name}</strong>?
                This cannot be undone.
              </p>
              <div className="production-confirm-actions">
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => setPendingDeleteTheme(null)}
                >
                  Cancel
                </button>
                <button
                  className="production-btn production-btn--danger"
                  onClick={() => void confirmDeleteTheme()}
                >
                  <Icon name="delete" size={16} />
                  Delete
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
                    {previewTheme.category || "general"}
                    {previewTheme.tags?.length ? ` · ${previewTheme.tags.join(", ")}` : ""}
                  </span>
                </div>
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => setPreviewTheme(null)}
                >
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
                    <span>No preview available for this theme.</span>
                  </div>
                )}
              </div>

              <div className="obs-preview-modal__footer">
                <button
                  className={`production-btn ${obsFavorites.has(previewTheme.id) ? "production-btn--primary" : "production-btn--ghost"}`}
                  onClick={() => handleToggleObsFavorite(previewTheme.id)}
                >
                  <Icon name={obsFavorites.has(previewTheme.id) ? "star" : "star_border"} size={16} />
                  {obsFavorites.has(previewTheme.id) ? "Added to OBS" : "Add to OBS"}
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
                    {previewTicker.source === "dock" ? "Dock Ticker" : "Permanent Ticker"}
                    {previewTicker.permanentTheme ? ` · ${previewTicker.permanentTheme.speed} speed` : ""}
                  </span>
                </div>
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => setPreviewTicker(null)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>

              <div className="obs-preview-modal__stage">
                <iframe
                  className="obs-preview-modal__iframe"
                  srcDoc={
                    previewTicker.source === "dock" && previewTicker.dockTheme
                      ? buildDockTickerPreviewHtml(previewTicker.dockTheme)
                      : previewTicker.permanentTheme
                        ? buildTickerPreviewHtml(previewTicker.permanentTheme)
                        : ""
                  }
                  sandbox="allow-same-origin"
                  title={previewTicker.name}
                />
              </div>

              <div className="obs-preview-modal__footer">
                <button
                  className={`production-btn ${tickerFavorites.has(previewTicker.id) ? "production-btn--primary" : "production-btn--ghost"}`}
                  onClick={() => handleToggleTickerFavorite(previewTicker.id)}
                >
                  <Icon name={tickerFavorites.has(previewTicker.id) ? "star" : "star_border"} size={16} />
                  {tickerFavorites.has(previewTicker.id) ? "Added to OBS" : "Add to OBS"}
                </button>
                <button
                  className="production-btn production-btn--ghost"
                  onClick={() => setPreviewTicker(null)}
                >
                  Close
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
