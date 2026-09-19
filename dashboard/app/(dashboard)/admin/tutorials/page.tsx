"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Video,
  X,
  Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Release = "current" | "legacy";

type VideoItem = {
  videoId: string;
  title: string;
  description: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  duration: string;
  tags: string[];
  release: Release;
  featured: boolean;
  enabled: boolean;
  sortOrder: number;
};

type TutorialPlaylist = {
  playlistId: string;
  youtubePlaylistUrl?: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  category: string;
  tags: string[];
  featured: boolean;
  enabled: boolean;
  sortOrder: number;
  videos: VideoItem[];
  updatedAt?: string;
};

type FormState = Omit<TutorialPlaylist, "tags" | "videos"> & {
  youtubePlaylistUrl?: string;
  tags: string;
  videos: Array<Omit<VideoItem, "tags"> & { tags: string }>;
};

const fieldClass =
  "w-full min-h-[42px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20";
const labelClass = "mb-1.5 block text-xs font-semibold text-slate-300";

function blankVideo(sortOrder = 0): FormState["videos"][number] {
  return {
    videoId: "",
    title: "",
    description: "",
    youtubeUrl: "",
    thumbnailUrl: "",
    duration: "",
    tags: "",
    release: "current",
    featured: false,
    enabled: true,
    sortOrder,
  };
}

function blankForm(): FormState {
  return {
    playlistId: "",
    youtubePlaylistUrl: "",
    title: "",
    description: "",
    thumbnailUrl: "",
    category: "Getting started",
    tags: "",
    featured: false,
    enabled: true,
    sortOrder: 0,
    videos: [blankVideo()],
  };
}

function playlistToForm(playlist: TutorialPlaylist): FormState {
  return {
    ...playlist,
    youtubePlaylistUrl: playlist.youtubePlaylistUrl || "",
    tags: playlist.tags.join(", "),
    videos: playlist.videos.map((video) => ({
      ...video,
      thumbnailUrl: video.thumbnailUrl || "",
      duration: video.duration || "",
      tags: video.tags.join(", "),
    })),
  };
}

function makePayload(form: FormState) {
  return {
    ...form,
    playlistId: form.playlistId.trim(),
    youtubePlaylistUrl: form.youtubePlaylistUrl?.trim() || undefined,
    title: form.title.trim(),
    description: form.description.trim(),
    thumbnailUrl: form.thumbnailUrl.trim(),
    category: form.category.trim(),
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    videos: form.videos.map((video, index) => ({
      ...video,
      videoId: video.videoId.trim(),
      title: video.title.trim(),
      description: video.description.trim(),
      youtubeUrl: video.youtubeUrl.trim(),
      thumbnailUrl: video.thumbnailUrl.trim(),
      duration: video.duration.trim(),
      tags: video.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      sortOrder: Number.isFinite(Number(video.sortOrder)) ? Number(video.sortOrder) : index,
    })),
  };
}

