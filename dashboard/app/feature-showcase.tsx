import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import styles from "./media-beside-obs-showcase.module.css";

type FeatureShowcaseProps = {
  id: string;
  eyebrow: string;
  heading: ReactNode;
  description: string[];
  benefits: { icon: LucideIcon; text: string }[];
  microcopy: string;
  href: string;
  linkLabel: string;
  reverse?: boolean;
  children: ReactNode;
};

export default function FeatureShowcase({ id, eyebrow, heading, description, benefits, microcopy, href, linkLabel, reverse = false, children }: FeatureShowcaseProps) {
  return (
    <section id={`feature-${id}`} className={styles.section} aria-labelledby={`${id}-showcase-title`}>
      <div className={`${styles.inner} ${reverse ? styles.reverse : ""}`}>
        <header className={styles.copyHeader}>
          <p className={styles.eyebrow}><span aria-hidden="true" />{eyebrow}</p>
          <h3 id={`${id}-showcase-title`}>{heading}</h3>
        </header>
        <div className={styles.copy}>
          <div className={styles.description}>{description.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
          <ul className={styles.benefits}>
            {benefits.map(({ icon: Icon, text }) => <li key={text}><span className={styles.benefitIcon} aria-hidden="true"><Icon size={16} strokeWidth={1.9} /></span><span>{text}</span></li>)}
          </ul>
          <p className={styles.microcopy}>{microcopy}</p>
          <Link href={href} className={styles.cta}>{linkLabel}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        {children}
      </div>
    </section>
  );
}
