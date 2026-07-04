/**
 * DockBibleThemePicker.tsx — Bible theme picker for the dock
 *
 * Compact trigger: shows the currently selected theme with a swatch.
 * Clicking it opens a full theme-browser modal with all themes.
 * A gear button next to the label opens the Theme Creator.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { BUILTIN_THEMES } from "../../bible/themes/builtinThemes";
import type { BibleTheme } from "../../bible/types";
import Icon from "../../components/Icon";
import DockThemeBrowserModal from "./DockThemeBrowserModal";

interface Props {
  selectedThemeId: string | null;
  onSelect: (theme: BibleTheme) => void;
  label?: string;
}

export default function DockBibleThemePicker({ selectedThemeId, onSelect, label }: Props) {
  const [allThemes, setAllThemes] = useState<BibleTheme[]>(BUILTIN_THEMES);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [editTheme, setEditTheme] = useState<BibleTheme | null>(null);

  // Load custom themes from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getCustomThemes } = await import("../../bible/bibleDb");
        const custom = await getCustomThemes();
        if (cancelled) return;
        const builtinIds = new Set(BUILTIN_THEMES.map((t) => t.id));
        const uniqueCustom = custom.filter((t) => !builtinIds.has(t.id));
        setAllThemes([...BUILTIN_THEMES, ...uniqueCustom]);
      } catch {
        // bibleDb might not be available (e.g. OBS CEF without IndexedDB)
      }
    })();
    return () => { cancelled = true; };
  }, [showCreator]);  // Reload after creator closes (in case a theme was saved)

  const selected = useMemo(
    () => allThemes.find((t) => t.id === selectedThemeId) ?? allThemes[0],
    [allThemes, selectedThemeId],
  );

  const handleSelect = useCallback(
    (theme: BibleTheme) => {
      onSelect(theme);
    },
    [onSelect],
  );

  // Auto-pick a visible theme so payloads always carry a valid theme.
  useEffect(() => {
    if (!selected) return;
    if (selectedThemeId === selected.id) return;
    handleSelect(selected);
  }, [selected, selectedThemeId, handleSelect]);

  const handleThemeSaved = useCallback((theme: BibleTheme) => {
    onSelect(theme);
    setShowCreator(false);
    setEditTheme(null);
  }, [onSelect]);

  return (
    <>
      <div className="dock-bible-theme-picker">
        {/* Label + gear row */}
        <div className="dock-theme-label-row">
          <div className="dock-section-label">
            {label ?? "Bible Theme"}
          </div>
          <button
            className="dock-theme-gear-btn"
            onClick={() => { setEditTheme(null); setShowCreator(true); }}
            title="Create a new theme"
          >
            <Icon name="add_circle" size={14} />
          </button>
        </div>

        {/* Selected theme preview — click to open theme browser */}
        <button
          className="dock-theme-dropdown-trigger"
          onClick={() => setShowBrowser(true)}
          title={selected?.description || selected?.name || "Select theme"}
        >
          <div
            className="dock-theme-dropdown-trigger__swatch"
            style={{
              background: selected?.settings.backgroundColor || "#0a0a14",
              color: selected?.settings.fontColor || "#fff",
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.9 }}>Aa</span>
          </div>
          <span className="dock-theme-dropdown-trigger__name">
            {selected?.name || "Select Theme"}
          </span>
          <Icon name="expand_more" size={14} style={{ color: "var(--dock-text-dim)" }} />
        </button>
      </div>

      {/* Theme browser modal */}
      <DockThemeBrowserModal
        open={showBrowser}
        selectedThemeId={selectedThemeId}
        onSelect={handleSelect}
        onClose={() => setShowBrowser(false)}
        onCreateNew={() => {
          setShowBrowser(false);
          setEditTheme(null);
          setShowCreator(true);
        }}
        onEdit={(theme) => {
          setShowBrowser(false);
          setEditTheme(theme);
          setShowCreator(true);
        }}
        title={label ?? "Select Bible Theme"}
      />

      {/* Theme Creator modal (lazy-loaded) */}
      {showCreator && (
        <ThemeCreatorLazy
          onClose={() => { setShowCreator(false); setEditTheme(null); }}
          onSaved={handleThemeSaved}
          editTheme={editTheme}
        />
      )}
    </>
  );
}

/**
 * Lazy wrapper for the Theme Creator Modal.
 * We lazy-import it so the dock doesn't load ~1200 lines of modal code upfront.
 */
import { lazy, Suspense } from "react";

const LazyThemeCreatorModal = lazy(() => import("../../pages/ThemeCreatorModal"));

function ThemeCreatorLazy(props: {
  onClose: () => void;
  onSaved: (theme: BibleTheme) => void;
  editTheme?: BibleTheme | null;
}) {
  return (
    <Suspense fallback={null}>
      <LazyThemeCreatorModal {...props} />
    </Suspense>
  );
}
