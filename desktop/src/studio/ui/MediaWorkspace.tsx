/**
 * MediaWorkspace.tsx — pictures, videos and sound in the Studio.
 *
 *  Library   Import, search, All · Pictures · Videos · Sound, where they came from, grid or list.
 *            Click and double-click follow the Studio's Preview first / Straight to screen setting.
 *  Slideshow tick several pictures (or several videos) — tick circle, Ctrl/Shift+click or Select —
 *            then Start slideshow. The slideshow's controls appear in the centre under Preview.
 *  Playback  for the video or sound on the screen: play / pause, stop, seek, loop, volume,
 *            mute, Fit / Fill. Only shown while one is playing.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarPlus,
  Check,
  CheckSquare,
  Copy,
  FolderSearch,
  Eye,
  Film,
  Grid3x3,
  Image as ImageIcon,
  List,
  Loader2,
  Music2,
  Pause,
  Play,
  Presentation,
  Repeat,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { MediaItem } from "../../library/libraryTypes";
import { DOCK_MEDIA_ACCEPT } from "../../services/mediaValidation";
import type { StudioMediaControl, StudioSlide } from "../studioEngine";
import { isDocumentPage, mediaPath } from "../studioSlides";
import { isReferenceMediaItem } from "../../library/mediaReferences";
import StudioMenu, { menuAt, type StudioMenuState } from "./StudioMenu";
import StudioModal from "./StudioModal";

type Kind = "all" | "image" | "video" | "audio";
type Origin = "all" | "local" | "templates";

interface MediaWorkspaceProps {
  media: MediaItem[];
  base: string;
  selectedId: string;
  liveId: string;
  previewFirst: boolean;
  onPick: (id: string) => void;
  onProject: (id: string) => void;
  onSchedule: (id: string) => void;
  /** Delete these items from the library (and their files). Shown after the operator confirms. */
  onDelete?: (ids: string[]) => Promise<void> | void;
  onImport: (files: FileList) => void;
  /** Desktop app: open the native picker (files are referenced by path, not copied). */
  onImportClick?: () => void;
  /** A file is being dragged over the window. */
  dropActive?: boolean;
  /** Referenced items whose original file can't be found. */
  missingIds?: Set<string>;
  /** Point a referenced item at its file again. */
  onRelink?: (id: string) => void;
  /** Keep a copy of a referenced item in the MakeChurchEazy folder. */
  onMakeCopy?: (id: string) => void;
  importing: string;
  /** Kept so the page can still pass it; the Overlays tab was removed, so it is not shown. */
  overlays?: React.ReactNode;
  /** Start a slideshow of these items (in the order they were ticked), from startIndex. */
  onSlideshow?: (ids: string[], kind: "image" | "video", startIndex?: number) => void;
  /** Where a stopped slideshow of exactly these items can resume (index), or null. */
  resumeIndexFor?: (ids: string[]) => number | null;
  /** Items of the slideshow that is running now (marked in the grid). */
  slideshowIds?: string[];
}

