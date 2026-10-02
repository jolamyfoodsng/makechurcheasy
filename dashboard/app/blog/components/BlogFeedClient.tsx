"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Clock,
  Sparkles,
  ArrowRight,
  Bookmark,
  Share2,
  TrendingUp,
  Tag,
  Download,
  CheckCircle2,
} from "lucide-react";

export interface BlogPostFeedItem {
  _id: string;
  slug: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  content?: string;
  coverImage?: string;
  category: string;
  tags: string[];
  author: {
    name: string;
    avatar?: string;
    role?: string;
  };
  status: "published" | "draft" | "archived";
  featured?: boolean;
  readingTimeMinutes: number;
  publishedAt?: string | null;
  createdAt: string;
}

interface BlogFeedClientProps {
  initialPosts: BlogPostFeedItem[];
}

export function BlogFeedClient({ initialPosts }: BlogFeedClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Extract categories dynamically
  const categories = useMemo(() => {
    const set = new Set<string>();
    initialPosts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["All", ...Array.from(set)];
  }, [initialPosts]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    initialPosts.forEach((p) => {
      p.tags?.forEach((t) => set.add(t));
    });
    return Array.from(set).slice(0, 10);
  }, [initialPosts]);

  const filteredPosts = useMemo(() => {
    if (selectedCategory === "All") return initialPosts;
    return initialPosts.filter((p) => p.category === selectedCategory);
  }, [initialPosts, selectedCategory]);

  const featuredPost = useMemo(() => {
    return initialPosts.find((p) => p.featured) || initialPosts[0];
  }, [initialPosts]);

  const feedPosts = useMemo(() => {
    return filteredPosts.filter((p) => p._id !== featuredPost?._id || selectedCategory !== "All");
  }, [filteredPosts, featuredPost, selectedCategory]);

  const handleShare = (e: React.MouseEvent, slug: string) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/blog/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Category Filter Pills */}
      <div className="mb-10 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800/80">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition ${
              selectedCategory === cat
                ? "bg-slate-100 text-slate-900 font-semibold shadow-sm"
                : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Main Feed Column (8 cols) */}
        <div className="lg:col-span-8 space-y-12">
          {/* Featured Hero Article (shown on 'All' tab) */}
          {selectedCategory === "All" && featuredPost && (
            <article className="group relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6 md:p-8 hover:border-slate-700 transition">
              {featuredPost.coverImage && (
                <Link href={`/blog/${featuredPost.slug}`} className="block overflow-hidden rounded-xl mb-6">
                  <img
                    src={featuredPost.coverImage}
                    alt={featuredPost.title}
                    className="w-full max-h-[380px] object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                </Link>
              )}

              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-950/80 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-400 border border-indigo-800/50">
                  <Sparkles size={11} /> Featured Story
                </span>
                <span className="text-xs text-slate-500">·</span>
                <span className="text-xs font-medium text-slate-400">{featuredPost.category}</span>
              </div>

              <Link href={`/blog/${featuredPost.slug}`}>
                <h2 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-slate-100 group-hover:text-indigo-300 transition leading-snug">
                  {featuredPost.title}
                </h2>
              </Link>

              {featuredPost.subtitle && (
                <p className="mt-2 text-base text-slate-300 leading-relaxed font-sans line-clamp-2">
                  {featuredPost.subtitle}
                </p>
              )}

              <p className="mt-3 text-sm text-slate-400 leading-relaxed font-sans line-clamp-3">
                {featuredPost.excerpt}
              </p>

              {/* Author footer */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4">
                <div className="flex items-center gap-3">
                  <img
                    src={featuredPost.author.avatar || "/assets/blog/authors/mce.svg"}
                    alt={featuredPost.author.name}
                    className="h-9 w-9 rounded-full border border-slate-700 object-cover bg-slate-800"
                  />
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      {featuredPost.author.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {featuredPost.publishedAt
                        ? new Date(featuredPost.publishedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Recently published"}
                      {" · "}
                      {featuredPost.readingTimeMinutes} min read
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleShare(e, featuredPost.slug)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
                    title="Copy share link"
                  >
                    {copiedSlug === featuredPost.slug ? (
                      <CheckCircle2 size={13} className="text-emerald-400" />
                    ) : (
                      <Share2 size={13} />
                    )}
                    <span>{copiedSlug === featuredPost.slug ? "Copied" : "Share"}</span>
                  </button>

                  <Link
                    href={`/blog/${featuredPost.slug}`}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                  >
                    <span>Read full story</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </article>
          )}

          {/* Medium Feed Stream */}
          <div className="divide-y divide-slate-800/80">
            {feedPosts.map((post) => (
              <article
                key={post._id}
                className="group py-8 first:pt-0 flex flex-col-reverse sm:flex-row items-start justify-between gap-6 hover:bg-slate-900/20 px-2 rounded-xl transition"
              >
                {/* Text side */}
                <div className="flex-1 min-w-0 space-y-2.5">
                  {/* Author meta row */}
                  <div className="flex items-center gap-2.5">
                    <img
                      src={post.author.avatar || "/assets/blog/authors/mce.svg"}
                      alt={post.author.name}
                      className="h-6 w-6 rounded-full border border-slate-700 object-cover bg-slate-800"
                    />
                    <span className="text-xs font-medium text-slate-300">
                      {post.author.name}
                    </span>
                    <span className="text-slate-600 text-xs">in</span>
                    <span className="text-xs font-medium text-slate-400">{post.category}</span>
                  </div>

                  {/* Title */}
                  <Link href={`/blog/${post.slug}`} className="block">
                    <h3 className="font-serif text-xl md:text-2xl font-bold tracking-tight text-slate-100 group-hover:text-indigo-300 transition leading-snug">
                      {post.title}
                    </h3>
                  </Link>

                  {/* Excerpt */}
                  <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed font-sans">
                    {post.subtitle || post.excerpt}
                  </p>

                  {/* Bottom details */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <span>
                        {post.publishedAt
                          ? new Date(post.publishedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "Recently published"}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {post.readingTimeMinutes} min read
                      </span>

                      {post.tags.slice(0, 2).map((t, i) => (
                        <span
                          key={i}
                          className="hidden sm:inline-block rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400 border border-slate-800"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    <button
                      onClick={(e) => handleShare(e, post.slug)}
                      className="flex items-center gap-1 text-slate-500 hover:text-slate-300 transition"
                      title="Copy link"
                    >
                      {copiedSlug === post.slug ? (
                        <span className="text-emerald-400 text-[11px]">Copied!</span>
                      ) : (
                        <Share2 size={13} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Thumbnail image */}
                {post.coverImage && (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="w-full sm:w-44 sm:h-28 h-48 shrink-0 overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950 block"
                  >
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  </Link>
                )}
              </article>
            ))}
          </div>

          {feedPosts.length === 0 && (
            <div className="py-16 text-center text-slate-500">
              <p>No stories found under this topic.</p>
            </div>
          )}
        </div>

        {/* Sidebar Column (4 cols) */}
        <aside className="lg:col-span-4 space-y-8 lg:border-l lg:border-slate-800/80 lg:pl-8">
          {/* Staff Picks / Recommended */}
          <div>
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 mb-4">
              <TrendingUp size={14} className="text-indigo-400" />
              <span>Recommended Reading</span>
            </h4>
            <div className="space-y-4">
              {initialPosts.slice(0, 3).map((item) => (
                <div key={item._id} className="group">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1">
                    <img
                      src={item.author.avatar || "/assets/blog/authors/mce.svg"}
                      alt={item.author.name}
                      className="h-4 w-4 rounded-full"
                    />
                    <span>{item.author.name}</span>
                  </div>
                  <Link
                    href={`/blog/${item.slug}`}
                    className="font-serif text-sm font-semibold text-slate-200 group-hover:text-indigo-300 transition line-clamp-2"
                  >
                    {item.title}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Topics tag cloud */}
          {allTags.length > 0 && (
            <div className="border-t border-slate-800/80 pt-6">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 mb-4">
                <Tag size={13} className="text-indigo-400" />
                <span>Explore Topics</span>
              </h4>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedCategory("All")}
                    className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 transition"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Built for OBS CTA Card */}
          <div className="rounded-2xl border border-indigo-950/80 bg-gradient-to-b from-indigo-950/40 to-slate-950 p-6 text-slate-200 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
              MAKECHURCHEASY
            </span>
            <h3 className="font-serif text-lg font-bold text-slate-100 mt-1 mb-2">
              The Complete Church Presentation Dock for OBS Studio
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Multi-version Bible verses, worship lyric setlists, AI scripture detection, and animated lower thirds unified in one native dock.
            </p>
            <Link
              href="/download"
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 transition w-full"
            >
              <Download size={14} />
              <span>Download Free for OBS</span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
