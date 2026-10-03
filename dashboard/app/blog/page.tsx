import type { Metadata } from "next";
import { MarketingHeader, MarketingFooter } from "../marketing-shell";
import { BlogFeedClient, BlogPostFeedItem } from "./components/BlogFeedClient";
import home from "../homepage.module.css";
import styles from "./blog.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "The MakeChurchEazy Journal | Church Media Guides" },
  description:
    "Practical guides, workflows, and tutorials on church presentation, Bible slides, OBS Studio, and worship production.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "MakeChurchEazy Journal — Church Presentation & OBS Workflows",
    description:
      "Explore articles and workflows for church media teams and Sunday broadcasts.",
    url: "https://makechurcheazy.com/blog",
  },
};

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3004";

async function getPublishedPosts(): Promise<{ posts: BlogPostFeedItem[]; unavailable: boolean }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/blog?limit=50`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      return { posts: data.posts || [], unavailable: false };
    }
  } catch (err) {
    console.warn("Failed to fetch blog posts from backend:", err);
  }
  return { posts: [], unavailable: true };
}

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const [{ posts, unavailable }, { topic }] = await Promise.all([getPublishedPosts(), searchParams]);
  return <div className={`${home.home} ${styles.journal}`}>
    <a href="#journal-main" className={home.skipLink}>Skip to stories</a>
    <MarketingHeader />
    <main id="journal-main">
      <header className={styles.masthead}>
        <p className={styles.eyebrow}>The MakeChurchEazy journal</p>
        <h1>For the people<br />behind the service.</h1>
        <p className={styles.intro}>Practical ideas, thoughtful guides, and better ways to bring your church’s message to the screen.</p>
      </header>
      <BlogFeedClient initialPosts={posts} initialTopic={topic} unavailable={unavailable} />
    </main>
    <MarketingFooter />
  </div>;
}
