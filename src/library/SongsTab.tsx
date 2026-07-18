/**
 * SongsTab.tsx — Songs list tab for the Library page
 *
 * Features:
 *   • Search by title / artist
 *   • Song list with lyrics preview, slide count, key badge
 *   • Add Song modal (title, key, leader, lyrics, auto-split)
 *   • Edit Song modal (same fields, pre-filled)
 *   • Archive with confirmation
 *   • ESC closes modals
 *
 * Songs are persisted in IndexedDB via worshipDb.ts.
 *
 * Plan enforcement:
 *   • Free: max 3 songs, no bulk import
 *   • Basic: max 70 songs, bulk import, translation, tickers
 *   • Growth+: unlimited songs, unlimited multiview
 *   • Existing songs are NEVER hidden or deleted on downgrade.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { useAuth } from "../contexts/AuthContext";
import {
  getEffectivePlan,
  getRemainingSongSlots,
} from "../services/licenseService";
import { checkEntitlementSync } from "../services/entitlementClient";
import { PremiumContentGate } from "../components/PremiumContentGate";
import { UpgradeModal } from "../components/UpgradeModal";
import { BulkImportModal } from "../worship/BulkImportModal";
import {
  formatOnlineLyricsSearchError,
  isSpotifyTrackLyricsQuery,
  searchOnlineSongLyrics,
  type OnlineLyricsSearchResult,
} from "../worship/onlineLyricsService";
import { generateSlides } from "../worship/slideEngine";
import {
  OnlineLyricsImportModal,
  type OnlineLyricsImportDraft,
} from "../worship/OnlineLyricsImportModal";
import { unicodeSearchNormalize, unicodeStripDiacritics } from "../worship/unicodeUtils";
import type { Song } from "../worship/types";
import {
  archiveSong,
  getAllSongs,
  getArchivedSongs,
  restoreSong,
  saveSong,
} from "../worship/worshipDb";
import WorshipSongModal from "../worship/WorshipSongModal";
import { UPGRADE_PROMO_FALLBACK } from "../lib/upgradePromo";

/* ---------- helpers ---------- */

function firstNLines(text: string, n: number): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, n);
}

const MIN_ONLINE_LYRICS_QUERY_LENGTH = 3;
const ONLINE_LYRICS_SEARCH_DELAY_MS = 80;

