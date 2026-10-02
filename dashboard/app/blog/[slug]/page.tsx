import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Share2,
  Calendar,
  Sparkles,
  Download,
  BookOpen,
} from "lucide-react";
import { MarketingHeader, MarketingFooter } from "../../marketing-shell";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import { ShareBar } from "./ShareBar";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3004";

async function getPost(slug: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/blog/${slug}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      return data.post || null;
    }
  } catch (err) {
    console.warn("Failed to fetch post by slug:", err);
  }
  return null;
}

async function getRelatedPosts(currentSlug: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/blog?limit=4`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      return (data.posts || []).filter((p: any) => p.slug !== currentSlug).slice(0, 3);
    }
  } catch {
    // ignore
  }
  return [];
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return {
      title: "Story Not Found | MakeChurchEasy Blog",
    };
  }

  const title = `${post.title} | MakeChurchEasy`;
  const description = post.subtitle || post.excerpt;
  const url = `https://makechurcheazy.com/blog/${post.slug}`;
  const images = post.coverImage
    ? [
        {
          url: post.coverImage.startsWith("http")
            ? post.coverImage
            : `https://makechurcheazy.com${post.coverImage}`,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ]
    : [];

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      publishedTime: post.publishedAt || post.createdAt,
      authors: [post.author?.name || "MakeChurchEasy Team"],
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((i) => i.url),
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = await getRelatedPosts(slug);

  const formattedDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : new Date(post.createdAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

  // JSON-LD Structured Data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.subtitle || post.excerpt,
    image: post.coverImage ? [post.coverImage] : undefined,
    datePublished: post.publishedAt || post.createdAt,
    dateModified: post.updatedAt || post.createdAt,
    author: {
      "@type": "Person",
      name: post.author?.name || "MakeChurchEasy Editorial",
    },
    publisher: {
      "@type": "Organization",
      name: "MakeChurchEasy",
      logo: {
        "@type": "ImageObject",
        url: "https://makechurcheazy.com/logos/make_church_easy_logo.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://makechurcheazy.com/blog/${post.slug}`,
    },
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <MarketingHeader />

      <main className="flex-1 py-12 px-4 sm:px-6">
        {/* Medium-style reading container: max-w-[740px] */}
        <article className="mx-auto max-w-[740px]">
          {/* Back link */}
          <div className="mb-8">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-indigo-400 transition"
            >
              <ArrowLeft size={14} />
              <span>Back to all stories</span>
            </Link>
          </div>

          {/* Category Pill */}
          <div className="mb-4">
            <span className="inline-block rounded-full bg-indigo-950/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-400 border border-indigo-800/50">
              {post.category || "Church Tech"}
            </span>
          </div>

          {/* Story Title */}
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-100 leading-[1.18]">
            {post.title}
          </h1>

          {/* Subtitle */}
          {post.subtitle && (
            <p className="mt-4 text-lg sm:text-xl text-slate-300 font-sans leading-relaxed font-light">
              {post.subtitle}
            </p>
          )}

          {/* Medium Author Row */}
          <div className="my-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-y border-slate-800/80 py-4">
            <div className="flex items-center gap-3.5">
              <img
                src={post.author?.avatar || "/assets/blog/authors/mce.svg"}
                alt={post.author?.name || "Author"}
                className="h-11 w-11 rounded-full border border-slate-700 object-cover bg-slate-800 shadow-sm"
              />
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  {post.author?.name || "MakeChurchEasy Team"}
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>{post.author?.role || "Editorial Team"}</span>
                  <span>·</span>
                  <span>{formattedDate}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-indigo-400">
                    <Clock size={11} /> {post.readingTimeMinutes} min read
                  </span>
                </div>
              </div>
            </div>

            {/* Share and Bookmark Bar */}
            <ShareBar title={post.title} slug={post.slug} />
          </div>

          {/* Cover Image */}
          {post.coverImage && (
            <figure className="mb-10">
              <img
                src={post.coverImage}
                alt={post.title}
                className="w-full rounded-2xl border border-slate-800/80 object-cover max-h-[480px] shadow-2xl"
              />
            </figure>
          )}

          {/* Article Markdown Body */}
          <div className="prose-container">
            <MarkdownRenderer content={post.content || post.excerpt} />
          </div>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-6">
              <span className="text-xs font-semibold text-slate-400 mr-1">Tags:</span>
              {post.tags.map((tag: string, i: number) => (
                <span
                  key={i}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs text-slate-300 border border-slate-800 hover:border-slate-700 transition"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Author Bio Box (Medium Style) */}
          <div className="mt-12 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 md:p-8 flex flex-col sm:flex-row items-start gap-5">
            <img
              src={post.author?.avatar || "/assets/blog/authors/mce.svg"}
              alt={post.author?.name}
              className="h-16 w-16 rounded-full border border-slate-700 object-cover bg-slate-800 shrink-0"
            />
            <div className="flex-1 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                WRITTEN BY
              </div>
              <h3 className="font-serif text-lg font-bold text-slate-200">
                {post.author?.name || "MakeChurchEasy Team"}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-sans">
                {post.author?.role
                  ? `${post.author.role} at MakeChurchEasy.`
                  : "Part of the MakeChurchEasy team."}{" "}
                Dedicated to helping church media directors and volunteers prepare and broadcast Sunday services with confidence.
              </p>
              <div className="pt-2">
                <Link
                  href="/download"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  <span>Explore MakeChurchEasy presentation dock</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </article>

        {/* Related Stories */}
        {relatedPosts.length > 0 && (
          <section className="mx-auto max-w-5xl mt-20 border-t border-slate-800/80 pt-12">
            <h3 className="font-serif text-2xl font-bold text-slate-200 mb-8">
              More from MakeChurchEasy
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedPosts.map((rel: any) => (
                <Link
                  key={rel._id}
                  href={`/blog/${rel.slug}`}
                  className="group rounded-xl border border-slate-800 bg-slate-900/30 p-5 hover:border-slate-700 hover:bg-slate-900/60 transition flex flex-col justify-between"
                >
                  <div>
                    {rel.coverImage && (
                      <div className="overflow-hidden rounded-lg mb-4 h-36">
                        <img
                          src={rel.coverImage}
                          alt={rel.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    )}
                    <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                      {rel.category}
                    </span>
                    <h4 className="font-serif text-base font-semibold text-slate-200 group-hover:text-indigo-300 transition mt-1 line-clamp-2">
                      {rel.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                      {rel.subtitle || rel.excerpt}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{rel.readingTimeMinutes} min read</span>
                    <span className="font-medium text-slate-400 group-hover:text-slate-200">
                      Read story →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <MarketingFooter />
    </div>
  );
}
