import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsShell } from "../DocsShell";
import { DOC_PAGES } from "../docs-data";

type Props = {
  params: Promise<{ slug: string }>;
};

const SUBPAGE_SLUGS = [
  "obs-setup",
  "scripture-engine",
  "worship-lyrics",
  "multiview-production",
  "stage-display",
  "hardware-projection",
  "troubleshooting",
];

export function generateStaticParams() {
  return SUBPAGE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = DOC_PAGES[slug];

  if (!page) {
    return {
      title: "Document Not Found | MakeChurchEazy Docs",
      description: "The requested documentation guide could not be located.",
    };
  }

  return {
    title: page.seoTitle,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical: `/docs/${slug}` },
    openGraph: {
      title: page.seoTitle,
      description: page.description,
      url: `https://makechurcheazy.com/docs/${slug}`,
      type: "article",
      siteName: "MakeChurchEazy",
      images: [
        {
          url: "/og-image.jpg",
          width: 1376,
          height: 768,
          alt: `${page.title} — MakeChurchEazy Documentation`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.seoTitle,
      description: page.description,
    },
  };
}

export default async function DocSubPage({ params }: Props) {
  const { slug } = await params;
  const page = DOC_PAGES[slug];

  if (!page) {
    notFound();
  }

  return <DocsShell page={page} />;
}
