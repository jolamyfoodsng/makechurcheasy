/**
 * DockBottomToolbar.tsx — Shared bottom toolbar for Bible & Worship tabs
 *
 * Default: single-row (toggle | divider | actions | spacer | collapse) + clear below
 * ≤250px: two-row compact (toggle + collapse | action icons incl. delete inline)
 */

import Icon from "../DockIcon";
import "./DockBottomToolbar.css";

type OverlayMode = "fullscreen" | "lower-third";

interface Props {
  /** Current overlay mode */
  overlayMode: OverlayMode;
  /** Called when the operator toggles Full ↔ LT */
  onModeChange: (mode: OverlayMode) => void;
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
  /** Whether the toolbar is collapsed (controlled) */
  collapsed?: boolean;
  /** Called when collapse/expand is toggled */
  onCollapseChange?: (collapsed: boolean) => void;
}

export default function DockBottomToolbar({
  overlayMode,
  onModeChange,
  morphing = false,
  children,
  clearLabel = "Hide Bible",
  onClear,
  clearDisabled = false,
  collapsed = false,
  onCollapseChange,
}: Props) {

  if (collapsed) {
    return (
      <div className="dock-btm-toolbar dock-btm-toolbar--collapsed">
        {onClear && (
          <button
            type="button"
            className="dock-btm-toolbar__clear dock-btm-toolbar__clear--bible"
            onClick={onClear}
            disabled={clearDisabled}
            title={clearLabel}
          >
            <span>Hide Bible</span>
            {/* <Icon name="delete_sweep" size={16} /> */}
          </button>
        )}
        <button
          type="button"
          className="dock-btm-toolbar__icon-btn"
          onClick={() => onCollapseChange?.(false)}
          aria-label="Expand toolbar"
          title="Expand toolbar"
        >
          <Icon name="expand_less" size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="dock-btm-toolbar">
      <div className="dock-btm-toolbar__row">
        {/* Segmented mode control */}
        <div
          className={`dock-btm-segmented${morphing ? " dock-btm-segmented--morphing" : ""}`}
          role="group"
          aria-label="Overlay mode"
        >
          <button
            type="button"
            className={`dock-btm-segmented__item${overlayMode === "fullscreen" ? " dock-btm-segmented__item--active" : ""}`}
            onClick={() => onModeChange("fullscreen")}
            title="Fullscreen overlay"
          >
            Full
          </button>
          <button
            type="button"
            className={`dock-btm-segmented__item${overlayMode === "lower-third" ? " dock-btm-segmented__item--active" : ""}`}
            onClick={() => onModeChange("lower-third")}
            title="Lower-third overlay"
          >
            LT
          </button>
          <button
            type="button"
            className="dock-btm-toolbar__icon-btn dock-btm-toolbar__icon-btn--collapse"
            onClick={() => onCollapseChange?.(true)}
            aria-label="Collapse toolbar"
            title="Collapse toolbar"
          >
            <Icon name="expand_more" size={18} />
          </button>


        </div>

        {/* Action buttons + collapse grouped together */}
        <div className="dock-btm-toolbar__actions">
          {children}
          {onClear && (
            <button
              type="button"
              className="dock-btm-toolbar__clear--inline"
              onClick={onClear}
              disabled={clearDisabled}
              title={clearLabel}
            >
              <Icon name="delete_sweep" size={16} />
            </button>
          )}
          <button
            type="button"
            className="dock-btm-toolbar__icon-btn dock-btm-toolbar__icon-btn--collapse_two"
            onClick={() => onCollapseChange?.(true)}
            aria-label="Collapse toolbar"
            title="Collapse toolbar"
          >
            <Icon name="expand_more" size={18} />
          </button>


        </div>

        {/* Clear button — inline with actions at ≤250px, full-width below at wider */}
        {onClear && (
          <button
            type="button"
            className="dock-btm-toolbar__clear dock-btm-toolbar__clear--bible"
            onClick={onClear}
            disabled={clearDisabled}
            title={clearLabel}
          >
            <span>Hide Bible</span>
            {/* <Icon name="delete_sweep" size={16} /> */}
            {/* <span>{clearLabel}</span> */}
          </button>
        )}


      </div>
      <button
        type="button"
        className="dock-btm-toolbar__clear dock-btm-toolbar__clear--full"
        onClick={onClear}
        disabled={clearDisabled}
        title={clearLabel}
      >
        <span>{clearLabel}</span>
        {/* <Icon name="delete_sweep" size={16} /> */}
      </button>
    </div>
  );
}
