import type { Metadata } from "next";
import { MarketingFooter, MarketingHeader } from "../marketing-shell";
import shared from "../homepage.module.css";
import PricingContent from "./PricingContent";

const title = "Pricing — Simple plans for every church media team | MakeChurchEazy";
const description = "Compare MakeChurchEazy Free, Basic, Growth, and Pro plans. See monthly pricing for Nigeria in NGN, African countries in local currency/USD, and global markets in USD.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/pricing",
    images: [{ url: "/og-image.jpg", width: 1376, height: 768, alt: "MakeChurchEazy Pricing Plans" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.jpg"],
  },
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
