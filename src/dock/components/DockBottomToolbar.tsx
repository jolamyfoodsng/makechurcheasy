/**
 * DockBottomToolbar.tsx — Shared bottom toolbar for Bible & Worship tabs
 *
 * Compact layout with a two-row fallback for ultra-narrow docks.
 * [ Full | LT ] [ centered action ] ... [ visibility ] [ inline action ] [ ⋯ ]
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
  /** Hide Full/LT mode controls when the output is fixed to fullscreen */
  hideOverlayModeToggle?: boolean;
  /** Disable Full/LT while an automated slide run owns the output mode */
  overlayModeToggleDisabled?: boolean;
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
  /** Move the clear/visibility action into the overflow menu */
  clearInOverflow?: boolean;
  /** Action that stays visible outside the overflow menu */
  inlineAction?: React.ReactNode;
  /** Actions moved into the overflow menu at very narrow dock widths */
  narrowOverflowActions?: React.ReactNode;
  /** Optional action centered between the overlay mode and toolbar actions */
  centerAction?: React.ReactNode;
  /** Optional search/control card rendered inside the lower-third toolbar */
  bottomPanel?: React.ReactNode;
  /** Notify consumers when the shared lower-toolbar overflow opens or closes */
  onOverflowChange?: (open: boolean) => void;
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
  hideOverlayModeToggle = false,
  overlayModeToggleDisabled = false,
  children,
  clearLabel,
  onClear,
  clearDisabled = false,
  sourceVisible = true,
  clearInOverflow = false,
  inlineAction,
  narrowOverflowActions,
  centerAction,
  bottomPanel,
  onOverflowChange,
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
  const [isNarrow, setIsNarrow] = useState(false);
  const [isUltraNarrow, setIsUltraNarrow] = useState(false);
  const visibilityIcon = sourceVisible ? "visibility_off" : "visibility";
  const modeToggleDisabled = morphing || overlayModeToggleDisabled;

  // The dock can be narrower than the browser window, so use the toolbar's
  // actual width instead of a viewport media query for the compact action set.
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar || typeof ResizeObserver === "undefined") return;

    const updateNarrowState = () => {
      const width = toolbar.clientWidth;
      setIsNarrow(width <= 350);
      setIsUltraNarrow(width <= 239);
    };
    updateNarrowState();

    const observer = new ResizeObserver(updateNarrowState);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [collapsed]);

  // Close overflow on outside click
  useEffect(() => {
    if (!showOverflow) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-dock-keep-overflow-open='true']")) return;
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
        onOverflowChange?.(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onOverflowChange, showOverflow]);

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

  const toggleOverflow = useCallback(() => {
    setShowOverflow((prev) => {
      const next = !prev;
      onOverflowChange?.(next);
      return next;
    });
  }, [onOverflowChange]);

  const closeOverflow = useCallback(() => {
    setShowOverflow(false);
    onOverflowChange?.(false);
  }, [onOverflowChange]);

  const renderVisibilityButton = (className: string) => (
    <button
      type="button"
      className={className}
      onClick={onClear}
      disabled={clearDisabled}
      aria-label={resolvedClearLabel}
      aria-pressed={!sourceVisible}
      title={resolvedClearLabel}
    >
      <Icon name={visibilityIcon} size={16} />
    </button>
  );

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
        {onClear && !clearInOverflow && (
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
        {centerAction && (
          <div
            className="dock-btm-toolbar__center dock-btm-toolbar__center--collapsed"
            aria-label={t("dock.bottomToolbar.centerActions", "Navigation")}
          >
            {centerAction}
          </div>
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
    <div
      className={`dock-btm-toolbar dock-btm-toolbar--compact${isNarrow ? " dock-btm-toolbar--narrow" : ""}${isUltraNarrow ? " dock-btm-toolbar--ultra-narrow" : ""}`}
      ref={toolbarRef}
    >
      {bottomPanel}
      <div className={`dock-btm-toolbar__row${centerAction ? " dock-btm-toolbar__row--centered" : ""}`}>
        {!hideOverlayModeToggle && (
          <div
            className={`dock-btm-segmented${morphing ? " dock-btm-segmented--morphing" : ""}`}
            role="group"
            aria-label={`${t("dock.bottomToolbar.overlayModeLabel")}: ${overlayMode === "fullscreen" ? t("dock.bottomToolbar.fullLabel") : t("dock.bottomToolbar.ltLabel")}`}
          >
            <div className="dock-btm-display-mode-anchor" ref={displayModeMenuRef}>
              <button
                type="button"
                className={`dock-btm-segmented__item dock-btm-segmented__item--full${overlayMode === "fullscreen" ? " dock-btm-segmented__item--active" : ""}`}
                onClick={() => {
                  if (!morphing && overlayMode !== "fullscreen") onModeChange("fullscreen");
                }}
                disabled={modeToggleDisabled}
                aria-busy={morphing || undefined}
                aria-pressed={overlayMode === "fullscreen"}
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
              disabled={modeToggleDisabled}
              aria-busy={morphing || undefined}
              aria-pressed={overlayMode === "lower-third"}
              title={t("dock.bottomToolbar.lowerThirdTooltip")}
            >
              {t("dock.bottomToolbar.ltLabel")}
            </button>
          </div>
        )}

        {centerAction && (
          <div className="dock-btm-toolbar__center" aria-label={t("dock.bottomToolbar.centerActions", "Navigation")}>
            {centerAction}
          </div>
        )}

        <div className="dock_bottom_bar">
          {/* Visibility toggle — always accessible */}
          {onClear && !clearInOverflow && (
            renderVisibilityButton("dock-btm-toolbar__clear--inline")
          )}

          {inlineAction && (
            <div className="dock-btm-toolbar__inline-action">
              {inlineAction}
            </div>
          )}

          {/* ⋯ Overflow menu for hidden actions */}
          {(children || narrowOverflowActions || (onClear && clearInOverflow)) && (
            <div className="dock-btm-overflow" ref={overflowRef}>
              <button
                type="button"
                className={`dock-btm-toolbar__icon-btn${showOverflow ? " dock-btm-toolbar__icon-btn--active" : ""}`}
                onClick={toggleOverflow}
                aria-label={t("dock.bottomToolbar.moreActions")}
                title={t("dock.bottomToolbar.moreActions")}
              >
                <Icon name="more_vert" size={16} />
              </button>
              {showOverflow && (
                <div className="dock-btm-overflow__menu" role="menu">
                  {onClear && clearInOverflow && renderVisibilityButton("dock-btm-toolbar__icon-btn")}
                  {narrowOverflowActions && (
                    <div
                      className="dock-btm-overflow__narrow-actions"
                      onClick={(event) => {
                        const target = event.target as Element | null;
                        if (target?.closest("[data-dock-close-overflow='true']")) {
                          closeOverflow();
                        }
                      }}
                    >
                      {narrowOverflowActions}
                    </div>
                  )}
                  {children && (
                    <div
                      className="dock-btm-overflow__children"
                      onClick={(event) => {
                        const target = event.target as Element | null;
                        if (target?.closest("[data-dock-close-overflow='true']")) {
                          closeOverflow();
                        }
                      }}
                    >
                      {children}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
