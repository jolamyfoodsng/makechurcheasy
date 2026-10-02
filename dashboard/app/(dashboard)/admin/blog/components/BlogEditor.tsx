"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  Edit3,
  Save,
  CheckCircle2,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  Clock,
  Sparkles,
  Settings2,
  Trash2,
  ExternalLink,
  ChevronDown,
  Loader2,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Quote,
  List,
  ListOrdered,
  Code,
  Link2,
  Minus,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";

export interface BlogPostData {
  _id?: string;
  slug: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  content: string;
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
  readingTimeMinutes?: number;
  publishedAt?: string | null;
}

interface BlogEditorProps {
  initialData?: Partial<BlogPostData>;
  isNew?: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function calculateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function BlogEditor({ initialData, isNew = false }: BlogEditorProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title || "");
  const [subtitle, setSubtitle] = useState(initialData?.subtitle || "");
  const [content, setContent] = useState(initialData?.content || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [slugCustomized, setSlugCustomized] = useState(Boolean(initialData?.slug));
  const [category, setCategory] = useState(initialData?.category || "Church Tech");
  const [tagsInput, setTagsInput] = useState((initialData?.tags || ["worship", "media"]).join(", "));
  const [coverImage, setCoverImage] = useState(initialData?.coverImage || "");
  const [status, setStatus] = useState<"draft" | "published" | "archived">(initialData?.status || "draft");
  const [featured, setFeatured] = useState<boolean>(Boolean(initialData?.featured));
  const [authorName, setAuthorName] = useState(initialData?.author?.name || "MakeChurchEasy Team");
  const [authorRole, setAuthorRole] = useState(initialData?.author?.role || "Editorial Team");
  const [authorAvatar, setAuthorAvatar] = useState(
    initialData?.author?.avatar || "/assets/blog/authors/mce.svg"
  );

  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-generate slug from title unless manually edited
  useEffect(() => {
    if (!slugCustomized && title) {
      setSlug(slugify(title));
    }
  }, [title, slugCustomized]);

  const readingTime = calculateReadingTime(content);
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  const handleInsertMarkdown = (prefix: string, suffix: string = "", placeholder: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end) || placeholder;

    const before = content.substring(0, start);
    const after = content.substring(end);

    const newContent = `${before}${prefix}${selected}${suffix}${after}`;
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selected.length + suffix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 10);
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "blog");

      const res = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to upload image");
      }

      setCoverImage(data.url);
      setSuccessMessage("Cover image uploaded successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async (targetStatus?: "draft" | "published" | "archived") => {
    setError(null);
    setSuccessMessage(null);

    const finalTitle = title.trim();
    if (!finalTitle) {
      setError("Please provide a story title");
      return;
    }

    if (!content.trim()) {
      setError("Please write some content for your story");
      return;
    }

    const effectiveStatus = targetStatus || status;
    setSaving(true);

    const tagsArray = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      title: finalTitle,
      subtitle: subtitle.trim(),
      content: content.trim(),
      slug: slug.trim() || slugify(finalTitle),
      coverImage: coverImage.trim(),
      category: category.trim() || "General",
      tags: tagsArray,
      status: effectiveStatus,
      featured,
      author: {
        name: authorName.trim() || "MakeChurchEasy Team",
        role: authorRole.trim() || "Editorial Team",
        avatar: authorAvatar.trim() || "/assets/blog/authors/mce.svg",
      },
    };

    try {
      let res: Response;
      if (isNew) {
        res = await fetch("/api/admin/blog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } else {
        const id = initialData?._id;
        if (!id) throw new Error("Missing post ID for update");
        res = await fetch(`/api/admin/blog/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      }

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || "Failed to save post");
      }

      setStatus(effectiveStatus);
      setSuccessMessage(
        effectiveStatus === "published"
          ? "Story published to MakeChurchEasy Blog!"
          : "Story saved as draft."
      );

      if (isNew && resData.post?._id) {
        setTimeout(() => {
          router.push(`/admin/blog/${resData.post._id}`);
        }, 1200);
      } else {
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while saving");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top action navbar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur-md md:px-8">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/blog"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition"
          >
            <ArrowLeft size={16} />
            <span>Stories</span>
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <span>/</span>
            <span className="font-semibold text-slate-300">
              {isNew ? "Drafting new story" : "Editing story"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium border border-slate-700 bg-slate-900 text-slate-400">
              <Clock size={11} /> {readingTime} min read · {wordCount} words
            </span>
          </div>
        </div>

        {/* Center mode switcher */}
        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/80 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("write")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "write"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Edit3 size={13} />
            Write
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "preview"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Eye size={13} />
            Preview
          </button>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showSettings
                ? "border-indigo-500 bg-indigo-950/40 text-indigo-300"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
            }`}
          >
            <Settings2 size={14} />
            <span>Settings</span>
          </button>

          {!isNew && slug && (
            <a
              href={`/blog/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:border-slate-700 transition"
              title="Open public page"
            >
              <ExternalLink size={13} />
              <span>View</span>
            </a>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave("draft")}
            className="rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin inline mr-1" /> : null}
            Save Draft
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave("published")}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            <span>Publish</span>
          </button>
        </div>
      </header>

      {/* Alert toast banners */}
      {error && (
        <div className="mx-auto mt-4 flex max-w-4xl items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-sm text-rose-300 shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            ×
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mx-auto mt-4 flex max-w-4xl items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300 shadow-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            ×
          </button>
        </div>
      )}

      {/* Collapsible Story Settings drawer */}
      {showSettings && (
        <div className="border-b border-slate-800 bg-slate-900/90 px-6 py-6 transition">
          <div className="mx-auto max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            {/* Left settings column */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Story URL Slug
                </label>
                <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                  <span className="text-slate-500">/blog/</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlugCustomized(true);
                      setSlug(slugify(e.target.value));
                    }}
                    placeholder="custom-slug"
                    className="ml-1 flex-1 bg-transparent text-slate-200 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Bible Presentation, Live Streaming"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. obs, worship, live stream, slides"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Featured Hero Story</span>
                </label>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Status:</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300 outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Right settings column */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Cover Image URL or Upload
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={coverImage}
                    onChange={(e) => setCoverImage(e.target.value)}
                    placeholder="https://... or /assets/blog/..."
                    className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleUploadCover}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
                  >
                    {uploadingImage ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Upload size={13} />
                    )}
                    <span>Upload</span>
                  </button>
                </div>
                {coverImage && (
                  <div className="relative mt-2.5 w-full h-28 rounded-lg overflow-hidden border border-slate-800">
                    <img
                      src={coverImage}
                      alt="Cover preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImage("")}
                      className="absolute top-2 right-2 rounded bg-black/70 p-1 text-slate-300 hover:text-white"
                      title="Remove cover"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Author Name
                  </label>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Author Role
                  </label>
                  <input
                    type="text"
                    value={authorRole}
                    onChange={(e) => setAuthorRole(e.target.value)}
                    placeholder="e.g. Media Director"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8">
        <div className="mx-auto max-w-3xl">
          {activeTab === "write" ? (
            <div className="space-y-6">
              {/* Cover image quick banner if set */}
              {coverImage && (
                <div className="relative mb-6 overflow-hidden rounded-2xl border border-slate-800 shadow-2xl">
                  <img
                    src={coverImage}
                    alt="Cover banner"
                    className="w-full max-h-[360px] object-cover"
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-black/70 backdrop-blur-md px-2.5 py-1 text-xs text-slate-200 hover:text-white"
                    >
                      Change Cover
                    </button>
                  </div>
                </div>
              )}

              {!coverImage && (
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="flex items-center gap-2 rounded-xl border border-dashed border-slate-800 px-4 py-3 text-xs text-slate-500 hover:border-slate-700 hover:text-slate-400 transition w-full justify-center"
                >
                  <ImageIcon size={15} />
                  <span>Add cover image (recommended for Medium feed layout)</span>
                </button>
              )}

              {/* Title Input */}
              <div>
                <textarea
                  rows={2}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title..."
                  className="w-full resize-none bg-transparent font-serif text-3xl md:text-5xl font-bold tracking-tight text-slate-100 placeholder:text-slate-700 outline-none leading-tight"
                />
              </div>

              {/* Subtitle Input */}
              <div>
                <textarea
                  rows={2}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Tell your story or add a subtitle..."
                  className="w-full resize-none bg-transparent font-sans text-lg md:text-xl text-slate-400 placeholder:text-slate-700 outline-none leading-relaxed"
                />
              </div>

              {/* Markdown Quick Toolbar */}
              <div className="sticky top-16 z-20 flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/90 p-1.5 backdrop-blur-md text-xs text-slate-300 shadow-md">
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("## ", "", "Heading")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Heading 2"
                >
                  <Heading2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("### ", "", "Subheading")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Heading 3"
                >
                  <Heading3 size={14} />
                </button>
                <div className="h-4 w-px bg-slate-800 mx-1" />
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("**", "**", "bold text")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Bold"
                >
                  <Bold size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("*", "*", "italic text")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Italic"
                >
                  <Italic size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("> ", "", "Quote text")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Blockquote"
                >
                  <Quote size={14} />
                </button>
                <div className="h-4 w-px bg-slate-800 mx-1" />
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("- ", "", "List item")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Bullet List"
                >
                  <List size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("1. ", "", "Ordered item")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Numbered List"
                >
                  <ListOrdered size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("```\n", "\n```", "console.log('code');")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Code Block"
                >
                  <Code size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("[", "](https://example.com)", "link title")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Hyperlink"
                >
                  <Link2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertMarkdown("\n---\n", "", "")}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white"
                  title="Divider"
                >
                  <Minus size={14} />
                </button>
              </div>

              {/* Markdown Content Editor */}
              <div>
                <textarea
                  ref={textareaRef}
                  rows={22}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your story here using Markdown..."
                  className="w-full resize-y rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 font-mono text-sm leading-relaxed text-slate-200 placeholder:text-slate-700 outline-none focus:border-indigo-500/80 focus:bg-slate-900/90 transition shadow-inner"
                />
              </div>
            </div>
          ) : (
            /* Live Medium Article Preview */
            <div className="py-6">
              {coverImage && (
                <div className="mb-8 overflow-hidden rounded-2xl border border-slate-800 shadow-2xl">
                  <img
                    src={coverImage}
                    alt={title || "Article cover"}
                    className="w-full max-h-[460px] object-cover"
                  />
                </div>
              )}

              <div className="mb-4">
                <span className="rounded-full bg-indigo-950/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-400 border border-indigo-800/50">
                  {category || "Church Tech"}
                </span>
              </div>

              <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-slate-100 leading-tight">
                {title || "Untitled Story"}
              </h1>

              {subtitle && (
                <p className="mt-3 text-lg md:text-xl text-slate-400 leading-relaxed font-sans">
                  {subtitle}
                </p>
              )}

              {/* Author & meta row */}
              <div className="my-8 flex items-center gap-4 border-y border-slate-800/80 py-4">
                <img
                  src={authorAvatar || "/assets/blog/authors/mce.svg"}
                  alt={authorName}
                  className="h-11 w-11 rounded-full border border-slate-700 object-cover bg-slate-800"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-200">{authorName}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span>{authorRole}</span>
                    <span>·</span>
                    <span>{readingTime} min read</span>
                    <span>·</span>
                    <span className="text-emerald-400 capitalize">{status}</span>
                  </div>
                </div>
              </div>

              {/* Rendered content */}
              <MarkdownRenderer content={content || "*Start writing to see the preview here...*"} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
