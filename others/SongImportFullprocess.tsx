import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../src/components/Icon";
import { useAuth } from "../src/contexts/AuthContext";
import { checkEntitlementSync } from "../src/services/entitlementClient";
import { getEffectivePlan, getRemainingSongSlots } from "../src/services/licenseService";
import { OnlineLyricsImportModal, type OnlineLyricsImportDraft } from "../src/worship/OnlineLyricsImportModal";
import { BulkImportDocumentFlow } from "../src/worship/BulkImportDocumentFlow";
import WorshipSongEditor from "../src/worship/WorshipSongEditor";
import {
  formatOnlineLyricsSearchError,
  isSpotifyTrackLyricsQuery,
  searchOnlineSongLyrics,
  type OnlineLyricsSearchResult,
} from "../src/worship/onlineLyricsService";
import { generateSlides } from "../src/worship/slideEngine";
import type { Song } from "../src/worship/types";
import { unicodeSearchNormalize } from "../src/worship/unicodeUtils";
import { getAllSongs, saveSong } from "../src/worship/worshipDb";
import "./SongimportFullprocess.css";

export type SongImportFullprocessMode = "manual" | "file" | "onlineSearch" | "onlineReview";

interface SongImportFullprocessProps {
  mode?: SongImportFullprocessMode;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
  initialQuery?: string;
  result?: OnlineLyricsSearchResult | null;
  onOpenExistingSong?: (song: Song) => void;
}

const MIN_ONLINE_LYRICS_QUERY_LENGTH = 3;
const ONLINE_LYRICS_SEARCH_DELAY_MS = 80;

