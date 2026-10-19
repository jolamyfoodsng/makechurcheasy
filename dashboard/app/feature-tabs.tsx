"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import FeatureVisual from "./feature-visual";
import { presentationFeatures } from "./feature-content";
import { supportingFeatures } from "./supporting-features";
import showcase from "./media-beside-obs-showcase.module.css";
import styles from "./homepage.module.css";

const TAB_LABELS: Record<string, string> = {
  worship: "Worship lyrics",
  "lower-thirds": "Lower thirds",
  countdowns: "Tickers & countdowns",
  multiview: "Multi-view",
};

/**
 * Worship, lower thirds, tickers & countdowns and multi-view in one section: a tab each, instead of
 * four full-height blocks. "#feature-worship" style links (from elsewhere on the page) open their tab.
 */
export default function FeatureTabs() {
  const [active, setActive] = useState(supportingFeatures[0].id);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#feature-/, "");
      if (supportingFeatures.some((f) => f.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const content = supportingFeatures.find((f) => f.id === active) ?? supportingFeatures[0];
  const feature = presentationFeatures.find((f) => f.id === content.id)!;

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const i = supportingFeatures.findIndex((f) => f.id === active);
    const next = supportingFeatures[(i + (event.key === "ArrowRight" ? 1 : supportingFeatures.length - 1)) % supportingFeatures.length];
    setActive(next.id);
    document.getElementById(`feature-${next.id}`)?.focus();
  };

  return (
    <section className={`${showcase.section} ${styles.featureTabs}`} aria-labelledby="feature-tabs-heading">
      <div className={styles.featureTabsInner}>
        <h3 id="feature-tabs-heading" className={styles.visuallyHidden}>More tools for the whole service</h3>
        <div className={styles.featureTabList} role="tablist" aria-label="More tools" onKeyDown={onKey}>
          {supportingFeatures.map((f) => (
            <button
              key={f.id}
              id={`feature-${f.id}`}
              type="button"
              role="tab"
              aria-selected={active === f.id}
              aria-controls="feature-tab-panel"
              tabIndex={active === f.id ? 0 : -1}
              className={active === f.id ? styles.featureTabOn : undefined}
              onClick={() => setActive(f.id)}
            >
              {TAB_LABELS[f.id] ?? f.eyebrow}
            </button>
          ))}
        </div>

        <div id="feature-tab-panel" role="tabpanel" aria-labelledby={`feature-${content.id}`} className={styles.featureTabPanel}>
          <div className={styles.featureTabCopy}>
            <p className={showcase.eyebrow}><span aria-hidden="true" />{content.eyebrow}</p>
            <h3 className={styles.featureTabHeading}>{content.lead} <span>{content.emphasis}</span></h3>
            <p className={styles.featureTabText}>{content.description[0]}</p>
            <ul className={showcase.benefits}>
              {content.benefits.map(({ icon: Icon, text }) => (
                <li key={text}><span className={showcase.benefitIcon} aria-hidden="true"><Icon size={16} strokeWidth={1.9} /></span><span>{text}</span></li>
              ))}
            </ul>
            <Link href={`/features/${content.id}`} className={showcase.cta}>{content.linkLabel}<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className={showcase.visual}>
            <div className={showcase.screenshotStage}><FeatureVisual feature={feature} /></div>
            <p className={showcase.visualCaption}>{feature.image ? `Inside MakeChurchEazy · ${feature.label}` : "Illustrative countdown workflow"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
