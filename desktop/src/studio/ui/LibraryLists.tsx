/**
 * LibraryLists.tsx — the left panel for Worship (songs), Notes and Media.
 */
import { useMemo, useState } from "react";
import { Film, Image as ImageIcon, Search } from "lucide-react";
import type { Song } from "../../worship/types";
import type { DockNote } from "../../dock/dockNotesStorage";
import type { MediaItem } from "../../library/libraryTypes";
import { mediaPath } from "../studioSlides";

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="sx-search">
      <Search size={15} />
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

export function SongList({ songs, selectedId, onSelect }: { songs: Song[]; selectedId: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...songs].filter((s) => !s.archived).sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
    if (!needle) return sorted;
    return sorted.filter((s) =>
      s.metadata.title.toLowerCase().includes(needle)
      || (s.metadata.artist || "").toLowerCase().includes(needle)
      || (s.metadata.hymnNumber || "") === needle
      || s.lyrics.toLowerCase().includes(needle));
  }, [songs, query]);
  return (
    <div className="sx-lib">
      <div className="sx-lib__search"><SearchBox value={query} onChange={setQuery} placeholder="Search songs or lyrics" /></div>
      <div className="sx-lib__list">
        {list.length === 0 && <div className="sx-empty">{songs.length === 0 ? "No songs yet. Add songs on the Worship page." : "No song matches."}</div>}
        {list.map((song) => (
          <button key={song.id} type="button" className={`sx-lib__row${song.id === selectedId ? " is-on" : ""}`} onClick={() => onSelect(song.id)}>
            <span className="sx-lib__title">{song.metadata.title}</span>
            <span className="sx-lib__sub">
              {[song.metadata.artist, song.metadata.key ? `Key ${song.metadata.key}` : "", `${song.slides?.length ?? 0} slides`].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function NoteList({ notes, selectedId, onSelect }: { notes: DockNote[]; selectedId: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
    return needle ? sorted.filter((n) => n.title.toLowerCase().includes(needle) || n.content.toLowerCase().includes(needle)) : sorted;
  }, [notes, query]);
  return (
    <div className="sx-lib">
      <div className="sx-lib__search"><SearchBox value={query} onChange={setQuery} placeholder="Search notes" /></div>
      <div className="sx-lib__list">
        {list.length === 0 && <div className="sx-empty">{notes.length === 0 ? "No notes yet. Verse AI and the Dock Notes tab save sermon notes here." : "No note matches."}</div>}
        {list.map((note) => (
          <button key={note.id} type="button" className={`sx-lib__row${note.id === selectedId ? " is-on" : ""}`} onClick={() => onSelect(note.id)}>
            <span className="sx-lib__title">{note.title || "Untitled note"}</span>
            <span className="sx-lib__sub">{note.content.split("\n").find((line) => line.trim()) || "Empty note"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type MediaFilter = "all" | "image" | "video";

export function MediaList({ media, selectedId, base, onSelect }: { media: MediaItem[]; selectedId: string; base: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return media.filter((m) => (filter === "all" || m.type === filter) && (!needle || m.name.toLowerCase().includes(needle)));
  }, [media, query, filter]);
  return (
    <div className="sx-lib">
      <div className="sx-lib__search">
        <SearchBox value={query} onChange={setQuery} placeholder="Search pictures and videos" />
        <div className="sx-chips">
          {(["all", "image", "video"] as MediaFilter[]).map((f) => (
            <button key={f} type="button" className={filter === f ? "is-on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "image" ? "Pictures" : "Videos"}
            </button>
          ))}
        </div>
      </div>
      <div className="sx-lib__list">
        {list.length === 0 && <div className="sx-empty">{media.length === 0 ? "No pictures or videos yet. Add them on the Media page." : "Nothing matches."}</div>}
        {list.map((item) => {
          const thumb = item.thumbnailUrl || (item.type === "image" ? mediaPath(item) : "");
          return (
            <button key={item.id} type="button" className={`sx-lib__row sx-lib__row--media${item.id === selectedId ? " is-on" : ""}`} onClick={() => onSelect(item.id)}>
              <span className="sx-lib__thumb">
                {thumb ? <img src={/^(data:|https?:)/i.test(thumb) ? thumb : `${base}${thumb}`} alt="" /> : item.type === "video" ? <Film size={16} /> : <ImageIcon size={16} />}
              </span>
              <span className="sx-lib__meta">
                <span className="sx-lib__title">{item.name}</span>
                <span className="sx-lib__sub">{item.type === "video" ? "Video" : "Picture"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
