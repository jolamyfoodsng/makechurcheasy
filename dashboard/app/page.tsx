import type { Metadata } from "next";
import { socialPreview, socialTitle, socialDescription } from "@/lib/social-preview";
import Homepage from "./homepage";

const title = "Church Presentation Software for OBS | MakeChurchEazy";
const description = "Present Bible verses from 10,000+ translations, compare passages, and show worship lyrics, media, lower thirds and countdowns inside OBS with MakeChurchEazy.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: socialTitle, description: socialDescription, type: "website", url: "/", siteName: "MakeChurchEazy",
    images: [socialPreview],
  },
  twitter: { card: "summary_large_image", title: socialTitle, description: socialDescription, images: [socialPreview] },
};

export default function Page() {
  return <Homepage />;
}
