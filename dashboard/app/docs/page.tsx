import type { Metadata } from "next";
import { DocsShell } from "./DocsShell";
import { DOC_PAGES } from "./docs-data";

export const metadata: Metadata = {
  title: DOC_PAGES.overview.seoTitle,
  description: DOC_PAGES.overview.description,
  keywords: DOC_PAGES.overview.keywords,
  alternates: { canonical: "/docs" },
  openGraph: {
    title: DOC_PAGES.overview.seoTitle,
    description: DOC_PAGES.overview.description,
    url: "https://makechurcheazy.com/docs",
    type: "website",
    siteName: "MakeChurchEazy",
    images: [
      {
        url: "/og-image.jpg",
        width: 1376,
        height: 768,
        alt: "MakeChurchEazy Documentation — Church Presentation & OBS Studio Guides",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DOC_PAGES.overview.seoTitle,
    description: DOC_PAGES.overview.description,
  },
};

export default function DocsRootPage() {
  return <DocsShell page={DOC_PAGES.overview} />;
}