function fuzzyMatch(query: string, target: string): boolean {
  const q = unicodeStripDiacritics(query).replace(/\s+/g, "");
  const t = unicodeStripDiacritics(target).replace(/\s+/g, "");
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function normalizeSongLookupPart(value: string): string {
  return unicodeSearchNormalize(value);
}

function normalizeCompactSearch(value: string): string {
  return unicodeStripDiacritics(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildSongLookupKeys(title: string, artist: string): string[] {
  const normalizedTitle = normalizeSongLookupPart(title);
  const normalizedArtist = normalizeSongLookupPart(artist);

  if (!normalizedTitle) {
    return [];
  }

  return normalizedArtist
    ? [`${normalizedTitle}::${normalizedArtist}`, normalizedTitle]
    : [normalizedTitle];
}

function createSongId(prefix = "song"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ========================================================================= */
/* SongsTab                                                                  */
/* ========================================================================= */

export function SongsTab() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [archivedSongs, setArchivedSongs] = useState<Song[]>([]);
  const [search, setSearch] = useState("");
  const [onlineSearchResults, setOnlineSearchResults] = useState<OnlineLyricsSearchResult[]>([]);
  const [onlineSearchState, setOnlineSearchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [onlineSearchMessage, setOnlineSearchMessage] = useState("");
  const [pendingOnlineImport, setPendingOnlineImport] = useState<OnlineLyricsSearchResult | null>(null);
  const [showOnlineSearchModal, setShowOnlineSearchModal] = useState(false);
  const [onlineSearchQuery, setOnlineSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editSong, setEditSong] = useState<Song | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [showSongLimitModal, setShowSongLimitModal] = useState(false);
  const [songLimitModalType, setSongLimitModalType] = useState<"songs" | "import">("songs");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [savingOnlineImport, setSavingOnlineImport] = useState(false);
  const onlineSearchRequestRef = useRef(0);
  const spotifyAutoImportRef = useRef<string | null>(null);

  // ── Plan enforcement ──
  const { user: authUser } = useAuth();
  const effectivePlan = getEffectivePlan(authUser);
  const { limit: songLimit } = checkEntitlementSync("songs", effectivePlan);
  const { allowed: canImport } = checkEntitlementSync("massImport", effectivePlan);
  const [songCount, setSongCount] = useState<number>(0);
  const isSongUnlimited = songLimit === -1;
  const hasReachedSongLimit = !isSongUnlimited && songCount >= songLimit;

  const computeSongLimits = useCallback(async () => {
    try {
      const slots = await getRemainingSongSlots(authUser);
      if (isSongUnlimited) {
        setSongCount(0);
      } else {
        setSongCount(songLimit - slots);
      }
    } catch {
      // Fallback: keep current count
    }
  }, [authUser, songLimit, isSongUnlimited]);

  const reload = useCallback(async () => {
    const [all, archived] = await Promise.all([getAllSongs(), getArchivedSongs()]);
    setSongs(all);
    setArchivedSongs(archived);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Recompute song limits whenever the song list or plan changes
  useEffect(() => {
    computeSongLimits();
  }, [songs.length, computeSongLimits]);

  // ESC handling
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAddModal) { setShowAddModal(false); return; }
        if (editSong) { setEditSong(null); return; }
        if (deleteConfirmId) { setDeleteConfirmId(null); return; }
        if (showOnlineSearchModal) { setShowOnlineSearchModal(false); return; }
        if (showArchiveModal) { setShowArchiveModal(false); return; }
        if (bulkImportOpen) { setBulkImportOpen(false); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAddModal, editSong, deleteConfirmId, showOnlineSearchModal, showArchiveModal, bulkImportOpen]);

  // ── Accessible songs: only the songs the current plan allows ──
  const accessibleSongs = useMemo(() => {
    if (isSongUnlimited) return songs;
    return songs.slice(0, songLimit);
  }, [songs, isSongUnlimited, songLimit]);

  const visible = useMemo(() => {
    const languageFiltered = languageFilter !== "all"
      ? accessibleSongs.filter((s) => s.metadata.language === languageFilter)
      : accessibleSongs;

    if (!search.trim()) return languageFiltered;

    const q = search.trim();
    const qLower = q.toLowerCase();
    const qCompact = normalizeCompactSearch(q);
    const numMatch = qLower.match(/(\d+)/);
    const searchNumber = numMatch ? numMatch[1] : null;

    const scored = languageFiltered
      .map((song) => {
        const title = song.metadata.title.toLowerCase();
        const hymnNumber = song.metadata.hymnNumber?.trim() ?? "";
        const hymnNumberCompact = normalizeCompactSearch(hymnNumber);
        const hymnLabelCompact = hymnNumberCompact ? `hymn${hymnNumberCompact}` : "";
        const searchText = `${song.metadata.title}\n${song.metadata.artist}\n${song.lyrics}\n${hymnNumber}\nHymn ${hymnNumber}`.toLowerCase();
        let score = 0;

        if (searchNumber) {
          const exactTitleRe = new RegExp(`^hymn\\s+${searchNumber}$`);
          const numDotRe = new RegExp(`^${searchNumber}[.\\s]`);
          const bareNumRe = new RegExp(`^${searchNumber}$`);
          if (hymnNumberCompact === searchNumber) score += 12000;
          else if (hymnNumberCompact.includes(searchNumber)) score += 7000;
          else if (exactTitleRe.test(title)) score += 10000;
          else if (bareNumRe.test(title)) score += 10000;
          else if (numDotRe.test(title)) score += 10000;
          else if (title.includes(`hymn ${searchNumber}`)) score += 5000;
          else if (title.includes(searchNumber)) score += 2000;
        }

        if (score === 0 && hymnLabelCompact && hymnLabelCompact.includes(qCompact)) score += 9000;

        if (score === 0 && title.startsWith(qLower)) score += 3000;
        if (score === 0 && title.includes(qLower)) score += 1000;
        if (score === 0 && searchText.includes(qLower)) score += 500;
        if (score === 0 && fuzzyMatch(q, searchText)) score += 100;

        return { song, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const bestScore = scored.length > 0 ? scored[0].score : 0;
    if (bestScore >= 500) {
      return scored.filter((item) => item.score >= 500).map((item) => item.song);
    }
    return scored.map((item) => item.song);
  }, [search, accessibleSongs, languageFilter]);

  const hasActiveFilters = search.trim().length > 0 || languageFilter !== "all";
  const languageFilterLabel = languageFilter === "all"
    ? "All languages"
    : languageFilter.charAt(0).toUpperCase() + languageFilter.slice(1);

  const importedSongsLookup = useMemo(() => {
    const lookup = new Map<string, Song>();

    for (const song of songs) {
      for (const key of buildSongLookupKeys(song.metadata.title, song.metadata.artist)) {
        if (!lookup.has(key)) {
          lookup.set(key, song);
        }
      }
    }

    return lookup;
  }, [songs]);

  const findImportedSong = useCallback((result: OnlineLyricsSearchResult): Song | undefined => {
    for (const key of buildSongLookupKeys(result.title, result.artist)) {
      const existing = importedSongsLookup.get(key);
      if (existing) {
        return existing;
      }
    }
    return undefined;
  }, [importedSongsLookup]);

  useEffect(() => {
    const trimmedSearch = onlineSearchQuery.trim();

    if (!showOnlineSearchModal || !trimmedSearch) {
      onlineSearchRequestRef.current += 1;
      setOnlineSearchResults([]);
      setOnlineSearchState("idle");
      setOnlineSearchMessage("");
      return;
    }

    if (trimmedSearch.length < MIN_ONLINE_LYRICS_QUERY_LENGTH) {
      onlineSearchRequestRef.current += 1;
      setOnlineSearchResults([]);
      setOnlineSearchState("idle");
      setOnlineSearchMessage(`Type at least ${MIN_ONLINE_LYRICS_QUERY_LENGTH} letters to search online lyrics.`);
      return;
    }

    const requestId = onlineSearchRequestRef.current + 1;
    onlineSearchRequestRef.current = requestId;
    setOnlineSearchState("loading");
    setOnlineSearchMessage("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchOnlineSongLyrics(trimmedSearch);
        if (onlineSearchRequestRef.current !== requestId) {
          return;
        }
        setOnlineSearchResults(results);
        setOnlineSearchState("ready");
        setOnlineSearchMessage(results.length === 0 ? "No online lyrics found for this search yet." : "");
      } catch (error) {
        if (onlineSearchRequestRef.current !== requestId) {
          return;
        }
        console.warn("[SongsTab] Online lyrics search failed:", error);
        setOnlineSearchResults([]);
        setOnlineSearchState("error");
        setOnlineSearchMessage(formatOnlineLyricsSearchError(error));
      }
    }, ONLINE_LYRICS_SEARCH_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [onlineSearchQuery, showOnlineSearchModal]);

  const handleArchive = useCallback(
    async (id: string) => {
      await archiveSong(id);
      reload();
      setDeleteConfirmId(null);
    },
    [reload]
  );

  const handleSaveComplete = useCallback(() => {
    reload();
    setShowAddModal(false);
    setEditSong(null);
  }, [reload]);

  const handleRestore = useCallback(async (id: string) => {
    await restoreSong(id);
    reload();
  }, [reload]);

  const handleAddSong = useCallback(() => {
    if (hasReachedSongLimit) {
      setSongLimitModalType("songs");
      setShowSongLimitModal(true);
      return;
    }
    setShowAddModal(true);
  }, [hasReachedSongLimit]);

  const handleBulkImport = useCallback(() => {
    if (!canImport) {
      setSongLimitModalType("import");
      setShowSongLimitModal(true);
      return;
    }
    setBulkImportOpen(true);
  }, [canImport]);

  const handleOpenOnlineImport = useCallback((result: OnlineLyricsSearchResult) => {
    const existingSong = findImportedSong(result);
    if (existingSong) {
      setShowOnlineSearchModal(false);
      setEditSong(existingSong);
      return;
    }
    setPendingOnlineImport(result);
  }, [findImportedSong]);

  const handleOpenOnlineSearch = useCallback(() => {
    setOnlineSearchQuery((current) => current || search.trim());
    setShowOnlineSearchModal(true);
  }, [search]);

  const handleImportOnlineSong = useCallback(async (draft: OnlineLyricsImportDraft) => {
    if (!pendingOnlineImport) {
      return;
    }

    setSavingOnlineImport(true);

    try {
      const now = new Date().toISOString();
      const lyrics = draft.lyrics.trim();
      const newSong: Song = {
        id: createSongId("song-online"),
        metadata: {
          title: draft.title.trim(),
          artist: draft.artist.trim(),
        },
        lyrics,
        slides: generateSlides(lyrics, 2, true),
        createdAt: now,
        updatedAt: now,
        importSourceType: "online",
        importSourceName: pendingOnlineImport.sourceName,
        importSourceUrl: pendingOnlineImport.url,
        autoSplit: true,
        linesPerSlide: 2,
      };

      await saveSong(newSong);
      await reload();
      setShowOnlineSearchModal(false);
      setSearch(newSong.metadata.title);
      setPendingOnlineImport(null);
    } catch (error) {
      console.error("[SongsTab] Failed to import online lyrics:", error);
      setOnlineSearchMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingOnlineImport(false);
    }
  }, [pendingOnlineImport, reload]);

  useEffect(() => {
    const trimmedSearch = onlineSearchQuery.trim();
    const firstResult = onlineSearchResults[0];

    if (
      !showOnlineSearchModal ||
      !isSpotifyTrackLyricsQuery(trimmedSearch)
      || onlineSearchState !== "ready"
      || !firstResult
      || findImportedSong(firstResult)
    ) {
      return;
    }

    const importKey = `${trimmedSearch}::${firstResult.id}`;
    if (spotifyAutoImportRef.current === importKey) {
      return;
    }

    spotifyAutoImportRef.current = importKey;
    setPendingOnlineImport(firstResult);
  }, [findImportedSong, onlineSearchQuery, onlineSearchResults, onlineSearchState, showOnlineSearchModal]);

  return (
    <>
      {/* Toolbar */}
      <div className="lib-toolbar">
        <div className="lib-toolbar-left">
          <div className="lib-search-wrap">
            <input
              className="lib-search-input"
              type="text"
              placeholder="Search songs or hymn number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search songs"
            />
            {search && (
              <button
                type="button"
                className="lib-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear song search"
                title="Clear song search"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

        </div>
        <div className="lib-toolbar-actions">
          <button
            type="button"
            className="lib-toolbar-btn lib-toolbar-btn--secondary"
            onClick={handleOpenOnlineSearch}
            title="Search lyrics online"
          >
            <Icon name="travel_explore" size={18} />
            Search Online
          </button>
          <button
            type="button"
            className="lib-toolbar-btn lib-toolbar-btn--secondary"
            onClick={() => setShowArchiveModal(true)}
            title="View archive"
          >
            <Icon name="archive" size={18} />
            Archive
            {archivedSongs.length > 0 && (
              <span className="lib-toolbar-btn-badge">{archivedSongs.length}</span>
            )}
          </button>
          <button
            type="button"
            className="lib-toolbar-btn lib-toolbar-btn--secondary"
            onClick={handleBulkImport}
            title="Import DOCX, PDF, or TXT"
          >
            <Icon name="upload_file" size={18} />
            Import File
          </button>
          <button
            type="button"
            className={`lib-add-btn ${hasReachedSongLimit ? "lib-add-btn--at-limit" : ""}`}
            onClick={handleAddSong}
            title="Add"
          >
            <Icon name="add" size={20} />
            Add Song
          </button>
        </div>
      </div>

      {/* Songs list */}
      <div className="lib-songs-list">
        {hasActiveFilters && (
          <div className="lib-song-section-head lib-song-section-head--active">
            <div className="lib-song-section-summary">
              <span className="lib-song-section-label">Library</span>
              <span className="lib-song-section-note">
                {visible.length} result{visible.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="lib-song-section-chips">
              {search.trim() && (
                <span className="lib-song-section-chip">
                  <Icon name="search" size={12} />
                  {search.trim()}
                </span>
              )}
              {languageFilter !== "all" && (
                <span className="lib-song-section-chip">
                  <Icon name="translate" size={12} />
                  {languageFilterLabel}
                </span>
              )}
            </div>
          </div>
        )}

        {visible.length === 0 &&
          (hasActiveFilters ? (
            <div className="lib-empty lib-empty--search">
              <div className="lib-empty-icon">
                <Icon name="travel_explore" size={30} />
              </div>
              <h3 className="lib-empty-title">No songs match this view</h3>
              <p className="lib-empty-copy">
                Try a different title, hymn number, or language filter. You can also search online lyrics and import directly.
              </p>
              <div className="lib-empty-actions">
                <button
                  type="button"
                  className="lib-toolbar-btn lib-toolbar-btn--secondary"
                  onClick={() => {
                    setSearch("");
                    setLanguageFilter("all");
                  }}
                >
                  <Icon name="filter_alt_off" size={18} />
                  Clear Filters
                </button>
                <button type="button" className="lib-add-btn" onClick={handleOpenOnlineSearch}>
                  <Icon name="travel_explore" size={18} />
                  Search Online
                </button>
              </div>
            </div>
          ) : (
            <div className="lib-empty lib-empty--rich">
              <div className="lib-empty-icon">
                <Icon name="library_music" size={34} />
              </div>
              <h3 className="lib-empty-title">Build your worship library</h3>
              <p className="lib-empty-copy">
                Add a single song, import a document, or pull lyrics from online sources. Songs added here become available across the app and dock.
              </p>
              <div className="lib-empty-actions">
                <button type="button" className="lib-add-btn" onClick={handleAddSong} title="Add">
                  <Icon name="add" size={20} />
                  Add Song
                </button>
                <button type="button" className="lib-toolbar-btn lib-toolbar-btn--secondary" onClick={handleBulkImport} title="Import DOCX, PDF, or TXT">
                  <Icon name="upload_file" size={18} />
                  Import File
                </button>
                <button type="button" className="lib-toolbar-btn lib-toolbar-btn--secondary" onClick={handleOpenOnlineSearch} title="Search lyrics online">
                  <Icon name="travel_explore" size={18} />
                  Search Online
                </button>
              </div>
            </div>
          ))}

        {visible.length > 0 && (
          <>
            <PremiumContentGate
              items={visible}
              limit={songLimit}
              plan={effectivePlan}
              upgradeTarget="songs"
              entityName="songs"
              className="lib-song-grid"
            >
              {({ all, gatedIds }) =>
                all.map((s) => {
                  const isGated = gatedIds.has(s.id);
                  const lines = firstNLines(s.lyrics, 2);
                  return (
                    <div
                      className={`lib-song-row lib-song-row--card ${isGated ? "lib-song-row--gated" : ""}`}
                      key={s.id}
                      onClick={isGated ? () => setShowUpgradeModal(true) : undefined}
                      role={isGated ? "button" : undefined}
                      tabIndex={isGated ? 0 : undefined}
                      onKeyDown={isGated ? (e) => { if (e.key === "Enter" || e.key === " ") setShowUpgradeModal(true); } : undefined}
                    >
                      <div className="lib-song-card-main">
                        <div className="lib-song-icon">
                          <Icon name="lyrics" size={20} />
                        </div>

                        <div className="lib-song-content">
                          <div className="lib-song-title-row">
                            <h3 className="lib-song-title">{s.metadata.title}</h3>
                            {s.metadata.hymnNumber && (
                              <span className="lib-song-artist-badge">Hymn {s.metadata.hymnNumber}</span>
                            )}
                            {s.metadata.artist && (
                              <span className="lib-song-artist-badge">{s.metadata.artist}</span>
                            )}
                            {s.metadata.language && (
                              <span className={`lib-song-lang-badge lib-song-lang-badge--${s.metadata.language}`}>
                                {s.metadata.language.charAt(0).toUpperCase() + s.metadata.language.slice(1)}
                              </span>
                            )}
                            {s.importSourceType === "online" && (
                              <span className="lib-song-imported-badge">
                                Imported{s.importSourceName ? ` from ${s.importSourceName}` : ""}
                              </span>
                            )}
                          </div>
                          {lines[0] && <p className="lib-song-lyric-line">{lines[0]}</p>}
                          {lines[1] && <p className="lib-song-lyric-line lib-song-lyric-line--faded">{lines[1]}</p>}
                        </div>
                      </div>

                      {isGated ? (
                        <div className="lib-song-gated-badge">
                          <Icon name="lock" size={14} />
                          <span>Upgrade</span>
                        </div>
                      ) : (
                        <>
                          <div className="lib-song-meta">
                            <span className="lib-song-slides-badge">
                              {s.slides.length} slide{s.slides.length !== 1 ? "s" : ""}
                            </span>
                          </div>

                          <div className="lib-song-actions lib-song-actions--card">
                            <button
                              type="button"
                              className="lib-song-action-btn"
                              title="Edit"
                              aria-label={`Edit ${s.metadata.title}`}
                              onClick={() => setEditSong(s)}
                            >
                              <Icon name="edit" size={16} />
                            </button>
                            <button
                              type="button"
                              className="lib-song-action-btn lib-song-action-btn--danger"
                              title="Archive"
                              aria-label={`Archive ${s.metadata.title}`}
                              onClick={() => setDeleteConfirmId(s.id)}
                            >
                              <Icon name="archive" size={16} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              }
            </PremiumContentGate>

            {!isSongUnlimited && visible.length >= songLimit && (
              <div
                className="lib-upgrade-banner"
                onClick={() => setShowUpgradeModal(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setShowUpgradeModal(true);
                }}
              >
                <div className="lib-upgrade-banner-icon">
                  <Icon name="lock" size={18} />
                </div>
                <div className="lib-upgrade-banner-body">
                  <span className="lib-upgrade-banner-title">
                    Song limit reached — {songLimit} of {songLimit}
                  </span>
                  <span className="lib-upgrade-banner-hint">
                    Upgrade to upload more songs and unlock additional features
                  </span>
                </div>
                <div className="lib-upgrade-banner-cta">
                  <Icon name="star" size={14} />
                  Upgrade
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showOnlineSearchModal && (
        <div className="lib-modal-backdrop" onClick={() => setShowOnlineSearchModal(false)}>
          <div
            className="lib-song-modal lib-online-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="online-lyrics-search-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lib-add-modal-header">
              <div>
                <h3 id="online-lyrics-search-title">Search Online Lyrics</h3>
                <p className="lib-online-search-subtitle">Find a song, then review the lyrics before saving it.</p>
              </div>
              <button
                type="button"
                className="lib-modal-close-btn"
                aria-label="Close online lyrics search"
                onClick={() => setShowOnlineSearchModal(false)}
                title="Close">
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="lib-song-modal-body lib-online-search-modal-body">
              <div className="lib-search-wrap lib-online-search-wrap">
                <input
                  className="lib-search-input"
                  type="text"
                  aria-label="Search online lyrics"
                  placeholder="Search title, artist, lyrics, or paste a Spotify track link..."
                  value={onlineSearchQuery}
                  autoFocus
                  onChange={(e) => setOnlineSearchQuery(e.target.value)}
                />
                {onlineSearchQuery && (
                  <button
                    type="button"
                    className="lib-search-clear"
                    onClick={() => setOnlineSearchQuery("")}
                    aria-label="Clear online lyrics search"
                    title="Clear online lyrics search"
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>

              <div className="lib-online-results">
                {onlineSearchState === "loading" && (
                  <div className="lib-online-status">Searching online lyrics…</div>
                )}

                {onlineSearchState !== "loading" && onlineSearchMessage && (
                  <div className={`lib-online-status${onlineSearchState === "error" ? " error" : ""}`}>
                    {onlineSearchMessage}
                  </div>
                )}

                {onlineSearchState === "idle" && !onlineSearchQuery.trim() && (
                  <div className="lib-online-status">Search by song title, artist, lyrics, or Spotify track link.</div>
                )}

                {onlineSearchResults.map((result) => {
                  const importedSong = findImportedSong(result);
                  const actionLabel = importedSong ? "Open" : "Import";

                  return (
                    <div key={result.id} className="lib-online-result-row">
                      <div className="lib-song-icon">
                        <Icon name="lyrics" size={20} />
                      </div>

                      <div className="lib-song-content">
                        <div className="lib-song-title-row">
                          <h3 className="lib-song-title">{result.title}</h3>
                          {result.artist && (
                            <span className="lib-song-artist-badge">{result.artist}</span>
                          )}
                          <span className="lib-song-source-badge">{result.sourceName}</span>
                          {importedSong && <span className="lib-song-imported-badge">Imported</span>}
                        </div>
                        <p className="lib-song-lyric-line">{result.preview || "No preview available yet."}</p>
                      </div>

                      <button
                        type="button"
                        className="lib-online-action"
                        onClick={() => handleOpenOnlineImport(result)}
                        title={actionLabel}>
                        {actionLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirmation */}
      {deleteConfirmId && (
        <div className="lib-modal-backdrop" onClick={() => setDeleteConfirmId(null)}>
          <div className="lib-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Archive the song?</h3>
            <p>This song and its lyrics will be archived and removed from the active library.</p>
            <div className="lib-confirm-actions">
              <button className="lib-confirm-cancel" onClick={() => setDeleteConfirmId(null)} title="Cancel">Cancel</button>
              <button className="lib-confirm-delete" onClick={() => handleArchive(deleteConfirmId)} title="Archive">Archive</button>
            </div>
          </div>
        </div>
      )}

      {showArchiveModal && (
        <div className="lib-modal-backdrop" onClick={() => setShowArchiveModal(false)}>
          <div className="lib-song-modal lib-archive-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lib-add-modal-header">
              <h3>Archived Songs</h3>
              <button className="lib-modal-close-btn" onClick={() => setShowArchiveModal(false)} title="Close">
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="lib-song-modal-body lib-archive-modal-body">
              {archivedSongs.length === 0 ? (
                <div className="lib-empty lib-empty--compact">
                  <Icon name="archive" size={44} style={{ opacity: 0.28 }} />
                  <p>No archived songs yet</p>
                </div>
              ) : (
                <div className="lib-archive-list">
                  {archivedSongs.map((song) => {
                    const lines = firstNLines(song.lyrics, 2);
                    return (
                      <div className="lib-archive-row" key={song.id}>
                        <div className="lib-song-icon">
                          <Icon name="lyrics" size={20} />
                        </div>

                        <div className="lib-song-content">
                          <div className="lib-song-title-row">
                            <h3 className="lib-song-title">{song.metadata.title}</h3>
                            {song.metadata.artist && (
                              <span className="lib-song-artist-badge">{song.metadata.artist}</span>
                            )}
                          </div>
                          {song.archivedAt && (
                            <p className="lib-archive-meta">
                              Archived {new Date(song.archivedAt).toLocaleString()}
                            </p>
                          )}
                          {lines[0] && <p className="lib-song-lyric-line">{lines[0]}</p>}
                          {lines[1] && <p className="lib-song-lyric-line lib-song-lyric-line--faded">{lines[1]}</p>}
                        </div>

                        <div className="lib-song-meta">
                          <span className="lib-song-slides-badge">
                            {song.slides.length} slide{song.slides.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        <div className="lib-song-actions lib-song-actions--visible">
                          <button
                            className="lib-song-action-btn"
                            title="Restore song"
                            onClick={() => handleRestore(song.id)}
                          >
                            <Icon name="unarchive" size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lib-add-modal-footer">
              <button className="lib-modal-cancel-btn" onClick={() => setShowArchiveModal(false)} title="Close">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Song Modal */}
      {showAddModal && (
        <WorshipSongModal onClose={() => setShowAddModal(false)} onSave={handleSaveComplete} />
      )}

      {pendingOnlineImport && (
        <OnlineLyricsImportModal
          result={pendingOnlineImport}
          saving={savingOnlineImport}
          onClose={() => setPendingOnlineImport(null)}
          onImport={(draft) => void handleImportOnlineSong(draft)}
        />
      )}

      {/* Edit Song Modal */}
      {editSong && (
        <WorshipSongModal song={editSong} onClose={() => setEditSong(null)} onSave={handleSaveComplete} />
      )}

      {/* Bulk Import Modal */}
      {bulkImportOpen && (
        <BulkImportModal
          onClose={() => setBulkImportOpen(false)}
          onImported={() => {
            void reload();
          }}
        />
      )}

      {/* Song limit / import restriction modal */}
      {showSongLimitModal && (
        <div className="ssm-backdrop" onClick={() => setShowSongLimitModal(false)}>
          <div className="ssm-modal ssm-modal--prompt lib-upgrade-prompt" onClick={(e) => e.stopPropagation()}>
            <button
              className="ssm-close"
              onClick={() => setShowSongLimitModal(false)}
              aria-label="Close upgrade prompt"
              title="Close">
              <Icon name="close" size={18} />
            </button>
            <div className="ssm-icon lib-upgrade-prompt__icon">
              <Icon name={songLimitModalType === "import" ? "upload_file" : "library_music"} size={28} />
            </div>
            <h2 className="ssm-title">
              {songLimitModalType === "import" ? "Bulk Import Requires Growth" : "Song Limit Reached"}
            </h2>
            {songLimitModalType === "import" ? (
              <>
                <p className="ssm-desc">
                  Bulk import is available on <strong>Growth</strong> and above.
                </p>
                <p className="ssm-hint">
                  Free trial users can use it during the trial. Upgrade to Growth to import multiple worship songs at once.
                </p>
              </>
            ) : (
              <>
                <p className="ssm-desc">
                  Your <strong>{effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1)}</strong> plan
                  allows up to <strong>{songLimit} songs</strong>.
                  {songLimitModalType === "songs" && effectivePlan === "free"
                    ? " You currently have " + songCount + " song" + (songCount !== 1 ? "s" : "") + "."
                    : songLimitModalType === "songs" && songCount >= songLimit
                      ? " You've reached your limit."
                      : ""}
                </p>
                <p className="ssm-hint">
                  Upgrade to <strong>Growth</strong> for unlimited songs and mass import. {UPGRADE_PROMO_FALLBACK}
                </p>
              </>
            )}
            <div className="ssm-actions lib-upgrade-prompt__actions">
              <button
                className="ssm-btn-cancel"
                onClick={() => setShowSongLimitModal(false)}
                title="Maybe Later">
                Maybe Later
              </button>
              <button
                className="ssm-btn-upgrade"
                onClick={() => {
                  window.open("https://makechurcheasy.creatorstudioslabs.stream/pricing", "_blank");
                  setShowSongLimitModal(false);
                }}
                title="Upgrade to Growth">
                Upgrade to Growth
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <UpgradeModal
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          feature="songs"
          requiredPlan={effectivePlan === "free" ? "basic" : effectivePlan === "basic" ? "growth" : "pro"}
          currentPlan={effectivePlan}
          message={`Your ${effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1)} plan allows up to ${songLimit} songs. Upgrade for more.`}
        />
      )}
    </>
  );
}