export default function AdminTutorialsPage() {
  const [playlists, setPlaylists] = useState<TutorialPlaylist[]>([]);
  const [form, setForm] = useState<FormState>(() => blankForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // YouTube Playlist Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importCategory, setImportCategory] = useState("Getting started");
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tutorial-playlists", { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load tutorials");
      setPlaylists(Array.isArray(body.playlists) ? body.playlists : []);
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load tutorials",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateVideo = <K extends keyof FormState["videos"][number]>(
    index: number,
    key: K,
    value: FormState["videos"][number][K]
  ) => {
    setForm((current) => ({
      ...current,
      videos: current.videos.map((video, videoIndex) =>
        videoIndex === index ? { ...video, [key]: value } : video
      ),
    }));
  };

  const selectPlaylist = (playlist: TutorialPlaylist) => {
    setSelectedId(playlist.playlistId);
    setForm(playlistToForm(playlist));
  };

  const createPlaylist = () => {
    setSelectedId(null);
    setForm(blankForm());
  };

  // Import directly from a YouTube Playlist Link
  const importFromYouTube = async (urlOverride?: string) => {
    const targetUrl = (urlOverride || importUrl).trim();
    if (!targetUrl) {
      setToast({ type: "error", message: "Please paste a YouTube playlist link" });
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/admin/tutorial-playlists/import-youtube", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to import YouTube playlist");

      const pl = data.playlist;
      if (!pl || !Array.isArray(pl.videos) || pl.videos.length === 0) {
        throw new Error("No videos found in this YouTube playlist");
      }

      setForm((current) => ({
        ...current,
        playlistId: current.playlistId || pl.playlistId,
        youtubePlaylistUrl: pl.youtubePlaylistUrl,
        title: current.title && current.title !== "" ? current.title : pl.title,
        description: current.description || pl.description,
        thumbnailUrl: current.thumbnailUrl || pl.thumbnailUrl,
        category: current.category || importCategory || "Getting started",
        videos: pl.videos.map((v: any, index: number) => ({
          videoId: v.videoId,
          title: v.title,
          description: v.description || "",
          youtubeUrl: v.youtubeUrl,
          thumbnailUrl: v.thumbnailUrl || "",
          duration: v.duration || "",
          tags: "",
          release: "current" as Release,
          featured: false,
          enabled: true,
          sortOrder: index,
        })),
      }));

      setShowImportModal(false);
      setImportUrl("");
      setToast({
        type: "success",
        message: `Imported ${pl.videos.length} videos from YouTube! Review and click "Publish changes" to save.`,
      });
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to import YouTube playlist",
      });
    } finally {
      setImporting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = makePayload(form);
      if (!payload.title) throw new Error("Playlist title is required");
      if (payload.videos.length === 0) {
        throw new Error("Please add at least one video or import from YouTube");
      }
      if (payload.videos.some((video) => !video.title || !video.youtubeUrl)) {
        throw new Error("Every video needs a title and YouTube URL");
      }

      const endpoint = selectedId
        ? `/api/admin/tutorial-playlists/${encodeURIComponent(selectedId)}`
        : "/api/admin/tutorial-playlists";

      const response = await fetch(endpoint, {
        method: selectedId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist: payload }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Failed to save tutorial playlist");

      const saved = body.playlist as TutorialPlaylist;
      setPlaylists((current) =>
        [...current.filter((playlist) => playlist.playlistId !== saved.playlistId), saved].sort(
          (left, right) =>
            Number(right.featured) - Number(left.featured) ||
            left.sortOrder - right.sortOrder ||
            left.title.localeCompare(right.title)
        )
      );
      setSelectedId(saved.playlistId);
      setForm(playlistToForm(saved));
      setToast({
        type: "success",
        message: "Tutorial playlist published to the desktop app and dashboard.",
      });
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save tutorial playlist",
      });
    } finally {
      setSaving(false);
    }
  };

  const deletePlaylist = async (playlistIdToDelete?: string) => {
    const targetId = playlistIdToDelete || selectedId;
    if (!targetId) return;

    const targetPlaylist = playlists.find((p) => p.playlistId === targetId);
    const title = targetPlaylist?.title || "this playlist";

    if (!window.confirm(`Are you sure you want to delete "${title}"? This will remove it from the desktop app.`)) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        `/api/admin/tutorial-playlists/${encodeURIComponent(targetId)}?permanent=true`,
        { method: "DELETE", credentials: "include" }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Failed to delete tutorial playlist");

      setPlaylists((current) => current.filter((p) => p.playlistId !== targetId));
      if (selectedId === targetId) {
        setSelectedId(null);
        setForm(blankForm());
      }
      setToast({ type: "success", message: `Playlist "${title}" deleted successfully.` });
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete tutorial playlist",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6 pb-16 md:p-8">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-400">
            Desktop Learning Centre
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-50">Tutorials & Training Playlists</h1>
          <p className="mt-1 text-sm text-slate-400">
            Import YouTube playlists or publish step-by-step videos shown in the desktop app.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800 transition"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/30 bg-red-600/15 px-3.5 text-sm font-semibold text-red-200 hover:bg-red-600/25 transition shadow-sm"
          >
            <Youtube className="h-4 w-4 text-red-400" />
            Import from YouTube
          </button>
          <button
            type="button"
            onClick={createPlaylist}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-3.5 text-sm font-semibold text-white hover:bg-violet-500 transition shadow-sm"
          >
            <Plus className="h-4 w-4" /> New playlist
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left: Playlists List */}
        <aside className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 flex flex-col">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Playlists</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
              {playlists.length}
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-28 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading playlists...
            </div>
          ) : playlists.length ? (
            <div className="space-y-1.5 overflow-y-auto max-h-[700px] pr-1">
              {playlists.map((playlist) => (
                <div
                  key={playlist.playlistId}
                  className={cn(
                    "group relative flex items-center justify-between rounded-lg border px-3 py-2.5 transition text-left cursor-pointer",
                    selectedId === playlist.playlistId
                      ? "border-violet-500/60 bg-violet-500/10"
                      : "border-transparent bg-slate-950/40 hover:bg-slate-800/80"
                  )}
                  onClick={() => selectPlaylist(playlist)}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <strong className="truncate text-sm text-slate-100">{playlist.title}</strong>
                    </div>
                    <span className="mt-1 block text-xs text-slate-400">
                      {playlist.videos.length} video{playlist.videos.length === 1 ? "" : "s"} · {playlist.category}
                    </span>
                  </div>

                  {/* Actions: Enabled indicator + Delete */}
                  <div className="flex items-center gap-1">
                    {playlist.enabled ? (
                      <span title="Visible in app">
                        <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      </span>
                    ) : (
                      <span title="Hidden">
                        <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deletePlaylist(playlist.playlistId);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-950/50 text-rose-400 transition"
                      title="Delete playlist"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-10 text-center text-slate-500 text-sm">
              <Youtube className="mx-auto h-8 w-8 text-slate-600 mb-2" />
              <p className="font-medium text-slate-400">No playlists yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Click <strong>"Import from YouTube"</strong> to load your OBS tutorial playlist automatically.
              </p>
            </div>
          )}
        </aside>

        {/* Right: Playlist Editor */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
          {/* Editor Header */}
          <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center bg-slate-950/30">
            <div>
              <h2 className="font-bold text-slate-100 text-lg">
                {selectedId ? "Edit Playlist" : "New Playlist"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Videos marked as <strong className="text-emerald-400">Current detailed</strong> will display in the app.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedId && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void deletePlaylist(selectedId)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-800/70 bg-rose-950/20 px-3 text-sm font-semibold text-rose-300 hover:bg-rose-900/30 transition disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> Delete playlist
                </button>
              )}
              <button
                type="button"
                disabled={saving || importing}
                onClick={() => void save()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 transition shadow-sm disabled:cursor-wait disabled:opacity-70"
              >
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Publish changes"}
              </button>
            </div>
          </div>

          <div className="space-y-6 p-5">
            {/* Connected YouTube Banner */}
            {form.youtubePlaylistUrl && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-950/20 p-3.5 text-xs text-slate-300">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Youtube className="h-5 w-5 text-red-500 shrink-0" />
                  <div className="truncate">
                    <span className="font-semibold text-white">Linked YouTube Playlist:</span>{" "}
                    <a
                      href={form.youtubePlaylistUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-red-300 hover:underline font-mono truncate"
                    >
                      {form.youtubePlaylistUrl}
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => void importFromYouTube(form.youtubePlaylistUrl)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900/40 transition disabled:opacity-50"
                  title="Re-fetch all videos from YouTube"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", importing && "animate-spin")} />
                  {importing ? "Syncing..." : "Sync latest from YouTube"}
                </button>
              </div>
            )}

            {/* Playlist Meta Form */}
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className={labelClass}>Playlist title</span>
                <input
                  className={fieldClass}
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  placeholder="e.g. Start your first service"
                />
              </label>
              <label>
                <span className={labelClass}>Category</span>
                <input
                  className={fieldClass}
                  value={form.category}
                  onChange={(event) => update("category", event.target.value)}
                  placeholder="e.g. Getting started, OBS & Streaming"
                />
              </label>
              <label>
                <span className={labelClass}>
                  YouTube Playlist Link <em className="font-normal text-slate-500">(for auto-sync)</em>
                </span>
                <input
                  className={fieldClass}
                  value={form.youtubePlaylistUrl || ""}
                  onChange={(event) => update("youtubePlaylistUrl", event.target.value)}
                  placeholder="https://www.youtube.com/playlist?list=PL..."
                />
              </label>
              <label>
                <span className={labelClass}>
                  Playlist thumbnail URL <em className="font-normal text-slate-500">(optional)</em>
                </span>
                <input
                  className={fieldClass}
                  value={form.thumbnailUrl}
                  onChange={(event) => update("thumbnailUrl", event.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label>
                <span className={labelClass}>
                  Tags <em className="font-normal text-slate-500">(comma separated)</em>
                </span>
                <input
                  className={fieldClass}
                  value={form.tags}
                  onChange={(event) => update("tags", event.target.value)}
                  placeholder="OBS, Bible, setup, lyrics"
                />
              </label>
              <label>
                <span className={labelClass}>Display order</span>
                <input
                  className={fieldClass}
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => update("sortOrder", Number(event.target.value))}
                />
              </label>
            </div>

            <label>
              <span className={labelClass}>Description</span>
              <textarea
                className={`${fieldClass} min-h-20`}
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                placeholder="Tell users what they will learn in this training playlist."
              />
            </label>

            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(event) => update("featured", event.target.checked)}
                  className="rounded border-slate-700 text-violet-600 focus:ring-violet-500"
                />
                <span className="font-medium">Featured playlist</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => update("enabled", event.target.checked)}
                  className="rounded border-slate-700 text-violet-600 focus:ring-violet-500"
                />
                <span className="font-medium">Visible in Tutorials</span>
              </label>
            </div>

            {/* Videos Section */}
            <div className="border-t border-slate-800 pt-6">
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                    <span>Videos</span>
                    <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300 font-semibold">
                      {form.videos.length}
                    </span>
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Arranged in sequential order. Users can click and watch inside MakeChurchEasy.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-950/20 px-3 text-xs font-semibold text-red-300 hover:bg-red-900/30 transition"
                  >
                    <Youtube className="h-3.5 w-3.5 text-red-400" /> Import from YouTube
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        videos: [...current.videos, blankVideo(current.videos.length)],
                      }))
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add manual video
                  </button>
                </div>
              </div>

              {form.videos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-500">
                  <Youtube className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-300">No videos in this playlist yet</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Paste a YouTube playlist link to populate all videos automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    <Youtube className="h-4 w-4" /> Import YouTube Playlist
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {form.videos.map((video, index) => (
                    <article
                      key={`${video.videoId || "video"}-${index}`}
                      className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition hover:border-slate-700"
                    >
                      <div className="mb-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="grid h-6 w-6 place-items-center rounded bg-slate-800 text-xs font-bold text-slate-300 shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-sm font-semibold text-slate-200 truncate">
                            {video.title || "Untitled video"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {video.youtubeUrl && (
                            <a
                              href={video.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded p-1.5 text-slate-400 hover:text-slate-200 transition"
                              title="Watch on YouTube"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() =>
                              setForm((current) => {
                                const videos = [...current.videos];
                                [videos[index - 1], videos[index]] = [videos[index], videos[index - 1]];
                                return {
                                  ...current,
                                  videos: videos.map((item, order) => ({ ...item, sortOrder: order })),
                                };
                              })
                            }
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-25"
                            aria-label="Move video up"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={index === form.videos.length - 1}
                            onClick={() =>
                              setForm((current) => {
                                const videos = [...current.videos];
                                [videos[index + 1], videos[index]] = [videos[index], videos[index + 1]];
                                return {
                                  ...current,
                                  videos: videos.map((item, order) => ({ ...item, sortOrder: order })),
                                };
                              })
                            }
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-25"
                            aria-label="Move video down"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                videos: current.videos.filter((_item, itemIndex) => itemIndex !== index),
                              }))
                            }
                            className="rounded p-1.5 text-rose-400 hover:bg-rose-950/40"
                            aria-label="Remove video"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label>
                          <span className={labelClass}>Video title</span>
                          <input
                            className={fieldClass}
                            value={video.title}
                            onChange={(event) => updateVideo(index, "title", event.target.value)}
                            placeholder="e.g. Connect MakeChurchEasy to OBS"
                          />
                        </label>
                        <label>
                          <span className={labelClass}>YouTube URL</span>
                          <input
                            className={fieldClass}
                            type="url"
                            value={video.youtubeUrl}
                            onChange={(event) => updateVideo(index, "youtubeUrl", event.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                          />
                        </label>
                      </div>

                      {/* Video Thumbnail & Details */}
                      {video.thumbnailUrl && (
                        <div className="mt-3 flex items-center gap-3">
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            className="h-12 w-20 rounded object-cover border border-slate-800 bg-slate-900 shrink-0"
                          />
                          <p className="text-xs text-slate-400 line-clamp-2">
                            {video.description || "No description provided."}
                          </p>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-5">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                          <input
                            type="radio"
                            name={`release-${index}`}
                            checked={video.release === "current"}
                            onChange={() => updateVideo(index, "release", "current")}
                          />
                          <span className="inline-flex items-center gap-1 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Current detailed (visible)
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                          <input
                            type="radio"
                            name={`release-${index}`}
                            checked={video.release === "legacy"}
                            onChange={() => updateVideo(index, "release", "legacy")}
                          />
                          Legacy (hidden from app)
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={video.enabled}
                            onChange={(event) => updateVideo(index, "enabled", event.target.checked)}
                          />
                          Enabled
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Import from YouTube Modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !importing) setShowImportModal(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 text-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-600/20 border border-red-500/30 text-red-400">
                  <Youtube className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Import from YouTube Playlist</h3>
                  <p className="text-xs text-slate-400">
                    Extracts all videos, titles, descriptions, and thumbnails automatically.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                disabled={importing}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <label className="block">
                <span className="mb-1 block font-semibold text-slate-300">
                  YouTube Playlist Link or ID <span className="text-red-400">*</span>
                </span>
                <input
                  className={fieldClass}
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://www.youtube.com/playlist?list=PL..."
                  autoFocus
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Example: <code>https://www.youtube.com/playlist?list=PLRua6gJfgC0o</code>
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block font-semibold text-slate-300">Category</span>
                <input
                  className={fieldClass}
                  value={importCategory}
                  onChange={(e) => setImportCategory(e.target.value)}
                  placeholder="e.g. OBS & Presentation, Getting started"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={importing}
                onClick={() => setShowImportModal(false)}
                className="px-4 h-9 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importing || !importUrl.trim()}
                onClick={() => void importFromYouTube()}
                className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching videos...
                  </>
                ) : (
                  <>
                    <Youtube className="h-3.5 w-3.5" /> Fetch & Load Videos
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl animate-in slide-in-from-bottom-2",
            toast.type === "success"
              ? "border-emerald-700 bg-emerald-950/95 text-emerald-200"
              : "border-rose-700 bg-rose-950/95 text-rose-200"
          )}
        >
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 shrink-0" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
