import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { presentationFeatures } from "../feature-content";
import FeatureVisual from "../feature-visual";
import { MarketingHeader, MarketingFooter } from "../marketing-shell";
import styles from "../homepage.module.css";

export const metadata: Metadata = {
  title: "Explore church presentation features",
  description: "Explore Bible, worship lyrics, media, lower thirds, tickers, countdowns, multi-view and Verse AI in MakeChurchEazy.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return <div className={styles.home}>
    <a className={styles.skipLink} href="#main">Skip to content</a><MarketingHeader />
    <main id="main">
      <section className={styles.directoryIntro}><p className={styles.eyebrow}>THE MAKECHURCHEAZY TOOLKIT</p><h1>Every part of your service.<br /><span>One familiar workspace.</span></h1><p>From the first song to the final amen. Explore the tools that bring your church presentation together inside OBS.</p></section>
      <section className={styles.featureDirectory} aria-label="All presentation features">
        <div className={styles.featureCards}>{presentationFeatures.map(feature => <Link key={feature.id} href={`/features/${feature.id}`} className={styles.featureCard}><div className={styles.cardVisual}><FeatureVisual feature={feature} /></div><div className={styles.cardBody}><p>{feature.label}</p><h2>{feature.title.replace("\n", " ")}</h2><p className={styles.cardDescription}>{feature.copy}</p><span>Explore {feature.label} <ArrowRight size={17} /></span></div></Link>)}</div>
        <p className={styles.availability}>Feature availability and limits vary by plan. <Link href="/pricing">Compare plans <ArrowRight size={13} /></Link></p>
      </section>
      <section className={styles.detailCta}><div><p className={styles.eyebrow}>LESS SETUP. MORE SERVICE.</p><h2>Ready for your next Sunday?</h2></div><Link href="/download" className={styles.lightButton}><Download size={18} /> Download MakeChurchEazy</Link></section>
    </main><MarketingFooter />
  </div>;
}
