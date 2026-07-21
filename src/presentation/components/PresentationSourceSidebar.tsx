import {
  Clock3,
  FileText,
  Image as ImageIcon,
  Music4,
  RectangleEllipsis,
} from "lucide-react";

import type { MinistrySource } from "../types";

const SOURCES: Array<{
  id: MinistrySource;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { id: "media", label: "Media", icon: ImageIcon },
  { id: "worship", label: "Worship", icon: Music4 },
  { id: "text", label: "Announcements / Text", icon: FileText },
  { id: "countdown", label: "Countdown", icon: Clock3 },
  { id: "ticker", label: "Tickers", icon: RectangleEllipsis },
];

interface PresentationSourceSidebarProps {
  value: MinistrySource;
  onChange: (source: MinistrySource) => void;
}

export function PresentationSourceSidebar({
  value,
  onChange,
}: PresentationSourceSidebarProps) {
  return (
    <aside className="presentation-source-sidebar">
      <div className="presentation-panel-title">Content Type</div>
      <div className="presentation-source-list">
        {SOURCES.map((source) => {
          const Icon = source.icon;
          return (
            <button
              key={source.id}
              type="button"
              className={`presentation-source-button${value === source.id ? " is-active" : ""}`}
              onClick={() => onChange(source.id)}
            >
              <Icon size={16} />
              <span>{source.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
