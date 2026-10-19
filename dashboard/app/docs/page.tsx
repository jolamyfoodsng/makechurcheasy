import type { Metadata } from "next";
import { DocsShell } from "./DocsShell";
import { getDocNav, getDocNeighbours, getDocPage, getDocSearch } from "./docs-source";

// Every docs page is built ahead of time from content/docs/*.md.
export const dynamic = "force-static";

const page = () => getDocPage("index")!;

export function generateMetadata(): Metadata {
  const p = page();
  return {
    title: `${p.title} · Docs`,
    description: p.description,
    alternates: { canonical: "/docs" },
    openGraph: { title: `${p.title} · Docs`, description: p.description, url: "https://makechurcheazy.com/docs", type: "website", siteName: "MakeChurchEazy" },
    twitter: { card: "summary_large_image", title: `${p.title} · Docs`, description: p.description },
  };
}

export default function DocsRootPage() {
  const p = page();
  const { prev, next } = getDocNeighbours(p.slug);
  return <DocsShell page={p} nav={getDocNav()} search={getDocSearch()} prev={prev} next={next} />;
}
