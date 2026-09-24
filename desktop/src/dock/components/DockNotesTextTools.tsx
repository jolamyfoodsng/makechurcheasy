import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import {
  NOTE_TEXT_TOOL_BUTTONS,
  type NoteTextToolAction,
} from "../noteTextTools";

interface DockNotesTextToolsProps {
  className: string;
  buttonClassName: string;
  onAction: (action: NoteTextToolAction, linesPerSlide?: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export default function DockNotesTextTools({
  className,
  buttonClassName,
  onAction,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: DockNotesTextToolsProps) {
  const { t } = useTranslation();
  const [autoSplitOpen, setAutoSplitOpen] = useState(false);
  const autoSplitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoSplitOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!autoSplitRef.current?.contains(event.target as Node)) setAutoSplitOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [autoSplitOpen]);

  return (
    <div className={className} role="toolbar" aria-label={t("notes.textTools")} onClick={(event) => event.stopPropagation()}>
      {onUndo && (
        <button
          type="button"
          className={`${buttonClassName} dock-notes-text-tools__btn--history`}
          onClick={(event) => {
            event.stopPropagation();
            onUndo();
          }}
          disabled={!canUndo}
          title={t("common.undo", "Undo (Ctrl+Z)")}
          aria-label={t("common.undo", "Undo (Ctrl+Z)")}
        >
          <Icon name="undo" size={12} />
        </button>
      )}
      {onRedo && (
        <button
          type="button"
          className={`${buttonClassName} dock-notes-text-tools__btn--history`}
          onClick={(event) => {
            event.stopPropagation();
            onRedo();
          }}
          disabled={!canRedo}
          title={t("common.redo", "Redo (Ctrl+Y)")}
          aria-label={t("common.redo", "Redo (Ctrl+Y)")}
        >
          <Icon name="redo" size={12} />
        </button>
      )}
      {NOTE_TEXT_TOOL_BUTTONS.map((tool) => {
        const title = {
          autosplit: t("notes.autoSplit"),
          clean: t("notes.cleanText"),
          "remove-verse-numbers": t("notes.verseNumbers"),
          uppercase: t("bible.uppercase"),
          lowercase: t("notes.lowercase"),
          capitalize: t("common.capitalize"),
        }[tool.action];
        if (tool.action === "autosplit") {
          return (
            <div key={tool.action} className="dock-notes-text-tools__autosplit" ref={autoSplitRef}>
              <button
                type="button"
                className={`${buttonClassName} dock-notes-text-tools__btn--accent${autoSplitOpen ? " dock-notes-text-tools__btn--active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setAutoSplitOpen((open) => !open);
                }}
                title={title}
                aria-label={title}
                aria-haspopup="menu"
                aria-expanded={autoSplitOpen}
              >
                <Icon name={tool.icon ?? "format_align_left"} size={12} />
                <span className="dock-lyrics-toolbar__caret">▾</span>
              </button>
              {autoSplitOpen && (
                <div className="dock-notes-text-tools__menu" role="menu" aria-label={t("notes.autoSplitOptions")}>
                  {[2, 3, 4].map((lines) => (
                    <button
                      key={lines}
                      type="button"
                      className="dock-notes-text-tools__menu-option"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAction("autosplit", lines);
                        setAutoSplitOpen(false);
                      }}
                    >
                      {t("notes.linesCount", { count: lines })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <button
            key={tool.action}
            type="button"
            className={buttonClassName}
            onClick={(event) => {
              event.stopPropagation();
              onAction(tool.action);
            }}
            title={title}
            aria-label={title}
          >
            {tool.icon ? <Icon name={tool.icon} size={12} /> : <span>{tool.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
