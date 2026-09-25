"use client";

import { ArrowDown, ArrowRight, BookOpen, Check, ChevronDown, Download, Image as ImageIcon, Layers, Mic, Monitor, Music2, Play, Radio, Timer, Type, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./homepage.module.css";
import { presentationFeatures } from "./feature-content";
import FeatureVisual from "./feature-visual";
import { MarketingHeader, MarketingFooter } from "./marketing-shell";

const featureIcons = [BookOpen, Music2, Type, ImageIcon, Timer, Layers];
const features = presentationFeatures.slice(0, 6).map((feature, index) => ({ ...feature, icon: featureIcons[index] }));
const showcaseFeatures = [features[0], features[1], features[3]];

const questions = [
  { q: "Do I need to create OBS scenes and sources myself?", a: "On paid plans, MakeChurchEazy creates and manages the OBS scenes and sources for you. The Free plan uses a presentation link that you add once as an OBS Browser Source." },
  { q: "Does it work on Windows and Mac?", a: "Yes. MakeChurchEazy is available for Windows and macOS. The download page lets you choose the right installer for your computer." },
  { q: "Can our volunteers use it?", a: "The controls are built around the tasks your team already understands: show a Bible verse, display lyrics, introduce a speaker, or put media on screen. Tutorials help your team get comfortable with the workflow." },
  { q: "Can I try it before choosing a paid plan?", a: "Yes. Start with the Free plan, then choose Basic or Growth when you need more capacity and tools. Visit the plans page for current pricing and feature availability." },
  { q: "Do all features require an internet connection?", a: "Many local presentation actions work after setup with downloaded content. Sign-in, downloads, cloud sync, billing, updates, and AI services require an internet connection." },
];

function ProductView() {
  const [active, setActive] = useState(0);
  const selected = showcaseFeatures[active];
  const select = (index: number, focus = false) => {
    setActive(index);
    if (focus) document.getElementById(`showcase-tab-${showcaseFeatures[index].id}`)?.focus();
  };
  return <>
    <div className={styles.showcaseTabs} role="tablist" aria-label="Preview MakeChurchEazy">
      {showcaseFeatures.map((feature, index) => <button key={feature.id} id={`showcase-tab-${feature.id}`} role="tab" aria-selected={index === active} aria-controls="showcase-panel" tabIndex={index === active ? 0 : -1} onClick={() => select(index)} onKeyDown={event => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % showcaseFeatures.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + showcaseFeatures.length) % showcaseFeatures.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = showcaseFeatures.length - 1;
        else return;
        event.preventDefault(); select(next, true);
      }}><feature.icon size={18} />{feature.label}</button>)}
    </div>
    <div className={styles.showcasePanel} id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${selected.id}`} tabIndex={0}>
      <div className={styles.showcaseImage} key={selected.id}><FeatureVisual feature={selected} priority /></div>
      <div className={styles.showcaseCaption}><div><span>{selected.label} in MakeChurchEazy</span><p>{selected.note}</p></div><Link href={`/features/${selected.id}`}>Explore {selected.label}<ArrowRight size={18} /></Link></div>
    </div>
  </>;
}

export default function Homepage() {
  const [activeFeature, setActiveFeature] = useState(0);
  const [downloadLabel, setDownloadLabel] = useState("Download MakeChurchEazy");
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const feature = features[activeFeature];

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) setDownloadLabel("Download for Windows");
    else if (/Macintosh|Mac OS/i.test(ua)) setDownloadLabel("Download for macOS");
  }, []);

  useEffect(() => {
    if (!demoOpen) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; };
  }, [demoOpen]);

  const openDemo = () => { setDemoLoaded(false); setDemoOpen(true); };
  const selectFeature = (index: number, focus = false) => {
    setActiveFeature(index);
    if (focus) document.getElementById(`feature-tab-${features[index].id}`)?.focus();
  };

  return <div className={styles.home}>
    <a className={styles.skipLink} href="#main">Skip to content</a>
    <MarketingHeader homepage />

    <main id="main">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>Everything your church needs.<br /><span>Right inside OBS.</span></h1>
          <p className={styles.heroDescription}>Display Bible verses, worship lyrics, media, lower thirds and more — without manually creating scenes, sources or complicated OBS setups. MakeChurchEazy sets up what you need and keeps everything inside the OBS workflow you already use.</p>
          <div className={styles.heroActions}><Link href="/download" className={styles.downloadButton}><Download size={18} /> {downloadLabel}</Link><button className={styles.demoLink} onClick={openDemo}><span className={styles.playCircle}><Play size={13} fill="currentColor" /></span> Watch demo <ArrowRight size={16} /></button></div>
          <p className={styles.platforms}><Monitor size={14} /> Windows & macOS <span>·</span> Start free</p>
        </div>
        <div className={styles.heroProduct}><ProductView /></div>
      </section>

      <div className={styles.featureRail} aria-label="Tools included"><span>ONE WORKFLOW. EVERY MOMENT.</span>{[{ name: "Bible", icon: BookOpen }, { name: "Worship", icon: Music2 }, { name: "Media", icon: ImageIcon }, { name: "Lower thirds", icon: Type }, { name: "Verse AI", icon: Mic }].map(item => <a key={item.name} href={item.name === "Verse AI" ? "#voice-bible" : "#features"} onClick={() => { const index = features.findIndex(feature => feature.label === item.name); if (index >= 0) selectFeature(index); }}><item.icon size={18} />{item.name}</a>)}</div>

      <section className={`${styles.section} ${styles.setupSection}`} id="how-it-works">
        <div className={styles.setupCopy}><p className={styles.eyebrow}>LESS SETUP. MORE SERVICE.</p><h2>You focus on what<br />goes on screen.<br /><span>We handle the setup.</span></h2><p>MakeChurchEazy creates, manages and updates the OBS scenes and sources required for its presentation workflow.</p><span className={styles.setupPlanNote}>Automatic OBS setup is included on paid plans. <Link href="/subscription/plans">Compare plans <ArrowRight size={13} /></Link></span></div>
        <div className={styles.workflow}><p className={styles.workflowLabel}>YOUR NEW WORKFLOW</p><ol>{[{ n: "01", name: "Connect", text: "Bring MakeChurchEazy into OBS." }, { n: "02", name: "Click", text: "Choose what you want on screen." }, { n: "03", name: "Present", text: "Let the moment take centre stage." }].map(item => <li key={item.n}><span className={styles.stepNumber}>{item.n}</span><div><h3>{item.name}</h3><p>{item.text}</p></div><ArrowRight size={22} /></li>)}</ol><p className={styles.workflowFooter}><Check size={16} /> The scenes and sources? Already taken care of.</p></div>
      </section>

      <section id="features" className={styles.featuresSection}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>FROM THE FIRST SONG TO THE FINAL AMEN</p><h2>Everything you need.<br /><span>Right where you need it.</span></h2><p>One familiar workspace for every part of your service.</p></div>
        <div className={styles.featureTabs} role="tablist" aria-label="Explore presentation tools">{features.map((item, index) => <button key={item.id} id={`feature-tab-${item.id}`} role="tab" aria-selected={index === activeFeature} aria-controls="feature-panel" tabIndex={index === activeFeature ? 0 : -1} onClick={() => selectFeature(index)} onKeyDown={event => { let next = index; if (event.key === "ArrowRight") next = (index + 1) % features.length; else if (event.key === "ArrowLeft") next = (index - 1 + features.length) % features.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = features.length - 1; else return; event.preventDefault(); selectFeature(next, true); }}><item.icon size={18} />{item.label}</button>)}</div>
        <div className={styles.featurePanel} id="feature-panel" role="tabpanel" aria-labelledby={`feature-tab-${feature.id}`} tabIndex={0}>
          <div className={styles.featureText}><p className={styles.eyebrow}>{String(activeFeature + 1).padStart(2, "0")} / {feature.label.toUpperCase()}</p><h3>{feature.title}</h3><p>{feature.copy}</p><Link href={`/features/${feature.id}`} className={styles.textLink}>Explore {feature.label} <ArrowRight size={17} /></Link><div className={styles.featureNote}><Check size={15} />{feature.note}</div></div>
          <div className={styles.featureScreenshot} key={feature.id}><FeatureVisual feature={feature} /><span className={styles.captureLabel}><span className={styles.statusDot} /> {feature.image ? "INSIDE MAKECHURCHEAZY" : "ILLUSTRATIVE EXAMPLE"}</span></div>
        </div>
        <div className={styles.exploreAll}><Link href="/features" className={styles.textLink}>Explore all features <ArrowRight size={17} /></Link></div>
        <p className={styles.availability}>Feature availability varies by plan. <a href="#plans">Find your fit <ArrowRight size={13} /></a></p>
      </section>

      <section className={`${styles.section} ${styles.voiceSection}`} id="voice-bible">
        <div className={styles.voiceArtwork} aria-label="Illustration of a spoken reference becoming a scripture suggestion"><div className={styles.voiceTop}><Mic size={20} /><span>SPEECH + SCRIPTURE</span><span className={styles.exampleLabel}>EXAMPLE</span></div><div className={styles.voiceWave} aria-hidden="true">{Array.from({ length: 39 }, (_, i) => <i key={i} style={{ height: `${12 + ((i * 17 + i * i * 7) % 53)}px` }} />)}</div><div className={styles.spokenWords}>“John chapter three,<br />verse sixteen.”</div><div className={styles.voiceConnector}><ArrowDown size={19} /></div><div className={styles.scriptureSuggestion}><div><BookOpen size={19} /><strong>John 3:16</strong><span>KJV</span></div><p>For God so loved the world, that he gave his only begotten Son…</p><span className={styles.readyLabel}><Check size={14} /> Ready to review and present</span></div></div>
        <div className={styles.voiceCopy}><p className={styles.eyebrow}><Mic size={15} /> VERSE AI</p><h2>Speak it.<br /><span>Show it.</span></h2><p>A preacher calls a Bible reference. Use MakeChurchEazy’s speech and AI tools to find the scripture faster and prepare it for presentation.</p><p className={styles.shortCopy}>Less typing. Less searching.<br />Faster response during live services.</p><Link href="/features/voice-bible" className={styles.textLink}>Explore Voice Bible <ArrowRight size={18} /></Link></div>
      </section>

      <section className={styles.obsSection} id="obs-workflow"><div className={styles.obsInner}><div className={styles.obsImage}><img src="/homepage/obs.webp" alt="OBS Studio with the MakeChurchEazy dock showing John 3 verse 8 live on the MCE Presentation scene" width="1269" height="768" loading="lazy" /></div><div className={styles.obsHeading}><p className={styles.eyebrow}><Radio size={15} /> BUILT AROUND OBS</p><h2>Click a verse.<br /><span>It’s already live in OBS.</span></h2><p>Find John 3, tap verse 8 in the dock, and MakeChurchEazy pushes it straight to your livestream through the MCE Presentation scene. No extra sources to build or switch.</p></div><div className={styles.obsBottom}><span>OBS + MakeChurchEazy</span><span>One simpler church media workflow.</span></div></div></section>

      <section className={`${styles.section} ${styles.volunteerSection}`}><div><p className={styles.eyebrow}>BUILT FOR VOLUNTEERS</p><h2>Your media team<br />shouldn’t need<br /><span>an OBS engineer.</span></h2></div><div><p>Give your team controls based on what they actually want to do. MakeChurchEazy handles the technical work behind the scenes.</p><div className={styles.volunteerActions}>{[{ icon: BookOpen, name: "Show Bible verse", index: 0 }, { icon: Music2, name: "Display lyrics", index: 1 }, { icon: Type, name: "Show speaker name", index: 2 }, { icon: ImageIcon, name: "Put media on screen", index: 3 }].map(item => <a key={item.name} href="#features" onClick={() => selectFeature(item.index)}><item.icon size={20} /><span>{item.name}</span><ArrowRight size={18} /></a>)}</div></div></section>

      <section className={styles.startSection}><div className={styles.sectionHeading}><p className={styles.eyebrow}>YOU’RE CLOSER THAN YOU THINK</p><h2>Get started in minutes.</h2></div><div className={styles.startSteps}>{[{ icon: Download, title: "Install", copy: "Download MakeChurchEazy for Windows or Mac." }, { icon: Radio, title: "Connect", copy: "Connect it with OBS. Let us take care of the setup." }, { icon: Play, title: "Present", copy: "Choose what you want on screen and present it." }].map((step, i) => <article key={step.title}><div className={styles.startStepTop}><step.icon size={24} /><span>0{i + 1}</span></div><h3>{step.title}</h3><p>{step.copy}</p></article>)}</div><Link href="/download" className={styles.button}>Let’s make your next service easier <ArrowRight size={18} /></Link></section>

      <section className={`${styles.section} ${styles.demoSection}`} id="demo"><div><p className={styles.eyebrow}>A CLOSER LOOK</p><h2>See it in action.</h2><p>From a Bible verse to a worship lyric.<br />See how it all comes together in OBS.</p><Link href="/tutorials" className={styles.textLink}>Watch full tutorials <ArrowRight size={17} /></Link></div><button className={styles.demoPreview} onClick={openDemo} aria-label="Watch the MakeChurchEazy product demo"><img src="/homepage/media.webp" alt="" width="1198" height="768" loading="lazy" /><span className={styles.demoOverlay}><span className={styles.largePlay}><Play size={28} fill="currentColor" /></span><strong>The MakeChurchEazy walkthrough</strong><span>Press play. See what’s possible.</span></span></button></section>

      <section className={styles.pricingSection} id="plans"><div className={styles.sectionHeading}><p className={styles.eyebrow}>ROOM TO GROW</p><h2>Simple plans.<br /><span>For your church media team.</span></h2></div><div className={styles.planGrid}>{[{ name: "Free", line: "Find your feet.", copy: "Start with the essentials and explore your new workflow.", cta: "Start free", href: "/signup", icon: BookOpen }, { name: "Basic", line: "Make Sundays simpler.", copy: "For churches getting started with a regular presentation workflow.", cta: "Explore Basic", href: "/subscription/plans", icon: Monitor }, { name: "Growth", line: "Bring it all together.", copy: "For growing media teams that need more capacity and tools.", cta: "Explore Growth", href: "/subscription/plans", icon: Layers }].map(plan => <article className={styles.plan} key={plan.name}><plan.icon size={24} /><p className={styles.planName}>{plan.name}</p><h3>{plan.line}</h3><p>{plan.copy}</p><Link href={plan.href}>{plan.cta}<ArrowRight size={18} /></Link></article>)}</div><Link href="/subscription/plans" className={styles.textLink}>Compare plans and current pricing <ArrowRight size={17} /></Link></section>

      <section className={`${styles.section} ${styles.faqSection}`}><div><p className={styles.eyebrow}>GOOD QUESTIONS</p><h2>A little clarity<br />before you begin.</h2><Link href="/support" className={styles.textLink}>Visit support <ArrowRight size={17} /></Link></div><div className={styles.faqList}>{questions.map(item => <details key={item.q}><summary>{item.q}<ChevronDown size={20} /></summary><p>{item.a}</p></details>)}</div></section>

      <section className={styles.finalCta}><div className={styles.finalMark}><img src="/homepage/logo-light.webp" alt="" width="58" height="58" /></div><p className={styles.eyebrow}>LESS FRICTION. MORE FOCUS.</p><h2>Make your next<br />service <span>Eazier.</span></h2><p>Bible. Worship. Media. Lower thirds. AI.<br />Built around OBS without the complicated setup.</p><Link href="/download" className={styles.lightButton}><Download size={19} />{downloadLabel}</Link><p className={styles.finalPlatforms}>Windows & macOS</p></section>
    </main>

    <MarketingFooter />

    {demoOpen && <dialog ref={dialogRef} className={styles.demoDialog} aria-labelledby="demo-title" onCancel={() => setDemoOpen(false)} onClose={() => setDemoOpen(false)} onClick={event => { if (event.target === event.currentTarget) setDemoOpen(false); }}><div className={styles.dialogHeader}><h2 id="demo-title">MakeChurchEazy in action</h2><button aria-label="Close demo" onClick={() => setDemoOpen(false)} autoFocus><X size={22} /></button></div><div className={styles.videoFrame}>{!demoLoaded && <div className={styles.videoLoading}>Loading the walkthrough…</div>}<iframe src="https://www.youtube.com/embed/NmneQhxY2jQ?autoplay=1&playsinline=1&rel=0" title="MakeChurchEasy product demo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen onLoad={() => setDemoLoaded(true)} /></div><div className={styles.dialogFooter}>Trouble playing? <a href="https://www.youtube.com/watch?v=NmneQhxY2jQ" target="_blank" rel="noreferrer">Open the demo on YouTube <ArrowRight size={14} /></a></div></dialog>}
  </div>;
}
