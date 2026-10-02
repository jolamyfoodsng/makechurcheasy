"use client";

import { useState } from "react";
import Image from "next/image";
import { Mic, ArrowRight, Check, Sparkles, Volume2, Globe, FileText, Share2, Layers } from "lucide-react";
import styles from "./verse-ai-showcase.module.css";

export default function VerseAiShowcase() {
  const [activeTab, setActiveTab] = useState<1 | 2 | 3>(1);

  return (
    <section className={`${styles.showcase} w-full bg-white relative overflow-hidden border-b border-slate-100`} id="verse-ai-showcase">
      <div className={styles.container}>
        {/* Section Header */}
        <header className={styles.header}>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
            <span className="block text-sm sm:text-base font-black tracking-widest text-[#0c66e4] uppercase">
              VERSE AI 101
            </span>
            <span className="text-xs sm:text-sm font-bold bg-[#deebff] text-[#0747a6] px-3.5 py-1 rounded-full uppercase tracking-wider">
              REAL-TIME SPEECH-TO-SCRIPTURE IN OBS
            </span>
          </div>
          <h2 className={styles.heading}>
            Turn live preaching into scriptures, sermon quotes, and transcripts in real time.
          </h2>
          <p className={styles.lead}>
            Zero scrambling. Zero app switching. OBS listens, detects, and prepares your graphics automatically.
          </p>
          <p className={styles.description}>
            When your pastor calls out an unexpected passage or drops an unforgettable quote, your media team shouldn&apos;t have to panic-search through separate software. MakeChurchEazy hooks straight into your pulpit audio feed inside OBS, transcribes speech in real time, and stages broadcast-ready scripture slides, quote graphics, and multi-lingual subtitles the exact moment they are spoken.
          </p>
        </header>

        {/* Grid Container */}
        <div className={`${styles.featureGrid} grid grid-cols-1 lg:grid-cols-12 items-start`}>

          {/* Left Navigation Tabs */}
          <nav aria-label="Feature Tabs" className={`${styles.featureNav} lg:col-span-4 flex flex-col space-y-4`}>

            {/* Tab 1: Speech-to-Scripture */}
            <button
              type="button"
              onClick={() => setActiveTab(1)}
              className={`text-left w-full relative rounded-2xl p-5 sm:p-6 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00c7e5] cursor-pointer ${
                activeTab === 1
                  ? "bg-[#f4f5f7] shadow-sm border border-slate-200/90"
                  : "bg-transparent hover:bg-gray-50/70 border border-transparent opacity-85 hover:opacity-100"
              }`}
            >
              {activeTab === 1 && (
                <div className="absolute left-0 top-0 bottom-0 w-[6px] bg-[#00c7e5] rounded-l-2xl" />
              )}
              <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#172b4d] mb-2 tracking-tight font-['Open_Sans',var(--font-open-sans),sans-serif]">
                Instant Bible verse detection
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed font-medium mb-3">
                Listens to your pastor&apos;s spoken words and automatically looks up every cited scripture in milliseconds.
              </p>
              {activeTab === 1 && (
                <ul className="space-y-2.5 text-sm sm:text-[15px] text-[#0f172a] font-bold border-t border-slate-200/80 pt-3">
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00c7e5] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>1-Click push to OBS:</strong> Send ready-to-air lower thirds or full-screen sanctuary projector slides instantly.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00c7e5] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Side-by-side translations:</strong> Instantly switch or compare ESV, NIV, KJV, NKJV, and NLT on air.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00c7e5] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>100% offline church engine:</strong> Works reliably on local sanctuary hardware even when Sunday Wi-Fi drops.</span>
                  </li>
                </ul>
              )}
            </button>

            {/* Tab 2: Live Quote & Note Capture */}
            <button
              type="button"
              onClick={() => setActiveTab(2)}
              className={`text-left w-full relative rounded-2xl p-5 sm:p-6 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00c7e5] cursor-pointer ${
                activeTab === 2
                  ? "bg-[#f4f5f7] shadow-sm border border-slate-200/90"
                  : "bg-transparent hover:bg-gray-50/70 border border-transparent opacity-85 hover:opacity-100"
              }`}
            >
              {activeTab === 2 && (
                <div className="absolute left-0 top-0 bottom-0 w-[6px] bg-[#6554c0] rounded-l-2xl" />
              )}
              <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#172b4d] mb-2 tracking-tight font-['Open_Sans',var(--font-open-sans),sans-serif]">
                Auto-capture sermon quotes &amp; key points
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed font-medium mb-3">
                Identifies powerful punchlines and memorable sermon takeaways as they are spoken from the pulpit.
              </p>
              {activeTab === 2 && (
                <ul className="space-y-2.5 text-sm sm:text-[15px] text-[#0f172a] font-bold border-t border-slate-200/80 pt-3">
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#6554c0] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Live editing dock:</strong> Review, polish, or trim pastor quotes in real time before sending them to the stream.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#6554c0] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Stream-ready lower thirds:</strong> Format quotes instantly into church-branded stream titles and overlay banners.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#6554c0] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Social cards &amp; notes:</strong> Generate shareable square/vertical sermon cards and bulletin takeaways with 1 click.</span>
                  </li>
                </ul>
              )}
            </button>

            {/* Tab 3: Transcripts & Translation */}
            <button
              type="button"
              onClick={() => setActiveTab(3)}
              className={`text-left w-full relative rounded-2xl p-5 sm:p-6 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00c7e5] cursor-pointer ${
                activeTab === 3
                  ? "bg-[#f4f5f7] shadow-sm border border-slate-200/90"
                  : "bg-transparent hover:bg-gray-50/70 border border-transparent opacity-85 hover:opacity-100"
              }`}
            >
              {activeTab === 3 && (
                <div className="absolute left-0 top-0 bottom-0 w-[6px] bg-[#00875a] rounded-l-2xl" />
              )}
              <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#172b4d] mb-2 tracking-tight font-['Open_Sans',var(--font-open-sans),sans-serif]">
                Full transcripts &amp; instant live subtitles
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed font-medium mb-3">
                Low-latency word-for-word voice transcription that feeds live captions directly into your broadcast.
              </p>
              {activeTab === 3 && (
                <ul className="space-y-2.5 text-sm sm:text-[15px] text-[#0f172a] font-bold border-t border-slate-200/80 pt-3">
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00875a] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>0.4s low-latency captioning:</strong> Live subtitling rendered directly over your OBS camera feed for accessibility.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00875a] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Multi-lingual live translation:</strong> Stream simultaneous translated subtitles in Spanish, French, Portuguese, and more.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00875a] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Instant sermon archive export:</strong> Export searchable full-text sermon transcripts to PDF, Word, or church bulletin.</span>
                  </li>
                </ul>
              )}
            </button>

          </nav>

          {/* Right Column: Interactive Mockup Display with Scaled Fonts */}
          <div className="lg:col-span-8 flex flex-col items-end w-full">

            {/* Top Right Mini Navigation Indicator (Three Dots) */}
            <div className="flex items-center space-x-2.5 mb-3.5 mr-2">
              <button
                type="button"
                onClick={() => setActiveTab(1)}
                className={`w-3 h-3 rounded-full transition-colors cursor-pointer ${
                  activeTab === 1 ? "bg-[#091E42] scale-110" : "bg-slate-300 hover:bg-slate-400"
                }`}
                aria-label="View Speech-to-Scripture mockup"
              />
              <button
                type="button"
                onClick={() => setActiveTab(2)}
                className={`w-3 h-3 rounded-full transition-colors cursor-pointer ${
                  activeTab === 2 ? "bg-[#091E42] scale-110" : "bg-slate-300 hover:bg-slate-400"
                }`}
                aria-label="View Live Quote Capture mockup"
              />
              <button
                type="button"
                onClick={() => setActiveTab(3)}
                className={`w-3 h-3 rounded-full transition-colors cursor-pointer ${
                  activeTab === 3 ? "bg-[#091E42] scale-110" : "bg-slate-300 hover:bg-slate-400"
                }`}
                aria-label="View Transcripts & Translation mockup"
              />
            </div>

            {/* Selected feature preview */}
            <div className="w-full">

              {/* PANEL 1: SPEECH-TO-SCRIPTURE VIEW */}
              {activeTab === 1 && (
                <div className="w-full animate-in fade-in duration-200">
                  <Image
                    src="/features/verse-ai-live-preaching-obs-studio.jpg"
                    alt="MakeChurchEazy Bible passage in OBS Studio, with preview and program outputs, a church Bible panel, and OBS controls."
                    width={4320}
                    height={2784}
                    priority
                    sizes="(min-width: 1024px) 66vw, 100vw"
                    className="block h-auto w-full"
                  />
                </div>
              )}

              {/* PANEL 2: LIVE QUOTE & NOTE CAPTURE VIEW */}
              {activeTab === 2 && (
                <div className="w-full animate-in fade-in duration-200">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-[#091E42]">
                    <Image
                      src="/features/verse-ai-live-quote-note-capture.jpg"
                      alt="MakeChurchEazy capturing sermon notes and quotes in OBS, with an editable quote panel and live transcript."
                      fill
                      sizes="(min-width: 1024px) 66vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                </div>
              )}

              {/* PANEL 3: TRANSCRIPTS & TRANSLATION VIEW */}
              {activeTab === 3 && (
                <div className="w-full animate-in fade-in duration-200">
                  <Image
                    src="/features/verse-ai-live-transcript-export.jpg"
                    alt="MakeChurchEazy transcript view in OBS, with export and translation controls and detected Bible verses."
                    width={2784}
                    height={1864}
                    sizes="(min-width: 1024px) 66vw, 100vw"
                    className="block h-auto w-full"
                  />
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
