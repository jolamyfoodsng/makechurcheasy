/**
 * WorshipWorkspace.tsx — songs in the Studio.
 *
 *  Left   the song library: search titles and lyrics; All · Favorites · Recent · Custom.
 *  Right  the open song's sections (Verse 1, Chorus, Bridge…). Click = Preview,
 *         double-click = Project, right-click = more.
 *
 * Songs are added and edited on the Worship page (New / Edit open it).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarPlus, Eye, Music, Pencil, Play, Plus, Search, Star, X } from "../../components/icons/NativeIcons";
import type { Song } from "../../worship/types";
import { toneStyle, type DeckSlide } from "../studioSlides";
import { lineStats, songLineStats } from "../../worship/lyricTools";
import StudioMenu, { menuAt, type StudioMenuState } from "./StudioMenu";
import { useNarrow } from "./useNarrow";
import "./WorshipWorkspace.css";

const FAV_KEY = "mce-studio-song-favorites";
const RECENT_KEY = "mce-studio-song-recent";

function readIds(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

/** Remember a song as recently shown (the page calls this after projecting a song). */
export function markSongRecent(songId: string): void {
  if (!songId) return;
  writeIds(RECENT_KEY, [songId, ...readIds(RECENT_KEY).filter((id) => id !== songId)].slice(0, 30));
}

type Filter = "all" | "favorites" | "recent" | "custom";

interface WorshipWorkspaceProps {
  songs: Song[];
  songId: string;
  onSong: (id: string) => void;
  /** Search + Enter: open the song and put its first slide on the screen. */
  onSendSong: (id: string) => void;
  slides: DeckSlide[];
  selectedKey: string;
  liveKey: string;
  onPick: (index: number) => void;
  onProject: (index: number) => void;
  onScheduleSection: (index: number) => void;
  onScheduleSong: () => void;
  onNewSong: () => void;
  onEditSong: (id: string) => void;
  /** Lines per slide + Translate row, shown above the sections. */
  tools?: ReactNode;
}

