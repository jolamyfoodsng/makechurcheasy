import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import type { MediaItem } from "../../library/libraryTypes";

/**
 * ImagePicker — compact image selector for lower-third variables.
 *
 * Props:
 *   value    — current image URL string
 *   onChange — callback with new URL string (empty string = cleared)
 */
export default function ImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryItems, setLibraryItems] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [urlInput, setUrlInput] = useState(value || "");
  const [urlError, setUrlError] = useState("");

  // Sync urlInput when external value changes
  useEffect(() => {
    setUrlInput(value || "");
  }, [value]);

  // ---- Upload handler ----
  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploading(true);
      try {
        const { registerDockMediaItem, uploadFileToDock } = await import("../dockUploadService");
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) continue;
          const result = await uploadFileToDock(file);
          if (result.item) {
            await registerDockMediaItem(result.item);
            onChange(result.item.url);
            setUrlInput(result.item.url);
          }
        }
      } catch (err) {
        console.warn("[ImagePicker] Upload failed:", err);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onChange]
  );

  // ---- Load library on first open ----
  useEffect(() => {
    if (!showLibrary || libraryItems.length > 0) return;
    (async () => {
      setLibraryLoading(true);
      try {
        const { getAllMedia } = await import("../../library/libraryDb");
        const items = await getAllMedia();
        setLibraryItems(items.filter((i) => i.type === "image"));
      } catch (err) {
        console.warn("[ImagePicker] Failed to load media library:", err);
      } finally {
        setLibraryLoading(false);
      }
    })();
  }, [showLibrary, libraryItems.length]);

  const filteredLibrary = libraryItems.filter((item) =>
    item.name.toLowerCase().includes(librarySearch.toLowerCase())
  );

  // ---- URL input commit ----
  const commitUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (trimmed && !trimmed.startsWith("http") && !trimmed.startsWith("/") && !trimmed.startsWith("data:")) {
      setUrlError("URL must start with http://, https://, /, or data:");
      return;
    }
    setUrlError("");
    onChange(trimmed);
  }, [urlInput, onChange]);

  const hasImage = Boolean(value);

  return (
    <div className="dtb-image-picker">
      {/* Preview + actions row */}
      <div className="dtb-image-picker__row">
        {/* Thumbnail preview */}
        <div className="dtb-image-picker__preview" title={value || t("common.noValue", "No value")}>
          {hasImage ? (
            <img
              src={value}
              alt=""
              className="dtb-image-picker__thumb"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Icon name="image" size={18} className="dtb-image-picker__placeholder" />
          )}
          {uploading && (
            <div className="dtb-image-picker__uploading">
              <Icon name="hourglass_top" size={14} />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="dtb-image-picker__actions">
          <button
            type="button"
            className="dtb-image-picker__btn"
            onClick={() => fileInputRef.current?.click()}
            title={t("common.upload", "Upload")}
            disabled={uploading}
          >
            <Icon name="upload" size={13} />
          </button>
          <button
            type="button"
            className="dtb-image-picker__btn"
            onClick={() => setShowLibrary(!showLibrary)}
            title={t("common.library", "Library")}
          >
            <Icon name="photo_library" size={13} />
          </button>
          {hasImage && (
            <button
              type="button"
              className="dtb-image-picker__btn dtb-image-picker__btn--danger"
              onClick={() => {
                onChange("");
                setUrlInput("");
              }}
              title={t("common.remove", "Remove")}
            >
              <Icon name="delete" size={13} />
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="dtb-image-picker__file-input"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {/* URL text input (fallback) */}
      <div className="dtb-image-picker__url-row">
        <input
          type="text"
          className={`dtb-image-picker__url-input${urlError ? " dtb-image-picker__url-input--error" : ""}`}
          placeholder="https://example.com/image.png"
          value={urlInput}
          onChange={(e) => {
            setUrlInput(e.target.value);
            setUrlError("");
          }}
          onBlur={commitUrl}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitUrl();
            }
          }}
        />
      </div>
      {urlError && <div className="dtb-image-picker__error">{urlError}</div>}

      {/* Media Library overlay */}
      {showLibrary && (
        <div className="dtb-image-picker__library-overlay">
          <div className="dtb-image-picker__library-header">
            <span className="dtb-image-picker__library-title">
              <Icon name="photo_library" size={13} />
              {t("common.library", "Library")}
            </span>
            <button
              type="button"
              className="dtb-image-picker__btn--icon"
              onClick={() => {
                setShowLibrary(false);
                setLibrarySearch("");
              }}
              title={t("common.close", "Close")}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
          <input
            type="text"
            className="dtb-image-picker__library-search"
            placeholder={t("common.search", "Search...")}
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            autoFocus
          />
          <div className="dtb-image-picker__library-grid">
            {libraryLoading ? (
              <div className="dtb-image-picker__library-empty">
                <Icon name="hourglass_top" size={16} />
                <span>{t("common.loading", "Loading...")}</span>
              </div>
            ) : filteredLibrary.length === 0 ? (
              <div className="dtb-image-picker__library-empty">
                <Icon name="image" size={16} />
                <span>{t("common.noImages", "No images")}</span>
              </div>
            ) : (
              filteredLibrary.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`dtb-image-picker__library-item${value === item.url ? " dtb-image-picker__library-item--selected" : ""}`}
                  onClick={() => {
                    onChange(item.url);
                    setUrlInput(item.url);
                    setShowLibrary(false);
                    setLibrarySearch("");
                  }}
                  title={item.name}
                >
                  <img
                    src={item.thumbnailUrl || item.url}
                    alt={item.name}
                    className="dtb-image-picker__library-thumb"
                  />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
