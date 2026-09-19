"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  ListVideo,
  LoaderCircle,
  Play,
  Search,
  X,
} from "lucide-react";

type TutorialVideo = {
  videoId: string;
  title: string;
  description: string;
  youtubeUrl: string;
  thumbnailUrl?: string;
  duration?: string;
  sortOrder: number;
  tags: string[];
};

type TutorialPlaylist = {
  playlistId: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  category: string;
  tags: string[];
  featured: boolean;
  sortOrder: number;
  videos: TutorialVideo[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, maxLength = 2_000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      id = url.searchParams.get("v") || "";
      if (!id) {
        const segments = url.pathname.split("/").filter(Boolean);
        const videoRoute = segments.findIndex((segment) => ["embed", "shorts", "live"].includes(segment));
        if (videoRoute >= 0) id = segments[videoRoute + 1] || "";
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function embedUrl(video: TutorialVideo): string {
  const id = youtubeVideoId(video.youtubeUrl);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` : "";
}

function normalizePlaylists(value: unknown): TutorialPlaylist[] {
  const entries = isRecord(value) && Array.isArray(value.playlists) ? value.playlists : [];
  return entries
    .map((entry): TutorialPlaylist | null => {
      if (!isRecord(entry)) return null;
      const playlistId = stringValue(entry.playlistId, 120);
      const title = stringValue(entry.title, 180);
      if (!playlistId || !title || entry.enabled === false) return null;

      const videos = (Array.isArray(entry.videos) ? entry.videos : [])
        .filter(isRecord)
        .filter((video) => video.enabled !== false && video.release !== "legacy")
        .map((video): TutorialVideo | null => {
          const youtubeUrl = stringValue(video.youtubeUrl, 1_000);
          const videoTitle = stringValue(video.title, 180);
          if (!videoTitle || !youtubeVideoId(youtubeUrl)) return null;
          return {
            videoId: stringValue(video.videoId, 120) || youtubeVideoId(youtubeUrl)!,
            title: videoTitle,
            description: stringValue(video.description, 1_200),
            youtubeUrl,
            thumbnailUrl: stringValue(video.thumbnailUrl, 1_000) || undefined,
            duration: stringValue(video.duration, 40) || undefined,
            sortOrder: typeof video.sortOrder === "number" ? video.sortOrder : 0,
            tags: Array.isArray(video.tags) ? video.tags.map((tag) => stringValue(tag, 48)).filter(Boolean) : [],
          };
        })
        .filter((video): video is TutorialVideo => !!video)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));

      return {
        playlistId,
        title,
        description: stringValue(entry.description, 1_200),
        thumbnailUrl: stringValue(entry.thumbnailUrl, 1_000) || undefined,
        category: stringValue(entry.category, 80) || "General",
        tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => stringValue(tag, 48)).filter(Boolean) : [],
        featured: entry.featured === true,
        sortOrder: typeof entry.sortOrder === "number" ? entry.sortOrder : 0,
        videos,
      };
    })
    .filter((playlist): playlist is TutorialPlaylist => !!playlist && playlist.videos.length > 0)
    .sort((left, right) => Number(right.featured) - Number(left.featured) || left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));
}

function thumbnailFor(video: TutorialVideo): string | undefined {
  if (video.thumbnailUrl) return video.thumbnailUrl;
  const id = youtubeVideoId(video.youtubeUrl);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}

export default function TutorialsPage() {
  const t = useTranslations("tutorials");
  const common = useTranslations("common");
  const [playlists, setPlaylists] = useState<TutorialPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedPlaylist, setSelectedPlaylist] = useState<TutorialPlaylist | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<TutorialVideo | null>(null);

  const loadPlaylists = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/tutorials", { cache: "no-store" });
      if (!response.ok) throw new Error(`Tutorial catalogue request failed: ${response.status}`);
      setPlaylists(normalizePlaylists(await response.json()));
    } catch (loadError) {
      console.error("Failed to load tutorial playlists:", loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlaylists();
  }, []);

  const categories = useMemo(
    () => ["All", ...new Set(playlists.map((playlist) => playlist.category).filter(Boolean))],
    [playlists],
  );

  const filteredPlaylists = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return playlists.filter((playlist) => {
      if (category !== "All" && playlist.category !== category) return false;
      if (!term) return true;
      const content = [
        playlist.title,
        playlist.description,
        playlist.category,
        ...playlist.tags,
        ...playlist.videos.flatMap((video) => [video.title, video.description, ...video.tags]),
      ].join(" ").toLocaleLowerCase();
      return content.includes(term);
    });
  }, [category, playlists, search]);

  const openPlaylist = (playlist: TutorialPlaylist) => {
    setSelectedPlaylist(playlist);
    setSelectedVideo(null);
  };

  const backToPlaylists = () => {
    setSelectedPlaylist(null);
    setSelectedVideo(null);
  };

  const currentVideos = selectedPlaylist?.videos ?? [];
  const currentVideoIndex = selectedVideo ? currentVideos.findIndex((v) => v.videoId === selectedVideo.videoId) : -1;
  const hasPrev = currentVideoIndex > 0;
  const hasNext = currentVideoIndex >= 0 && currentVideoIndex < currentVideos.length - 1;

  const goToPrevVideo = () => {
    if (hasPrev) {
      setSelectedVideo(currentVideos[currentVideoIndex - 1] ?? null);
    }
  };

  const goToNextVideo = () => {
    if (hasNext) {
      setSelectedVideo(currentVideos[currentVideoIndex + 1] ?? null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-6 pb-16 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-500">{t("description")}</p>
      </header>

      {selectedPlaylist ? (
        <section className="space-y-6" aria-label={selectedPlaylist.title}>
          <div>
            <button
              type="button"
              onClick={backToPlaylists}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ArrowLeft className="h-4 w-4" /> {common("back")}
            </button>
          </div>

          {/* Playlist Hero Banner */}
          <div className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 md:flex-row md:items-center">
            <div
              className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-slate-900 bg-cover bg-center md:w-64"
              style={
                selectedPlaylist.thumbnailUrl || (currentVideos[0] ? thumbnailFor(currentVideos[0]) : undefined)
                  ? { backgroundImage: `url("${selectedPlaylist.thumbnailUrl || thumbnailFor(currentVideos[0])}")` }
                  : undefined
              }
            >
              {!(selectedPlaylist.thumbnailUrl || (currentVideos[0] ? thumbnailFor(currentVideos[0]) : undefined)) && (
                <div className="grid h-full place-items-center text-slate-500"><BookOpen className="h-10 w-10" /></div>
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-blue-700">
                  {selectedPlaylist.category}
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                  <ListVideo className="h-3.5 w-3.5" /> {currentVideos.length} {currentVideos.length === 1 ? "video" : "videos"}
                </span>
              </div>

              <h2 className="text-2xl font-bold text-slate-900">{selectedPlaylist.title}</h2>
              {selectedPlaylist.description && (
                <p className="max-w-3xl text-sm leading-relaxed text-slate-600 line-clamp-3">{selectedPlaylist.description}</p>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedVideo(currentVideos[0] ?? null)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Play className="h-4 w-4 fill-white" /> Start Playlist
                </button>
              </div>
            </div>
          </div>

          {/* Videos in this playlist */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-900">Videos in this Playlist ({currentVideos.length})</h3>

            <div className="space-y-3">
              {currentVideos.map((video, index) => {
                const thumb = thumbnailFor(video);
                return (
                  <article
                    key={video.videoId}
                    onClick={() => setSelectedVideo(video)}
                    className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm sm:flex-row sm:items-center cursor-pointer"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
                      {index + 1}
                    </span>

                    <div
                      className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-slate-900 bg-cover bg-center sm:w-44"
                      style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                    >
                      <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                        <Play className="h-6 w-6 fill-white text-white" />
                      </div>
                      {video.duration && (
                        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <Clock3 className="h-2.5 w-2.5" /> {video.duration}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <h4 className="font-bold text-slate-900 text-base group-hover:text-blue-700 transition">
                        {video.title}
                      </h4>
                      {video.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{video.description}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVideo(video);
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-700 transition hover:border-blue-500 hover:bg-blue-600 hover:text-white"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" /> Play
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        <>
          <label className="flex h-11 max-w-lg items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={common("search")}
              aria-label={common("search")}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>

          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("title")}>
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={category === item}
                  onClick={() => setCategory(item)}
                  className={`min-h-9 rounded-lg border px-3 text-sm font-semibold transition ${category === item ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  {item === "All" ? common("all") : item}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="grid min-h-56 place-content-center justify-items-center gap-3 text-sm text-slate-500" role="status" aria-live="polite">
              <LoaderCircle className="h-6 w-6 animate-spin text-blue-700" /> {common("loading")}
            </div>
          ) : error ? (
            <div className="grid min-h-56 place-content-center justify-items-center gap-3 text-center">
              <p className="text-sm text-slate-600">{common("somethingWentWrong")}</p>
              <button type="button" onClick={() => void loadPlaylists()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">{common("retry")}</button>
            </div>
          ) : filteredPlaylists.length > 0 ? (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("title")}>
              {filteredPlaylists.map((playlist) => {
                const cover = playlist.thumbnailUrl || thumbnailFor(playlist.videos[0]);
                return (
                  <button
                    key={playlist.playlistId}
                    type="button"
                    onClick={() => openPlaylist(playlist)}
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <span className="relative block aspect-video overflow-hidden bg-slate-100">
                      {cover ? <img src={cover} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" /> : <span className="grid h-full place-items-center text-slate-400"><BookOpen className="h-9 w-9" /></span>}
                      <span className="absolute inset-0 grid place-items-center bg-slate-950/15"><span className="grid h-11 w-11 place-items-center rounded-full bg-white text-blue-700 shadow"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span>
                      {playlist.featured && <span className="absolute left-3 top-3 rounded-md bg-slate-950/80 px-2 py-1 text-[11px] font-bold text-white">{t("popular")}</span>}
                    </span>
                    <span className="grid gap-2 p-4">
                      <span className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                        <span className="truncate">{playlist.category}</span>
                        <span className="inline-flex shrink-0 items-center gap-1"><ListVideo className="h-3.5 w-3.5" /> {t("videosCount", { count: playlist.videos.length })}</span>
                      </span>
                      <strong className="line-clamp-1 text-base text-slate-900">{playlist.title}</strong>
                      <span className="line-clamp-2 min-h-10 text-sm leading-relaxed text-slate-600">{playlist.description || t("description")}</span>
                      <span className="pt-1 text-sm font-semibold text-blue-700">{t("watchTutorial")} →</span>
                    </span>
                  </button>
                );
              })}
            </section>
          ) : (
            <section className="grid min-h-56 place-content-center justify-items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center">
              <ListVideo className="h-7 w-7 text-slate-400" />
              <h2 className="font-semibold text-slate-900">{t("cantFindTitle")}</h2>
              <p className="max-w-md text-sm text-slate-500">{t("cantFindDesc")}</p>
            </section>
          )}
        </>
      )}

      {/* Playback Modal with Back and Next buttons */}
      {selectedPlaylist && selectedVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  {selectedPlaylist.title} • Video {currentVideoIndex + 1} of {currentVideos.length}
                </p>
                <h3 className="truncate font-bold text-white text-base mt-0.5">{selectedVideo.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideo(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-700 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-black">
                {embedUrl(selectedVideo) ? (
                  <iframe
                    key={selectedVideo.videoId}
                    className="h-full w-full"
                    src={embedUrl(selectedVideo)}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <div className="grid h-full place-items-center text-white"><Play className="h-10 w-10" /></div>
                )}
              </div>

              {/* Navigation Bar: BACK & NEXT BUTTONS */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 pt-1">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={goToPrevVideo}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>

                <a
                  href={selectedVideo.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  Watch on YouTube <ExternalLink className="h-4 w-4" />
                </a>

                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={goToNextVideo}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {selectedVideo.description && (
                <div className="space-y-1.5 pt-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">About this tutorial</h4>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300 break-words">{selectedVideo.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
