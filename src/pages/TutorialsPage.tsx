import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  ListVideo,
  Play,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  fetchTutorialCatalog,
  getCachedTutorialCatalog,
  getCurrentTutorialVideos,
  getTutorialProgress,
  getTutorialProgressSummary,
  getYouTubeEmbedUrl,
  setTutorialProgressStatus,
  type TutorialPlaylist,
  type TutorialProgress,
  type TutorialVideo,
} from "../services/tutorialCatalog";
import "./TutorialsPage.css";

function videoThumbnail(video: TutorialVideo): string | undefined {
  if (video.thumbnailUrl?.trim()) return video.thumbnailUrl;
  const embedUrl = getYouTubeEmbedUrl(video.youtubeUrl);
  const videoId = embedUrl?.split("/").pop()?.split("?")[0];
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined;
}

function progressLabel(completed: number, total: number): string {
  if (!total) return "No current videos yet";
  if (completed === total) return "Complete";
  if (completed === 0) return `${total} video${total === 1 ? "" : "s"}`;
  return `${completed} of ${total} complete`;
}

function renderTutorialDescription(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="tutorial-link"
          onClick={(e) => {
            e.stopPropagation();
            window.open(part, "_blank", "noopener,noreferrer");
          }}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export default function TutorialsPage() {
  const [playlists, setPlaylists] = useState<TutorialPlaylist[]>(() => getCachedTutorialCatalog());
  const [progress, setProgress] = useState<TutorialProgress>(() => getTutorialProgress());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedPlaylist, setSelectedPlaylist] = useState<TutorialPlaylist | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<TutorialVideo | null>(null);
  const [loading, setLoading] = useState(playlists.length === 0);
  const [refreshing, setRefreshing] = useState(false);

  const loadCatalogue = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    const next = await fetchTutorialCatalog({ force });
    setPlaylists(next);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  const availablePlaylists = useMemo(
    () => playlists.filter((playlist) => getCurrentTutorialVideos(playlist).length > 0),
    [playlists],
  );

  const categories = useMemo(
    () => ["All", ...new Set(availablePlaylists.map((playlist) => playlist.category).filter(Boolean))],
    [availablePlaylists],
  );

  const filteredPlaylists = useMemo(() => {
    const term = search.trim().toLowerCase();
    return availablePlaylists.filter((playlist) => {
      const matchesCategory = category === "All" || playlist.category === category;
      const haystack = [
        playlist.title,
        playlist.description,
        playlist.category,
        ...playlist.tags,
        ...getCurrentTutorialVideos(playlist).flatMap((video) => [video.title, video.description, ...video.tags]),
      ].join(" ").toLowerCase();
      return matchesCategory && (!term || haystack.includes(term));
    });
  }, [availablePlaylists, category, search]);

  const currentVideos = useMemo(
    () => (selectedPlaylist ? getCurrentTutorialVideos(selectedPlaylist) : []),
    [selectedPlaylist],
  );

  const currentVideoIndex = useMemo(
    () => (selectedVideo ? currentVideos.findIndex((v) => v.videoId === selectedVideo.videoId) : -1),
    [currentVideos, selectedVideo],
  );

  const hasPrev = currentVideoIndex > 0;
  const hasNext = currentVideoIndex >= 0 && currentVideoIndex < currentVideos.length - 1;

  const currentPlaylistSummary = useMemo(() => {
    if (!selectedPlaylist) return { completed: 0, total: 0 };
    return getTutorialProgressSummary(selectedPlaylist, progress);
  }, [progress, selectedPlaylist]);

  const markStarted = useCallback((video: TutorialVideo) => {
    setProgress((current) => {
      if (current[video.videoId]?.status === "completed") return current;
      return setTutorialProgressStatus(current, video.videoId, "started");
    });
  }, []);

  const selectVideo = useCallback((video: TutorialVideo) => {
    setSelectedVideo(video);
    markStarted(video);
  }, [markStarted]);

  const openPlaylist = useCallback((playlist: TutorialPlaylist) => {
    setSelectedPlaylist(playlist);
    setSelectedVideo(null);
  }, []);

  const goToPrevVideo = useCallback(() => {
    if (hasPrev) {
      const prev = currentVideos[currentVideoIndex - 1];
      setSelectedVideo(prev);
      markStarted(prev);
    }
  }, [currentVideoIndex, currentVideos, hasPrev, markStarted]);

  const goToNextVideo = useCallback(() => {
    if (hasNext) {
      const next = currentVideos[currentVideoIndex + 1];
      setSelectedVideo(next);
      markStarted(next);
    }
  }, [currentVideoIndex, currentVideos, hasNext, markStarted]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (selectedVideo) {
        if (event.key === "Escape") {
          setSelectedVideo(null);
        } else if (event.key === "ArrowLeft" && hasPrev) {
          goToPrevVideo();
        } else if (event.key === "ArrowRight" && hasNext) {
          goToNextVideo();
        }
      } else if (selectedPlaylist && event.key === "Escape") {
        setSelectedPlaylist(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToNextVideo, goToPrevVideo, hasNext, hasPrev, selectedPlaylist, selectedVideo]);

  const setCompletion = useCallback((video: TutorialVideo, completed: boolean) => {
    setProgress((current) => setTutorialProgressStatus(current, video.videoId, completed ? "completed" : "started"));
  }, []);

  const playFirstUncompleted = useCallback(() => {
    if (!selectedPlaylist) return;
    const videos = getCurrentTutorialVideos(selectedPlaylist);
    if (!videos.length) return;
    const nextVideo = videos.find((v) => progress[v.videoId]?.status !== "completed") || videos[0];
    setSelectedVideo(nextVideo);
    markStarted(nextVideo);
  }, [markStarted, progress, selectedPlaylist]);

  return (
    <div className="app-page tutorials-page">
      <div className="app-page__inner tutorials-page__inner">
        {selectedPlaylist ? (
          /* ==================== 2ND LEVEL: PLAYLIST IN-PAGE VIEW ==================== */
          <section className="tutorials-playlist-view" aria-label={selectedPlaylist.title}>
            <div className="tutorials-playlist-view__top-nav">
              <button
                type="button"
                className="tutorials-back-btn"
                onClick={() => setSelectedPlaylist(null)}
              >
                <ArrowLeft size={16} /> <span>All Playlists</span>
              </button>
            </div>

            <div className="tutorials-playlist-hero">
              <div
                className="tutorials-playlist-hero__cover"
                style={
                  selectedPlaylist.thumbnailUrl || videoThumbnail(currentVideos[0])
                    ? { backgroundImage: `url("${selectedPlaylist.thumbnailUrl || videoThumbnail(currentVideos[0])}")` }
                    : undefined
                }
              >
                {!(selectedPlaylist.thumbnailUrl || videoThumbnail(currentVideos[0])) && (
                  <BookOpen size={48} aria-hidden="true" />
                )}
                <div className="tutorials-playlist-hero__cover-overlay">
                  <button
                    type="button"
                    className="tutorials-playlist-hero__play-btn"
                    onClick={playFirstUncompleted}
                    aria-label="Play playlist"
                  >
                    <Play size={24} fill="currentColor" />
                  </button>
                </div>
              </div>

              <div className="tutorials-playlist-hero__details">
                <div className="tutorials-playlist-hero__meta">
                  <span className="tutorials-badge">{selectedPlaylist.category}</span>
                  <span className="tutorials-video-count">
                    <ListVideo size={14} /> {currentVideos.length} {currentVideos.length === 1 ? "video" : "videos"}
                  </span>
                </div>

                <h2>{selectedPlaylist.title}</h2>
                {selectedPlaylist.description && (
                  <p className="tutorials-playlist-hero__desc">{selectedPlaylist.description}</p>
                )}

                <div className="tutorials-playlist-hero__actions">
                  <button
                    type="button"
                    className="tutorials-hero-cta"
                    onClick={playFirstUncompleted}
                  >
                    <Play size={16} fill="currentColor" />
                    <span>
                      {currentPlaylistSummary.completed > 0 && currentPlaylistSummary.completed < currentPlaylistSummary.total
                        ? "Continue Watching"
                        : "Start Playlist"}
                    </span>
                  </button>

                  <div className="tutorials-playlist-hero__progress-box">
                    <span>{progressLabel(currentPlaylistSummary.completed, currentPlaylistSummary.total)}</span>
                    <span className="tutorial-card__progress-track" aria-hidden="true">
                      <i
                        style={{
                          width: `${currentPlaylistSummary.total ? (currentPlaylistSummary.completed / currentPlaylistSummary.total) * 100 : 0}%`,
                        }}
                      />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="tutorials-playlist-section-header">
              <h3>Videos in this Playlist ({currentVideos.length})</h3>
            </div>

            <div className="tutorials-video-list-view">
              {currentVideos.map((video, index) => {
                const isCompleted = progress[video.videoId]?.status === "completed";
                const isStarted = progress[video.videoId]?.status === "started";
                const thumb = videoThumbnail(video);

                return (
                  <article
                    key={video.videoId}
                    className={`tutorial-list-item ${isCompleted ? "is-complete" : ""}`}
                    onClick={() => selectVideo(video)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectVideo(video);
                      }
                    }}
                  >
                    <div className="tutorial-list-item__index">
                      {isCompleted ? <CheckCircle2 size={18} className="is-success" /> : <span>{index + 1}</span>}
                    </div>

                    <div
                      className="tutorial-list-item__thumb"
                      style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                    >
                      {!thumb && <Play size={20} />}
                      <span className="tutorial-list-item__hover-play">
                        <Play size={16} fill="currentColor" />
                      </span>
                      {video.duration && (
                        <span className="tutorial-list-item__duration">
                          <Clock3 size={11} /> {video.duration}
                        </span>
                      )}
                    </div>

                    <div className="tutorial-list-item__info">
                      <div className="tutorial-list-item__heading">
                        <h4>{video.title}</h4>
                      </div>
                      {video.description && (
                        <p className="tutorial-list-item__desc">{video.description}</p>
                      )}
                    </div>

                    <div className="tutorial-list-item__actions">
                      <span className={`tutorial-status-pill ${isCompleted ? "is-complete" : isStarted ? "is-started" : ""}`}>
                        {isCompleted ? "Completed" : isStarted ? "In progress" : "Not started"}
                      </span>
                      <button
                        type="button"
                        className="tutorial-item-play-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectVideo(video);
                        }}
                      >
                        <Play size={14} fill="currentColor" />
                        <span>Play</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          /* ==================== 1ST LEVEL: ALL PLAYLISTS CATALOG ==================== */
          <>
            <header className="app-page__header tutorials-page__header">
              <div className="app-page__header-copy tutorials-page__header-copy">
                <p className="app-page__eyebrow">LEARN MAKECHURCHEASY</p>
                <h1 className="app-page__title">Tutorials</h1>
                <p className="app-page__subtitle">Step-by-step training for your service team. Newly published detailed videos appear here automatically.</p>
              </div>
              <button className="tutorials-refresh" type="button" onClick={() => void loadCatalogue(true)} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? "tutorials-refresh__icon--spinning" : undefined} />
                {refreshing ? "Checking…" : "Refresh"}
              </button>
            </header>

            <section className="tutorials-toolbar" aria-label="Find tutorials">
              <label className="tutorials-search">
                <Search size={17} aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search tutorials"
                  aria-label="Search tutorials"
                />
              </label>
              <div className="tutorials-categories" role="tablist" aria-label="Tutorial categories">
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={category === item}
                    className={category === item ? "tutorials-category is-active" : "tutorials-category"}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>

            {loading ? (
              <div className="tutorials-empty" role="status">
                <RefreshCw size={22} className="tutorials-refresh__icon--spinning" />
                <p>Loading tutorials…</p>
              </div>
            ) : filteredPlaylists.length > 0 ? (
              <section className="tutorials-grid" aria-label="Tutorial playlists">
                {filteredPlaylists.map((playlist) => {
                  const summary = getTutorialProgressSummary(playlist, progress);
                  const videos = getCurrentTutorialVideos(playlist);
                  const cover = playlist.thumbnailUrl || videoThumbnail(videos[0]);
                  return (
                    <button key={playlist.playlistId} type="button" className="tutorial-card" onClick={() => openPlaylist(playlist)}>
                      <div className="tutorial-card__cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
                        {!cover && <BookOpen size={30} aria-hidden="true" />}
                        <span className="tutorial-card__play"><Play size={19} fill="currentColor" aria-hidden="true" /></span>
                        {playlist.featured && <span className="tutorial-card__badge">Featured</span>}
                      </div>
                      <div className="tutorial-card__body">
                        <div className="tutorial-card__meta">
                          <span>{playlist.category}</span>
                          <span><ListVideo size={14} aria-hidden="true" /> {videos.length}</span>
                        </div>
                        <h2>{playlist.title}</h2>
                        <p>{playlist.description || "A guided MakeChurchEasy training playlist."}</p>
                        <div className="tutorial-card__progress">
                          <span>{progressLabel(summary.completed, summary.total)}</span>
                          <span className="tutorial-card__progress-track" aria-hidden="true"><i style={{ width: `${summary.total ? (summary.completed / summary.total) * 100 : 0}%` }} /></span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </section>
            ) : (
              <section className="tutorials-empty">
                <BookOpen size={28} aria-hidden="true" />
                <h2>{availablePlaylists.length ? "No matching tutorials" : "New tutorials are on the way"}</h2>
                <p>{availablePlaylists.length ? "Try a different search or category." : "Detailed training playlists will appear here as soon as they are published."}</p>
              </section>
            )}
          </>
        )}
      </div>

      {/* ==================== 3RD LEVEL: VIDEO PLAYBACK MODAL ==================== */}
      {selectedPlaylist && selectedVideo && (
        <div
          className="tutorials-modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelectedVideo(null)}
        >
          <section
            className="tutorials-modal tutorials-modal--player"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-player-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="tutorials-modal__header">
              <div className="tutorials-player-modal__header-copy">
                <p>
                  {selectedPlaylist.title} • Video {currentVideoIndex + 1} of {currentVideos.length}
                </p>
                <h2 id="tutorial-player-title">{selectedVideo.title}</h2>
              </div>
              <button
                type="button"
                className="tutorials-modal__close"
                onClick={() => setSelectedVideo(null)}
                aria-label="Close video player"
              >
                <X size={20} />
              </button>
            </header>

            <div className="tutorials-player-modal__content">
              {getYouTubeEmbedUrl(selectedVideo.youtubeUrl) ? (
                <div className="tutorials-player__frame">
                  <iframe
                    key={selectedVideo.videoId}
                    src={getYouTubeEmbedUrl(selectedVideo.youtubeUrl) ?? undefined}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="tutorials-player__unavailable">
                  <Play size={28} />
                  <p>This tutorial opens in YouTube.</p>
                </div>
              )}

              {/* Navigation Bar: BACK & NEXT BUTTONS */}
              <div className="tutorials-player__nav-bar">
                <button
                  type="button"
                  className="tutorials-nav-btn tutorials-nav-btn--prev"
                  disabled={!hasPrev}
                  onClick={goToPrevVideo}
                  title={hasPrev ? `Previous: ${currentVideos[currentVideoIndex - 1]?.title}` : "First video"}
                >
                  <ChevronLeft size={18} />
                  <span>Back</span>
                </button>

                <div className="tutorials-player__center-actions">
                  <button
                    type="button"
                    className={progress[selectedVideo.videoId]?.status === "completed" ? "tutorial-action is-complete" : "tutorial-action"}
                    onClick={() => setCompletion(selectedVideo, progress[selectedVideo.videoId]?.status !== "completed")}
                  >
                    <CheckCircle2 size={16} />
                    {progress[selectedVideo.videoId]?.status === "completed" ? "Completed" : "Mark complete"}
                  </button>
                  <a
                    href={selectedVideo.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markStarted(selectedVideo)}
                  >
                    Open in YouTube <ExternalLink size={14} />
                  </a>
                </div>

                <button
                  type="button"
                  className="tutorials-nav-btn tutorials-nav-btn--next"
                  disabled={!hasNext}
                  onClick={goToNextVideo}
                  title={hasNext ? `Next: ${currentVideos[currentVideoIndex + 1]?.title}` : "Last video"}
                >
                  <span>Next</span>
                  <ChevronRight size={18} />
                </button>
              </div>

              {selectedVideo.description && (
                <div className="tutorials-player__description">
                  <h4>About this tutorial</h4>
                  <p>{renderTutorialDescription(selectedVideo.description)}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
