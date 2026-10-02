"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  PenTool,
  Search,
  Plus,
  ExternalLink,
  Edit,
  Trash2,
  Clock,
  CheckCircle,
  Eye,
  Archive,
  Sparkles,
  BookOpen,
  Filter,
  RefreshCw,
  Loader2,
  AlertCircle,
  TrendingUp,
  Share2,
} from "lucide-react";

interface BlogPostItem {
  _id: string;
  slug: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  coverImage?: string;
  category: string;
  tags: string[];
  author: {
    name: string;
    avatar?: string;
    role?: string;
  };
  status: "draft" | "published" | "archived";
  featured?: boolean;
  readingTimeMinutes: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "published" | "draft" | "archived">("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadPosts = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch("/api/admin/blog", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch blog posts");
      }
      setPosts(data.posts || []);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load posts",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const counts = useMemo(() => {
    return {
      all: posts.length,
      published: posts.filter((p) => p.status === "published").length,
      draft: posts.filter((p) => p.status === "draft").length,
      archived: posts.filter((p) => p.status === "archived").length,
    };
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (activeTab !== "all" && post.status !== activeTab) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const inTitle = post.title.toLowerCase().includes(q);
      const inSubtitle = (post.subtitle || "").toLowerCase().includes(q);
      const inCategory = post.category.toLowerCase().includes(q);
      const inTags = post.tags.some((t) => t.toLowerCase().includes(q));
      const inAuthor = post.author.name.toLowerCase().includes(q);

      return inTitle || inSubtitle || inCategory || inTags || inAuthor;
    });
  }, [posts, activeTab, searchQuery]);

  const handleToggleStatus = async (post: BlogPostItem) => {
    const nextStatus = post.status === "published" ? "draft" : "published";
    setActionLoadingId(post._id);

    try {
      const res = await fetch(`/api/admin/blog/${post._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status");
      }

      setPosts((prev) =>
        prev.map((p) => (p._id === post._id ? { ...p, status: nextStatus } : p))
      );
      setToast({
        type: "success",
        message: nextStatus === "published" ? "Story published!" : "Story moved to drafts.",
      });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update status",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/admin/blog/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete story");
      }

      setPosts((prev) => prev.filter((p) => p._id !== id));
      setDeleteConfirmId(null);
      setToast({ type: "success", message: "Story deleted successfully." });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to delete story",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/15 border border-indigo-500/30 text-indigo-400">
              <BookOpen size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                Stories & Blog CMS
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Write, publish, and manage Medium-style articles for MakeChurchEasy
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadPosts(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <Link
            href="/blog"
            target="_blank"
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition"
          >
            <ExternalLink size={14} />
            <span>View Public Blog</span>
          </Link>

          <Link
            href="/admin/blog/new"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
          >
            <Plus size={15} />
            <span>Write Story</span>
          </Link>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm shadow-lg ${
            toast.type === "success"
              ? "border border-emerald-500/30 bg-emerald-950/60 text-emerald-300"
              : "border border-rose-500/30 bg-rose-950/60 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Tabs */}
        <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/80 p-1 text-xs">
          <button
            onClick={() => setActiveTab("all")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              activeTab === "all"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            onClick={() => setActiveTab("published")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              activeTab === "published"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Published ({counts.published})
          </button>
          <button
            onClick={() => setActiveTab("draft")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              activeTab === "draft"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Drafts ({counts.draft})
          </button>
          <button
            onClick={() => setActiveTab("archived")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              activeTab === "archived"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Archived ({counts.archived})
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-[260px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stories, tags, authors..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/80 pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      {/* Stories List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Loader2 size={32} className="animate-spin text-indigo-500 mb-3" />
          <p className="text-sm">Loading stories...</p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 py-20 px-4 text-center">
          <PenTool size={36} className="text-slate-600 mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No stories found</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
            {searchQuery
              ? `No articles matched "${searchQuery}". Try clearing your search query.`
              : "Start sharing insights and guides with church media teams worldwide."}
          </p>
          <Link
            href="/admin/blog/new"
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
          >
            <Plus size={14} />
            <span>Write New Story</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <div
              key={post._id}
              className="group flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 hover:border-slate-700 hover:bg-slate-900/70 transition"
            >
              {/* Left Details */}
              <div className="flex items-start gap-4 flex-1 min-w-0">
                {post.coverImage ? (
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    className="h-20 w-28 rounded-lg object-cover border border-slate-800 shrink-0"
                  />
                ) : (
                  <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-700">
                    <BookOpen size={20} />
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        post.status === "published"
                          ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/50"
                          : post.status === "draft"
                          ? "bg-amber-950/80 text-amber-400 border border-amber-800/50"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {post.status}
                    </span>

                    {post.featured && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-950/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-800/50">
                        <Sparkles size={10} />
                        Featured
                      </span>
                    )}

                    <span className="text-xs font-medium text-slate-400">
                      {post.category}
                    </span>

                    <span className="text-xs text-slate-600">·</span>

                    <span className="text-xs text-slate-500">
                      {post.readingTimeMinutes} min read
                    </span>
                  </div>

                  <Link
                    href={`/admin/blog/${post._id}`}
                    className="block text-base font-semibold text-slate-200 hover:text-indigo-400 transition truncate"
                  >
                    {post.title}
                  </Link>

                  {post.subtitle && (
                    <p className="text-xs text-slate-400 truncate line-clamp-1">
                      {post.subtitle}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
                    <span>By {post.author.name}</span>
                    <span>·</span>
                    <span>
                      {post.publishedAt
                        ? `Published ${new Date(post.publishedAt).toLocaleDateString()}`
                        : `Created ${new Date(post.createdAt).toLocaleDateString()}`}
                    </span>
                    {post.tags.length > 0 && (
                      <>
                        <span>·</span>
                        <div className="flex items-center gap-1">
                          {post.tags.slice(0, 3).map((tag, idx) => (
                            <span
                              key={idx}
                              className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-400"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center border-t md:border-t-0 pt-3 md:pt-0 border-slate-800/60 w-full md:w-auto justify-end">
                {post.status === "published" && (
                  <a
                    href={`/blog/${post.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-700 transition"
                    title="View live article"
                  >
                    <ExternalLink size={13} />
                    <span className="hidden sm:inline">Live</span>
                  </a>
                )}

                <button
                  type="button"
                  disabled={actionLoadingId === post._id}
                  onClick={() => handleToggleStatus(post)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    post.status === "published"
                      ? "border-amber-900/60 bg-amber-950/20 text-amber-300 hover:bg-amber-900/40"
                      : "border-emerald-900/60 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-900/40"
                  }`}
                >
                  {actionLoadingId === post._id ? (
                    <Loader2 size={13} className="animate-spin inline" />
                  ) : post.status === "published" ? (
                    "Unpublish"
                  ) : (
                    "Publish"
                  )}
                </button>

                <Link
                  href={`/admin/blog/${post._id}`}
                  className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  <Edit size={13} />
                  <span>Edit</span>
                </Link>

                {deleteConfirmId === post._id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={actionLoadingId === post._id}
                      onClick={() => handleDelete(post._id)}
                      className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(null)}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(post._id)}
                    className="rounded-lg p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition"
                    title="Delete story"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
