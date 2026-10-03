"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Building2, Check, ChevronDown, Layers, Minus, Monitor } from "lucide-react";
import shared from "../homepage.module.css";
import styles from "./pricing.module.css";

const regions = [
  { id: "nigeria", label: "Nigeria", currency: "NGN", symbol: "₦", prices: [0, 2800, 6000, 15000] },
  { id: "africa", label: "Africa", currency: "USD", symbol: "$", prices: [0, 3, 6, 12] },
  { id: "global", label: "Global", currency: "USD", symbol: "$", prices: [0, 7, 12, 20] },
] as const;

const plans = [
  { id: "free", name: "Free", icon: BookOpen, audience: "Explore the essentials for your next service.", cta: "Start free", href: "/signup", highlights: ["Up to 10 songs, lyrics & media", "5 Bible versions", "30-minute speech-to-scripture trial", "Free EW / ProPresenter import"] },
  { id: "basic", name: "Basic", icon: Monitor, audience: "A simpler setup for your weekly services.", cta: "Get started with Basic", href: "/signup?callbackUrl=%2Fsubscription%2Fplans", highlights: ["Unlimited local songs, lyrics & media", "All Bible versions", "Automatic OBS scenes & sources", "4 speech-to-scripture hours / month"] },
  { id: "growth", name: "Growth", icon: Layers, audience: "Keep your operators and content connected.", cta: "Get started with Growth", href: "/signup?callbackUrl=%2Fsubscription%2Fplans", inherits: "Everything in Basic, plus:", highlights: ["Cloud storage for songs, lyrics & media", "Cloud sync across operators", "Mobile control app", "Lower thirds & sermon export", "10 speech-to-scripture hours / month", "Priority support"] },
  { id: "pro", name: "Pro", icon: Building2, audience: "One connected workflow across your campuses.", cta: "Talk to us about Pro", href: "/contact", inherits: "Everything in Growth, plus:", highlights: ["Unlimited multi-campus content sync", "20 speech-to-scripture hours / month", "Full phone support & direct line", "Online remote laptop control — coming soon"] },
] as const;

type ComparisonRow = { label: string; values: readonly (string | boolean)[] };
const rows: ComparisonRow[] = [
  { label: "Pricing (NGN)", values: ["₦0", "₦2,800/mo", "₦6,000/mo", "₦15,000/mo"] },
  { label: "Pricing (Africa)", values: ["$0", "$3/mo", "$6/mo", "$12/mo"] },
  { label: "Pricing (Global)", values: ["$0", "$7/mo", "$12/mo", "$20/mo"] },
  { label: "Songs, Lyrics & Media", values: ["Up to 10", "Unlimited (Local)", "Unlimited (Local + Cloud)", "Unlimited (Multi-Campus Sync)"] },
  { label: "Bible Versions", values: ["5 Versions", "Unlimited All", "Unlimited All", "Unlimited All"] },
  { label: "Auto Scene / Source Creation", values: ["Manual only", "Automatic", "Automatic", "Automatic"] },
  { label: "Speech-to-Scripture Hours", values: ["30 min trial", "4 Hours/mo", "10 Hours/mo", "20 Hours/mo"] },
  { label: "Hour Top-Ups", values: [false, true, true, true] },
  { label: "1-Click EW/ProPresenter Import", values: ["Free", "Free", "Free", "Free"] },
  { label: "Cloud Sync Across Operators", values: [false, false, true, "Multi-Campus"] },
  { label: "Mobile Control App", values: [false, false, true, true] },
  { label: "Lower Thirds & Sermon Export", values: [false, false, true, true] },
  { label: "Support Channel", values: ["Community", "Standard Email", "Priority Support", "Full Phone & Direct Line"] },
  { label: "Online Remote Laptop Control", values: [false, false, false, "Coming Soon"] },
];

const faqs = [
  { question: "Can I start with the Free plan?", answer: "Yes. Free includes up to 10 songs, lyrics and media items, 5 Bible versions, and a 30-minute speech-to-scripture trial. OBS scenes and sources are set up manually on Free." },
  { question: "Which plans create my OBS scenes and sources?", answer: "Basic, Growth and Pro include automatic scene and source creation. Choose the content you want to present and MakeChurchEazy handles the OBS setup for its presentation workflow." },
  { question: "What happens when I need more speech-to-scripture hours?", answer: "Basic includes 4 hours per month, Growth includes 10, and Pro includes 20. Hour top-ups are available on all paid plans when you need extra time." },
  { question: "Can I bring content from EasyWorship or ProPresenter?", answer: "Yes. One-click EasyWorship and ProPresenter import is free on every plan, including Free." },
  { question: "Is online remote laptop control available now?", answer: "Online remote laptop control is coming soon for Pro. It is separate from the mobile control app, which is included with Growth and Pro." },
];

function FeatureValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") return value
    ? <span className={styles.included}><Check size={20} aria-hidden="true" /><span className={styles.srOnly}>Included</span></span>
    : <span className={styles.unavailable}><Minus size={18} aria-hidden="true" /><span className={styles.srOnly}>Not included</span></span>;
  if (value === "Coming Soon") return <span className={styles.comingSoon}>Coming soon</span>;
  return <span>{value}</span>;
}

export default function PricingContent() {
  const [regionIndex, setRegionIndex] = useState(0);
  const region = regions[regionIndex];
  const price = (index: number) => `${region.symbol}${region.prices[index].toLocaleString("en-US")}`;

  return <main id="main" className={styles.page}>
    <section className={styles.intro} aria-labelledby="pricing-title">
      <p className={styles.eyebrow}>PRICING</p>
      <h1 id="pricing-title">A plan for your church.<br />Room for what comes next.</h1>
      <p className={styles.lead}>From your first service to a growing team across campuses.<br className={styles.desktopBreak} /> Choose the tools and capacity your church needs.</p>
      <div className={styles.pricingControls}>
        <div className={styles.regionPicker} role="group" aria-label="Pricing region">
          {regions.map((item, index) => <button type="button" key={item.id} aria-pressed={regionIndex === index} onClick={() => setRegionIndex(index)}>{item.label} <span>{item.currency}</span></button>)}
        </div>
        <p id="region-note" className={styles.regionNote}>Monthly pricing · Nigeria in NGN, other African countries and global markets in USD.</p>
      </div>
      <div className={styles.plans} aria-describedby="region-note">
        {plans.map((plan, index) => <article key={plan.id} className={`${styles.plan} ${plan.id === "growth" ? styles.featured : ""}`}>
          <div className={styles.cardHeading}><plan.icon size={24} aria-hidden="true" />{plan.id === "growth" && <span className={styles.badge}>For growing teams</span>}</div>
          <h2>{plan.name}{plan.id === "pro" && <span>Multi-Campus</span>}</h2>
          <p className={styles.audience}>{plan.audience}</p>
          <div className={styles.price} aria-live="polite" aria-atomic="true"><strong>{price(index)}</strong><span>{region.currency} / month</span></div>
          <Link href={plan.href} className={`${plan.id === "growth" ? shared.button : shared.outlineButton} ${styles.planButton}`}>{plan.cta}<ArrowRight size={16} aria-hidden="true" /></Link>
          <div className={styles.planFeatures}>{"inherits" in plan && <p className={styles.inheritance}>{plan.inherits}</p>}<ul>{plan.highlights.map(feature => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}</ul></div>
        </article>)}
      </div>
      <p className={styles.importNote}><Check size={18} aria-hidden="true" />Bring your content with you. EasyWorship and ProPresenter import is free on every plan.</p>
    </section>

    <section className={styles.comparison} aria-labelledby="comparison-heading">
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>THE DETAILS, SIDE BY SIDE</p><h2 id="comparison-heading">Find the right fit for your service.</h2></div><p>Every plan, every inclusion.<br />See exactly what your team gets.</p></div>
      <p className={styles.scrollHint} id="comparison-hint">Scroll across the table to compare all four plans.</p>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Plan comparison" aria-describedby="comparison-hint">
        <table className={styles.table}>
          <caption className={styles.srOnly}>MakeChurchEazy monthly pricing and feature comparison for Free, Basic, Growth and Pro Multi-Campus.</caption>
          <thead><tr><th scope="col">Features</th>{plans.map(plan => <th key={plan.id} scope="col" className={plan.id === "growth" ? styles.growthColumn : undefined}>{plan.name}{plan.id === "pro" && <span>Multi-Campus</span>}</th>)}</tr></thead>
          <tbody>{rows.map((row, rowIndex) => <tr key={row.label} className={rowIndex < 3 ? styles.priceRow : undefined}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={plans[index].id} className={index === 2 ? styles.growthColumn : undefined}><FeatureValue value={value} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className={styles.faq} aria-labelledby="faq-heading"><div className={styles.faqIntro}><p className={styles.eyebrow}>A FEW HELPFUL ANSWERS</p><h2 id="faq-heading">Before you choose.</h2><p>Need a hand finding the right plan for your church?</p><Link href="/contact">Talk to our team <ArrowRight size={17} aria-hidden="true" /></Link></div><div className={styles.questions}>{faqs.map(faq => <details key={faq.question}><summary>{faq.question}<ChevronDown size={20} aria-hidden="true" /></summary><p>{faq.answer}</p></details>)}</div></section>
    <section className={styles.cta} aria-labelledby="start-heading"><div><h2 id="start-heading">Ready for your next service?</h2><p>Bring your scriptures, songs, and visuals together inside OBS.</p></div><Link href="/download" className={shared.button}>Download MakeChurchEazy <ArrowRight size={18} aria-hidden="true" /></Link></section>
  </main>;
}
