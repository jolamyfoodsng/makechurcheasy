"use client";

import { ArrowRight, BookOpen, ChevronDown, Crown, Download, Image as ImageIcon, Layers, Monitor, Music2, Play, Radio, Type, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./homepage.module.css";
import { MarketingHeader, MarketingFooter } from "./marketing-shell";
import VerseAiShowcase from "./verse-ai-showcase";
import HomepageFeatureShowcases from "./homepage-feature-showcases";

const questions = [
  { q: "Can I compare Bible verses and translations inside OBS?", a: "Yes. MakeChurchEazy brings Bible reference search, verse comparison, and translation comparison into the OBS dock. Explore 10,000+ Bible translations, compare passages side by side, and update displayed scripture in real time. Scripture can appear full screen or as a lower third." },
  { q: "Do I need to create OBS scenes and sources myself?", a: "On paid plans, MakeChurchEazy creates and manages the OBS scenes and sources for you. The Free plan uses a presentation link that you add once as an OBS Browser Source." },
  { q: "Does it work on Windows and Mac?", a: "Yes. MakeChurchEazy is available for Windows and macOS. The download page lets you choose the right installer for your computer." },
  { q: "Can our volunteers use it?", a: "The controls are built around the tasks your team already understands: show a Bible verse, display lyrics, introduce a speaker, or put media on screen. Tutorials help your team get comfortable with the workflow." },
  { q: "Can I try it before choosing a paid plan?", a: "Yes. Start with the Free plan, then choose Basic or Growth when you need more capacity and tools. Visit the plans page for current pricing and feature availability." },
  { q: "Do all features require an internet connection?", a: "Many local presentation actions work after setup with downloaded content. Sign-in, downloads, cloud sync, billing, updates, and AI services require an internet connection." },
];

function ProductView() {
  return <div className={styles.showcasePanel}>
    <div className={styles.showcaseImage}>
      <img className={styles.showcasePoster} src="/homepage/church-presentation-software-obs-hero-poster.jpg" alt="" aria-hidden="true" fetchPriority="high" />
      <video className={styles.showcaseVideo} autoPlay muted loop playsInline preload="metadata" poster="/homepage/church-presentation-software-obs-hero-poster.jpg" aria-label="MakeChurchEazy church presentation software displaying Bible verses in OBS">
        <source src="/homepage/church-presentation-software-obs-hero.mp4" type="video/mp4" />
        <source src="/homepage/church-presentation-software-obs-hero.webm" type="video/webm" />
      </video>
    </div>
  </div>;
}

export default function Homepage() {
  const [downloadLabel, setDownloadLabel] = useState("Download MakeChurchEazy");
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

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


  return <div className={`${styles.home} ${styles.homePage}`}>
    <a className={styles.skipLink} href="#main">Skip to content</a>
    <MarketingHeader homepage />

    <main id="main">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>The Complete Church Presentation Dock.<br /><span>Built Directly Into OBS Studio.</span></h1>
          <p className={styles.heroDescription}>Everything your church broadcasts, unified in one window: real-time Voice-to-Scripture AI, instant multi-version Bible comparisons, one-click worship setlists, animated lower thirds, and live countdowns. Pre-configured for your stream and projector with zero NDI lag and zero window juggling.</p>
          <div className={styles.heroActions}>
            <Link href="/download" className={styles.downloadButton}>
              <Download size={17} /> Download for Free
            </Link>
            <button className={styles.demoLink} onClick={openDemo}>
              <Play size={14} fill="currentColor" /> Watch Demo
            </button>
          </div>
          <p className={styles.platforms}><Monitor size={14} /> Mac &amp; Windows <span>·</span> 30-second setup <span>·</span> 100% Offline Sunday mode</p>
        </div>
        <div className={styles.heroProduct}><ProductView /></div>
      </section>

      <VerseAiShowcase />

      <section className={`${styles.section} ${styles.setupSection}`} id="how-it-works" aria-labelledby="setup-heading">
        <header className={styles.setupHeading}>
          <p className={styles.eyebrow}>THE MAKECHURCHEAZY ADVANTAGE</p>
          <h2 id="setup-heading">No scenes to build.<br /><span>No sources to manage.</span></h2>
        </header>
        <div className={styles.setupCopy}>
          <p>Choose a Bible verse, worship lyrics, media, or a lower third. MakeChurchEazy automatically creates the OBS scenes and sources needed to display it.</p>
          <p>When your content changes, MakeChurchEazy updates those sources in real time. You stay inside OBS, without manually creating scenes, adding sources, or rebuilding your setup for each item.</p>
          <span className={styles.setupPlanNote}>Automatic scene and source management is included on paid plans. <Link href="/subscription/plans">Compare plans <ArrowRight size={16} /></Link></span>
        </div>

      </section>

      <section id="features" className={styles.featuresSection} aria-labelledby="features-heading">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>FROM THE FIRST SONG TO THE FINAL AMEN</p><h2 id="features-heading">Everything you need.<br /><span>Right where you need it.</span></h2><p>Bible presentation, worship lyrics, media, lower thirds, tickers, countdowns, and multi-view layouts, all from your OBS workspace.</p></div>
        <HomepageFeatureShowcases />
        <div className={styles.exploreAll}><Link href="/features" className={styles.textLink}>Explore all features <ArrowRight size={17} /></Link></div>
        <p className={styles.availability}>Feature availability varies by plan. <a href="#plans">Find your fit <ArrowRight size={13} /></a></p>
      </section>

      <section className={styles.obsSection} id="obs-workflow"><div className={styles.obsInner}><div className={styles.obsImage}><img src="/homepage/obs.webp" alt="OBS Studio with the MakeChurchEazy presentation dock integrated directly into the workspace" width="1269" height="768" loading="lazy" /></div><div className={styles.obsHeading}><p className={styles.eyebrow}><Radio size={15} /> BUILT FOR OBS STUDIO</p><h2>One screen.<br /><span>Zero window switching.</span></h2><p>No second laptop. No panic alt-tabbing while the pastor is preaching. Your scriptures, lyrics, and media dock directly into OBS so your team controls the entire broadcast from a single window.</p></div><div className={styles.obsBottom}><span>OBS + MakeChurchEazy</span><span>One unified broadcast workspace.</span></div></div></section>

      <section className={`${styles.section} ${styles.volunteerSection}`}><div><p className={styles.eyebrow}>BUILT FOR VOLUNTEERS</p><h2>Your media team<br />shouldn’t need<br /><span>an OBS engineer.</span></h2></div><div><p>Give your team controls based on what they actually want to do. MakeChurchEazy handles the technical work behind the scenes.</p><div className={styles.volunteerActions}>{[{ icon: BookOpen, name: "Show Bible verse", anchor: "bible" }, { icon: Music2, name: "Display lyrics", anchor: "worship" }, { icon: Type, name: "Show speaker name", anchor: "lower-thirds" }, { icon: ImageIcon, name: "Put media on screen", anchor: "media" }].map(item => <a key={item.name} href={`#feature-${item.anchor}`}><item.icon size={20} /><span>{item.name}</span><ArrowRight size={18} /></a>)}</div></div></section>

      <section className={styles.startSection}><div className={styles.sectionHeading}><p className={styles.eyebrow}>YOU’RE CLOSER THAN YOU THINK</p><h2>Get started in minutes.</h2></div><div className={styles.startSteps}>{[{ icon: Download, title: "Install", copy: "Download MakeChurchEazy for Windows or Mac." }, { icon: Radio, title: "Connect", copy: "Connect it with OBS. Let us take care of the setup." }, { icon: Play, title: "Present", copy: "Choose what you want on screen and present it." }].map((step, i) => <article key={step.title}><div className={styles.startStepTop}><step.icon size={24} /><span>0{i + 1}</span></div><h3>{step.title}</h3><p>{step.copy}</p></article>)}</div><Link href="/download" className={styles.button}>Let’s make your next service easier <ArrowRight size={18} /></Link></section>

      <section className={`${styles.section} ${styles.demoSection}`} id="demo"><div><p className={styles.eyebrow}>A CLOSER LOOK</p><h2>See it in action.</h2><p>From a Bible verse to a worship lyric.<br />See how it all comes together in OBS.</p><Link href="/tutorials" className={styles.textLink}>Watch full tutorials <ArrowRight size={17} /></Link></div><button className={styles.demoPreview} onClick={openDemo} aria-label="Watch the MakeChurchEazy product demo"><img src="/homepage/media.webp" alt="" width="1198" height="768" loading="lazy" /><span className={styles.demoOverlay}><span className={styles.largePlay}><Play size={28} fill="currentColor" /></span><strong>The MakeChurchEazy walkthrough</strong><span>Press play. See what’s possible.</span></span></button></section>

      <section className={styles.pricingSection} id="plans"><div className={styles.sectionHeading}><p className={styles.eyebrow}>ROOM TO GROW</p><h2>Simple plans.<br /><span>For your church media team.</span></h2></div><div className={styles.planGrid}>{[{ name: "Free", line: "Find your feet.", copy: "Start with the essentials and explore your new workflow.", cta: "Start free", href: "/signup", icon: BookOpen }, { name: "Basic", line: "Make Sundays simpler.", copy: "Unlimited media, Bible versions, auto OBS scenes, and 4 hrs/mo speech transcription.", cta: "Explore Basic", href: "/subscription/plans", icon: Monitor }, { name: "Growth", line: "Bring it all together.", copy: "Cloud sync across operators, mobile control app, lower thirds, and 10 hrs/mo speech transcription.", cta: "Explore Growth", href: "/subscription/plans", icon: Layers }, { name: "Pro", line: "Full production power.", copy: "Multi-campus sync, remote laptop control, 20 hrs/mo speech transcription, and phone support.", cta: "Explore Pro", href: "/subscription/plans", icon: Crown }].map(plan => <article className={styles.plan} key={plan.name}><plan.icon size={24} /><p className={styles.planName}>{plan.name}</p><h3>{plan.line}</h3><p>{plan.copy}</p><Link href={plan.href}>{plan.cta}<ArrowRight size={18} /></Link></article>)}</div><Link href="/subscription/plans" className={styles.textLink}>Compare plans and current pricing <ArrowRight size={17} /></Link></section>

      <section className={`${styles.section} ${styles.faqSection}`}><div><p className={styles.eyebrow}>GOOD QUESTIONS</p><h2>A little clarity<br />before you begin.</h2><Link href="/support" className={styles.textLink}>Visit support <ArrowRight size={17} /></Link></div><div className={styles.faqList}>{questions.map(item => <details key={item.q}><summary>{item.q}<ChevronDown size={20} /></summary><p>{item.a}</p></details>)}</div></section>

      <section className={styles.finalCta}><div className={styles.finalMark}><img src="/homepage/logo-light.webp" alt="" width="58" height="58" /></div><p className={styles.eyebrow}>LESS FRICTION. MORE FOCUS.</p><h2>Make your next<br />service <span>Eazier.</span></h2><p>Bible. Worship. Media. Lower thirds. AI.<br />Built around OBS without the complicated setup.</p><Link href="/download" className={styles.lightButton}><Download size={19} />{downloadLabel}</Link><p className={styles.finalPlatforms}>Windows & macOS</p></section>
    </main>

    <MarketingFooter />

    {demoOpen && <dialog ref={dialogRef} className={styles.demoDialog} aria-labelledby="demo-title" onCancel={() => setDemoOpen(false)} onClose={() => setDemoOpen(false)} onClick={event => { if (event.target === event.currentTarget) setDemoOpen(false); }}><div className={styles.dialogHeader}><h2 id="demo-title">MakeChurchEazy in action</h2><button aria-label="Close demo" onClick={() => setDemoOpen(false)} autoFocus><X size={22} /></button></div><div className={styles.videoFrame}>{!demoLoaded && <div className={styles.videoLoading}>Loading the walkthrough…</div>}<iframe src="https://www.youtube.com/embed/NmneQhxY2jQ?autoplay=1&playsinline=1&rel=0" title="MakeChurchEasy product demo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen onLoad={() => setDemoLoaded(true)} /></div><div className={styles.dialogFooter}>Trouble playing? <a href="https://www.youtube.com/watch?v=NmneQhxY2jQ" target="_blank" rel="noreferrer">Open the demo on YouTube <ArrowRight size={14} /></a></div></dialog>}
  </div>;
}
