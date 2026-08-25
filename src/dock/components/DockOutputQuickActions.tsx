import { useCallback, useEffect, useRef, useState } from "react";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";
import Icon from "../DockIcon";

export type DockOutputQuickTextSettings = Pick<
  DockFullscreenQuickThemeSettings,
  "fontSize" | "autoFontScale"
>;

export type DockOutputQuickSettingsPatch = Partial<DockFullscreenQuickThemeSettings>;

export type DockOutputLineMode = "count" | "original";

export type DockOutputQuickSizePreset = {
  id: string;
  label: string;
  value?: string;
};

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
  lineMode?: DockOutputLineMode;
  maxLineCount: number;
  minFontSize: number;
  maxFontSize?: number;
  updateImmediately: boolean;
  isLive: boolean;
  top: number;
  left: number | null;
  onPositionChange: (top: number, left: number | null) => void;
  onCommit: (
    patch: DockOutputQuickSettingsPatch,
    lineCount?: number,
    lineMode?: DockOutputLineMode,
  ) => void;
  originalLineLabel?: string;
  sizePresets?: readonly DockOutputQuickSizePreset[];
  activeSizePreset?: string;
  getSizePresetPatch?: (id: string) => DockOutputQuickSettingsPatch | null;
  onUpdateImmediatelyChange: (value: boolean) => void;
}

interface QuickActionDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startTop: number;
  startLeft: number;
  currentTop: number;
  currentLeft: number;
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

function getElementLeft(element: HTMLDivElement | null, fallback: number): number {
  const parent = element?.parentElement;
  const parentRect = parent?.getBoundingClientRect();
  const elementRect = element?.getBoundingClientRect();
  if (!parentRect || !elementRect) return fallback;
  return elementRect.left - parentRect.left;
}

function getRightEdgeLeft(element: HTMLDivElement | null): number {
  const width = getParentBounds(element)?.width ?? QUICK_ACTIONS_HANDLE_WIDTH;
  return Math.max(0, width - QUICK_ACTIONS_HANDLE_WIDTH);
}

export function snapDockQuickActionsLeft(
  requestedLeft: number,
  containerWidth: number,
  handleWidth = QUICK_ACTIONS_HANDLE_WIDTH,
): number | null {
  const maxLeft = Math.max(0, containerWidth - handleWidth);
  if (maxLeft === 0) return 0;

  const clampedLeft = clamp(requestedLeft, 0, maxLeft);
  return clampedLeft <= maxLeft / 2 ? 0 : null;
}

/** Quick actions may move vertically, but they snap to an edge only when dragging ends. */
function snapLeftToDockEdge(element: HTMLDivElement | null, requestedLeft: number): number | null {
  const bounds = getParentBounds(element);
  if (!bounds) return requestedLeft <= 0 ? 0 : null;
  return snapDockQuickActionsLeft(requestedLeft, bounds.width);
}

function clampPosition(
  element: HTMLDivElement | null,
  top: number,
  left: number,
): { top: number; left: number | null } {
  const bounds = getParentBounds(element);
  if (!bounds) {
    return {
      top: Math.max(QUICK_ACTIONS_MIN_TOP, top),
      left: Math.max(0, left),
    };
  }

  const maxTop = Math.max(
    QUICK_ACTIONS_MIN_TOP,
    bounds.height - QUICK_ACTIONS_HANDLE_HEIGHT - QUICK_ACTIONS_BOTTOM_GAP,
  );
  return {
    top: Math.round(clamp(top, QUICK_ACTIONS_MIN_TOP, maxTop)),
    left: Math.round(clamp(left, 0, bounds.width - QUICK_ACTIONS_HANDLE_WIDTH)),
  };
}

