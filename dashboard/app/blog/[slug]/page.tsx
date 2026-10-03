import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import home from "../../homepage.module.css";
import styles from "../blog.module.css";
import { ReadingProgress } from "./ReadingProgress";
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
      title: "Story Not Found | MakeChurchEazy Blog",
    };
  }

  const title = `${post.title} | MakeChurchEazy`;
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
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      publishedTime: post.publishedAt || post.createdAt,
      authors: [post.author?.name || "MakeChurchEazy Team"],
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
      name: post.author?.name || "MakeChurchEazy Editorial",
    },
    publisher: {
      "@type": "Organization",
      name: "MakeChurchEazy",
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

  return <div className={`${home.home} ${styles.journal}`}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <a href="#article-main" className={home.skipLink}>Skip to article</a>
    <ReadingProgress />
    <MarketingHeader />
    <main id="article-main" className={styles.articleMain}>
      <article className={styles.article} id="story-content">
        <Link href="/blog" className={styles.back}><ArrowLeft size={16}/> All stories</Link>
        <header>
          <p className={styles.eyebrow}>{post.category || "Church media"}</p>
          <h1 className={styles.articleTitle}>{post.title}</h1>
          {(post.subtitle || post.excerpt) && <p className={styles.subtitle}>{post.subtitle || post.excerpt}</p>}
          <div className={styles.byline}>
            <img className={styles.avatar} src={post.author?.avatar || "/assets/blog/authors/mce.svg"} alt="" width={44} height={44}/>
            <div><p>{post.author?.name || "MakeChurchEazy Team"}</p><div className={styles.meta}><time dateTime={post.publishedAt || post.createdAt}>{formattedDate}</time><span>·</span><span>{Math.max(1, post.readingTimeMinutes || 1)} min read</span></div></div>
          </div>
          <ShareBar title={post.title} slug={post.slug}/>
        </header>
        {post.coverImage && <figure className={styles.articleCover}><img src={post.coverImage} alt={post.title}/></figure>}
        <MarkdownRenderer content={post.content || post.excerpt} className={styles.body}/>
        <footer className={styles.articleEnd}>
          <div className={styles.tags}>{(post.tags || []).map((tag: string) => <Link key={tag} href={`/blog?topic=${encodeURIComponent(tag)}`} className={styles.tag}>{tag}</Link>)}</div>
          <h2>Written by {post.author?.name || "MakeChurchEazy Team"}</h2>
          {post.author?.role && <p>{post.author.role}</p>}
          <p>More practical stories and guides for the people behind the service.</p>
          <Link className={styles.primaryLink} href="/blog">Explore the journal <span aria-hidden="true">→</span></Link>
        </footer>
      </article>
      {relatedPosts.length > 0 && <section className={styles.related} aria-labelledby="related-heading"><h2 id="related-heading">Keep reading</h2><div className={styles.relatedGrid}>{relatedPosts.map((rel: any) => <article key={rel._id}>
        {rel.coverImage && <Link href={`/blog/${rel.slug}`} className={styles.cover} tabIndex={-1} aria-hidden="true"><img src={rel.coverImage} alt="" loading="lazy"/></Link>}
        <span className={styles.eyebrow}>{rel.category}</span><h3><Link href={`/blog/${rel.slug}`}>{rel.title}</Link></h3><p>{rel.subtitle || rel.excerpt}</p><div className={styles.meta}>{Math.max(1,rel.readingTimeMinutes || 1)} min read</div>
      </article>)}</div></section>}
    </main>
    <MarketingFooter />
  </div>;
}