function normalizeSongLookupPart(value: string): string {
  return unicodeSearchNormalize(value);
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

export default function SongImportFullprocess({
  mode = "manual",
  onClose,
  onImported,
  initialQuery = "",
  result = null,
  onOpenExistingSong,
}: SongImportFullprocessProps) {
  const { user } = useAuth();
  const effectivePlan = getEffectivePlan(user);
  const { limit: songLimit } = checkEntitlementSync("songs", effectivePlan);
  const isSongUnlimited = songLimit === -1;

  const [songCount, setSongCount] = useState(0);
  const [existingSongs, setExistingSongs] = useState<Song[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<OnlineLyricsSearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [reviewResult, setReviewResult] = useState<OnlineLyricsSearchResult | null>(mode === "onlineReview" ? result : null);
  const [savingResultId, setSavingResultId] = useState<string | null>(null);

  const onlineSearchRequestRef = useRef(0);
  const spotifyAutoImportRef = useRef<string | null>(null);

  const refreshExistingSongs = useCallback(async () => {
    try {
      const songs = await getAllSongs();
      setExistingSongs(songs);
    } catch {
      // Leave the current lookup in place.
    }
  }, []);

  useEffect(() => {
    if (mode !== "onlineSearch" && mode !== "onlineReview") {
      return;
    }

    void refreshExistingSongs();
  }, [mode, refreshExistingSongs]);

  useEffect(() => {
    if (mode !== "onlineSearch" && mode !== "onlineReview") {
      return;
    }

    let cancelled = false;

    getRemainingSongSlots(user)
      .then((slots) => {
        if (cancelled) {
          return;
        }

        if (isSongUnlimited) {
          setSongCount(0);
          return;
        }

        setSongCount(songLimit - slots);
      })
      .catch(() => {
        if (!cancelled && isSongUnlimited) {
          setSongCount(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSongUnlimited, mode, songLimit, user]);

  useEffect(() => {
    if (mode === "onlineReview") {
      setReviewResult(result ?? null);
    }
  }, [mode, result]);

  useEffect(() => {
    if (mode === "onlineSearch") {
      setQuery(initialQuery);
    }
  }, [initialQuery, mode]);

  const importedSongsLookup = useMemo(() => {
    const lookup = new Map<string, Song>();

    for (const song of existingSongs) {
      for (const key of buildSongLookupKeys(song.metadata.title, song.metadata.artist)) {
        if (!lookup.has(key)) {
          lookup.set(key, song);
        }
      }
    }

    return lookup;
  }, [existingSongs]);

  const findImportedSong = useCallback((entry: OnlineLyricsSearchResult): Song | undefined => {
    for (const key of buildSongLookupKeys(entry.title, entry.artist)) {
      const existingSong = importedSongsLookup.get(key);
      if (existingSong) {
        return existingSong;
      }
    }

    return undefined;
  }, [importedSongsLookup]);

  const hasReachedSongLimit = !isSongUnlimited && songCount >= songLimit;

  const handleImportedRefresh = useCallback(() => {
    if (!onImported) {
      return;
    }

    void Promise.resolve(onImported());
  }, [onImported]);

  const handleImportedAndClose = useCallback(() => {
    void Promise.resolve(onImported?.()).finally(() => {
      onClose();
    });
  }, [onClose, onImported]);

  useEffect(() => {
    if (mode !== "onlineSearch") {
      return;
    }

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      onlineSearchRequestRef.current += 1;
      setSearchResults([]);
      setSearchState("idle");
      setSearchMessage("");
      return;
    }

    if (trimmedQuery.length < MIN_ONLINE_LYRICS_QUERY_LENGTH) {
      onlineSearchRequestRef.current += 1;
      setSearchResults([]);
      setSearchState("idle");
      setSearchMessage(`Type at least ${MIN_ONLINE_LYRICS_QUERY_LENGTH} letters to search online lyrics.`);
      return;
    }

    const requestId = onlineSearchRequestRef.current + 1;
    onlineSearchRequestRef.current = requestId;
    setSearchState("loading");
    setSearchMessage("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchOnlineSongLyrics(trimmedQuery);
        if (onlineSearchRequestRef.current !== requestId) {
          return;
        }

        setSearchResults(results);
        setSearchState("ready");
        setSearchMessage(results.length === 0 ? "No online lyrics found for this search yet." : "");
      } catch (error) {
        if (onlineSearchRequestRef.current !== requestId) {
          return;
        }

        setSearchResults([]);
        setSearchState("error");
        setSearchMessage(formatOnlineLyricsSearchError(error));
      }
    }, ONLINE_LYRICS_SEARCH_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [mode, query]);

  useEffect(() => {
    if (mode !== "onlineSearch") {
      return;
    }

    const trimmedQuery = query.trim();
    const firstResult = searchResults[0];

    if (
      !isSpotifyTrackLyricsQuery(trimmedQuery)
      || searchState !== "ready"
      || !firstResult
      || findImportedSong(firstResult)
    ) {
      return;
    }

    const importKey = `${trimmedQuery}::${firstResult.id}`;
    if (spotifyAutoImportRef.current === importKey) {
      return;
    }

    spotifyAutoImportRef.current = importKey;
    setReviewResult(firstResult);
  }, [findImportedSong, mode, query, searchResults, searchState]);

  const handleOpenExisting = useCallback((song: Song | undefined) => {
    if (!song) {
      return;
    }

    onOpenExistingSong?.(song);
    onClose();
  }, [onClose, onOpenExistingSong]);

  const handleOpenOnlineImport = useCallback((entry: OnlineLyricsSearchResult) => {
    const existingSong = findImportedSong(entry);
    if (existingSong) {
      handleOpenExisting(existingSong);
      return;
    }

    setReviewResult(entry);
  }, [findImportedSong, handleOpenExisting]);

  const handleConfirmOnlineImport = useCallback(async (
    entry: OnlineLyricsSearchResult,
    draft: OnlineLyricsImportDraft,
  ) => {
    const existingSong = findImportedSong(entry);
    if (existingSong) {
      handleOpenExisting(existingSong);
      return;
    }

    if (hasReachedSongLimit) {
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
        title: draft.title.trim() || query.trim() || "Imported Song",
        artist: draft.artist.trim(),
      },
      lyrics,
      slides: generateSlides(lyrics, 2, true),
      createdAt: now,
      updatedAt: now,
      importSourceName: entry.sourceName,
      importSourceType: "online",
      importSourceUrl: entry.url,
    };

    setSavingResultId(entry.id);
    try {
      await saveSong(newSong);
      await refreshExistingSongs();
      await Promise.resolve(onImported?.());
      setReviewResult(null);
      onClose();
    } finally {
      setSavingResultId(null);
    }
  }, [findImportedSong, handleOpenExisting, hasReachedSongLimit, onClose, onImported, query, refreshExistingSongs]);

  if (mode === "manual") {
    return (
      <WorshipSongEditor
        onClose={onClose}
        onSave={handleImportedAndClose}
      />
    );
  }

  if (mode === "file") {
    return (
      <BulkImportDocumentFlow
        onClose={onClose}
        onImported={handleImportedRefresh}
      />
    );
  }

  if (reviewResult) {
    return (
      <OnlineLyricsImportModal
        result={reviewResult}
        saving={savingResultId === reviewResult.id}
        onClose={() => {
          if (mode === "onlineReview") {
            onClose();
            return;
          }

          setReviewResult(null);
        }}
        onImport={(draft) => handleConfirmOnlineImport(reviewResult, draft)}
      />
    );
  }

  if (mode !== "onlineSearch") {
    return null;
  }

  return (
    <div className="song-import-fullprocess-backdrop" onMouseDown={onClose}>
      <div
        className="song-import-fullprocess-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-import-online-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="song-import-fullprocess-header">
          <div>
            <p className="song-import-fullprocess-eyebrow">Song Import</p>
            <h2 id="song-import-online-title">Search Online Lyrics</h2>
            <p className="song-import-fullprocess-subtitle">
              Find a song online, review the lyrics, then bring it into the worship library.
            </p>
          </div>
          <button
            type="button"
            className="song-import-fullprocess-close"
            onClick={onClose}
            aria-label="Close online song import"
            title="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="song-import-fullprocess-body">
          <label className="song-import-fullprocess-search">
            <Icon name="search" size={18} className="song-import-fullprocess-search-icon" />
            <input
              type="text"
              value={query}
              autoFocus
              placeholder="Search title, artist, lyrics, or paste a Spotify track link..."
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search online lyrics"
            />
            {query ? (
              <button
                type="button"
                className="song-import-fullprocess-search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear online search"
                title="Clear"
              >
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </label>

          {hasReachedSongLimit ? (
            <div className="song-import-fullprocess-banner">
              <Icon name="lock" size={16} />
              <span>You have reached your song limit. You can still open existing imported songs.</span>
            </div>
          ) : null}

          <div className="song-import-fullprocess-results">
            {searchState === "loading" ? (
              <div className="song-import-fullprocess-status">Searching online lyrics…</div>
            ) : null}

            {searchState !== "loading" && searchMessage ? (
              <div className={`song-import-fullprocess-status${searchState === "error" ? " error" : ""}`}>
                {searchMessage}
              </div>
            ) : null}

            {searchState === "idle" && !query.trim() ? (
              <div className="song-import-fullprocess-status">
                Search by song title, artist, lyrics, or Spotify track link.
              </div>
            ) : null}

            {searchResults.map((entry) => {
              const importedSong = findImportedSong(entry);
              const actionLabel = importedSong ? "Open" : "Import";
              const atLimit = hasReachedSongLimit && !importedSong;

              return (
                <div key={entry.id} className="song-import-fullprocess-result">
                  <div className="song-import-fullprocess-result-main">
                    <div className="song-import-fullprocess-result-top">
                      <div>
                        <h3>{entry.title}</h3>
                        <div className="song-import-fullprocess-result-meta">
                          <span>{entry.artist || "Unknown artist"}</span>
                          <span className="song-import-fullprocess-tag">{entry.sourceName}</span>
                          {importedSong ? <span className="song-import-fullprocess-tag">Imported</span> : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`song-import-fullprocess-action${atLimit ? " at-limit" : ""}`}
                        onClick={() => {
                          if (importedSong) {
                            handleOpenExisting(importedSong);
                            return;
                          }

                          if (atLimit) {
                            return;
                          }

                          handleOpenOnlineImport(entry);
                        }}
                        disabled={atLimit}
                        title={atLimit ? "Limit reached" : actionLabel}
                      >
                        {atLimit ? "Limit Reached" : actionLabel}
                      </button>
                    </div>
                    <p className="song-import-fullprocess-preview">
                      {entry.preview || "No preview available yet."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="song-import-fullprocess-footer">
          <button
            type="button"
            className="song-import-fullprocess-secondary"
            onClick={onClose}
            title="Close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