export default function WorshipWorkspace(props: WorshipWorkspaceProps) {
  const { songs, songId, slides, selectedKey, liveKey } = props;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [favorites, setFavorites] = useState<string[]>(() => readIds(FAV_KEY));
  const [recent, setRecent] = useState<string[]>(() => readIds(RECENT_KEY));
  const [menu, setMenu] = useState<StudioMenuState | null>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const narrow = useNarrow(rootRef, 560);
  const [active, setActive] = useState(0);

  // Recent changes when a song is shown; re-read when the list is opened.
  useEffect(() => {
    if (filter === "recent") setRecent(readIds(RECENT_KEY));
  }, [filter, liveKey]);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let base = songs.filter((s) => !s.archived);
    if (filter === "favorites") base = base.filter((s) => favorites.includes(s.id));
    if (filter === "custom") base = base.filter((s) => (s.importSourceType ?? "manual") === "manual");
    if (filter === "recent") {
      const order = new Map(recent.map((id, i) => [id, i]));
      base = base.filter((s) => order.has(s.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    } else {
      base = [...base].sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
    }
    if (!needle) return base;
    return base.filter((s) => s.metadata.title.toLowerCase().includes(needle)
      || (s.metadata.artist || "").toLowerCase().includes(needle)
      || (s.metadata.hymnNumber || "") === needle
      || s.lyrics.toLowerCase().includes(needle));
  }, [songs, query, filter, favorites, recent]);

  useEffect(() => setActive(0), [query, filter]);
  const song = songs.find((s) => s.id === songId);
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next);
    writeIds(FAV_KEY, next);
  };

  return (
    <section ref={rootRef} className={`st-split2${narrow ? " is-narrow" : ""}`} aria-label="Worship">
      <div className="st-lib">
        <div className="st-lib__top">
          <div className="st-searchbox st-searchbox--big">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((v) => Math.min(list.length - 1, v + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((v) => Math.max(0, v - 1)); }
                else if (e.key === "Escape") setQuery("");
                else if (e.key === "Enter" && list[active]) {
                  if (e.shiftKey) props.onSong(list[active].id); else props.onSendSong(list[active].id);
                  setQuery("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Search songs or lyrics, then Enter to show"
              aria-label="Search songs"
            />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={12} /></button>}
          </div>
          <div className="st-chips" role="group" aria-label="Filter songs">
            {(["all", "favorites", "recent", "custom"] as Filter[]).map((f) => (
              <button key={f} type="button" className={filter === f ? "is-on" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "favorites" ? "Favorites" : f === "recent" ? "Recent" : "Custom"}
              </button>
            ))}
          </div>
        </div>
        <div className="st-lib__list">
          {list.length === 0 && (
            <div className="st-empty">
              {songs.length === 0 ? "No songs yet." : filter === "favorites" ? "Star a song to keep it here." : filter === "recent" ? "Songs you show appear here." : "No song matches."}
            </div>
          )}
          {list.map((s, i) => (
            <div key={s.id} className={`st-lib__row${s.id === songId ? " is-on" : ""}${query && i === active ? " is-next" : ""}`}>
              <button type="button" className="st-lib__main" onClick={() => props.onSong(s.id)}>
                <span className="st-lib__title">{s.metadata.title}</span>
                <span className="st-lib__sub">{[s.metadata.artist, s.metadata.key ? `Key ${s.metadata.key}` : "", `${s.slides?.length ?? 0} slides`, s.slides?.length ? songLineStats(s).short : ""].filter(Boolean).join(" · ")}</span>
              </button>
              <button type="button" className={`st-star${favorites.includes(s.id) ? " is-on" : ""}`} onClick={() => toggleFavorite(s.id)} aria-label={favorites.includes(s.id) ? "Remove from favorites" : "Add to favorites"} title="Favorite">
                <Star size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="st-lib__foot">
          <button type="button" className="studio-btn" onClick={props.onNewSong}><Plus size={13} /> New song</button>
        </div>
      </div>

      <div className="st-sections">
        {!song ? (
          <div className="st-empty st-empty--big"><Music size={22} /> Pick a song on the left to see its sections.</div>
        ) : (
          <>
            <div className="st-sections__head">
              <div className="st-sections__title">
                <h2>{song.metadata.title}</h2>
                <span>{[song.metadata.artist, song.metadata.key ? `Key ${song.metadata.key}` : ""].filter(Boolean).join(" · ")}</span>
                {song.slides?.length > 0 && <span className="st-sections__stats" title="Measured from this song's slides">{lineStats(song.slides).slides} slides · {lineStats(song.slides).lines} lines · {lineStats(song.slides).label}</span>}
              </div>
              <button type="button" className="studio-btn" onClick={() => props.onEditSong(song.id)} title="Edit on the Worship page"><Pencil size={13} /> Edit</button>
              <button type="button" className="studio-btn" onClick={props.onScheduleSong} title="Add song to Schedule" aria-label="Add song to Schedule"><CalendarPlus size={13} /> <span className="st-btnlabel--wide">Add song to Schedule</span></button>
            </div>
            {props.tools}
            <div className="st-sections__list" ref={sectionsRef}>
              {slides.length === 0 && <div className="st-empty">This song has no slides yet. Open it on the Worship page to split the lyrics.</div>}
              {slides.map((slide, i) => {
                const tone = toneStyle(slide.tone);
                const isSel = slide.key === selectedKey;
                const isLive = slide.key === liveKey;
                return (
                  <div
                    key={slide.key}
                    data-index={i}
                    role="button"
                    tabIndex={0}
                    className={`st-section${isSel ? " is-selected" : ""}${isLive ? " is-live" : ""}`}
                    onClick={() => props.onPick(i)}
                    onDoubleClick={() => props.onProject(i)}
                    onKeyDown={(e) => { if (e.key === "Enter") props.onPick(i); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu(menuAt(e, [
                        { label: "Preview", icon: <Eye size={14} />, onSelect: () => props.onPick(i) },
                        { label: "Project", icon: <Play size={14} />, hint: "Double-click", onSelect: () => props.onProject(i) },
                        { label: "Add section to Schedule", icon: <CalendarPlus size={14} />, divider: true, onSelect: () => props.onScheduleSection(i) },
                        { label: "Add song to Schedule", icon: <CalendarPlus size={14} />, onSelect: props.onScheduleSong },
                      ]));
                    }}
                  >
                    <span className="st-section__tag" style={{ background: tone.bg, color: tone.fg }}>{(slide.label || tone.name || `Slide ${i + 1}`).toUpperCase()}</span>
                    <span className="st-section__text">{slide.text}</span>
                    <span className="st-section__lines" title="Lines on this slide">{slide.text.split("\n").filter((l) => l.trim()).length} line{slide.text.split("\n").filter((l) => l.trim()).length === 1 ? "" : "s"}</span>
                    {isLive && <span className="st-tag st-tag--live">LIVE</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <StudioMenu menu={menu} onClose={() => setMenu(null)} />
    </section>
  );
}
