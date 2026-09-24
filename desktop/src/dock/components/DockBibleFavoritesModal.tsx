import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import type { DockFavoriteBibleSearch } from "../bibleSearchSuggestions";
import { formatDockFavoriteBibleSearch } from "../bibleSearchSuggestions";
import type { BiblePassage } from "../../bible/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  favorites: DockFavoriteBibleSearch[];
  favoritePassages?: BiblePassage[];
  onSelectFavorite: (favorite: DockFavoriteBibleSearch) => void;
  onGoToChapter?: (favorite: DockFavoriteBibleSearch) => void;
  onSendToObs?: (favorite: DockFavoriteBibleSearch) => void;
  onRemoveFavorite?: (reference: string) => void;
}

export default function DockBibleFavoritesModal({
  isOpen,
  onClose,
  favorites,
  favoritePassages = [],
  onSelectFavorite,
  onGoToChapter,
  onSendToObs,
  onRemoveFavorite,
}: Props) {
  const { t } = useTranslation();
  const [filterQuery, setFilterQuery] = useState("");

  // Map reference -> verse text if available from favoritePassages
  const passageTextMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of favoritePassages) {
      const text = p.verses?.map((v) => v.text).filter(Boolean).join(" ");
      if (p.reference && text) {
        map.set(p.reference.toLowerCase().trim(), text);
      }
    }
    return map;
  }, [favoritePassages]);

  const filteredFavorites = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((fav) => {
      const ref = fav.reference.toLowerCase();
      const trans = fav.translation?.toLowerCase() || "";
      const text = passageTextMap.get(ref) || "";
      return ref.includes(q) || trans.includes(q) || text.toLowerCase().includes(q);
    });
  }, [favorites, filterQuery, passageTextMap]);

  if (!isOpen) return null;

  return (
    <div
      className="dock-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="dock-modal dock-modal--standard dock-bible-favorites-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dock-favorites-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dock-modal__header">
          <div className="dock-modal__title-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="star" size={18} style={{ color: "var(--dock-accent-color, #eab308)" }} />
            <h2 id="dock-favorites-modal-title" className="dock-modal__title" style={{ margin: 0 }}>
              {t("bible.favorites", "Favorite Passages")}
            </h2>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "999px",
                backgroundColor: "rgba(234, 179, 8, 0.15)",
                color: "var(--dock-accent-color, #eab308)",
                border: "1px solid rgba(234, 179, 8, 0.3)",
              }}
            >
              {favorites.length}
            </span>
          </div>
          <button
            type="button"
            className="dock-modal__close"
            onClick={onClose}
            aria-label={t("common.close", "Close")}
            title={t("common.close", "Close")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="dock-modal__body dock-bible-favorites-modal__body">
          {/* Quick Filter Bar */}
          <div className="dock-bible-favorites-modal__search">
            <Icon name="search" size={14} style={{ opacity: 0.6 }} />
            <input
              type="text"
              className="dock-input"
              placeholder={t("bible.filterFavorites", "Search favorites...")}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              autoFocus
            />
            {filterQuery && (
              <button
                type="button"
                className="dock-btn dock-btn--ghost dock-btn--compact"
                onClick={() => setFilterQuery("")}
                style={{ padding: "2px 6px" }}
                title={t("common.clear", "Clear")}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>

          {/* List of Favorites */}
          {filteredFavorites.length === 0 ? (
            <div className="dock-bible-favorites-modal__empty">
              <Icon name="star_border" size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
              <p style={{ margin: 0, fontWeight: 500 }}>
                {filterQuery
                  ? t("bible.noFavoritesMatch", "No favorites match your search")
                  : t("bible.noFavoritesYet", "No favorite passages saved yet")}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "12px", opacity: 0.7 }}>
                {filterQuery
                  ? t("bible.tryDifferentSearch", "Try searching for a different book or verse")
                  : t("bible.howToFavorite", "Click the star icon on any Bible passage to save it here for fast access.")}
              </p>
            </div>
          ) : (
            <div className="dock-bible-favorites-modal__list">
              {filteredFavorites.map((fav) => {
                const label = formatDockFavoriteBibleSearch(fav);
                const snippet = passageTextMap.get(fav.reference.toLowerCase().trim());
                return (
                  <div
                    key={fav.reference}
                    className="dock-bible-favorites-modal__item"
                  >
                    <div
                      className="dock-bible-favorites-modal__item-main"
                      onClick={() => {
                        onSelectFavorite(fav);
                        onClose();
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectFavorite(fav);
                          onClose();
                        }
                      }}
                      title={`${label} — ${t("bible.jumpToPassage", "Jump to this passage")}`}
                    >
                      <div className="dock-bible-favorites-modal__item-ref-row">
                        <Icon name="star" size={14} style={{ color: "var(--dock-accent-color, #eab308)", flexShrink: 0 }} />
                        <span className="dock-bible-favorites-modal__item-ref">
                          {fav.reference}
                        </span>
                        {fav.translation && (
                          <span className="dock-bible-favorites-modal__item-badge">
                            {fav.translation}
                          </span>
                        )}
                      </div>
                      {snippet && (
                        <div className="dock-bible-favorites-modal__item-snippet">
                          {snippet}
                        </div>
                      )}
                    </div>

                    <div className="dock-bible-favorites-modal__item-actions">
                      {onGoToChapter && (
                        <button
                          type="button"
                          className="dock-btn dock-btn--ghost dock-btn--compact"
                          onClick={(e) => {
                            e.stopPropagation();
                            onGoToChapter(fav);
                            onClose();
                          }}
                          title={t("bible.goToChapter", "Go to chapter")}
                          aria-label={t("bible.goToChapter", "Go to chapter")}
                        >
                          <Icon name="menu_book" size={13} />
                        </button>
                      )}
                      {onSendToObs && (
                        <button
                          type="button"
                          className="dock-btn dock-btn--primary dock-btn--compact"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSendToObs(fav);
                            onClose();
                          }}
                          title={t("common.sendToObs", "Send to OBS")}
                          aria-label={t("common.sendToObs", "Send to OBS")}
                        >
                          <Icon name="slideshow" size={13} />
                        </button>
                      )}
                      {onRemoveFavorite && (
                        <button
                          type="button"
                          className="dock-btn dock-btn--ghost dock-btn--compact dock-bible-favorites-modal__remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveFavorite(fav.reference);
                          }}
                          title={t("bible.removeFromFavorites", "Remove from favorites")}
                          aria-label={t("bible.removeFromFavorites", "Remove from favorites")}
                        >
                          <Icon name="delete" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="dock-modal__footer dock-bible-favorites-modal__footer">
          <span style={{ fontSize: "12px", opacity: 0.7 }}>
            {favorites.length} {favorites.length === 1 ? t("bible.savedFavorite", "favorite saved") : t("bible.savedFavorites", "favorites saved")}
          </span>
          <button
            type="button"
            className="dock-btn dock-btn--ghost"
            onClick={onClose}
          >
            {t("common.close", "Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
