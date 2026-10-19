import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsShell } from "../DocsShell";
import { getDocNav, getDocNeighbours, getDocPage, getDocPages, getDocSearch } from "../docs-source";

type Props = { params: Promise<{ slug: string }> };

// Every docs page is built ahead of time from content/docs/*.md.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getDocPages().filter((p) => p.slug !== "index").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = getDocPage(slug);
  if (!p || slug === "index") return { title: "Page not found · Docs" };
  const title = `${p.title} · Docs`;
  return {
    title,
    description: p.description,
    alternates: { canonical: `/docs/${slug}` },
    openGraph: { title, description: p.description, url: `https://makechurcheazy.com/docs/${slug}`, type: "article", siteName: "MakeChurchEazy" },
    twitter: { card: "summary_large_image", title, description: p.description },
  };
}

export default async function DocSubPage({ params }: Props) {
  const { slug } = await params;
  const p = getDocPage(slug);
  if (!p || slug === "index") notFound();
  const { prev, next } = getDocNeighbours(p.slug);
  return <DocsShell page={p} nav={getDocNav()} search={getDocSearch()} prev={prev} next={next} />;
}