/** A video with no saved picture: show its first frame (loaded only when the tile scrolls into view). */
function VideoFrame({ src, fallback }: { src: string; fallback: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return undefined; }
    const watcher = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); watcher.disconnect(); }
    }, { rootMargin: "200px" });
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);
  return (
    <span ref={box} className="st-mitem__vframe">
      {!ready && fallback}
      {near && (
        <video
          src={`${src}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          tabIndex={-1}
          aria-hidden="true"
          disablePictureInPicture
          className={ready ? "is-ready" : ""}
          onLoadedMetadata={(e) => { try { e.currentTarget.currentTime = Math.min(0.1, (e.currentTarget.duration || 0.1) / 2); } catch { /* the frame still shows */ } }}
          onLoadedData={() => setReady(true)}
        />
      )}
    </span>
  );
}

function videoUrlOf(item: MediaItem, base: string): string {
  const url = mediaPath(item);
  return /^(data:|https?:|blob:)/i.test(url) ? url : `${base}${url}`;
}

function thumbOf(item: MediaItem, base: string): string {
  const thumb = item.thumbnailUrl || (item.type === "image" ? mediaPath(item) : "");
  if (!thumb) return "";
  return /^(data:|https?:|blob:)/i.test(thumb) ? thumb : `${base}${thumb}`;
}

function duration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function MediaWorkspace(props: MediaWorkspaceProps) {
  const { media, base, selectedId, liveId } = props;
  const tab = "library" as const;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [origin, setOrigin] = useState<Origin>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [menu, setMenu] = useState<StudioMenuState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Ticked items for a slideshow, in the order they were ticked. Only pictures or only videos.
  const [ticked, setTicked] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [tickNote, setTickNote] = useState("");
  const byId = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const tickedKind: "image" | "video" | null = ticked.length ? ((byId.get(ticked[0])?.type as "image" | "video") ?? null) : null;

  // Forget ticks for items that were deleted.
  useEffect(() => {
    setTicked((cur) => {
      const next = cur.filter((id) => byId.has(id));
      return next.length === cur.length ? cur : next;
    });
  }, [byId]);

  const toggleTick = (item: MediaItem) => {
    if (item.type !== "image" && item.type !== "video") return;
    setTickNote("");
    setTicked((cur) => {
      if (cur.includes(item.id)) return cur.filter((id) => id !== item.id);
      const kindNow = cur.length ? byId.get(cur[0])?.type : null;
      if (kindNow && kindNow !== item.type) {
        setTickNote(item.type === "video"
          ? "A slideshow is only pictures or only videos — started a new video selection."
          : "A slideshow is only pictures or only videos — started a new picture selection.");
        return [item.id];
      }
      return [...cur, item.id];
    });
  };

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return media.filter((m) => !isDocumentPage(m)
      && (kind === "all" || m.type === kind)
      && (origin === "all" || (origin === "templates" ? m.source === "template-cloudflare" : m.source !== "template-cloudflare"))
      && (!needle || m.name.toLowerCase().includes(needle)));
  }, [media, query, kind, origin]);

  const selectAllOfKind = () => {
    const k = tickedKind ?? (kind === "video" ? "video" : "image");
    setTicked(list.filter((m) => m.type === k).map((m) => m.id));
    setTickNote("");
  };
  const showChecks = selectMode || ticked.length > 0;
  const resumeAt = ticked.length > 1 ? props.resumeIndexFor?.(ticked) ?? null : null;
  const running = new Set(props.slideshowIds ?? []);

  // Delete (always asks first). Something on the screen or in a running slideshow can't be deleted.
  const [pendingDelete, setPendingDelete] = useState<MediaItem[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const askDelete = (items: MediaItem[]) => {
    if (!props.onDelete || items.length === 0) return;
    setDeleteError("");
    setPendingDelete(items);
  };
  const closeDelete = () => { if (!deleting) setPendingDelete([]); };
  const deleteBlocked = pendingDelete.filter((item) => item.id === liveId || running.has(item.id));
  const confirmDelete = async () => {
    if (!props.onDelete || pendingDelete.length === 0 || deleteBlocked.length > 0) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await props.onDelete(pendingDelete.map((item) => item.id));
      setTicked((cur) => cur.filter((id) => !pendingDelete.some((item) => item.id === id)));
      setPendingDelete([]);
    } catch (error) {
      setDeleteError(error instanceof Error && error.message ? error.message : "Could not delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="st-media" aria-label="Media">
      <div className="st-media__bar">
        {tab === "library" && (
          <>
            <div className="st-searchbox">
              <Search size={13} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search media" aria-label="Search media" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={12} /></button>}
            </div>
            <div className="st-chips" role="group" aria-label="Type">
              {(["all", "image", "video", "audio"] as Kind[]).map((k) => (
                <button key={k} type="button" className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>
                  {k === "all" ? "All" : k === "image" ? "Pictures" : k === "video" ? "Videos" : "Sound"}
                </button>
              ))}
            </div>
            <select value={origin} onChange={(e) => setOrigin(e.target.value as Origin)} aria-label="Folder" className="st-sel" title="Where the media came from">
              <option value="all">All media</option>
              <option value="local">My uploads</option>
              <option value="templates">Ready-made</option>
            </select>
            <div className="st-seg st-seg--icons" role="group" aria-label="View">
              <button type="button" className={view === "grid" ? "is-on" : ""} onClick={() => setView("grid")} aria-label="Grid"><Grid3x3 size={14} /></button>
              <button type="button" className={view === "list" ? "is-on" : ""} onClick={() => setView("list")} aria-label="List"><List size={14} /></button>
            </div>
            {props.onSlideshow && (
              <button
                type="button"
                className={`studio-btn${showChecks ? " is-on" : ""}`}
                onClick={() => { if (showChecks) { setSelectMode(false); setTicked([]); setTickNote(""); } else setSelectMode(true); }}
                aria-pressed={showChecks}
                title="Tick several pictures or videos to make a slideshow"
              >
                <CheckSquare size={14} /> {showChecks ? "Done" : "Select"}
              </button>
            )}
            <button type="button" className="studio-btn studio-btn--primary" onClick={() => (props.onImportClick ? props.onImportClick() : fileRef.current?.click())} disabled={Boolean(props.importing)}>
              {props.importing ? <Loader2 size={14} className="st-spin" /> : <Upload size={14} />} Import Media
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={DOCK_MEDIA_ACCEPT}
              onChange={(e) => { if (e.target.files?.length) props.onImport(e.target.files); e.target.value = ""; }}
            />
          </>
        )}
      </div>
      {props.importing && <div className="st-banner" role="status">{props.importing}</div>}
      {props.dropActive && !props.importing && <div className="st-banner" role="status">Drop to add to your media library</div>}

      {props.previewFirst && list.some((item) => item.type === "video") && !showChecks && (
        <div className="st-media__hint" role="status">
          Preview first is on. Click a video to preview it, or use <strong>Send to Screen</strong> on its card to project it.
        </div>
      )}

      {props.onSlideshow && showChecks && (
        <div className="st-mselect" role="region" aria-label="Slideshow selection">
          <span className="st-mselect__count">
            {ticked.length === 0
              ? "Tick pictures or videos for a slideshow"
              : `${ticked.length} ${tickedKind === "video" ? "video" : "picture"}${ticked.length === 1 ? "" : "s"} selected`}
          </span>
          {ticked.length === 1 && <span className="st-mselect__hint">Tick one more to make a slideshow</span>}
          {tickNote && <span className="st-mselect__hint">{tickNote}</span>}
          <span className="st-mselect__spacer" />
          <button type="button" className="studio-btn" onClick={selectAllOfKind}>
            Select all {(tickedKind ?? (kind === "video" ? "video" : "image")) === "video" ? "videos" : "pictures"}
          </button>
          {ticked.length > 0 && <button type="button" className="studio-btn" onClick={() => { setTicked([]); setTickNote(""); }}>Clear</button>}
          {props.onDelete && ticked.length > 0 && (
            <button
              type="button"
              className="studio-btn studio-btn--danger"
              onClick={() => askDelete(ticked.map((id) => byId.get(id)).filter((m): m is MediaItem => Boolean(m)))}
              title="Delete the selected items from your media library"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          {resumeAt !== null && (
            <button type="button" className="studio-btn" onClick={() => props.onSlideshow?.(ticked, tickedKind ?? "image", resumeAt)} title="Carry on from where the slideshow stopped">
              <RotateCcw size={14} /> Resume at {resumeAt + 1}
            </button>
          )}
          <button
            type="button"
            className="studio-btn studio-btn--primary"
            disabled={ticked.length < 2}
            onClick={() => props.onSlideshow?.(ticked, tickedKind ?? "image", 0)}
          >
            <Presentation size={14} /> {resumeAt !== null ? "Start over" : "Start slideshow"}
          </button>
        </div>
      )}

      {(
        <div className={`st-media__items st-media__items--${view}`}>
          {list.length === 0 && (
            <div className="st-empty st-empty--big">{media.length === 0 ? "No media yet. Press Import Media to add pictures, videos or sound." : "Nothing matches."}</div>
          )}
          {list.map((item) => {
            const thumb = thumbOf(item, base);
            const Icon = item.type === "video" ? Film : item.type === "audio" ? Music2 : ImageIcon;
            const isSel = item.id === selectedId;
            const isLive = item.id === liveId;
            const tickAt = ticked.indexOf(item.id);
            const canTick = Boolean(props.onSlideshow) && (item.type === "image" || item.type === "video");
            const isReference = isReferenceMediaItem(item) && Boolean(item.referenceId);
            const isMissing = Boolean(props.missingIds?.has(item.id));
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`st-mitem${isSel ? " is-selected" : ""}${isLive ? " is-live" : ""}${tickAt >= 0 ? " is-ticked" : ""}${showChecks ? " st-mitem--select" : ""}`}
                onClick={(e) => {
                  // In Select mode (or with Ctrl / Cmd / Shift) a click ticks instead of previewing.
                  if (canTick && (showChecks || e.ctrlKey || e.metaKey || e.shiftKey)) { toggleTick(item); return; }
                  props.onPick(item.id);
                }}
                onDoubleClick={() => {
                  if (showChecks) return;
                  (props.previewFirst ? props.onPick : props.onProject)(item.id);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") props.onPick(item.id); }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu(menuAt(e, [
                    { label: "Preview", icon: <Eye size={14} />, onSelect: () => props.onPick(item.id) },
                    { label: "Project", icon: <Play size={14} />, onSelect: () => props.onProject(item.id) },
                    { label: "Add to Schedule", icon: <CalendarPlus size={14} />, divider: true, onSelect: () => props.onSchedule(item.id) },
                    ...(canTick ? [{ label: tickAt >= 0 ? "Untick (slideshow)" : "Tick for a slideshow", icon: <CheckSquare size={14} />, onSelect: () => toggleTick(item) }] : []),
                    ...(isReference && props.onRelink ? [{ label: isMissing ? "Locate missing file…" : "Locate file…", icon: <FolderSearch size={14} />, divider: true, onSelect: () => props.onRelink?.(item.id) }] : []),
                    ...(isReference && props.onMakeCopy && item.storage !== "copy" && !isMissing ? [{ label: "Make a local copy", icon: <Copy size={14} />, onSelect: () => props.onMakeCopy?.(item.id) }] : []),
                    ...(props.onDelete ? [{ label: "Delete…", icon: <Trash2 size={14} />, danger: true, divider: true, onSelect: () => askDelete([item]) }] : []),
                  ]));
                }}
                title={item.name}
              >
                <span className="st-mitem__thumb">
                  {thumb ? <img src={thumb} alt="" loading="lazy" /> : item.type === "video" && mediaPath(item) ? <VideoFrame src={videoUrlOf(item, base)} fallback={<Icon size={22} />} /> : <Icon size={22} />}
                  {item.type !== "image" && <span className="st-mitem__kind"><Icon size={11} /> {duration(item.durationSec)}</span>}
                  {isLive && <span className="st-tag st-tag--live">LIVE</span>}
                  {isMissing && (
                    <button
                      type="button"
                      className="st-tag st-mitem__missing"
                      onClick={(e) => { e.stopPropagation(); props.onRelink?.(item.id); }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      title="The original file was moved or deleted. Click to locate it."
                    >
                      File missing
                    </button>
                  )}
                  {running.has(item.id) && !isLive && <span className="st-tag st-mitem__inshow">In slideshow</span>}
                  {canTick && (
                    <button
                      type="button"
                      className={`st-mitem__check${tickAt >= 0 ? " is-on" : ""}`}
                      onClick={(e) => { e.stopPropagation(); toggleTick(item); }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      aria-pressed={tickAt >= 0}
                      aria-label={tickAt >= 0 ? `Untick ${item.name}` : `Tick ${item.name} for a slideshow`}
                      title={tickAt >= 0 ? `Number ${tickAt + 1} in the slideshow` : "Tick for a slideshow"}
                    >
                      {tickAt >= 0 ? <span>{tickAt + 1}</span> : <Check size={12} />}
                    </button>
                  )}
                  {props.onDelete && (
                    <button
                      type="button"
                      className="st-mitem__del"
                      onClick={(e) => { e.stopPropagation(); askDelete([item]); }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      aria-label={`Delete ${item.name}`}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </span>
                <span className="st-mitem__details">
                  <span className="st-mitem__name">{item.name}</span>
                  {props.previewFirst && item.type === "video" && !showChecks && (
                    <button
                      type="button"
                      className="st-mitem__project"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); props.onProject(item.id); }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}
                      aria-label={`Send ${item.name} to screen`}
                      title={`Send ${item.name} to screen`}
                    >
                      <Play size={12} /> <span>Send</span>
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <StudioMenu menu={menu} onClose={() => setMenu(null)} />
      {pendingDelete.length > 0 && (
        <StudioModal
          title={pendingDelete.length === 1 ? "Delete this media?" : `Delete ${pendingDelete.length} items?`}
          onClose={closeDelete}
        >
          <div className="st-confirm">
            <p className="st-confirm__text">
              {pendingDelete.every((item) => isReferenceMediaItem(item) && item.storage !== "copy")
                ? (pendingDelete.length === 1
                  ? <><strong>{pendingDelete[0].name}</strong> will be removed from your media library. The original file stays where it is on this computer.</>
                  : <>These {pendingDelete.length} items will be removed from your media library. The original files stay where they are on this computer.</>)
                : pendingDelete.length === 1
                  ? <><strong>{pendingDelete[0].name}</strong> will be removed from your media library and its file deleted from this computer.</>
                  : <>These {pendingDelete.length} items will be removed from your media library and their files deleted from this computer.</>}
              {" "}This can't be undone.
            </p>
            {deleteBlocked.length > 0 && (
              <p className="st-confirm__warn" role="alert">
                {deleteBlocked.length === 1 ? `“${deleteBlocked[0].name}” is` : `${deleteBlocked.length} of these are`} on the screen or in a running slideshow. Clear it from the screen first, then delete.
              </p>
            )}
            {deleteError && <p className="st-confirm__warn" role="alert">{deleteError}</p>}
            <div className="st-confirm__actions">
              <button type="button" className="studio-btn" onClick={closeDelete} disabled={deleting} autoFocus>Cancel</button>
              <button type="button" className="studio-btn studio-btn--danger" onClick={() => void confirmDelete()} disabled={deleting || deleteBlocked.length > 0}>
                {deleting ? <Loader2 size={14} className="st-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        </StudioModal>
      )}
    </section>
  );
}

interface MediaControlsProps {
  /** The video or sound on the screen. */
  slide: StudioSlide;
  durationSec?: number;
  control: StudioMediaControl;
  onChange: (change: Partial<StudioMediaControl>) => void;
  onStopSound?: () => void;
  /** In a video slideshow, transport and loop controls already live on the slideshow bar. */
  compact?: boolean;
}

/** Playback bar for the video / sound that is on the screen. */
export function MediaControls({ slide, durationSec, control, onChange, onStopSound, compact = false }: MediaControlsProps) {
  // The output doesn't report its position back, so the bar keeps its own clock.
  const [anchor, setAnchor] = useState({ at: Date.now(), pos: 0 });
  const [, tick] = useState(0);
  const isAudio = slide.media?.kind === "audio";
  const isVideo = slide.media?.kind === "video";

  useEffect(() => {
    setAnchor({ at: Date.now(), pos: control.seekTo });
  }, [control.seekRev, control.seekTo, slide.key]);

  useEffect(() => {
    if (control.paused) return undefined;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [control.paused]);

  const length = durationSec && durationSec > 0 ? durationSec : 0;
  let position = control.paused ? anchor.pos : anchor.pos + (Date.now() - anchor.at) / 1000;
  if (length) position = control.loop ? position % length : Math.min(position, length);

  const togglePause = () => {
    if (control.paused) {
      onChange({ paused: false });
      setAnchor((a) => ({ at: Date.now(), pos: a.pos }));
    } else {
      setAnchor({ at: Date.now(), pos: position });
      onChange({ paused: true });
    }
  };

  if (!isAudio && !isVideo) {
    return (
      <div className="st-playbar">
        <span className="st-playbar__name"><ImageIcon size={13} /> {slide.itemTitle}</span>
        <div className="st-seg" role="group" aria-label="Fit">
          <button type="button" className={control.fit === "contain" ? "is-on" : ""} onClick={() => onChange({ fit: "contain" })}>Fit</button>
          <button type="button" className={control.fit === "cover" ? "is-on" : ""} onClick={() => onChange({ fit: "cover" })}>Fill</button>
        </div>
      </div>
    );
  }

  return (
    <div className="st-playbar" aria-label="Playback">
      {!compact && <span className="st-playbar__name">{isAudio ? <Music2 size={13} /> : <Film size={13} />} {slide.itemTitle}</span>}
      {!compact && (
        <button type="button" className="st-iconbtn" onClick={togglePause} aria-label={control.paused ? "Play" : "Pause"} title={control.paused ? "Play" : "Pause"}>
          {control.paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
      )}
      {!compact && (
        <button
          type="button"
          className="st-iconbtn"
          onClick={() => {
            if (isAudio && onStopSound) onStopSound();
            else onChange({ paused: true, seekTo: 0, seekRev: Date.now() });
          }}
          aria-label="Stop"
          title={isAudio ? "Stop the sound" : "Stop (back to the start)"}
        >
          <Square size={13} />
        </button>
      )}
      <span className="st-playbar__time">{duration(position) || "0:00"}</span>
      <input
        type="range"
        min={0}
        max={Math.max(1, length)}
        step={1}
        value={Math.min(position, Math.max(1, length))}
        disabled={!length}
        onChange={(e) => onChange({ seekTo: Number(e.target.value), seekRev: Date.now() })}
        aria-label="Seek"
        className="st-playbar__seek"
      />
      <span className="st-playbar__time">{duration(length) || "–"}</span>
      {!compact && (
        <button type="button" className={`st-iconbtn${control.loop ? " is-on" : ""}`} onClick={() => onChange({ loop: !control.loop })} aria-pressed={control.loop} aria-label="Loop" title="Loop">
          <Repeat size={14} />
        </button>
      )}
      <button type="button" className="st-iconbtn" onClick={() => onChange({ muted: !control.muted })} aria-label={control.muted ? "Unmute" : "Mute"} title={control.muted ? "Unmute" : "Mute"}>
        {control.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
      <input type="range" min={0} max={100} value={Math.round(control.volume * 100)} onChange={(e) => onChange({ volume: Number(e.target.value) / 100, muted: false })} aria-label="Volume" className="st-playbar__vol" />
      {isVideo && (
        <div className="st-seg" role="group" aria-label="Fit">
          <button type="button" className={control.fit === "contain" ? "is-on" : ""} onClick={() => onChange({ fit: "contain" })}>Fit</button>
          <button type="button" className={control.fit === "cover" ? "is-on" : ""} onClick={() => onChange({ fit: "cover" })}>Fill</button>
        </div>
      )}
    </div>
  );
}
