import { useRef } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";

import { MEDIA_FILE_ACCEPT } from "../../library/MediaTab";
import type { MediaItem } from "../../library/libraryTypes";
import type { PresentationMediaFit, PresentationMediaPlaybackState } from "../types";

type MediaFilter = "all" | "image" | "video";

interface MediaWorkspaceProps {
  items: MediaItem[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  filter: MediaFilter;
  onFilterChange: (value: MediaFilter) => void;
  selectedMediaId: string | null;
  onSelectMedia: (item: MediaItem) => void;
  fit: PresentationMediaFit;
  onFitChange: (value: PresentationMediaFit) => void;
  backgroundColor: string;
  onBackgroundColorChange: (value: string) => void;
  playback: PresentationMediaPlaybackState;
  onPlaybackChange: (patch: Partial<PresentationMediaPlaybackState>) => void;
  onUpload: (files: FileList | null) => void;
  onRename: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
}

export function MediaWorkspace({
  items,
  searchQuery,
  onSearchQueryChange,
  filter,
  onFilterChange,
  selectedMediaId,
  onSelectMedia,
  fit,
  onFitChange,
  backgroundColor,
  onBackgroundColorChange,
  playback,
  onPlaybackChange,
  onUpload,
  onRename,
  onDelete,
}: MediaWorkspaceProps) {
  const uploadRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="presentation-workspace">
      <div className="presentation-workspace__toolbar">
        <div className="presentation-library-search">
          <Search size={16} />
          <input
            value={searchQuery}
            className="presentation-input presentation-input--search"
            placeholder="Search media"
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </div>
        <div className="presentation-filter-strip">
          <button type="button" className={`presentation-chip${filter === "all" ? " is-active" : ""}`} onClick={() => onFilterChange("all")}>All</button>
          <button type="button" className={`presentation-chip${filter === "image" ? " is-active" : ""}`} onClick={() => onFilterChange("image")}>Images</button>
          <button type="button" className={`presentation-chip${filter === "video" ? " is-active" : ""}`} onClick={() => onFilterChange("video")}>Videos</button>
        </div>
        <button type="button" className="presentation-button" onClick={() => uploadRef.current?.click()}>
          <Plus size={16} />
          <span>Upload</span>
        </button>
        <input
          ref={uploadRef}
          type="file"
          accept={MEDIA_FILE_ACCEPT}
          className="hidden"
          multiple
          onChange={(event) => {
            onUpload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <div className="presentation-workspace__split">
        <div className="presentation-library-panel">
          <div className="presentation-library-list">
            {items.map((item) => (
              <div
                key={item.id}
                className={`presentation-library-item presentation-library-item--media${selectedMediaId === item.id ? " is-active" : ""}`}
              >
                <button type="button" className="presentation-library-item__body" onClick={() => onSelectMedia(item)}>
                  <strong>{item.name}</strong>
                  <span>{item.type === "video" ? "Video" : "Image"}</span>
                </button>
                <div className="presentation-library-item__actions">
                  <button type="button" className="presentation-icon-button" onClick={() => onRename(item)} title="Rename">
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="presentation-icon-button danger" onClick={() => onDelete(item)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 ? (
              <div className="presentation-library-empty">No media items available.</div>
            ) : null}
          </div>
        </div>

        <div className="presentation-settings-panel">
          <div className="presentation-settings-grid">
            <label className="presentation-field">
              <span>Fit</span>
              <select value={fit} className="presentation-input" onChange={(event) => onFitChange(event.target.value as PresentationMediaFit)}>
                <option value="fit">Fit</option>
                <option value="fill">Fill</option>
                <option value="contain">Contain</option>
                <option value="stretch">Stretch</option>
              </select>
            </label>
            <label className="presentation-field">
              <span>Background</span>
              <input type="color" value={backgroundColor} onChange={(event) => onBackgroundColorChange(event.target.value)} />
            </label>
            <label className="presentation-field">
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={playback.volume}
                onChange={(event) => onPlaybackChange({ volume: Number(event.target.value), version: Date.now() })}
              />
            </label>
            <div className="presentation-field">
              <span>Video controls</span>
              <div className="presentation-inline-actions">
                <button type="button" className="presentation-chip" onClick={() => onPlaybackChange({ playing: true, version: Date.now() })}>Play</button>
                <button type="button" className="presentation-chip" onClick={() => onPlaybackChange({ playing: false, version: Date.now() })}>Pause</button>
                <button type="button" className="presentation-chip" onClick={() => onPlaybackChange({ positionSeconds: 0, playing: true, version: Date.now() })}>Restart</button>
                <button type="button" className={`presentation-chip${playback.muted ? " is-active" : ""}`} onClick={() => onPlaybackChange({ muted: !playback.muted, version: Date.now() })}>Mute</button>
                <button type="button" className={`presentation-chip${playback.loop ? " is-active" : ""}`} onClick={() => onPlaybackChange({ loop: !playback.loop, version: Date.now() })}>Loop</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
