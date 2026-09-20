"use client";

import { ArrowDown, ArrowRight, BookOpen, Check, ChevronDown, Download, Image as ImageIcon, Layers, Menu, Mic, Monitor, Music2, Play, Radio, Timer, Type, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./homepage.module.css";

const features = [
  { id: "bible", label: "Bible", icon: BookOpen, title: "The right verse.\nRight on time.", copy: "Find and display scripture quickly with multiple Bible versions and translation tools. Keep the passage ready, then put it on screen when it matters.", image: "bible", alt: "The real MakeChurchEasy Bible dock with John 3:16 selected", note: "Search a reference. Select a verse. Present it." },
  { id: "worship", label: "Worship", icon: Music2, title: "Keep every voice\non the same verse.", copy: "Prepare and present worship lyrics from the same workflow. Keep your songs together, arrange the slides, and follow the service with confidence.", image: "worship", alt: "MakeChurchEasy worship library with songs and prepared lyric slides", note: "Your song library, ready for Sunday." },
  { id: "lower-thirds", label: "Lower thirds", icon: Type, title: "Give every speaker\na proper introduction.", copy: "Display pastors, speakers, titles and announcements. Choose a theme, add the details, and bring a polished lower third into your OBS output.", image: "lower-thirds", alt: "MakeChurchEasy speaker lower-third controls and theme selection", note: "Speaker names, titles, and announcements." },
  { id: "media", label: "Media", icon: ImageIcon, title: "Everything you want\nthe church to see.", copy: "Show church graphics and media quickly. Keep your service artwork, images, and videos in one place, ready to send into OBS.", image: "media", alt: "The real MakeChurchEasy media library filled with church graphics", note: "Service graphics. Backgrounds. Images. Videos." },
  { id: "time", label: "Countdowns", icon: Timer, title: "Set the pace\nfor your service.", copy: "Handle service countdowns, timers, and clocks from your dock. Keep the team on time and the congregation informed.", image: "countdowns", alt: "MakeChurchEasy countdown controls for pre-service, worship, and sermon", note: "A clear start for every part of the service." },
  { id: "multiview", label: "Multi-view", icon: Layers, title: "More on screen.\nAll working together.", copy: "Manage different presentation outputs more easily. Choose a layout and bring your OBS scenes, scripture, media, and overlays together.", image: "multiview", alt: "MakeChurchEasy multiview layout library with split and picture-in-picture layouts", note: "Choose the arrangement. Add your content." },
];

const questions = [
  { q: "Do I need to create OBS scenes and sources myself?", a: "MakeChurchEazy creates, manages, and updates the scenes and sources required for its presentation workflow. Connect it to OBS, choose your content, and present it." },
  { q: "Does it work on Windows and Mac?", a: "Yes. MakeChurchEazy is available for Windows and macOS. The download page lets you choose the right installer for your computer." },
  { q: "Can our volunteers use it?", a: "The controls are built around the tasks your team already understands: show a Bible verse, display lyrics, introduce a speaker, or put media on screen. Tutorials help your team get comfortable with the workflow." },
  { q: "Can I try it before choosing a paid plan?", a: "Yes. Start with the Free plan, then choose Basic or Growth when you need more capacity and tools. Visit the plans page for current pricing and feature availability." },
  { q: "Do all features require an internet connection?", a: "Many local presentation actions work after setup with downloaded content. Sign-in, downloads, cloud sync, billing, updates, and AI services require an internet connection." },
];

function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={styles.brand} aria-label="MakeChurchEazy home">
    <img src={light ? "/homepage/logo-light.webp" : "/homepage/logo.webp"} alt="" width="40" height="40" />
    <span>MakeChurchEazy<span className={styles.brandDot}>.</span></span>
  </Link>;
}

