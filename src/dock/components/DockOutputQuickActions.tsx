import { useCallback, useEffect, useRef, useState } from "react";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";
import Icon from "../DockIcon";

export type DockOutputQuickTextSettings = Pick<
  DockFullscreenQuickThemeSettings,
  "fontSize" | "autoFontScale"
>;

export const DEFAULT_DOCK_OUTPUT_QUICK_ACTIONS_TOP = 96;

const QUICK_ACTIONS_MIN_TOP = 8;
const QUICK_ACTIONS_HANDLE_WIDTH = 30;
const QUICK_ACTIONS_HANDLE_HEIGHT = 74;
const QUICK_ACTIONS_BOTTOM_GAP = 12;

interface DockOutputQuickActionsProps {
  title?: string;
  textLabel: string;
  lineLabel: string;
  settings: DockOutputQuickTextSettings;
  lineCount: number;
  maxLineCount: number;
  minFontSize: number;
  maxFontSize: number;
  updateImmediately: boolean;
  top: number;
  left: number | null;
  onPositionChange: (top: number, left: number | null) => void;
  onCommit: (patch: Partial<DockOutputQuickTextSettings>, lineCount?: number) => void;
  onUpdateImmediatelyChange: (value: boolean) => void;
}

interface QuickActionDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startTop: number;
  startLeft: number;
  moved: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function getParentBounds(element: HTMLDivElement | null): { width: number; height: number } | null {
  const parent = element?.parentElement;
  if (!parent) return null;
  const rect = parent.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function clampPosition(
  element: HTMLDivElement | null,
  top: number,
  left: number,
): { top: number; left: number } {
  const bounds = getParentBounds(element);
  if (!bounds) {
    return { top: Math.max(QUICK_ACTIONS_MIN_TOP, top), left: Math.max(0, left) };
  }

  const maxTop = Math.max(
    QUICK_ACTIONS_MIN_TOP,
    bounds.height - QUICK_ACTIONS_HANDLE_HEIGHT - QUICK_ACTIONS_BOTTOM_GAP,
  );
  const maxLeft = Math.max(0, bounds.width - QUICK_ACTIONS_HANDLE_WIDTH);
  return {
    top: Math.round(clamp(top, QUICK_ACTIONS_MIN_TOP, maxTop)),
    left: Math.round(clamp(left, 0, maxLeft)),
  };
}

export default function DockOutputQuickActions({
  title = "OBS text size",
  textLabel,
  lineLabel,
  settings,
  lineCount,
  maxLineCount,
  minFontSize,
  maxFontSize,
  updateImmediately,
  top,
  left,
  onPositionChange,
  onCommit,
  onUpdateImmediatelyChange,
}: DockOutputQuickActionsProps) {
  const [open, setOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<Partial<DockOutputQuickTextSettings> | null>(null);
  const [draftLineCount, setDraftLineCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<QuickActionDragState | null>(null);
  const suppressClickRef = useRef(false);

  const displayedSettings: DockOutputQuickTextSettings = {
    ...settings,
    ...(draftSettings ?? {}),
  };
  const displayedLineCount = draftLineCount ?? lineCount;
  const currentFontSize = typeof displayedSettings.fontSize === "number"
    ? displayedSettings.fontSize
    : minFontSize;
  const areManualFontSizesDisabled = displayedSettings.autoFontScale === true;
  const hasPendingChanges = draftSettings !== null || draftLineCount !== null;
  const menuOnRight = left !== null && left < 210;

  const normalizePosition = useCallback(() => {
    const actualLeft = left ?? Math.max(0, (getParentBounds(rootRef.current)?.width ?? QUICK_ACTIONS_HANDLE_WIDTH) - QUICK_ACTIONS_HANDLE_WIDTH);
    const next = clampPosition(rootRef.current, top, actualLeft);
    const isRightAnchored = left === null && next.left === Math.max(0, (getParentBounds(rootRef.current)?.width ?? QUICK_ACTIONS_HANDLE_WIDTH) - QUICK_ACTIONS_HANDLE_WIDTH);
    if (next.top !== top || (!isRightAnchored && left !== next.left) || (isRightAnchored && left !== null)) {
      onPositionChange(next.top, isRightAnchored ? null : next.left);
    }
  }, [left, onPositionChange, top]);

  useEffect(() => {
    normalizePosition();
    const handleResize = () => normalizePosition();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [normalizePosition]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const applySettingsPatch = useCallback((patch: Partial<DockOutputQuickTextSettings>) => {
    if (updateImmediately) {
      onCommit(patch);
      return;
    }
    setDraftSettings((current) => ({
      ...(current ?? settings),
      ...patch,
    }));
  }, [onCommit, settings, updateImmediately]);

  const applyLineCount = useCallback((nextLineCount: number) => {
    const next = Math.min(Math.max(1, Math.trunc(nextLineCount)), maxLineCount);
    if (updateImmediately) {
      onCommit({}, next);
      return;
    }
    setDraftLineCount(next);
  }, [maxLineCount, onCommit, updateImmediately]);

  const handleSave = useCallback(() => {
    if (!hasPendingChanges) return;
    onCommit(draftSettings ?? {}, draftLineCount ?? undefined);
    setDraftSettings(null);
    setDraftLineCount(null);
  }, [draftLineCount, draftSettings, hasPendingChanges, onCommit]);

  const handleUpdateImmediatelyChange = useCallback((nextValue: boolean) => {
    if (nextValue && hasPendingChanges) {
      onCommit(draftSettings ?? {}, draftLineCount ?? undefined);
      setDraftSettings(null);
      setDraftLineCount(null);
    }
    onUpdateImmediatelyChange(nextValue);
  }, [draftLineCount, draftSettings, hasPendingChanges, onCommit, onUpdateImmediatelyChange]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = getParentBounds(rootRef.current);
    const currentLeft = left ?? Math.max(0, (bounds?.width ?? QUICK_ACTIONS_HANDLE_WIDTH) - QUICK_ACTIONS_HANDLE_WIDTH);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: top,
      startLeft: currentLeft,
      moved: false,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [left, top]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 3) return;
    drag.moved = true;
    const next = clampPosition(rootRef.current, drag.startTop + deltaY, drag.startLeft + deltaX);
    onPositionChange(next.top, next.left);
  }, [onPositionChange]);

  const finishPointerDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((current) => !current);
  }, []);

  return (
    <div
      ref={rootRef}
      className={`dock-bible-reader__quick-actions${menuOnRight ? " dock-bible-reader__quick-actions--menu-right" : ""}`}
      style={{
        top: `${top}px`,
        ...(left !== null ? { left: `${left}px`, right: "auto" } : {}),
      }}
    >
      <button
        type="button"
        className={`dock-bible-reader__quick-actions-trigger${open ? " dock-bible-reader__quick-actions-trigger--active" : ""}${isDragging ? " dock-bible-reader__quick-actions-trigger--dragging" : ""}`}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${textLabel} quick actions. Drag to move.`}
        title={`${textLabel} quick actions. Drag to move.`}
      >
        <span className="dock-bible-reader__quick-actions-label">Quick</span>
      </button>

      {open && (
        <div className="dock-bible-reader__font-size-menu" role="dialog" aria-label={`${textLabel} output controls`}>
          <div className="dock-bible-reader__font-size-menu-header">
            <span>{title}</span>
            <span className="dock-output-quick-actions__live">LIVE</span>
          </div>

          <div className="dock-bible-reader__font-size-field">
            <span className="dock-bible-reader__font-size-field-label">Fit text to frame</span>
            <small>Shrinks text when it would overflow.</small>
            <button
              type="button"
              className={`dtb-toggle${displayedSettings.autoFontScale ? " dtb-toggle--on" : ""}`}
              onClick={() => applySettingsPatch({ autoFontScale: !displayedSettings.autoFontScale })}
              role="switch"
              aria-checked={displayedSettings.autoFontScale === true}
              aria-label="Fit text to frame"
            >
              <span className="dtb-toggle__knob" />
            </button>
          </div>

          <div className="dock-bible-reader__font-size-field">
            <span className="dock-bible-reader__font-size-field-label">{textLabel}</span>
            <div className="dock-bible-reader__font-size-controls">
              <button
                type="button"
                className="dock-bible-reader__font-size-btn"
                onClick={() => applySettingsPatch({ fontSize: Math.max(minFontSize, currentFontSize - 4) })}
                disabled={areManualFontSizesDisabled || currentFontSize <= minFontSize}
                aria-label={`Decrease ${textLabel.toLowerCase()} size`}
                title={`Decrease ${textLabel.toLowerCase()} size`}
              >
                <Icon name="remove" size={11} />
              </button>
              <span className="dock-bible-reader__font-size-value">{currentFontSize}px</span>
              <button
                type="button"
                className="dock-bible-reader__font-size-btn"
                onClick={() => applySettingsPatch({ fontSize: Math.min(maxFontSize, currentFontSize + 4) })}
                disabled={areManualFontSizesDisabled || currentFontSize >= maxFontSize}
                aria-label={`Increase ${textLabel.toLowerCase()} size`}
                title={`Increase ${textLabel.toLowerCase()} size`}
              >
                <Icon name="add" size={11} />
              </button>
            </div>
          </div>

          <label className="dock-bible-reader__font-size-field">
            <span className="dock-bible-reader__font-size-field-label">{lineLabel}</span>
            <select
              className="dock-bible-reader__font-size-select"
              value={displayedLineCount}
              onChange={(event) => applyLineCount(Number(event.target.value))}
              aria-label={lineLabel}
            >
              {Array.from({ length: maxLineCount }, (_, index) => index + 1).map((count) => (
                <option key={`quick-lines-${count}`} value={count}>
                  {count} {count === 1 ? "line" : "lines"}
                </option>
              ))}
            </select>
          </label>

          <div className="dock-bible-reader__font-size-menu-footer">
            <label className="dock-bible-reader__font-size-checkbox">
              <input
                type="checkbox"
                checked={updateImmediately}
                onChange={(event) => handleUpdateImmediatelyChange(event.target.checked)}
              />
              <span>Update Immediately</span>
            </label>
            {!updateImmediately && (
              <button
                type="button"
                className="dock-bible-reader__font-size-save"
                onClick={handleSave}
                disabled={!hasPendingChanges}
              >
                Save
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