export default function DockOutputQuickActions({
  title = "OBS text size",
  textLabel,
  lineLabel,
  settings,
  lineCount,
  lineMode = "count",
  maxLineCount,
  minFontSize,
  maxFontSize,
  updateImmediately,
  isLive,
  top,
  left,
  onPositionChange,
  onCommit,
  originalLineLabel = "Original",
  sizePresets,
  activeSizePreset,
  getSizePresetPatch,
  onUpdateImmediatelyChange,
}: DockOutputQuickActionsProps) {
  const [open, setOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<DockOutputQuickSettingsPatch | null>(null);
  const [draftLineCount, setDraftLineCount] = useState<number | null>(null);
  const [draftLineMode, setDraftLineMode] = useState<DockOutputLineMode | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<QuickActionDragState | null>(null);
  const suppressClickRef = useRef(false);

  const displayedSettings: DockOutputQuickTextSettings = {
    ...settings,
    ...(draftSettings ?? {}),
  };
  const displayedLineCount = draftLineCount ?? lineCount;
  const displayedLineMode = draftLineMode ?? lineMode;
  const currentFontSize = typeof displayedSettings.fontSize === "number"
    ? displayedSettings.fontSize
    : minFontSize;
  const fontSizeUpperBound = Number.isFinite(maxFontSize)
    ? maxFontSize as number
    : Number.POSITIVE_INFINITY;
  const areManualFontSizesDisabled = false;
  const hasPendingChanges = draftSettings !== null || draftLineCount !== null || draftLineMode !== null;
  const renderedTop = dragPosition?.top ?? top;
  const renderedLeft = dragPosition?.left ?? left;
  const menuOnRight = renderedLeft !== null && renderedLeft < 210;

  const normalizePosition = useCallback(() => {
    if (dragRef.current) return;
    const actualLeft = left ?? getRightEdgeLeft(rootRef.current);
    const next = clampPosition(rootRef.current, top, actualLeft);
    const normalizedLeft = left === null ? null : snapLeftToDockEdge(rootRef.current, next.left as number);
    if (next.top !== top || normalizedLeft !== left) {
      onPositionChange(next.top, normalizedLeft);
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

  const applySettingsPatch = useCallback((patch: DockOutputQuickSettingsPatch) => {
    const normalizedPatch = { ...patch, autoFontScale: true };
    if (updateImmediately) {
      onCommit(normalizedPatch);
      return;
    }
    setDraftSettings((current) => ({
      ...(current ?? settings),
      ...normalizedPatch,
    }));
  }, [onCommit, settings, updateImmediately]);

  const draftSizeValue = typeof draftSettings?.lowerThirdSize === "string"
    ? draftSettings.lowerThirdSize
    : null;
  const displayedSizePreset = draftSizeValue
    ? sizePresets?.find((preset) => (preset.value ?? preset.id) === draftSizeValue)?.id ?? activeSizePreset
    : activeSizePreset;

  const handleSizePresetChange = useCallback((id: string) => {
    const patch = getSizePresetPatch?.(id);
    if (!patch) return;
    applySettingsPatch(patch);
  }, [applySettingsPatch, getSizePresetPatch]);

  const applyLineCount = useCallback((nextLineCount: number) => {
    const next = Math.min(Math.max(1, Math.trunc(nextLineCount)), maxLineCount);
    if (updateImmediately) {
      onCommit({}, next, "count");
      return;
    }
    setDraftLineCount(next);
    setDraftLineMode("count");
  }, [maxLineCount, onCommit, updateImmediately]);

  const applyLineMode = useCallback((nextMode: DockOutputLineMode) => {
    if (updateImmediately) {
      onCommit({}, nextMode === "count" ? displayedLineCount : undefined, nextMode);
      return;
    }
    setDraftLineMode(nextMode);
  }, [displayedLineCount, onCommit, updateImmediately]);

  const handleSave = useCallback(() => {
    if (!hasPendingChanges) return;
    onCommit(
      draftSettings ?? {},
      (draftLineMode ?? lineMode) === "original" ? undefined : draftLineCount ?? lineCount,
      draftLineMode ?? undefined,
    );
    setDraftSettings(null);
    setDraftLineCount(null);
    setDraftLineMode(null);
  }, [draftLineCount, draftLineMode, draftSettings, hasPendingChanges, lineCount, lineMode, onCommit]);

  const handleUpdateImmediatelyChange = useCallback((nextValue: boolean) => {
    if (nextValue && hasPendingChanges) {
      onCommit(
        draftSettings ?? {},
        (draftLineMode ?? lineMode) === "original" ? undefined : draftLineCount ?? lineCount,
        draftLineMode ?? undefined,
      );
      setDraftSettings(null);
      setDraftLineCount(null);
      setDraftLineMode(null);
    }
    onUpdateImmediatelyChange(nextValue);
  }, [draftLineCount, draftLineMode, draftSettings, hasPendingChanges, lineCount, lineMode, onCommit, onUpdateImmediatelyChange]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const bounds = getParentBounds(rootRef.current);
    const fallbackLeft = left ?? Math.max(0, (bounds?.width ?? QUICK_ACTIONS_HANDLE_WIDTH) - QUICK_ACTIONS_HANDLE_WIDTH);
    const currentLeft = clampPosition(
      rootRef.current,
      top,
      getElementLeft(rootRef.current, fallbackLeft),
    ).left as number;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: top,
      startLeft: currentLeft,
      currentTop: top,
      currentLeft,
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
    drag.currentTop = next.top;
    drag.currentLeft = next.left as number;
    setDragPosition({ top: drag.currentTop, left: drag.currentLeft });
  }, []);

  const finishPointerDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    setIsDragging(false);
    setDragPosition(null);
    if (drag.moved) {
      const nextLeft = snapLeftToDockEdge(rootRef.current, drag.currentLeft);
      onPositionChange(drag.currentTop, nextLeft);
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Some embedded browsers may not support pointer capture.
    }
  }, [onPositionChange]);

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
        top: `${renderedTop}px`,
        ...(renderedLeft !== null ? { left: `${renderedLeft}px`, right: "auto" } : {}),
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
            <div className="dock-output-quick-actions__header-actions">
              <span className={`dock-output-quick-actions__live${isLive ? "" : " dock-output-quick-actions__preview"}`}>
                {isLive ? "LIVE" : "PREVIEW"}
              </span>
            </div>
          </div>

          {sizePresets && sizePresets.length > 0 && getSizePresetPatch && (
            <div className="dock-bible-reader__font-size-field">
              <span className="dock-bible-reader__font-size-field-label">Text size</span>
              <small>Larger text uses a narrower frame.</small>
              <div className="dock-bible-reader__size-presets" role="group" aria-label="Text size">
                {sizePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`dock-bible-reader__size-preset${
                      displayedSizePreset === preset.id ? " dock-bible-reader__size-preset--active" : ""
                    }`}
                    onClick={() => handleSizePresetChange(preset.id)}
                    aria-pressed={displayedSizePreset === preset.id}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                onClick={() => applySettingsPatch({ fontSize: Math.min(fontSizeUpperBound, currentFontSize + 4) })}
                disabled={areManualFontSizesDisabled || currentFontSize >= fontSizeUpperBound}
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
              value={displayedLineMode === "original" ? "original" : displayedLineCount}
              onChange={(event) => {
                if (event.target.value === "original") {
                  applyLineMode("original");
                  return;
                }
                applyLineCount(Number(event.target.value));
              }}
              aria-label={lineLabel}
            >
              <option value="original">{originalLineLabel}</option>
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
