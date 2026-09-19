import Footer from "@/app/_components/footer";
import Header from "@/app/_components/header";
import {
  COMPANY_URL,
  HOME_OG_IMAGE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/constants";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} Blog`,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: `${SITE_NAME} Blog`,
  description: SITE_DESCRIPTION,
  keywords: [
    "church media",
    "Bible presentation",
    "worship lyrics",
    "OBS church streaming",
    "vMix church streaming",
    "church presentation software",
  ],
  authors: [{ name: SITE_NAME, url: COMPANY_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: `${SITE_NAME} Blog`,
    locale: "en_GB",
    title: `${SITE_NAME} Blog`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: HOME_OG_IMAGE_URL,
        width: 1300,
        height: 630,
        alt: `${SITE_NAME} Blog`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} Blog`,
    description: SITE_DESCRIPTION,
    images: [HOME_OG_IMAGE_URL],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/favicon/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon/favicon-16x16.png"
        />
        <link rel="manifest" href="/favicon/site.webmanifest" />
        <link
          rel="mask-icon"
          href="/favicon/safari-pinned-tab.svg"
          color="#000000"
        />
        <link rel="shortcut icon" href="/favicon/favicon.ico" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta
          name="msapplication-config"
          content="/favicon/browserconfig.xml"
        />
        <meta name="theme-color" content="#000" />
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
      </head>
      <body
        className={inter.className}
      >
        <div className="site-shell">
          <Header />
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
