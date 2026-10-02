import type { Metadata } from "next";
import { MarketingHeader, MarketingFooter } from "../marketing-shell";
import { BlogFeedClient, BlogPostFeedItem } from "./components/BlogFeedClient";
import styles from "../homepage.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stories & Guides for Church Media Teams",
  description:
    "Practical guides, workflows, and tutorials on church presentation, Bible slides, OBS Studio, and worship production.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "MakeChurchEasy Blog — Church Presentation & OBS Workflows",
    description:
      "Explore articles and workflows for church media teams and Sunday broadcasts.",
    url: "https://makechurcheazy.com/blog",
  },
};

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3004";

async function getPublishedPosts(): Promise<BlogPostFeedItem[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/blog?limit=50`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      return data.posts || [];
    }
  } catch (err) {
    console.warn("Failed to fetch blog posts from backend:", err);
  }
  return [];
}

export default async function BlogPage() {
  const posts = await getPublishedPosts();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <MarketingHeader />

      <main className="flex-1">
        {/* Medium-style Publication Masthead */}
        <section className="border-b border-slate-800/80 bg-gradient-to-b from-slate-900/40 via-slate-950 to-slate-950 py-16 px-4 sm:px-6 lg:px-8 text-center">
          <div className="mx-auto max-w-3xl">
            <span className="inline-block rounded-full bg-indigo-950/80 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-400 border border-indigo-800/50 mb-4">
              Stories & Workflows
            </span>
            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-100 leading-tight">
              The Church Media Journal
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-400 leading-relaxed font-sans max-w-2xl mx-auto">
              Practical guides, Sunday preparation workflows, and production insights designed for the teams behind the service.
            </p>
          </div>
        </section>

        {/* Feed & Interactive Feed Client */}
        <BlogFeedClient initialPosts={posts} />
      </main>

      <MarketingFooter />
    </div>
  );
}
