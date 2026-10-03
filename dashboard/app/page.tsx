import type { Metadata } from "next";
import Homepage from "./homepage";

const title = "Church Presentation Software for OBS | MakeChurchEazy";
const description = "Present Bible verses from 10,000+ translations, compare passages, and show worship lyrics, media, lower thirds and countdowns inside OBS with MakeChurchEazy.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title, description, type: "website", url: "/", siteName: "MakeChurchEazy",
    images: [{ url: "/og-image.jpg", width: 1376, height: 768, alt: "MakeChurchEazy church presentation software for OBS - Get Your First Month Free" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.jpg"] },
};

export default function Page() {
  return <Homepage />;
}
