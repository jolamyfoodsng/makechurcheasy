import { useEffect, useRef, useState } from "react";
import Icon from "../DockIcon";
import {
  NOTE_TEXT_TOOL_BUTTONS,
  type NoteTextToolAction,
} from "../noteTextTools";

interface DockNotesTextToolsProps {
  className: string;
  buttonClassName: string;
  onAction: (action: NoteTextToolAction, linesPerSlide?: number) => void;
}

export default function DockNotesTextTools({
  className,
  buttonClassName,
  onAction,
}: DockNotesTextToolsProps) {
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
    <div className={className} role="toolbar" aria-label="Note text tools" onClick={(event) => event.stopPropagation()}>
      {NOTE_TEXT_TOOL_BUTTONS.map((tool) => {
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
                title={tool.title}
                aria-label={tool.title}
                aria-haspopup="menu"
                aria-expanded={autoSplitOpen}
              >
                <Icon name={tool.icon ?? "format_align_left"} size={12} />
                <span className="dock-lyrics-toolbar__caret">▾</span>
              </button>
              {autoSplitOpen && (
                <div className="dock-notes-text-tools__menu" role="menu" aria-label="Auto split options">
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
                      {lines} lines
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
            title={tool.title}
            aria-label={tool.title}
          >
            {tool.icon ? <Icon name={tool.icon} size={12} /> : <span>{tool.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
