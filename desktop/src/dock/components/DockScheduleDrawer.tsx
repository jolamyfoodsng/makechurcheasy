/**
 * DockScheduleDrawer.tsx — In-flow 40/60 Shared Space Service Schedule.
 *
 * Design:
 * 1. Shares layout space with Dock tabs (40/60 split, user-resizable via drag handle).
 * 2. Pin / Unpin button with true Pin icon (pins open permanently).
 * 3. Card-based schedule items: rich cards with 1.5 line-height.
 * 4. Entire card is clickable to present live to OBS.
 * 5. High-contrast, easily visible close and remove buttons.
 * 6. Bottom center placeholder when queue has space.
 * 7. Clean collapse to slim 34px rail when unpinned.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import { dockObsClient } from "../dockObsClient";
import type { ServicePlan, ServicePlanItem, ServicePlannerSnapshot } from "../../service-planner/types";
import {
  createNewSchedulePlan,
  DOCK_SCHEDULE_CHANGED_EVENT,
  DOCK_SCHEDULE_TOAST_EVENT,
  getOrCreateActiveSchedule,
  notifyScheduleToast,
  removeItemFromActiveSchedule,
  saveSchedulePlan,
  setActiveScheduleId,
  type ScheduleToastPayload,
} from "../dockScheduleService";
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveOverlayAssetUrl } from "../../services/overlayUrl";
import "./dock-schedule.css";

const PIN_STORAGE_KEY = "__mce_dock_schedule_pinned_v1";
const SCHEDULE_WIDTH_KEY = "__mce_dock_schedule_width_v2";
const MIN_SCHEDULE_WIDTH = 140;

interface Props {
  initialSnapshot?: ServicePlannerSnapshot | null;
  onSelectTab?: (tab: "bible" | "worship" | "media" | "notes") => void;
  isNarrow?: boolean;
}

function getMediaThumbnailSrc(payload: Record<string, unknown>): string {
  // 1. Direct thumbnail URL or data/blob URI
  const directThumb = typeof payload.thumbnailUrl === "string" ? payload.thumbnailUrl.trim() : "";
  if (directThumb) return directThumb;

  const preview = typeof payload.previewUrl === "string" ? payload.previewUrl.trim() : "";
  if (preview) return preview;

  const directUrl = typeof payload.url === "string" ? payload.url.trim() : "";
  if (directUrl) return directUrl;

  const rawPath = (typeof payload.filePath === "string" ? payload.filePath : "") ||
                  (typeof payload.fileName === "string" ? payload.fileName : "");
  if (!rawPath) return "";

  if (rawPath.startsWith("http://") || rawPath.startsWith("https://") || rawPath.startsWith("data:") || rawPath.startsWith("blob:")) {
    return rawPath;
  }

  // If in Tauri desktop app, use convertFileSrc for absolute disk paths
  if (typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || window.location.protocol === "tauri:")) {
    try {
      if (rawPath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
        return convertFileSrc(rawPath);
      }
    } catch {
      // Fallback below
    }
  }

  // Resolve via local MCE overlay HTTP server (e.g. /uploads/fileName)
  try {
    return resolveOverlayAssetUrl(rawPath);
  } catch {
    return rawPath;
  }
}


export default function DockScheduleDrawer({ initialSnapshot, onSelectTab }: Props) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [activePlan, setActivePlan] = useState<ServicePlan | null>(null);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showNewSchedulePrompt, setShowNewSchedulePrompt] = useState(false);
  const [newScheduleTitle, setNewScheduleTitle] = useState("");

  // Default to true so user immediately sees the requested shared space
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return true;
    const stored = localStorage.getItem(PIN_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  });

  const [expanded, setExpanded] = useState<boolean>(() => isPinned);

  // User draggable width state: null means use default 30% / 70% split from CSS
  const [customWidth, setCustomWidth] = useState<number | null>(() => {
    if (typeof localStorage === "undefined") return null;
    const stored = localStorage.getItem(SCHEDULE_WIDTH_KEY);
    if (!stored) return null;
    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed >= MIN_SCHEDULE_WIDTH ? parsed : null;
  });

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const refreshState = useCallback(() => {
    const { snapshot, activePlan: currentActive } = getOrCreateActiveSchedule();
    setPlans(snapshot.plans);
    setActivePlan(currentActive);
    if (currentActive.selectedItemId) {
      setActiveCueId(currentActive.selectedItemId);
    }
  }, []);

  useEffect(() => {
    refreshState();
  }, [initialSnapshot, refreshState]);

  useEffect(() => {
    const handleScheduleChanged = () => {
      refreshState();
    };

    const handleToast = (e: Event) => {
      const custom = e as CustomEvent<ScheduleToastPayload>;
      if (custom.detail?.message) {
        setToastMessage(custom.detail.message);
        setTimeout(() => setToastMessage(null), 2400);
      }
    };

    window.addEventListener(DOCK_SCHEDULE_CHANGED_EVENT, handleScheduleChanged);
    window.addEventListener(DOCK_SCHEDULE_TOAST_EVENT, handleToast);

    return () => {
      window.removeEventListener(DOCK_SCHEDULE_CHANGED_EVENT, handleScheduleChanged);
      window.removeEventListener(DOCK_SCHEDULE_TOAST_EVENT, handleToast);
    };
  }, [refreshState]);

  // Handle pin toggle
  const handleTogglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(PIN_STORAGE_KEY, String(next));
      }
      if (next) {
        setExpanded(true);
      }
      return next;
    });
  }, []);

  const handleCollapse = useCallback(() => {
    setExpanded(false);
    setIsPinned(false);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PIN_STORAGE_KEY, "false");
    }
  }, []);

  const handleExpand = useCallback(() => {
    setExpanded(true);
  }, []);

  // Drag-to-resize handlers
  const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    const container = e.currentTarget.parentElement as HTMLElement | null;
    startWidthRef.current = container ? container.getBoundingClientRect().width : (customWidth ?? 280);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = moveEvent.clientX - startXRef.current;
      const minAllowed = Math.max(MIN_SCHEDULE_WIDTH, Math.floor(window.innerWidth * 0.15));
      const maxAllowed = Math.max(minAllowed, Math.min(600, Math.floor(window.innerWidth * 0.45)));
      const nextWidth = Math.round(Math.max(minAllowed, Math.min(maxAllowed, startWidthRef.current + delta)));
      setCustomWidth(nextWidth);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SCHEDULE_WIDTH_KEY, String(nextWidth));
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [customWidth]);

  const handleDoubleClickResize = useCallback(() => {
    setCustomWidth(null);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SCHEDULE_WIDTH_KEY);
    }
  }, []);

  const handlePresentItem = useCallback(async (item: ServicePlanItem) => {
    if (!activePlan) return;
    setActiveCueId(item.id);

    try {
      const payload = item.payloadSnapshot;

      if (item.type === "bible") {
        await dockObsClient.pushBible(payload as unknown as Parameters<typeof dockObsClient.pushBible>[0]);
        onSelectTab?.("bible");
      } else if (item.type === "worship") {
        const obsPayload = {
          sectionText: payload.sectionText,
          sectionLabel: payload.sectionLabel,
          songTitle: payload.songTitle,
          artist: payload.artist,
          overlayMode: payload.overlayMode || "lower-third",
          theme: payload.theme,
          bibleThemeSettings: payload.bibleThemeSettings,
          liveOverrides: null,
        };
        await dockObsClient.pushWorshipLyrics(obsPayload as unknown as Parameters<typeof dockObsClient.pushWorshipLyrics>[0]);
        onSelectTab?.("worship");
      } else if (item.type === "sermon") {
        if (payload?.isNoteSlide) {
          const notesPayload = {
            sectionText: payload.slideText,
            sectionLabel: payload.noteTitle || "Note",
            songTitle: payload.noteTitle || "Note",
            overlayMode: payload.overlayMode || "lower-third",
            theme: payload.theme,
            bibleThemeSettings: payload.bibleThemeSettings,
            liveOverrides: null,
          };
          await dockObsClient.pushNotesLyrics(notesPayload as unknown as Parameters<typeof dockObsClient.pushNotesLyrics>[0]);
          onSelectTab?.("worship");
        } else {
          await dockObsClient.pushSermonCue(payload as Parameters<typeof dockObsClient.pushSermonCue>[0]);
        }
      } else if (item.type === "media") {
        const filePath = (payload.filePath as string) || "";
        const fileName = (payload.fileName as string) || item.label;
        if (filePath) {
          await dockObsClient.pushMedia(filePath, fileName);
          onSelectTab?.("media");
        }
      }

      saveSchedulePlan({
        ...activePlan,
        selectedItemId: item.id,
        completedItemIds: Array.from(new Set([...(activePlan.completedItemIds ?? []), item.id])),
        lastSentItemId: item.id,
      });

      notifyScheduleToast(`Live: ${item.label}`);
    } catch (err) {
      console.warn("[DockSchedule] Error presenting item:", err);
      notifyScheduleToast(`Failed to present ${item.label}`, "error");
    }
  }, [activePlan, onSelectTab]);

  const handleRemoveItem = useCallback((e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    removeItemFromActiveSchedule(itemId);
  }, []);

  const handleGoToItem = useCallback((item: ServicePlanItem) => {
    switch (item.type) {
      case "bible":
        onSelectTab?.("bible");
        break;
      case "worship":
        onSelectTab?.("worship");
        break;
      case "media":
        onSelectTab?.("media");
        break;
      case "sermon":
        onSelectTab?.("notes");
        break;
      default:
        break;
    }
  }, [onSelectTab]);

  const handleCreateNewSchedule = useCallback(() => {
    const title = newScheduleTitle.trim() || `Service ${plans.length + 1}`;
    createNewSchedulePlan(title);
    setNewScheduleTitle("");
    setShowNewSchedulePrompt(false);
  }, [newScheduleTitle, plans.length]);

  const scheduleItems = useMemo(() => activePlan?.items ?? [], [activePlan]);
  const isDrawerOpen = expanded || isPinned;
  const isCompact = Boolean(customWidth !== null && customWidth <= 270);

  return (
    <aside
      className={`dock-schedule-container ${isDrawerOpen ? "dock-schedule-container--expanded" : "dock-schedule-container--collapsed"}`}
      style={isDrawerOpen && customWidth !== null ? { width: customWidth, flex: `0 0 ${customWidth}px` } : undefined}
      aria-label={t("schedule.title", "Service Schedule")}
    >
      {/* ── Toast notification feedback ── */}
      {toastMessage && (
        <div className="dock-schedule-toast" role="status" aria-live="polite">
          <Icon name="check_circle" size={13} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Collapsed Rail View (34px) ── */}
      {!isDrawerOpen && (
        <div className="dock-schedule-rail">
          <button
            type="button"
            className="dock-schedule-rail__trigger"
            onClick={handleExpand}
            title={t("schedule.openSchedule", "Open Schedule (Shared Space)")}
            aria-label={t("schedule.openSchedule", "Open Schedule")}
          >
            <Icon name="playlist_play" size={18} />
            {scheduleItems.length > 0 && (
              <span className="dock-schedule-rail__badge">{scheduleItems.length}</span>
            )}
          </button>

          <div className="dock-schedule-rail__divider" />

          {/* Quick status dots for queued items */}
          <div className="dock-schedule-rail__status-dots">
            {scheduleItems.slice(0, 10).map((item, index) => {
              const isLive = activeCueId === item.id;
              return (
                <span
                  key={item.id}
                  className={`dock-schedule-rail__dot ${isLive ? "dock-schedule-rail__dot--live" : ""}`}
                  title={`${index + 1}. ${item.label}`}
                />
              );
            })}
          </div>

          <button
            type="button"
            className="dock-schedule-rail__expand-btn"
            onClick={handleExpand}
            title={t("schedule.expandSchedule", "Expand Schedule")}
            aria-label={t("schedule.expandSchedule", "Expand Schedule")}
          >
            <Icon name="chevron_right" size={14} />
          </button>
        </div>
      )}

      {/* ── In-Flow Schedule Panel (Shares Space With Dock) ── */}
      {isDrawerOpen && (
        <div className={`dock-schedule-panel ${isCompact ? "dock-schedule-panel--compact" : ""}`}>
          <div className="dock-schedule-panel__header">
            <div className="dock-schedule-panel__title-row">
              <Icon name="event_note" size={16} className="dock-schedule-panel__header-icon" />

              <select
                className="dock-schedule-panel__select"
                value={activePlan?.id || ""}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setShowNewSchedulePrompt(true);
                  } else {
                    setActiveScheduleId(e.target.value);
                  }
                }}
                aria-label={t("schedule.selectSchedule", "Select Schedule")}
              >
                {plans.map((p, idx) => (
                  <option key={p.id} value={p.id}>
                    {p.title || `Schedule ${idx + 1}`}
                  </option>
                ))}
                <option value="__new__">+ {t("schedule.createNew", "New Schedule...")}</option>
              </select>

              <div className="dock-schedule-panel__header-actions">
                {/* Pin button: always clean pin icon */}
                <button
                  type="button"
                  className={`dock-schedule-panel__pin-btn ${isPinned ? "is-pinned" : ""}`}
                  onClick={handleTogglePin}
                  title={isPinned ? t("schedule.pinnedHint", "Schedule is pinned open. Click to unpin.") : t("schedule.pinHint", "Pin open permanently")}
                  aria-label={isPinned ? "Unpin schedule" : "Pin schedule open"}
                >
                  <Icon name="pin" size={14} />
                </button>

                {/* Highly visible close button */}
                <button
                  type="button"
                  className="dock-schedule-panel__close-btn"
                  onClick={handleCollapse}
                  title={t("schedule.close", "Close Schedule")}
                  aria-label={t("schedule.close", "Close Schedule")}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            </div>

            {showNewSchedulePrompt && (
              <div className="dock-schedule-panel__new-prompt">
                <input
                  type="text"
                  placeholder={t("schedule.scheduleName", "Schedule Name")}
                  value={newScheduleTitle}
                  onChange={(e) => setNewScheduleTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateNewSchedule()}
                  autoFocus
                />
                <div className="dock-schedule-panel__prompt-actions">
                  <button type="button" className="dock-schedule-btn dock-schedule-btn--primary" onClick={handleCreateNewSchedule}>
                    <Icon name="add" size={12} />
                    <span>{t("common.add", "Add")}</span>
                  </button>
                  <button type="button" className="dock-schedule-btn" onClick={() => setShowNewSchedulePrompt(false)}>
                    <span>{t("common.cancel", "Cancel")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Rich Card List ── */}
          <div className="dock-schedule-panel__list">
            {scheduleItems.length === 0 ? (
              <div className="dock-schedule-panel__empty">
                <Icon name="playlist_add" size={32} />
                <p>{t("schedule.emptyHint", "No items queued in this schedule.")}</p>
                <small>{t("schedule.emptySubhint", "Right-click any scripture, worship song, or media file to queue it here.")}</small>
              </div>
            ) : (
              scheduleItems.map((item, index) => {
                const isLive = activeCueId === item.id;
                const isCompleted = activePlan?.completedItemIds?.includes(item.id);
                const isMedia = item.type === "media";
                const payload = (item.payloadSnapshot || {}) as Record<string, unknown>;
                const isVideo = isMedia && (payload.mediaType === "video" || (typeof item.subtitle === "string" && item.subtitle.toLowerCase().includes("video")));
                const mediaSrc = isMedia ? getMediaThumbnailSrc(payload) : "";

                // ── Picture & Video Card (Thumbnail on top, minimal text emphasis) ──
                if (isMedia) {
                  const isImgThumb = mediaSrc && (/\.(png|jpe?g|webp|gif|avif)($|\?)/i.test(mediaSrc) || Boolean(payload.thumbnailUrl));

                  return (
                    <div
                      key={item.id}
                      className={`dock-schedule-card dock-schedule-card--media ${isLive ? "dock-schedule-card--live" : ""} ${isCompleted ? "dock-schedule-card--completed" : ""}`}
                      onClick={() => handleGoToItem(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleGoToItem(item);
                        }
                      }}
                      title={`${index + 1}. ${item.label}`}
                      aria-label={`${index + 1}. ${item.label}`}
                    >
                      {/* Thumbnail on TOP */}
                      <div className="dock-schedule-card__media-thumb-wrap">
                        {mediaSrc ? (
                          isVideo && !isImgThumb ? (
                            <video src={mediaSrc} className="dock-schedule-card__media-thumb" muted playsInline preload="metadata" />
                          ) : (
                            <img
                              src={mediaSrc}
                              alt={item.label}
                              className="dock-schedule-card__media-thumb"
                              loading="lazy"
                              onError={(e) => {
                                const target = e.currentTarget;
                                const raw = (payload.fileName as string) || (payload.filePath as string) || "";
                                if (raw) {
                                  const fallback = resolveOverlayAssetUrl(raw);
                                  if (fallback && target.src !== fallback) {
                                    target.src = fallback;
                                    return;
                                  }
                                }
                                target.style.display = "none";
                              }}
                            />
                          )
                        ) : (
                          <div className="dock-schedule-card__media-thumb dock-schedule-card__media-thumb--placeholder">
                            <Icon name={isVideo ? "movie" : "image"} size={20} />
                          </div>
                        )}

                        {isVideo && (
                          <span className="dock-schedule-card__media-video-badge">
                            <Icon name="play_arrow" size={10} />
                          </span>
                        )}

                        {isLive && (
                          <span className="dock-schedule-card__media-live-badge">
                            <span className="dock-schedule-card__live-dot" />
                            LIVE
                          </span>
                        )}
                      </div>

                      {/* Footer with minimal text emphasis & actions */}
                      <div className="dock-schedule-card__media-footer">
                        <span className="dock-schedule-card__media-caption" title={item.label}>
                          {item.label}
                        </span>

                        <div className="dock-schedule-card__actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={`dock-schedule-card__project-btn ${isLive ? "dock-schedule-card__project-btn--live" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handlePresentItem(item);
                            }}
                            title={isLive ? t("schedule.liveNow", "Currently Live on Output") : t("schedule.project", "Project to OBS")}
                            aria-label={t("schedule.project", "Project to OBS")}
                          >
                            {isLive ? "LIVE" : t("schedule.projectShort", "Project")}
                          </button>

                          <button
                            type="button"
                            className="dock-schedule-card__remove-btn"
                            onClick={(e) => handleRemoveItem(e, item.id)}
                            title={t("common.remove", "Remove from schedule")}
                            aria-label={t("common.remove", "Remove from schedule")}
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // ── Bible / Worship / Notes Card (Top: Chapter-verse, Middle: Inscribed passage, Bottom: Buttons) ──
                return (
                  <div
                    key={item.id}
                    className={`dock-schedule-card dock-schedule-card--text ${isLive ? "dock-schedule-card--live" : ""} ${isCompleted ? "dock-schedule-card--completed" : ""}`}
                    onClick={() => handleGoToItem(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleGoToItem(item);
                      }
                    }}
                    title={`${index + 1}. ${item.label}`}
                    aria-label={`${index + 1}. ${item.label}`}
                  >
                    {/* Top Row: Bible chapter-verse / Song title (Full width, no buttons crowding it) */}
                    <div className="dock-schedule-card__header-row dock-schedule-card__title-row">
                      <div className="dock-schedule-card__title">
                        <span className="dock-schedule-card__title-text">{item.label}</span>
                        {isLive && (
                          <span className="dock-schedule-card__live-pill">
                            <span className="dock-schedule-card__live-dot" />
                            LIVE
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: The passage being read (inscribed presentation) */}
                    {item.subtitle && (
                      <div
                        className="dock-schedule-card__snippet dock-schedule-card__inscribed-passage"
                        title={item.subtitle}
                      >
                        {item.subtitle}
                      </div>
                    )}

                    {/* Bottom Row: Actions (Buttons at the bottom) */}
                    <div className="dock-schedule-card__bottom-row" onClick={(e) => e.stopPropagation()}>
                      <div className="dock-schedule-card__actions">
                        <button
                          type="button"
                          className={`dock-schedule-card__project-btn ${isLive ? "dock-schedule-card__project-btn--live" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handlePresentItem(item);
                          }}
                          title={isLive ? t("schedule.liveNow", "Currently Live on Output") : t("schedule.project", "Project to OBS")}
                          aria-label={t("schedule.project", "Project to OBS")}
                        >
                          {isLive ? "LIVE" : t("schedule.projectShort", "Project")}
                        </button>

                        <button
                          type="button"
                          className="dock-schedule-card__remove-btn"
                          onClick={(e) => handleRemoveItem(e, item.id)}
                          title={t("common.remove", "Remove from schedule")}
                          aria-label={t("common.remove", "Remove from schedule")}
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Bottom center placeholder text hint */}
            <div className="dock-schedule-panel__bottom-placeholder">
              <Icon name="playlist_add" size={18} />
              <span className="dock-schedule-panel__placeholder-title">
                {t("schedule.placeholderTitle", "Service Schedule")}
              </span>
              <span className="dock-schedule-panel__placeholder-hint">
                {t("schedule.placeholderHint", "Right-click any scripture, worship song, or media to queue it here.")}
              </span>
            </div>
          </div>

          {/* Footer without clear button */}
          <div className="dock-schedule-panel__footer">
            <div className="dock-schedule-panel__count">
              <Icon name="checklist" size={13} />
              <span>{scheduleItems.length} {t("schedule.queued", "items queued")}</span>
            </div>
          </div>

          {/* Draggable resizer handle */}
          <div
            className="dock-schedule-resizer"
            onMouseDown={handleMouseDownResize}
            onDoubleClick={handleDoubleClickResize}
            title={t("schedule.resizeHint", "Drag left/right to resize schedule (double-click to reset)")}
            aria-label="Resize schedule"
          />
        </div>
      )}
    </aside>
  );
}
