/**
 * MVMenuBar.tsx — Application Menu Bar
 *
 * Native-style menu bar with File | Edit | View | Help dropdowns.
 * Each item shows the action label and keyboard shortcut.
 * Works both inside the editor (dispatches to EditorProvider)
 * and on shell pages (navigation actions only).
 */

import { useState, useRef, useEffect } from "react";
import { shortcutLabel, SHORTCUT_MAP } from "../shortcuts";
import Icon from "../../components/Icon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MenuItem {
  label?: string;
  shortcutId?: string;
  icon?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MVMenuBarProps {
  /** Menu groups — caller decides which actions are available */
  menus?: MenuGroup[];
  /** Extra class on root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MVMenuBar({ menus, className }: MVMenuBarProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (openIdx === null) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenIdx(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openIdx]);

  // Close on Escape
  useEffect(() => {
    if (openIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIdx(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openIdx]);

  if (!menus || menus.length === 0) return null;

  return (
    <div className={`mv-menubar ${className ?? ""}`} ref={barRef}>
      {menus.map((menu, idx) => (
        <div key={menu.label} className="mv-menubar-item">
          <button
            className={`mv-menubar-trigger ${openIdx === idx ? "mv-menubar-trigger--active" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpenIdx(openIdx === idx ? null : idx);
            }}
            onMouseEnter={() => {
              if (openIdx !== null) setOpenIdx(idx);
            }}
          >
            {menu.label}
          </button>

          {openIdx === idx && (
            <div className="mv-menubar-dropdown">
              {menu.items.map((item, i) =>
                item.divider ? (
                  <div key={`d-${i}`} className="mv-menubar-divider" />
                ) : (
                  <button
                    key={item.label}
                    className={`mv-menubar-action ${item.disabled ? "mv-menubar-action--disabled" : ""}`}
                    disabled={item.disabled}
                    onClick={() => {
                      item.action?.();
                      setOpenIdx(null);
                    }}
                  >
                    <span className="mv-menubar-action-label">
                      {item.icon && (
                        <Icon name={item.icon} size={20} className="mv-menubar-action-icon" />
                      )}
                      {item.label}
                    </span>
                    {item.shortcutId && SHORTCUT_MAP.has(item.shortcutId) && (
                      <span className="mv-menubar-shortcut">
                        {shortcutLabel(SHORTCUT_MAP.get(item.shortcutId)!.keys)}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-built menu factory for the editor
// ---------------------------------------------------------------------------

export interface EditorMenuActions {
  save: () => void;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  deleteSelected: () => void;
  selectAll: () => void;
  deselectAll: () => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  toggleSafeFrame: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  goBack: () => void;
  openShortcuts: () => void;
  exportLayout: () => void;
  importLayout: () => void;
  lockAll: () => void;
  unlockAll: () => void;
  alignLeft: () => void;
  alignRight: () => void;
  alignTop: () => void;
  alignBottom: () => void;
  alignCenterH: () => void;
  alignCenterV: () => void;
  distributeH: () => void;
  distributeV: () => void;
  // state flags
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  hasMultiSelection: boolean;
  hasClipboard: boolean;
  gridOn: boolean;
  snapOn: boolean;
  safeFrameOn: boolean;
}

export function buildEditorMenus(a: EditorMenuActions, t: (key: string) => string): MenuGroup[] {
  return [
    {
      label: t("menu.file"),
      items: [
        { label: t("menu.file.save"), shortcutId: "save", icon: "save", action: a.save },
        { divider: true },
        { label: t("menu.file.exportLayout"), shortcutId: "export-layout", icon: "file_download", action: a.exportLayout },
        { label: t("menu.file.importLayout"), shortcutId: "import-layout", icon: "file_upload", action: a.importLayout },
        { divider: true },
        { label: t("menu.file.backToDashboard"), icon: "arrow_back", action: a.goBack },
      ],
    },
    {
      label: t("menu.edit"),
      items: [
        { label: t("menu.edit.undo"), shortcutId: "undo", icon: "undo", action: a.undo, disabled: !a.canUndo },
        { label: t("menu.edit.redo"), shortcutId: "redo", icon: "redo", action: a.redo, disabled: !a.canRedo },
        { divider: true },
        { label: t("menu.edit.cut"), shortcutId: "cut", icon: "content_cut", action: a.cut, disabled: !a.hasSelection },
        { label: t("menu.edit.copy"), shortcutId: "copy", icon: "content_copy", action: a.copy, disabled: !a.hasSelection },
        { label: t("menu.edit.paste"), shortcutId: "paste", icon: "content_paste", action: a.paste, disabled: !a.hasClipboard },
        { label: t("menu.edit.duplicate"), shortcutId: "duplicate", icon: "content_copy", action: a.duplicate, disabled: !a.hasSelection },
        { divider: true },
        { label: t("menu.edit.delete"), shortcutId: "delete", icon: "delete", action: a.deleteSelected, disabled: !a.hasSelection },
        { divider: true },
        { label: t("menu.edit.selectAll"), shortcutId: "select-all", icon: "select_all", action: a.selectAll },
        { label: t("menu.edit.deselectAll"), shortcutId: "deselect", action: a.deselectAll },
        { divider: true },
        { label: t("menu.edit.lockAll"), shortcutId: "lock-all", icon: "lock", action: a.lockAll },
        { label: t("menu.edit.unlockAll"), shortcutId: "unlock-all", icon: "lock_open", action: a.unlockAll },
      ],
    },
    {
      label: t("menu.view"),
      items: [
        { label: a.gridOn ? "✓ " + t("menu.view.grid") : t("menu.view.grid"), shortcutId: "toggle-grid", icon: "grid_on", action: a.toggleGrid },
        { label: a.snapOn ? "✓ " + t("menu.view.snapToGrid") : t("menu.view.snapToGrid"), shortcutId: "toggle-snap", icon: "grid_4x4", action: a.toggleSnap },
        { label: a.safeFrameOn ? "✓ " + t("menu.view.safeFrame") : t("menu.view.safeFrame"), shortcutId: "toggle-safe-frame", icon: "crop_free", action: a.toggleSafeFrame },
        { divider: true },
        { label: t("menu.view.zoomIn"), shortcutId: "zoom-in", icon: "zoom_in", action: a.zoomIn },
        { label: t("menu.view.zoomOut"), shortcutId: "zoom-out", icon: "zoom_out", action: a.zoomOut },
        { label: t("menu.view.zoomToFit"), shortcutId: "zoom-fit", icon: "fit_screen", action: a.zoomFit },
      ],
    },
    {
      label: t("menu.arrange"),
      items: [
        { label: t("menu.arrange.alignLeft"), shortcutId: "align-left", icon: "align_horizontal_left", action: a.alignLeft, disabled: !a.hasMultiSelection },
        { label: t("menu.arrange.alignRight"), shortcutId: "align-right", icon: "align_horizontal_right", action: a.alignRight, disabled: !a.hasMultiSelection },
        { label: t("menu.arrange.alignTop"), shortcutId: "align-top", icon: "align_vertical_top", action: a.alignTop, disabled: !a.hasMultiSelection },
        { label: t("menu.arrange.alignBottom"), shortcutId: "align-bottom", icon: "align_vertical_bottom", action: a.alignBottom, disabled: !a.hasMultiSelection },
        { divider: true },
        { label: t("menu.arrange.alignCenterH"), shortcutId: "align-center-h", icon: "align_horizontal_center", action: a.alignCenterH, disabled: !a.hasMultiSelection },
        { label: t("menu.arrange.alignCenterV"), shortcutId: "align-center-v", icon: "align_vertical_center", action: a.alignCenterV, disabled: !a.hasMultiSelection },
        { divider: true },
        { label: t("menu.arrange.distributeH"), shortcutId: "distribute-h", icon: "horizontal_distribute", action: a.distributeH, disabled: !(a.hasMultiSelection) },
        { label: t("menu.arrange.distributeV"), shortcutId: "distribute-v", icon: "vertical_distribute", action: a.distributeV, disabled: !(a.hasMultiSelection) },
      ],
    },
    {
      label: t("menu.help"),
      items: [
        { label: t("menu.help.shortcuts"), icon: "keyboard", action: a.openShortcuts },
      ],
    },
  ];
}
