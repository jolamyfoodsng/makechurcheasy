import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Download } from "lucide-react";
import { getPresentationFeature, presentationFeatures } from "../../feature-content";
import FeatureVisual from "../../feature-visual";
import { MarketingFooter, MarketingHeader } from "../../marketing-shell";
import styles from "../../homepage.module.css";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return presentationFeatures.map(feature => ({ slug: feature.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const feature = getPresentationFeature((await params).slug);
  if (!feature) return {};
  return {
    title: `${feature.label} for your church presentation`,
    description: feature.copy,
    alternates: { canonical: `/features/${feature.id}` },
    openGraph: { title: `${feature.label} | MakeChurchEazy`, description: feature.copy, url: `/features/${feature.id}` },
  };
}

export default async function FeaturePage({ params }: Props) {
  const feature = getPresentationFeature((await params).slug);
  if (!feature) notFound();
  const index = presentationFeatures.indexOf(feature);
  const related = [1, 2, 3].map(offset => presentationFeatures[(index + offset) % presentationFeatures.length]);

  return <div className={styles.home}>
    <a className={styles.skipLink} href="#main">Skip to content</a>
    <MarketingHeader />
    <main id="main">
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/features">Features</Link><span>/</span><span aria-current="page">{feature.label}</span></nav>
      <section className={styles.detailHero}>
        <div className={styles.detailVisual}><FeatureVisual feature={feature} priority /><p>{feature.image ? "Inside MakeChurchEazy" : "Illustrative example"}</p></div>
        <div className={styles.detailIntro}>
          <span className={styles.featureBadge}>FEATURE / {feature.label.toUpperCase()}</span>
          <h1>{feature.title}</h1>
          <p>{feature.copy}</p>
          <Link href="/download" className={styles.button}><Download size={18} /> Get MakeChurchEazy</Link>
          <a href="#feature-guide" className={styles.textLink}>See how it works <ArrowRight size={17} /></a>
        </div>
      </section>
      <div className={styles.detailHighlights}>{feature.highlights.map(highlight => <span key={highlight}><Check size={17} />{highlight}</span>)}</div>

      <section className={styles.detailGuide} id="feature-guide">
        <div className={styles.guideHeading}><p className={styles.eyebrow}>A LITTLE PREPARATION. A SMOOTHER SERVICE.</p><h2>Make it part<br />of your workflow.</h2><p>{feature.note}</p></div>
        <div className={styles.guideSteps}>{feature.steps.map((step, i) => <article key={step.title}><span>0{i + 1}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div></article>)}</div>
      </section>

      <section className={`${styles.section} ${styles.faqSection} ${styles.detailFaq}`}>
        <div><p className={styles.eyebrow}>GOOD TO KNOW</p><h2>Your questions,<br />answered.</h2><Link href="/tutorials" className={styles.textLink}>Watch the tutorials <ArrowRight size={17} /></Link></div>
        <div className={styles.faqList}>{feature.questions.map(item => <details key={item.q}><summary>{item.q}<ChevronDown size={20} /></summary><p>{item.a}</p></details>)}<p className={styles.featurePlanNote}>Feature availability and limits vary by plan. <Link href="/pricing">Compare current plans.</Link></p></div>
      </section>

      <section className={styles.relatedSection}>
        <div className={styles.galleryHeading}><div><p className={styles.eyebrow}>KEEP EXPLORING</p><h2>More for your service.</h2></div><Link href="/features" className={styles.textLink}>All features <ArrowRight size={17} /></Link></div>
        <div className={styles.featureCards}>{related.map(item => <Link href={`/features/${item.id}`} className={styles.featureCard} key={item.id}><div className={styles.cardVisual}><FeatureVisual feature={item} /></div><div className={styles.cardBody}><p>{item.label}</p><h3>{item.title.replace("\n", " ")}</h3><span>Explore {item.label} <ArrowRight size={17} /></span></div></Link>)}</div>
      </section>
      <section className={styles.detailCta}><div><p className={styles.eyebrow}>FOR THE PEOPLE BEHIND THE SERVICE</p><h2>Make your next service Eazier.</h2></div><Link href="/download" className={styles.lightButton}><Download size={18} /> Download MakeChurchEazy</Link></section>
    </main>
    <MarketingFooter />
  </div>;
}
