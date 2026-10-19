import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDocMarkdown, type DocBlock, type DocSection } from "./docs-markdown";

/**
 * docs-source.ts — the docs pages are Markdown files in content/docs/ (one file per page; the file
 * name is the URL: worship.md → /docs/worship, index.md → /docs). They are read when the site is
 * built, so editing a page never needs a code change.
 */
const DOCS_DIR = path.join(process.cwd(), "content", "docs");

/** Sidebar groups, in this order. A page's "group" in its front matter puts it in one. */
export const DOC_GROUPS = ["Start here", "Present on Sunday", "Set up", "Help"] as const;

export interface DocPage {
  slug: string;
  href: string;
  title: string;
  nav: string;
  description: string;
  group: string;
  order: number;
  updated: string;
  readingTime: string;
  intro: DocBlock[];
  sections: DocSection[];
  /** The page's Markdown, for "Copy as Markdown" / "View Markdown". */
  markdown: string;
}

export interface DocNavGroup {
  title: string;
  items: { slug: string; href: string; title: string }[];
}

export interface DocSearchEntry {
  href: string;
  pageTitle: string;
  sectionTitle: string;
  text: string;
}

let cache: { pages: DocPage[]; search: DocSearchEntry[] } | null = null;

function load() {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md")).sort();
  const search: DocSearchEntry[] = [];
  const pages = files.map((file) => {
    const slug = file.replace(/\.md$/, "");
    const markdown = readFileSync(path.join(DOCS_DIR, file), "utf8");
    const doc = parseDocMarkdown(markdown, slug);
    const href = slug === "index" ? "/docs" : `/docs/${slug}`;
    search.push({ href, pageTitle: doc.meta.title, sectionTitle: "", text: doc.meta.description });
    for (const s of doc.text) search.push({ href: `${href}#${s.id}`, pageTitle: doc.meta.title, sectionTitle: s.title, text: s.text });
    return {
      slug,
      href,
      title: doc.meta.title,
      nav: doc.meta.nav,
      description: doc.meta.description,
      group: doc.meta.group,
      order: doc.meta.order,
      updated: doc.meta.updated,
      readingTime: `${Math.max(1, Math.round(doc.words / 200))} min read`,
      intro: doc.intro,
      sections: doc.sections,
      markdown: markdown.replace(/^---[\s\S]*?\n---\n?/, "").trim(),
    } satisfies DocPage;
  });
  const groupIndex = (g: string) => {
    const i = (DOC_GROUPS as readonly string[]).indexOf(g);
    return i < 0 ? DOC_GROUPS.length : i;
  };
  pages.sort((a, b) => groupIndex(a.group) - groupIndex(b.group) || a.order - b.order || a.title.localeCompare(b.title));
  cache = { pages, search };
  return cache;
}

export function getDocPages(): DocPage[] {
  return load().pages;
}

export function getDocPage(slug: string): DocPage | undefined {
  return load().pages.find((p) => p.slug === slug);
}

export function getDocNav(): DocNavGroup[] {
  const groups = new Map<string, DocNavGroup>();
  for (const p of load().pages) {
    if (!groups.has(p.group)) groups.set(p.group, { title: p.group, items: [] });
    groups.get(p.group)!.items.push({ slug: p.slug, href: p.href, title: p.nav });
  }
  return [...groups.values()];
}

export function getDocSearch(): DocSearchEntry[] {
  return load().search;
}

/** Previous and next page in sidebar order. */
export function getDocNeighbours(slug: string): { prev?: { href: string; title: string }; next?: { href: string; title: string } } {
  const pages = load().pages;
  const i = pages.findIndex((p) => p.slug === slug);
  const pick = (p?: DocPage) => (p ? { href: p.href, title: p.nav } : undefined);
  return { prev: pick(pages[i - 1]), next: pick(pages[i + 1]) };
}
