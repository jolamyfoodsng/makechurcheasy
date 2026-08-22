import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
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

  const closePlaylist = useCallback(() => {
    setSelectedPlaylist(null);
    setSelectedVideo(null);
  }, []);

  useEffect(() => {
    if (!selectedPlaylist) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePlaylist();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePlaylist, selectedPlaylist]);

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
    const firstVideo = getCurrentTutorialVideos(playlist)[0] ?? null;
    setSelectedPlaylist(playlist);
    setSelectedVideo(firstVideo);
    if (firstVideo) markStarted(firstVideo);
  }, [markStarted]);

  const setCompletion = useCallback((video: TutorialVideo, completed: boolean) => {
    setProgress((current) => setTutorialProgressStatus(current, video.videoId, completed ? "completed" : "started"));
  }, []);

  return (
    <div className="app-page tutorials-page">
      <div className="app-page__inner tutorials-page__inner">
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
      </div>

      {selectedPlaylist && selectedVideo && (
        <div className="tutorials-modal-backdrop" role="presentation" onMouseDown={closePlaylist}>
          <section
            className="tutorials-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-playlist-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="tutorials-modal__header">
              <div>
                <p>{selectedPlaylist.category}</p>
                <h2 id="tutorial-playlist-title">{selectedPlaylist.title}</h2>
              </div>
              <button type="button" className="tutorials-modal__close" onClick={closePlaylist} aria-label="Close tutorials">
                <X size={20} />
              </button>
            </header>

            <div className="tutorials-modal__content">
              <aside className="tutorials-video-list" aria-label="Videos in this playlist">
                {getCurrentTutorialVideos(selectedPlaylist).map((video, index) => {
                  const completed = progress[video.videoId]?.status === "completed";
                  return (
                    <button
                      key={video.videoId}
                      type="button"
                      className={selectedVideo.videoId === video.videoId ? "tutorials-video-list__item is-active" : "tutorials-video-list__item"}
                      onClick={() => selectVideo(video)}
                    >
                      <span className={completed ? "tutorials-video-list__number is-complete" : "tutorials-video-list__number"}>
                        {completed ? <CheckCircle2 size={16} /> : index + 1}
                      </span>
                      <span>
                        <strong>{video.title}</strong>
                        {video.duration && <small><Clock3 size={12} /> {video.duration}</small>}
                      </span>
                    </button>
                  );
                })}
              </aside>

              <div className="tutorials-player">
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
                <div className="tutorials-player__details">
                  <div>
                    <h3>{selectedVideo.title}</h3>
                    {selectedVideo.description && <p>{selectedVideo.description}</p>}
                  </div>
                  <div className="tutorials-player__actions">
                    <button
                      type="button"
                      className={progress[selectedVideo.videoId]?.status === "completed" ? "tutorial-action is-complete" : "tutorial-action"}
                      onClick={() => setCompletion(selectedVideo, progress[selectedVideo.videoId]?.status !== "completed")}
                    >
                      <CheckCircle2 size={16} />
                      {progress[selectedVideo.videoId]?.status === "completed" ? "Completed" : "Mark complete"}
                    </button>
                    <a href={selectedVideo.youtubeUrl} target="_blank" rel="noopener noreferrer" onClick={() => markStarted(selectedVideo)}>
                      Open in YouTube <ExternalLink size={15} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
