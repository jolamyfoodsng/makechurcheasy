"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import styles from "../blog.module.css";

export interface BlogPostFeedItem {
  _id: string; slug: string; title: string; subtitle?: string; excerpt: string; content?: string;
  coverImage?: string; category: string; tags: string[];
  author: { name: string; avatar?: string; role?: string };
  status: "published" | "draft" | "archived"; featured?: boolean;
  readingTimeMinutes: number; publishedAt?: string | null; createdAt: string;
}

function Author({ post }: { post: BlogPostFeedItem }) {
  return <div className={styles.author}><img className={styles.avatar} src={post.author?.avatar || "/assets/blog/authors/mce.svg"} alt="" width={28} height={28} /><span>{post.author?.name || "MakeChurchEazy Team"}</span></div>;
}
function Meta({ post }: { post: BlogPostFeedItem }) {
  const date = new Date(post.publishedAt || post.createdAt);
  return <div className={styles.meta}>{!Number.isNaN(date.getTime()) && <time dateTime={date.toISOString()}>{date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>}<span>·</span><span>{Math.max(1, post.readingTimeMinutes || 1)} min read</span>{post.category && <><span>·</span><span>{post.category}</span></>}</div>;
}

export function BlogFeedClient({ initialPosts, initialTopic = "", unavailable = false }: { initialPosts: BlogPostFeedItem[]; initialTopic?: string; unavailable?: boolean }) {
  const [category, setCategory] = useState("All");
  const [topic, setTopic] = useState(initialTopic);
  const [query, setQuery] = useState("");
  const categories = useMemo(() => ["All", ...new Set(initialPosts.map(p => p.category).filter(Boolean))], [initialPosts]);
  const tags = useMemo(() => [...new Set(initialPosts.flatMap(p => p.tags || []))].slice(0, 12), [initialPosts]);
  const filtered = useMemo(() => initialPosts.filter(p => (category === "All" || p.category === category) && (!topic || p.tags?.includes(topic)) && `${p.title} ${p.subtitle || ""} ${p.excerpt} ${p.author?.name || ""} ${(p.tags || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())), [initialPosts, category, topic, query]);
  const isFiltered = category !== "All" || !!topic || !!query.trim();
  const featured = !isFiltered ? filtered.find(p => p.featured) || filtered[0] : undefined;
  const stories = filtered.filter(p => p.slug !== featured?.slug);
  const reset = () => { setCategory("All"); setTopic(""); setQuery(""); };
  return <div className={styles.feed}>
    <div className={styles.toolbar}>
      <nav className={styles.topics} aria-label="Article categories">{categories.map(cat => <button key={cat} type="button" className={styles.topic} aria-pressed={category === cat} onClick={() => { setCategory(cat); setTopic(""); }}>{cat === "All" ? "All stories" : cat}</button>)}</nav>
      <label className={styles.search}><Search size={18} aria-hidden="true"/><input type="search" aria-label="Search articles" placeholder="Search stories and guides" value={query} onChange={e => setQuery(e.target.value)}/></label>
    </div>
    <div className={styles.layout}>
      <div>
        {isFiltered && <div className={styles.resultSummary}><span role="status">{filtered.length} {filtered.length === 1 ? "story" : "stories"}{topic ? ` about ${topic}` : ""}</span><button type="button" className={styles.textButton} onClick={reset}>Clear filters</button></div>}
        {featured && <article className={styles.featured}>
          <p className={styles.eyebrow}>{featured.featured ? "Featured story" : "Latest story"}</p>
          {featured.coverImage && <Link href={`/blog/${featured.slug}`} className={styles.cover} style={{marginTop: 20}} aria-label={`Read ${featured.title}`}><img src={featured.coverImage} alt="" fetchPriority="high"/></Link>}
          <Author post={featured}/><h2 className={styles.storyTitle}><Link href={`/blog/${featured.slug}`}>{featured.title}</Link></h2><p className={styles.excerpt}>{featured.subtitle || featured.excerpt}</p><Meta post={featured}/>
        </article>}
        {stories.map(post => <article className={styles.story} key={post.slug}>
          <div className={styles.storyText}><Author post={post}/><h2 className={styles.storyTitle}><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2><p className={styles.excerpt}>{post.subtitle || post.excerpt}</p><Meta post={post}/></div>
          {post.coverImage && <Link href={`/blog/${post.slug}`} className={styles.thumbnail} tabIndex={-1} aria-hidden="true"><img src={post.coverImage} alt="" loading="lazy"/></Link>}
        </article>)}
        {!filtered.length && <div className={styles.empty}><h2>{unavailable ? "Stories are temporarily unavailable" : isFiltered ? "No stories found" : "Our next story is on its way"}</h2><p>{unavailable ? "Please try again shortly. You can still explore our tutorials and presentation guides." : isFiltered ? "Try a different search or clear your filters to see all stories." : "Explore our tutorials while we prepare more practical guides for your church media team."}</p>{isFiltered ? <button type="button" onClick={reset} className={styles.textButton}>Show all stories</button> : <Link href="/tutorials" className={styles.primaryLink}>Explore tutorials <ArrowRight size={16}/></Link>}</div>}
      </div>
      <aside className={styles.sidebar} aria-label="More from the journal">
        {initialPosts.length > 0 && <section><h2>Worth a read</h2><ul className={styles.picks}>{initialPosts.filter(p => p.slug !== featured?.slug).slice(0,3).map(p => <li key={p.slug}><Author post={p}/><Link href={`/blog/${p.slug}`}>{p.title}</Link></li>)}</ul></section>}
        {tags.length > 0 && <section><h2>Explore a topic</h2><div className={styles.tags}>{tags.map(tag => <button type="button" key={tag} className={styles.tag} aria-pressed={topic === tag} onClick={() => { setTopic(topic === tag ? "" : tag); setCategory("All"); }}>{tag}</button>)}</div></section>}
        <section><p className={styles.eyebrow}>Made for the team behind Sunday</p><h2 style={{marginTop:16}}>Bring your presentation into OBS.</h2><p>Keep scripture, worship lyrics, and service media together with MakeChurchEazy.</p><Link href="/download" className={styles.primaryLink}>Explore MakeChurchEazy <ArrowRight size={16}/></Link></section>
      </aside>
    </div>
  </div>;
}
