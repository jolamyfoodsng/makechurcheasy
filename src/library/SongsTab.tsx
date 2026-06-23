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
 *   • Basic: max 30 songs, no bulk import
 *   • Starter+: unlimited songs, bulk import allowed
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
import { OnlineLyricsImportModal, type OnlineLyricsImportDraft } from "../worship/OnlineLyricsImportModal";
import {
  formatOnlineLyricsSearchError,
  isSpotifyTrackLyricsQuery,
  searchOnlineSongLyrics,
  type OnlineLyricsSearchResult,
} from "../worship/onlineLyricsService";
import { generateSlides } from "../worship/slideEngine";
import type { Song } from "../worship/types";
import { archiveSong, getAllSongs, getArchivedSongs, restoreSong, saveSong } from "../worship/worshipDb";
import WorshipSongModal from "../worship/WorshipSongModal";

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
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function normalizeSongLookupPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const [importingOnlineId, setImportingOnlineId] = useState<string | null>(null);
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
  const showSongUsage = !isSongUnlimited; // Show usage counter for free/basic

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

  const visible = useMemo(() => {
    const filtered = songs.filter((s) => {
      if (languageFilter !== "all" && s.metadata.language !== languageFilter) return false;
      if (!search) return true;
      const q = search;
      return (
        fuzzyMatch(q, s.metadata.title) ||
        fuzzyMatch(q, s.metadata.artist) ||
        fuzzyMatch(q, s.lyrics)
      );
    });
    return filtered;
  }, [search, songs, languageFilter]);

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const song of songs) {
      if (song.metadata.language) langs.add(song.metadata.language);
    }
    return Array.from(langs).sort();
  }, [songs]);

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

  const handleConfirmOnlineImport = useCallback(
    async (result: OnlineLyricsSearchResult, draft: OnlineLyricsImportDraft) => {
      const existingSong = findImportedSong(result);
      if (existingSong) {
        setEditSong(existingSong);
        setPendingOnlineImport(null);
        return;
      }

      const lyrics = draft.lyrics.trim();
      if (!lyrics) {
        return;
      }

      const now = new Date().toISOString();
      const newSong: Song = {
        id: `song-online-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        metadata: {
          title: draft.title.trim() || onlineSearchQuery.trim() || "Imported Song",
          artist: draft.artist.trim(),
        },
        lyrics,
        slides: generateSlides(lyrics, 2, true),
        createdAt: now,
        updatedAt: now,
        importSourceName: result.sourceName,
        importSourceType: "online",
        importSourceUrl: result.url,
      };

      setImportingOnlineId(result.id);
      try {
        await saveSong(newSong);
        await reload();
        setPendingOnlineImport(null);
        setShowOnlineSearchModal(false);
        setSearch(newSong.metadata.title);
      } finally {
        setImportingOnlineId(null);
      }
    },
    [findImportedSong, onlineSearchQuery, reload],
  );

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
            {/* <Icon name="search" size={18} className="lib-search-icon" /> */}
            <input
              className="lib-search-input"
              type="text"
              placeholder="Search songs..."
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
          {showSongUsage && (
            <span className="lib-song-usage-badge">
              Songs {songCount} / {songLimit}
            </span>
          )}
          <button
            type="button"
            className={`lib-add-btn ${hasReachedSongLimit ? "lib-add-btn--at-limit" : ""}`}
            onClick={handleAddSong}
          >
            <Icon name="add" size={20} />
            Add Song
          </button>
          <button type="button" className={`lib-add-btn ${!canImport ? "lib-add-btn--at-limit" : ""}`} onClick={handleBulkImport}>
            <Icon name="upload_file" size={20} />
            Bulk Import
          </button>
          {availableLanguages.length > 0 && (
            <select
              className="lib-lang-filter"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              aria-label="Filter songs by language"
            >
              <option value="all">All languages</option>
              {availableLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang.charAt(0).toUpperCase() + lang.slice(1)}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="lib-archive-btn" onClick={() => setShowArchiveModal(true)}>
            <Icon name="archive" size={18} />
            View Archive
            {archivedSongs.length > 0 && (
              <span className="lib-archive-count">{archivedSongs.length}</span>
            )}
          </button>
        </div>
        <div className="lib-toolbar-actions">
          <button type="button" className="lib-online-search-trigger" onClick={handleOpenOnlineSearch}>
            <Icon name="travel_explore" size={18} />
            Search Online
          </button>
        </div>
      </div>

      {/* Songs list */}
      <div className="lib-songs-list">
        {search.trim() && (
          <div className="lib-song-section-head">
            <span className="lib-song-section-label">Library</span>
            <span className="lib-song-section-note">
              {visible.length} result{visible.length === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {visible.length === 0 &&
          (search.trim() ? (
            <div className="lib-online-status">No library matches for this search.</div>
          ) : (
            <div className="lib-empty">
              <Icon name="music_note" size={48} style={{ opacity: 0.3 }} />
              <p>No songs found</p>
              <button type="button" className="lib-add-btn" onClick={() => setShowAddModal(true)}>
                <Icon name="add" size={20} />
                Add Song
              </button>
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
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="lib-song-modal-body lib-online-search-modal-body">
              <div className="lib-search-wrap lib-online-search-wrap">
                <Icon name="search" size={18} className="lib-search-icon" />
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
                  const isImporting = importingOnlineId === result.id;

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
                        disabled={isImporting}
                        onClick={() => handleOpenOnlineImport(result)}
                      >
                        {isImporting ? "Saving…" : actionLabel}
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
              <button className="lib-confirm-cancel" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
              <button className="lib-confirm-delete" onClick={() => handleArchive(deleteConfirmId)}>Archive</button>
            </div>
          </div>
        </div>
      )}

      {showArchiveModal && (
        <div className="lib-modal-backdrop" onClick={() => setShowArchiveModal(false)}>
          <div className="lib-song-modal lib-archive-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lib-add-modal-header">
              <h3>Archived Songs</h3>
              <button className="lib-modal-close-btn" onClick={() => setShowArchiveModal(false)}>
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
              <button className="lib-modal-cancel-btn" onClick={() => setShowArchiveModal(false)}>
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
          saving={importingOnlineId === pendingOnlineImport.id}
          onClose={() => setPendingOnlineImport(null)}
          onImport={(draft) => handleConfirmOnlineImport(pendingOnlineImport, draft)}
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
            setBulkImportOpen(false);
          }}
        />
      )}

      {/* Song limit / import restriction modal */}
      {showSongLimitModal && (
        <div className="ssm-backdrop" onClick={() => setShowSongLimitModal(false)}>
          <div className="ssm-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="um-close"
              onClick={() => setShowSongLimitModal(false)}
              aria-label="Close"
            >
              <Icon name="close" size={18} />
            </button>
            <div className="dock-upgrade">
              <div className="dock-upgrade__icon">
                <Icon name="lock" size={28} />
              </div>
              <h2 className="dock-upgrade__title">
                {songLimitModalType === "import" ? "Mass Import Restricted" : "Song Limit Reached"}
              </h2>
              <p className="dock-upgrade__message">
                {songLimitModalType === "import" ? (
                  <>
                    Mass Import is available on <strong>Starter</strong> and above.
                    Upgrade to unlock bulk import, translation, and more.
                  </>
                ) : (
                  <>
                    Your <strong>{effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1)}</strong> plan
                    allows up to <strong>{songLimit} songs</strong>.
                    {songLimitModalType === "songs" && effectivePlan === "free"
                      ? " You currently have " + songCount + " song" + (songCount !== 1 ? "s" : "") + "."
                      : songLimitModalType === "songs" && songCount >= songLimit
                        ? " You've reached your limit."
                        : ""}
                    <br />
                    Upgrade to <strong>Starter</strong> for unlimited songs and mass import.
                  </>
                )}
              </p>
              <div className="dock-upgrade__actions">
                <button
                  className="dock-upgrade__btn dock-upgrade__btn--secondary"
                  onClick={() => setShowSongLimitModal(false)}
                >
                  Maybe Later
                </button>
                <button
                  className="dock-upgrade__btn dock-upgrade__btn--primary"
                  onClick={() => {
                    window.open("https://makechurcheasy.com/pricing", "_blank");
                    setShowSongLimitModal(false);
                  }}
                >
                  Upgrade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <UpgradeModal
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          feature="songs"
          requiredPlan={effectivePlan === "free" ? "basic" : effectivePlan === "basic" ? "starter" : effectivePlan === "starter" ? "growth" : "pro"}
          currentPlan={effectivePlan}
          message={`Your ${effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1)} plan allows up to ${songLimit} songs. Upgrade for more.`}
        />
      )}
    </>
  );
}
