/**
 * MediaWorkspace.tsx — pictures, videos and sound in the Studio.
 *
 *  Library   Import, search, All · Pictures · Videos · Sound, where they came from, grid or list.
 *            Click = Preview, double-click = Project, right-click = more.
 *  Playback  for the video or sound on the screen: play / pause, stop, seek, loop, volume,
 *            mute, Fit / Fill. Only shown while one is playing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus,
  Eye,
  Film,
  Grid3x3,
  Image as ImageIcon,
  List,
  Loader2,
  Music2,
  Pause,
  Play,
  Repeat,
  Search,
  Square,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { MediaItem } from "../../library/libraryTypes";
import { DOCK_MEDIA_ACCEPT } from "../../services/mediaValidation";
import type { StudioMediaControl, StudioSlide } from "../studioEngine";
import { isDocumentPage, mediaPath } from "../studioSlides";
import StudioMenu, { menuAt, type StudioMenuState } from "./StudioMenu";

type Kind = "all" | "image" | "video" | "audio";
type Origin = "all" | "local" | "templates";

interface MediaWorkspaceProps {
  media: MediaItem[];
  base: string;
  selectedId: string;
  liveId: string;
  onPick: (id: string) => void;
  onProject: (id: string) => void;
  onSchedule: (id: string) => void;
  onImport: (files: FileList) => void;
  importing: string;
  /** Kept so the page can still pass it; the Overlays tab was removed, so it is not shown. */
  overlays?: React.ReactNode;
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

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return media.filter((m) => !isDocumentPage(m)
      && (kind === "all" || m.type === kind)
      && (origin === "all" || (origin === "templates" ? m.source === "template-cloudflare" : m.source !== "template-cloudflare"))
      && (!needle || m.name.toLowerCase().includes(needle)));
  }, [media, query, kind, origin]);

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
            <button type="button" className="studio-btn studio-btn--primary" onClick={() => fileRef.current?.click()} disabled={Boolean(props.importing)}>
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
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`st-mitem${isSel ? " is-selected" : ""}${isLive ? " is-live" : ""}`}
                onClick={() => props.onPick(item.id)}
                onDoubleClick={() => props.onProject(item.id)}
                onKeyDown={(e) => { if (e.key === "Enter") props.onPick(item.id); }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu(menuAt(e, [
                    { label: "Preview", icon: <Eye size={14} />, onSelect: () => props.onPick(item.id) },
                    { label: "Project", icon: <Play size={14} />, hint: "Double-click", onSelect: () => props.onProject(item.id) },
                    { label: "Add to Schedule", icon: <CalendarPlus size={14} />, divider: true, onSelect: () => props.onSchedule(item.id) },
                  ]));
                }}
                title={item.name}
              >
                <span className="st-mitem__thumb">
                  {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon size={22} />}
                  {item.type !== "image" && <span className="st-mitem__kind"><Icon size={11} /> {duration(item.durationSec)}</span>}
                  {isLive && <span className="st-tag st-tag--live">LIVE</span>}
                </span>
                <span className="st-mitem__name">{item.name}</span>
              </div>
            );
          })}
        </div>
      )}
      <StudioMenu menu={menu} onClose={() => setMenu(null)} />
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
}

/** Playback bar for the video / sound that is on the screen. */
export function MediaControls({ slide, durationSec, control, onChange, onStopSound }: MediaControlsProps) {
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
      <span className="st-playbar__name">{isAudio ? <Music2 size={13} /> : <Film size={13} />} {slide.itemTitle}</span>
      <button type="button" className="st-iconbtn" onClick={togglePause} aria-label={control.paused ? "Play" : "Pause"} title={control.paused ? "Play" : "Pause"}>
        {control.paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
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
      <button type="button" className={`st-iconbtn${control.loop ? " is-on" : ""}`} onClick={() => onChange({ loop: !control.loop })} aria-pressed={control.loop} aria-label="Loop" title="Loop">
        <Repeat size={14} />
      </button>
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