function ProductView() {
  return <div className={styles.productWindow}>
    <div className={styles.productBar}><span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span><span>MakeChurchEazy <span className={styles.barDivider}>/</span> OBS workspace</span><span className={styles.connected}><i /> Connected</span></div>
    <div className={styles.productBody}>
      <div className={styles.productDock}><div className={styles.screenLabel}><BookOpen size={14} /> BIBLE DOCK</div><img src="/homepage/bible.webp" alt="MakeChurchEasy Bible controls with John 3:16 selected" width="1280" height="720" fetchPriority="high" /></div>
      <div className={styles.productOutput}><div className={styles.screenLabel}><Monitor size={14} /> OBS OUTPUT <span>1920 × 1080</span></div><div className={styles.outputCrop}><img src="/homepage/obs.webp" alt="John 3:16 displayed in the actual OBS presentation output" width="1269" height="768" fetchPriority="high" /></div><div className={styles.outputFooter}><span><Check size={14} /> Scripture on screen</span><span>John 3:16 · KJV</span></div></div>
    </div>
    <div className={styles.productToolbar} aria-hidden="true"><span className={styles.activeTool}><BookOpen /> Bible</span><span><Music2 /> Worship</span><span><ImageIcon /> Media</span><span><Type /> Ministry</span><span><Layers /> Multi-view</span></div>
  </div>;
}

