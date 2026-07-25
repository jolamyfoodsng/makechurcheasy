import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import I18nProvider from "@/i18n/provider";
import { isValidLocale, DEFAULT_LOCALE } from "@/i18n/routing";
import { getInitialMongoUser } from "@/lib/serverAuth";

export const metadata: Metadata = {
  title: {
    default: "MakeChurchEasy | Church Presentation Software for OBS",
    template: "%s | MakeChurchEasy",
  },
  description:
    "MakeChurchEasy is an all-in-one church presentation and OBS software for displaying Bible verses, worship lyrics, media, lower thirds, announcements, AI tools, and livestream graphics.",
  keywords: [
    "church presentation software",
    "OBS Studio church",
    "Bible verse display",
    "worship lyrics software",
    "church lower thirds",
    "livestream graphics",
    "church media management",
    "sermon transcription",
    "live translation church",
    "church broadcasting software",
    "OBS plugin church",
    "church announcements display",
  ],
  authors: [{ name: "MakeChurchEasy" }],
  creator: "MakeChurchEasy",
  publisher: "MakeChurchEasy",
  metadataBase: new URL("https://makechurcheasy.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://makechurcheasy.com",
    siteName: "MakeChurchEasy",
    title: "MakeChurchEasy | Church Presentation Software for OBS",
    description:
      "MakeChurchEasy is an all-in-one church presentation and OBS software for displaying Bible verses, worship lyrics, media, lower thirds, announcements, AI tools, and livestream graphics.",
    images: [
      {
        url: "/logos/make_church_easy_logo.png",
        width: 1200,
        height: 630,
        alt: "MakeChurchEasy — Church Presentation Software for OBS Studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MakeChurchEasy | Church Presentation Software for OBS",
    description:
      "All-in-one church presentation and OBS software for Bible verses, worship lyrics, media, lower thirds, AI tools, and livestream graphics.",
    images: ["/logos/make_church_easy_logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    other: [
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = isValidLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;
  const initialMongoUser = await getInitialMongoUser();

  let messages: Record<string, unknown> = {};
  try {
    messages = (await import(`@/locales/${locale}.json`)).default;
  } catch {
    messages = (await import("@/locales/en.json")).default;
  }

  return (
    <html lang={locale} className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.classList.toggle('dark', dark);
                document.documentElement.classList.toggle('light', !dark);
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-white antialiased">
        <I18nProvider locale={locale} messages={messages}>
          <AuthProvider initialMongoUser={initialMongoUser}>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
