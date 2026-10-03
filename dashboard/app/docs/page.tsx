import type { Metadata } from "next";
import { DocsClient } from "./DocsClient";

export const metadata: Metadata = {
  title: "MakeChurchEazy Documentation | Setup & OBS Guides",
  description:
    "Complete step-by-step documentation for MakeChurchEazy: installing desktop apps, OBS Studio browser source setup, scripture search, EasyWorship song imports, and mobile remote control.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "MakeChurchEazy Documentation | Church Presentation & OBS",
    description:
      "Step-by-step setup guides for church presentation, OBS Studio livestreaming, and scripture projection.",
    url: "https://makechurcheazy.com/docs",
    type: "website",
  },
};

export default function DocsPage() {
  return <DocsClient />;
}