export default function Homepage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [downloadLabel, setDownloadLabel] = useState("Download MakeChurchEazy");
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const feature = features[activeFeature];

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) setDownloadLabel("Download for Windows");
    else if (/Macintosh|Mac OS/i.test(ua)) setDownloadLabel("Download for Mac");
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
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Brand />
        <nav className={styles.desktopNav} aria-label="Main navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#plans">Pricing</a><Link href="/tutorials">Resources <ArrowRight size={14} /></Link></nav>
        <div className={styles.headerActions}><Link className={styles.login} href="/login">Log in</Link><Link className={`${styles.button} ${styles.headerDownload}`} href="/download"><Download size={16} /> Download</Link><button className={styles.menuToggle} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></div>
      </div>
      {menuOpen && <nav id="mobile-menu" className={styles.mobileNav} aria-label="Mobile navigation" onClick={() => setMenuOpen(false)}><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#plans">Pricing</a><Link href="/tutorials">Resources</Link><Link href="/login">Log in</Link></nav>}
    </header>

    <main id="main">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.statusDot} /> BUILT FOR THE PEOPLE BEHIND THE SERVICE</p>
          <h1>Church media.<br />Without the complicated<br /><span>OBS setup.</span></h1>
          <p className={styles.heroDescription}>Bible verses, worship lyrics, lower thirds, media and more.<br className={styles.desktopBreak} /> Right inside the OBS workflow you already know.</p>
          <div className={styles.heroActions}><Link href="/download" className={styles.button}><Download size={18} /> {downloadLabel}</Link><button className={styles.demoLink} onClick={openDemo}><span className={styles.playCircle}><Play size={13} fill="currentColor" /></span> Watch demo <ArrowRight size={16} /></button></div>
          <p className={styles.platforms}><Monitor size={14} /> Windows & macOS <span>·</span> Start free</p>
        </div>
        <div className={styles.heroProduct}><ProductView /><div className={styles.productCaption}><span>No manual scene setup. No manual source setup.</span><a href="#features">Take a closer look <ArrowDown size={14} /></a></div></div>
      </section>

      <div className={styles.featureRail} aria-label="Tools included"><span>ONE WORKFLOW. EVERY MOMENT.</span>{[{ name: "Bible", icon: BookOpen }, { name: "Worship", icon: Music2 }, { name: "Media", icon: ImageIcon }, { name: "Lower thirds", icon: Type }, { name: "Verse AI", icon: Mic }].map(item => <a key={item.name} href={item.name === "Verse AI" ? "#voice-bible" : "#features"} onClick={() => { const index = features.findIndex(feature => feature.label === item.name); if (index >= 0) selectFeature(index); }}><item.icon size={18} />{item.name}</a>)}</div>

      <section className={`${styles.section} ${styles.setupSection}`} id="how-it-works">
        <div className={styles.setupCopy}><p className={styles.eyebrow}>LESS SETUP. MORE SERVICE.</p><h2>You focus on what<br />goes on screen.<br /><span>We handle the setup.</span></h2><p>MakeChurchEazy creates, manages and updates the OBS scenes and sources required for its presentation workflow.</p></div>
        <div className={styles.workflow}><p className={styles.workflowLabel}>YOUR NEW WORKFLOW</p><ol>{[{ n: "01", name: "Connect", text: "Bring MakeChurchEazy into OBS." }, { n: "02", name: "Click", text: "Choose what you want on screen." }, { n: "03", name: "Present", text: "Let the moment take centre stage." }].map(item => <li key={item.n}><span className={styles.stepNumber}>{item.n}</span><div><h3>{item.name}</h3><p>{item.text}</p></div><ArrowRight size={22} /></li>)}</ol><p className={styles.workflowFooter}><Check size={16} /> The scenes and sources? Already taken care of.</p></div>
      </section>

      <section id="features" className={styles.featuresSection}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>FROM THE FIRST SONG TO THE FINAL AMEN</p><h2>Everything you need.<br /><span>Right where you need it.</span></h2><p>One familiar workspace for every part of your service.</p></div>
        <div className={styles.featureTabs} role="tablist" aria-label="Explore presentation tools">{features.map((item, index) => <button key={item.id} id={`feature-tab-${item.id}`} role="tab" aria-selected={index === activeFeature} aria-controls="feature-panel" tabIndex={index === activeFeature ? 0 : -1} onClick={() => selectFeature(index)} onKeyDown={event => { let next = index; if (event.key === "ArrowRight") next = (index + 1) % features.length; else if (event.key === "ArrowLeft") next = (index - 1 + features.length) % features.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = features.length - 1; else return; event.preventDefault(); selectFeature(next, true); }}><item.icon size={18} />{item.label}</button>)}</div>
        <div className={styles.featurePanel} id="feature-panel" role="tabpanel" aria-labelledby={`feature-tab-${feature.id}`} tabIndex={0}>
          <div className={styles.featureText}><p className={styles.eyebrow}>{String(activeFeature + 1).padStart(2, "0")} / {feature.label.toUpperCase()}</p><h3>{feature.title}</h3><p>{feature.copy}</p><Link href="/download" className={styles.textLink}>Make it part of your service <ArrowRight size={17} /></Link><div className={styles.featureNote}><Check size={15} />{feature.note}</div></div>
          <div className={styles.featureScreenshot} key={feature.id}><>{feature.id === "time" ? <div className={styles.countdownExample}><Timer size={28} /><span>PRE-SERVICE COUNTDOWN</span><strong>15:00</strong><p>A clear start. A ready team.</p><div><span>Worship set <b>05:00</b></span><span>Sermon start <b>10:00</b></span></div></div> : <img src={`/homepage/${feature.image}.webp`} alt={feature.alt} width="1280" height="800" loading="lazy" />}<span className={styles.captureLabel}><span className={styles.statusDot} /> {feature.id === "time" ? "COUNTDOWN EXAMPLE" : "INSIDE MAKECHURCHEAZY"}</span></></div>
        </div>
        <p className={styles.availability}>Feature availability varies by plan. <a href="#plans">Find your fit <ArrowRight size={13} /></a></p>
      </section>

      <section className={`${styles.section} ${styles.voiceSection}`} id="voice-bible">
        <div className={styles.voiceArtwork} aria-label="Illustration of a spoken reference becoming a scripture suggestion"><div className={styles.voiceTop}><Mic size={20} /><span>SPEECH + SCRIPTURE</span><span className={styles.exampleLabel}>EXAMPLE</span></div><div className={styles.voiceWave} aria-hidden="true">{Array.from({ length: 39 }, (_, i) => <i key={i} style={{ height: `${12 + ((i * 17 + i * i * 7) % 53)}px` }} />)}</div><div className={styles.spokenWords}>“John chapter three,<br />verse sixteen.”</div><div className={styles.voiceConnector}><ArrowDown size={19} /></div><div className={styles.scriptureSuggestion}><div><BookOpen size={19} /><strong>John 3:16</strong><span>KJV</span></div><p>For God so loved the world, that he gave his only begotten Son…</p><span className={styles.readyLabel}><Check size={14} /> Ready to review and present</span></div></div>
        <div className={styles.voiceCopy}><p className={styles.eyebrow}><Mic size={15} /> VERSE AI</p><h2>Speak it.<br /><span>Show it.</span></h2><p>A preacher calls a Bible reference. Use MakeChurchEazy’s speech and AI tools to find the scripture faster and prepare it for presentation.</p><p className={styles.shortCopy}>Less typing. Less searching.<br />Faster response during live services.</p><button onClick={openDemo} className={styles.textLink}>See the workflow <ArrowRight size={18} /></button></div>
      </section>

      <section className={styles.obsSection} id="obs-workflow"><div className={styles.obsInner}><div className={styles.obsHeading}><p className={styles.eyebrow}><Radio size={15} /> BUILT AROUND OBS</p><h2>Stay in your flow.<br /><span>Stay inside OBS.</span></h2><p>Bible, lyrics, graphics and presentation tools, closer to the place you’re already producing your livestream.</p></div><div className={styles.obsImage}><img src="/homepage/obs.webp" alt="Actual OBS Studio workspace displaying John 3:16 using MakeChurchEasy" width="1269" height="768" loading="lazy" /></div><div className={styles.obsBottom}><span>OBS + MakeChurchEazy</span><span>One simpler church media workflow.</span></div></div></section>

      <section className={`${styles.section} ${styles.volunteerSection}`}><div><p className={styles.eyebrow}>BUILT FOR VOLUNTEERS</p><h2>Your media team<br />shouldn’t need<br /><span>an OBS engineer.</span></h2></div><div><p>Give your team controls based on what they actually want to do. MakeChurchEazy handles the technical work behind the scenes.</p><div className={styles.volunteerActions}>{[{ icon: BookOpen, name: "Show Bible verse", index: 0 }, { icon: Music2, name: "Display lyrics", index: 1 }, { icon: Type, name: "Show speaker name", index: 2 }, { icon: ImageIcon, name: "Put media on screen", index: 3 }].map(item => <a key={item.name} href="#features" onClick={() => selectFeature(item.index)}><item.icon size={20} /><span>{item.name}</span><ArrowRight size={18} /></a>)}</div></div></section>

      <section className={styles.startSection}><div className={styles.sectionHeading}><p className={styles.eyebrow}>YOU’RE CLOSER THAN YOU THINK</p><h2>Get started in minutes.</h2></div><div className={styles.startSteps}>{[{ icon: Download, title: "Install", copy: "Download MakeChurchEazy for Windows or Mac." }, { icon: Radio, title: "Connect", copy: "Connect it with OBS. Let us take care of the setup." }, { icon: Play, title: "Present", copy: "Choose what you want on screen and present it." }].map((step, i) => <article key={step.title}><div className={styles.startStepTop}><step.icon size={24} /><span>0{i + 1}</span></div><h3>{step.title}</h3><p>{step.copy}</p></article>)}</div><Link href="/download" className={styles.button}>Let’s make your next service easier <ArrowRight size={18} /></Link></section>

      <section className={`${styles.section} ${styles.demoSection}`} id="demo"><div><p className={styles.eyebrow}>A CLOSER LOOK</p><h2>See it in action.</h2><p>From a Bible verse to a worship lyric.<br />See how it all comes together in OBS.</p><Link href="/tutorials" className={styles.textLink}>Watch full tutorials <ArrowRight size={17} /></Link></div><button className={styles.demoPreview} onClick={openDemo} aria-label="Watch the MakeChurchEazy product demo"><img src="/homepage/media.webp" alt="" width="1198" height="768" loading="lazy" /><span className={styles.demoOverlay}><span className={styles.largePlay}><Play size={28} fill="currentColor" /></span><strong>The MakeChurchEazy walkthrough</strong><span>Press play. See what’s possible.</span></span></button></section>

      <section className={styles.pricingSection} id="plans"><div className={styles.sectionHeading}><p className={styles.eyebrow}>ROOM TO GROW</p><h2>Simple plans.<br /><span>For your church media team.</span></h2></div><div className={styles.planGrid}>{[{ name: "Free", line: "Find your feet.", copy: "Start with the essentials and explore your new workflow.", cta: "Start free", href: "/signup", icon: BookOpen }, { name: "Basic", line: "Make Sundays simpler.", copy: "For churches getting started with a regular presentation workflow.", cta: "Explore Basic", href: "/subscription/plans", icon: Monitor }, { name: "Growth", line: "Bring it all together.", copy: "For growing media teams that need more capacity and tools.", cta: "Explore Growth", href: "/subscription/plans", icon: Layers }].map(plan => <article className={styles.plan} key={plan.name}><plan.icon size={24} /><p className={styles.planName}>{plan.name}</p><h3>{plan.line}</h3><p>{plan.copy}</p><Link href={plan.href}>{plan.cta}<ArrowRight size={18} /></Link></article>)}</div><Link href="/subscription/plans" className={styles.textLink}>Compare plans and current pricing <ArrowRight size={17} /></Link></section>

      <section className={`${styles.section} ${styles.faqSection}`}><div><p className={styles.eyebrow}>GOOD QUESTIONS</p><h2>A little clarity<br />before you begin.</h2><Link href="/support" className={styles.textLink}>Visit support <ArrowRight size={17} /></Link></div><div className={styles.faqList}>{questions.map(item => <details key={item.q}><summary>{item.q}<ChevronDown size={20} /></summary><p>{item.a}</p></details>)}</div></section>

      <section className={styles.finalCta}><div className={styles.finalMark}><img src="/homepage/logo-light.webp" alt="" width="58" height="58" /></div><p className={styles.eyebrow}>LESS FRICTION. MORE FOCUS.</p><h2>Make your next<br />service <span>Eazier.</span></h2><p>Bible. Worship. Media. Lower thirds. AI.<br />Built around OBS without the complicated setup.</p><Link href="/download" className={styles.lightButton}><Download size={19} />{downloadLabel}</Link><p className={styles.finalPlatforms}>Windows & macOS</p></section>
    </main>

    <footer className={styles.footer}><div className={styles.footerTop}><div><Brand light /><p>For the people behind the service.</p></div><nav aria-label="Footer navigation"><div><strong>Product</strong><a href="#features">Features</a><a href="#plans">Pricing</a><Link href="/download">Download</Link></div><div><strong>Resources</strong><Link href="/tutorials">Tutorials</Link><Link href="/support">Support</Link><Link href="/login">Your account</Link></div></nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} MakeChurchEazy.</span><span>Made for church media teams. Built around OBS.</span></div></footer>

    {demoOpen && <dialog ref={dialogRef} className={styles.demoDialog} aria-labelledby="demo-title" onCancel={() => setDemoOpen(false)} onClose={() => setDemoOpen(false)} onClick={event => { if (event.target === event.currentTarget) setDemoOpen(false); }}><div className={styles.dialogHeader}><h2 id="demo-title">MakeChurchEazy in action</h2><button aria-label="Close demo" onClick={() => setDemoOpen(false)} autoFocus><X size={22} /></button></div><div className={styles.videoFrame}>{!demoLoaded && <div className={styles.videoLoading}>Loading the walkthrough…</div>}<iframe src="https://www.youtube.com/embed/NmneQhxY2jQ?autoplay=1&playsinline=1&rel=0" title="MakeChurchEasy product demo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen onLoad={() => setDemoLoaded(true)} /></div><div className={styles.dialogFooter}>Trouble playing? <a href="https://www.youtube.com/watch?v=NmneQhxY2jQ" target="_blank" rel="noreferrer">Open the demo on YouTube <ArrowRight size={14} /></a></div></dialog>}
  </div>;
}
