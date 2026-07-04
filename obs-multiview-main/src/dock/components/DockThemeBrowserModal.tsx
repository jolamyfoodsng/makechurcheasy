/**
 * DockThemeBrowserModal.tsx — Full-screen theme browser modal for the dock
 *
 * Opens when the user clicks the theme selector in Bible / Worship tabs.
 * Shows all available themes (favorites, custom, builtin) in a searchable
 * grid with category-colored swatches and a preview strip.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { BUILTIN_THEMES } from "../../bible/themes/builtinThemes";
import type { BibleTheme } from "../../bible/types";
import {
  getBibleFavorites,
  toggleBibleFavorite,
} from "../../services/favoriteThemes";
import Icon from "../../components/Icon";

interface Props {
  open: boolean;
  selectedThemeId: string | null;
  onSelect: (theme: BibleTheme) => void;
  onClose: () => void;
  /** Open the Theme Creator for a new theme */
  onCreateNew?: () => void;
  /** Open the Theme Creator to edit a specific theme */
  onEdit?: (theme: BibleTheme) => void;
  /** Label shown in the modal header */
  title?: string;
}

export default function DockThemeBrowserModal({
  open,
  selectedThemeId,
  onSelect,
  onClose,
  onCreateNew,
  onEdit,
  title = "Select Theme",
}: Props) {
  const [allThemes, setAllThemes] = useState<BibleTheme[]>(BUILTIN_THEMES);
  const [favs, setFavs] = useState<Set<string>>(() => getBibleFavorites());
  const [search, setSearch] = useState("");

  // Load custom themes from IndexedDB
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { getCustomThemes } = await import("../../bible/bibleDb");
        const custom = await getCustomThemes();
        if (cancelled) return;
        const builtinIds = new Set(BUILTIN_THEMES.map((t) => t.id));
        const uniqueCustom = custom.filter((t) => !builtinIds.has(t.id));
        setAllThemes([...BUILTIN_THEMES, ...uniqueCustom]);
      } catch { /* IndexedDB unavailable */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const handleToggleFav = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = toggleBibleFavorite(id);
    setFavs(new Set(updated));
  }, []);

  // Filter & group themes
  const { favorites, custom, builtin } = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? allThemes.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.description ?? "").toLowerCase().includes(q) ||
            (t.category ?? "").toLowerCase().includes(q),
        )
      : allThemes;

    const favorites: BibleTheme[] = [];
    const custom: BibleTheme[] = [];
    const builtin: BibleTheme[] = [];

    for (const t of filtered) {
      if (favs.has(t.id)) favorites.push(t);
      if (t.source === "custom") custom.push(t);
      else builtin.push(t);
    }

    return { favorites, custom, builtin };
  }, [allThemes, favs, search]);

  if (!open) return null;

  const renderThemeCard = (theme: BibleTheme) => {
    const isActive = theme.id === selectedThemeId;
    const isFav = favs.has(theme.id);
    const bgColor = theme.settings.backgroundColor || "#0a0a14";
    const fontColor = theme.settings.fontColor || "#fff";
    const bgImage = theme.settings.backgroundImage;
    const hasBgImage = bgImage && !bgImage.startsWith("__") && bgImage !== "";

    return (
      <button
        key={theme.id}
        className={`dtb-card${isActive ? " dtb-card--active" : ""}`}
        onClick={() => {
          onSelect(theme);
          onClose();
        }}
        title={theme.description || theme.name}
      >
        {/* Theme preview swatch */}
        <div
          className="dtb-card__swatch"
          style={{
            background: hasBgImage ? `url(${bgImage}) center/cover` : bgColor,
            color: fontColor,
          }}
        >
          <span className="dtb-card__swatch-text">Aa</span>
          {theme.settings.logoUrl && theme.settings.logoUrl !== "" && (
            <span className="dtb-card__logo-badge" title="Has logo">
              <Icon name="image" size={8} />
            </span>
          )}
        </div>

        {/* Info row */}
        <div className="dtb-card__info">
          <span className="dtb-card__name">{theme.name}</span>
          <span className="dtb-card__actions">
            {/* Favorite star */}
            <span
              onClick={(e) => handleToggleFav(theme.id, e)}
              title={isFav ? "Remove from favorites" : "Add to favorites"}
              className={`dtb-card__fav${isFav ? " dtb-card__fav--active" : ""}`}
            >
              <Icon name={isFav ? "star" : "star_border"} size={11} />
            </span>
            {/* Edit button (custom themes only) */}
            {theme.source === "custom" && onEdit && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(theme);
                }}
                title="Edit theme"
                className="dtb-card__edit"
              >
                <Icon name="edit" size={10} />
              </span>
            )}
          </span>
        </div>

        {/* Category / source badge */}
        <div className="dtb-card__meta">
          {theme.category && (
            <span className={`dtb-card__badge dtb-card__badge--${theme.category}`}>
              {theme.category}
            </span>
          )}
          <span className={`dtb-card__badge dtb-card__badge--${theme.source}`}>
            {theme.source === "custom" ? "Custom" : "Built-in"}
          </span>
        </div>
      </button>
    );
  };

  const renderSection = (label: string, themes: BibleTheme[], icon: string) => {
    if (themes.length === 0) return null;
    return (
      <div className="dtb-section">
        <div className="dtb-section__header">
          <Icon name={icon} size={12} />
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
        {/* Header */}
        <div className="dtb-header">
          <h3 className="dtb-title">{title}</h3>
          <div className="dtb-header__actions">
            {onCreateNew && (
              <button className="dtb-create-btn" onClick={onCreateNew} title="Create new theme">
                <Icon name="add" size={14} />
                New Theme
              </button>
            )}
            <button className="dtb-close-btn" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="dtb-search">
          <Icon name="search" size={14} />
          <input
            type="text"
            className="dtb-search__input"
            placeholder="Search themes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="dtb-search__clear" onClick={() => setSearch("")}>
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        {/* Scrollable body */}
        <div className="dtb-body">
          {renderSection("Favorites", favorites, "star")}
          {renderSection("My Themes", custom, "palette")}
          {renderSection("Built-in Themes", builtin, "auto_awesome")}

          {favorites.length === 0 && custom.length === 0 && builtin.length === 0 && (
            <div className="dtb-empty">
              <Icon name="search_off" size={28} />
              <span>No themes match your search</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
