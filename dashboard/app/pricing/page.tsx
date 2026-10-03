import type { Metadata } from "next";
import { socialPreview } from "@/lib/social-preview";
import { MarketingFooter, MarketingHeader } from "../marketing-shell";
import shared from "../homepage.module.css";
import PricingContent from "./PricingContent";

const description = "Compare MakeChurchEazy Free, Basic, Growth, and Pro plans. See monthly pricing for Nigeria, Africa, and global churches, plus Bible, OBS, speech-to-scripture, and multi-campus features.";

export const metadata: Metadata = {
  title: "Pricing — plans for every church media team",
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { images: [socialPreview], title: "MakeChurchEazy pricing", description, url: "/pricing" },
};

export default function PricingPage() {
  return (
    <div className={shared.home}>
      <a className={shared.skipLink} href="#main">Skip to content</a>
      <MarketingHeader />
      <PricingContent />
      <MarketingFooter />
    </div>
  );
}
