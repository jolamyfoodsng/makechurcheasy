/**
 * DockBottomToolbar.tsx — Shared bottom toolbar for Bible & Worship tabs
 *
 * Always compact one-row layout at every width.
 * [ Full | LT ] ... [ visibility ] [ inline action ] [ ⋯ ]
 */

import { useCallback, useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import "./DockBottomToolbar.css";

type OverlayMode = "fullscreen" | "lower-third";
type DisplayMode = "single" | "compare";
const DISPLAY_MODES = [
  { id: "single" as const, labelKey: "dock.bottomToolbar.singleTranslation" },
  { id: "compare" as const, labelKey: "dock.bottomToolbar.compareTranslations" },
];

interface Props {
  /** Current overlay mode */
  overlayMode: OverlayMode;
  /** Called when the operator toggles Full ↔ LT */
  onModeChange: (mode: OverlayMode) => void;
  /** Current display mode (single translation or compare) */
  displayMode?: DisplayMode;
  /** Called when the operator switches display mode */
  onDisplayModeChange?: (mode: DisplayMode) => void;
  /** Whether the segmented control shows the morphing pulse */
  morphing?: boolean;
  /** Action buttons rendered between the divider and spacer */
  children?: React.ReactNode;
  /** Label for the clear button */
  clearLabel?: string;
  /** Called when the clear button is clicked */
  onClear?: () => void;
  /** Whether the clear button is disabled */
  clearDisabled?: boolean;
  /** Whether the associated OBS source is currently visible */
  sourceVisible?: boolean;
  /** Action that stays visible outside the overflow menu */
  inlineAction?: React.ReactNode;
  /** Whether the toolbar is collapsed (controlled) */
  collapsed?: boolean;
  /** Called when collapse/expand is toggled */
  onCollapseChange?: (collapsed: boolean) => void;
}

export default function DockBottomToolbar({
  overlayMode,
  onModeChange,
  displayMode = "single",
  onDisplayModeChange,
  morphing = false,
  children,
  clearLabel,
  onClear,
  clearDisabled = false,
  sourceVisible = true,
  inlineAction,
  collapsed = false,
  onCollapseChange,
}: Props) {
  const { t } = useTranslation();
  const resolvedClearLabel = clearLabel ?? t("dock.bottomToolbar.hideBible");
  const [showOverflow, setShowOverflow] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const [showDisplayModeMenu, setShowDisplayModeMenu] = useState(false);
  const displayModeMenuRef = useRef<HTMLDivElement>(null);
  const visibilityIcon = sourceVisible ? "visibility_off" : "visibility";

  // Close overflow on outside click
  useEffect(() => {
    if (!showOverflow) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showOverflow]);

  // Close display mode menu on outside click
  useEffect(() => {
    if (!showDisplayModeMenu) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (displayModeMenuRef.current && !displayModeMenuRef.current.contains(e.target as Node)) {
        setShowDisplayModeMenu(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showDisplayModeMenu]);

  const toggleOverflow = useCallback(() => setShowOverflow((prev) => !prev), []);

  const handleDisplayModeSelect = useCallback(
    (mode: DisplayMode) => {
      onDisplayModeChange?.(mode);
      setShowDisplayModeMenu(false);
    },
    [onDisplayModeChange],
  );

  if (collapsed) {
    return (
      <div className="dock-btm-toolbar dock-btm-toolbar--collapsed" ref={toolbarRef}>
        {onClear && (
          <button
            type="button"
            className="dock-btm-toolbar__clear dock-btm-toolbar__clear--bible"
            onClick={onClear}
            disabled={!clearDisabled}
            title={resolvedClearLabel}
          >
            <span>{t("dock.bottomToolbar.hideBible")}</span>
          </button>
        )}
        {inlineAction}
        <button
          type="button"
          className="dock-btm-toolbar__icon-btn"
          onClick={() => onCollapseChange?.(false)}
          aria-label={t("dock.bottomToolbar.expandTooltip")}
          title={t("dock.bottomToolbar.expandTooltip")}
        >
          <Icon name="expand_less" size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="dock-btm-toolbar dock-btm-toolbar--compact" ref={toolbarRef}>
      <div className="dock-btm-toolbar__row">
        {/* Segmented: Full ▼ | LT */}
        <div
          className={`dock-btm-segmented${morphing ? " dock-btm-segmented--morphing" : ""}`}
          role="group"
          aria-label={t("dock.bottomToolbar.overlayModeLabel")}
        >
          <div className="dock-btm-display-mode-anchor" ref={displayModeMenuRef}>
            <button
              type="button"
              className={`dock-btm-segmented__item dock-btm-segmented__item--full${overlayMode === "fullscreen" ? " dock-btm-segmented__item--active" : ""}`}
              onClick={() => {
                if (!morphing && overlayMode !== "fullscreen") onModeChange("fullscreen");
              }}
              disabled={morphing}
              aria-busy={morphing}
              title={t("dock.bottomToolbar.fullscreenTooltip")}
            >
              {t("dock.bottomToolbar.fullLabel")}
            </button>
            {showDisplayModeMenu && onDisplayModeChange && (
              <div className="dock-btm-display-mode-menu" role="menu">
                {DISPLAY_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`dock-btm-display-mode-menu__item${displayMode === mode.id ? " dock-btm-display-mode-menu__item--active" : ""}`}
                    onClick={() => handleDisplayModeSelect(mode.id)}
                    role="menuitem"
                  >
                    {t(mode.labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`dock-btm-segmented__item${overlayMode === "lower-third" ? " dock-btm-segmented__item--active" : ""}`}
            onClick={() => {
              if (!morphing && overlayMode !== "lower-third") onModeChange("lower-third");
            }}
            disabled={morphing}
            aria-busy={morphing}
            title={t("dock.bottomToolbar.lowerThirdTooltip")}
          >
            {t("dock.bottomToolbar.ltLabel")}
          </button>
        </div>

        <div className="dock_bottom_bar">
          {/* Visibility toggle — always accessible */}
          {onClear && (
            <button
              type="button"
              className="dock-btm-toolbar__clear--inline"
              onClick={onClear}
              disabled={clearDisabled}
              aria-label={resolvedClearLabel}
              aria-pressed={!sourceVisible}
              title={resolvedClearLabel}
            >
              <Icon name={visibilityIcon} size={16} />
            </button>
          )}

          {inlineAction}

          {/* ⋯ Overflow menu for hidden actions */}
          {children && (
            <div className="dock-btm-overflow" ref={overflowRef}>
              <button
                type="button"
                className={`dock-btm-toolbar__icon-btn${showOverflow ? " dock-btm-toolbar__icon-btn--active" : ""}`}
                onClick={toggleOverflow}
                aria-label={t("dock.bottomToolbar.moreActions")}
                title={t("dock.bottomToolbar.moreActions")}
              >
                <Icon name="more_horiz" size={16} />
              </button>
              {showOverflow && (
                <div className="dock-btm-overflow__menu" role="menu">
                  {children}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
