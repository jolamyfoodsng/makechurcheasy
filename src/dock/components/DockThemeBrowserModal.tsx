import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { BibleTheme } from "../../bible/types";
import { loadDockFavoriteBibleThemes } from "../dockThemeData";
import { dockEntitlementGuard, requireEntitlement } from "../dockEntitlement";
import DockIcon from "../DockIcon";
import ThemePreviewSurface from "../../components/ThemePreviewSurface";

interface Props {
  open: boolean;
  selectedThemeId: string | null;
  onSelect: (theme: BibleTheme) => void;
  onClose: () => void;
  title?: string;
  templateType?: BibleTheme["templateType"];
  allowedCategories?: Array<NonNullable<BibleTheme["category"]>>;
  /** Current number of favorite themes the user has saved */
  themeCount?: number;
}

function clampPreviewSize(size: number, min: number, max: number, ratio = 0.2): number {
  return Math.max(min, Math.min(max, Math.round(size * ratio)));
}

export default function DockThemeBrowserModal({
  open,
  selectedThemeId,
  onSelect,
  onClose,
  title,
  templateType,
  allowedCategories,
  themeCount = 0,
}: Props) {
  const { t } = useTranslation();
  const resolvedTitle = title || t('themes.selectTheme');
  const [allThemes, setAllThemes] = useState<BibleTheme[]>([]);
  const [search, setSearch] = useState("");
  const [themeLimit, setThemeLimit] = useState<number>(-1);

  // Fetch theme entitlement limit on open
  useEffect(() => {
    if (!open) return;
    void dockEntitlementGuard("themes", themeCount).then((result) => {
      setThemeLimit(result.limit);
    });
  }, [open, themeCount]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      const favoriteThemes = await loadDockFavoriteBibleThemes();
      if (cancelled) return;
      const allowed = new Set((allowedCategories ?? []).map((category) => category.toLowerCase()));
      const filtered = allowed.size === 0
        ? favoriteThemes
        : favoriteThemes.filter((theme) => {
          const categories = theme.categories?.length ? theme.categories : theme.category ? [theme.category] : [];
          if (categories.length === 0) return false;
          return categories.some((category) => allowed.has(category.toLowerCase()));
        });
      setAllThemes(filtered);
    })();

    return () => {
      cancelled = true;
    };
  }, [allowedCategories, open, templateType]);

  const favorites = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q
      ? allThemes.filter(
        (theme) =>
          theme.name.toLowerCase().includes(q) ||
          (theme.description ?? "").toLowerCase().includes(q) ||
          (theme.category ?? "").toLowerCase().includes(q) ||
          (theme.categories ?? []).some((category) => category.toLowerCase().includes(q)),
      )
      : allThemes;
  }, [allThemes, search]);

  if (!open) return null;

  const isUnlimited = themeLimit === -1 || themeLimit === Infinity;
  const lockedThemeIds = new Set(
    isUnlimited ? [] : allThemes.slice(themeLimit).map((t) => t.id),
  );

  const renderThemeCard = (theme: BibleTheme) => {
    const isActive = theme.id === selectedThemeId;
    const isLocked = lockedThemeIds.has(theme.id);
    const bgColor = theme.settings.boxBackground || theme.settings.backgroundColor || "#0F172A";
    const fontColor = theme.settings.fontColor || "#fff";
    const bgImage = theme.settings.boxBackgroundImage || theme.settings.backgroundImage;
    const bgVideo = theme.settings.backgroundVideo;
    const hasBgImage = Boolean(bgImage && !bgImage.startsWith("__"));
    const textAlign = theme.settings.textAlign || "center";

    return (
      <button
        key={theme.id}
        className={`dtb-card${isActive ? " dtb-card--active" : ""}${isLocked ? " dtb-card--locked" : ""}`}
        onClick={() => {
          if (isLocked) {
            void requireEntitlement("themes", themeCount);
            return;
          }
          onSelect(theme);
          onClose();
        }}
        title={isLocked ? t('themes.upgradeToUnlock') : (theme.description || theme.name)}
      >
        <ThemePreviewSurface
          className="dtb-card__swatch"
          videoSrc={bgVideo}
          posterSrc={hasBgImage ? bgImage : undefined}
          style={{
            background: hasBgImage ? `url(${bgImage}) center/cover` : bgColor,
            color: fontColor,
            fontFamily: theme.settings.fontFamily,
            textAlign,
          }}
        >
          <div className="dtb-card__swatch-preview">
            <span
              className="dtb-card__swatch-main"
              style={{
                fontSize: clampPreviewSize(theme.settings.fontSize, 10, 18),
                fontWeight: theme.settings.fontWeight === "light" ? 400 : theme.settings.fontWeight === "bold" ? 700 : 500,
                textTransform: theme.settings.textTransform,
                textShadow: theme.settings.textShadow,
                color: theme.settings.fontColor,
              }}
            >
              Faith
            </span>
            <span
              className="dtb-card__swatch-ref"
              style={{
                fontSize: clampPreviewSize(theme.settings.refFontSize, 8, 12),
                fontWeight: theme.settings.refFontWeight === "light" ? 400 : theme.settings.refFontWeight === "bold" ? 700 : 500,
                color: theme.settings.refFontColor || theme.settings.fontColor,
              }}
            >
              John 3:16
            </span>
          </div>
          {theme.settings.logoUrl && (
            <span className="dtb-card__logo-badge" title={t('themes.includesLogo')}>
              <DockIcon name="image" size={9} />
            </span>
          )}
          {isLocked && (
            <span className="dtb-card__lock-badge" title={t('themes.upgradeToUnlock')}>
              <DockIcon name="lock" size={14} />
            </span>
          )}
        </ThemePreviewSurface>

        <div className="dtb-card__info">
          <span className="dtb-card__name">{theme.name}</span>
          {/* <span className="dtb-card__favorite-badge">
            <Star size={10} />
            Favorite
          </span> */}
        </div>

        <div className="dtb-card__meta">
          {(theme.categories?.length ? theme.categories : theme.category ? [theme.category] : []).map((category) => (
            <span key={`${theme.id}-${category}`} className={`dtb-card__badge dtb-card__badge--${category}`}>
              {category}
            </span>
          ))}
          <span className={`dtb-card__badge dtb-card__badge--${theme.source}`}>
            {theme.source === "custom" ? t('themes.custom') : t('themes.builtin')}
          </span>
        </div>
      </button>
    );
  };

  const renderSection = (label: string, themes: BibleTheme[]) => {
    if (themes.length === 0) return null;
    return (
      <div className="dtb-section">
        <div className="dtb-section__header">
          <span>{label}</span>
          <span className="dtb-section__count">{themes.length}</span>
        </div>
        <div className="dtb-grid">
          {themes.map(renderThemeCard)}
        </div>
      </div>
    );
  };

  return (
    <div className="dtb-backdrop" onClick={onClose}>
      <div className="dtb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dtb-header">
          <h3 className="dtb-title">{resolvedTitle}</h3>
          <div className="dtb-header__actions">
            <button className="dtb-close-btn" onClick={onClose} aria-label={t('common.close')} title="Close">
              <DockIcon name="close" size={16} />
            </button>
          </div>
        </div>

        <div className="dtb-search">
          <DockIcon name="search" size={14} />
          <input
            type="text"
            className="dtb-search__input"
            placeholder={t('themes.searchThemes')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('common.search')}
            autoFocus
          />
          {search && (
            <button type="button" className="dtb-search__clear" onClick={() => setSearch("")} aria-label={t('common.clear')} title="Close">
              <DockIcon name="close" size={12} />
            </button>
          )}
        </div>

        <div className="dtb-body">
          {renderSection(t('themes.favoriteThemes'), favorites)}

          {favorites.length === 0 && (
            <div className="dtb-empty">
              <DockIcon name="widgets" size={28} />
              <span>{t('themes.noThemesFound')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
