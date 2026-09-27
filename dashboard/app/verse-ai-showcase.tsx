"use client";

import { useState } from "react";
import Image from "next/image";
import { Mic, ArrowRight, Check, Sparkles, Volume2, Globe, FileText, Share2, Layers } from "lucide-react";

export default function VerseAiShowcase() {
  const [activeTab, setActiveTab] = useState<1 | 2 | 3>(1);

  return (
    <section className="w-full bg-white relative overflow-hidden border-b border-slate-100" id="verse-ai-showcase">
      <div className="max-w-[1520px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-14 pt-12 sm:pt-16 pb-24 w-full">
        {/* Section Header */}
        <header className="max-w-5xl mx-auto flex flex-col items-center text-center mb-12 sm:mb-16 font-['Open_Sans',var(--font-open-sans),sans-serif]">
          <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
            <span className="block text-sm sm:text-base font-black tracking-widest text-[#0c66e4] uppercase">
              VERSE AI 101
            </span>
            <span className="text-xs sm:text-sm font-bold bg-[#deebff] text-[#0747a6] px-3.5 py-1 rounded-full uppercase tracking-wider">
              REAL-TIME SPEECH-TO-SCRIPTURE IN OBS
            </span>
          </div>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black text-[#172b4d] leading-[1.1] tracking-tight mb-5 text-balance text-center">
            Turn live preaching into scriptures, sermon quotes, and transcripts in real time.
          </h2>
          <p className="text-base sm:text-xl md:text-2xl text-[#44546f] leading-relaxed font-normal max-w-3xl sm:max-w-4xl text-center text-balance font-sans">
            <strong className="text-[#172b4d] font-bold">Think PewBeam, but directly inside OBS.</strong> You don&apos;t need to juggle three different apps just to get things done on Sunday morning—never scramble to find unannounced Bible verses or missed quotes again. MakeChurchEazy listens to your pastor’s voice and stages broadcast-ready content the moment it&apos;s spoken, <span className="text-[#0c66e4] font-bold underline decoration-2 underline-offset-4">directly inside OBS.</span>
          </p>
        </header>

        {/* Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">

          {/* Left Navigation Tabs (Shortened, Clean Key Points, Large Fonts) */}
          <nav aria-label="Feature Tabs" className="lg:col-span-4 flex flex-col space-y-4">

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
                Project Bible verses at the speed of light
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed font-medium mb-3">
                Listens to your pastor in real time and detects quoted scriptures automatically.
              </p>
              {activeTab === 1 && (
                <ul className="space-y-2 text-sm sm:text-[15px] text-[#0f172a] font-bold border-t border-slate-200/80 pt-3">
                  <li className="flex items-center text-slate-800">
                    <Check className="w-4 h-4 text-[#00c7e5] mr-2.5 stroke-[3] shrink-0" />
                    <span>1-Click push to OBS lower-thirds &amp; projector</span>
                  </li>
                  <li className="flex items-center text-slate-800">
                    <Check className="w-4 h-4 text-[#00c7e5] mr-2.5 stroke-[3] shrink-0" />
                    <span>Multi-translation side-by-side (ESV, NIV, KJV)</span>
                  </li>
                  <li className="flex items-center text-slate-800">
                    <Check className="w-4 h-4 text-[#00c7e5] mr-2.5 stroke-[3] shrink-0" />
                    <span>100% offline church sanctuary engine</span>
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
                Capture &amp; edit sermon quotes on the fly
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed font-medium mb-3">
                Turn standout sermon points into broadcast visuals and take-home notes instantly.
              </p>
              {activeTab === 2 && (
                <ul className="space-y-2 text-sm sm:text-[15px] text-[#0f172a] font-bold border-t border-slate-200/80 pt-3">
                  <li className="flex items-center text-slate-800">
                    <Check className="w-4 h-4 text-[#6554c0] mr-2.5 stroke-[3] shrink-0" />
                    <span>Auto-detects memorable sermon principles</span>
                  </li>
                  <li className="flex items-center text-slate-800">
                    <Check className="w-4 h-4 text-[#6554c0] mr-2.5 stroke-[3] shrink-0" />
                    <span>Live editing dock before going to air</span>
                  </li>
                  <li className="flex items-center text-slate-800">
                    <Check className="w-4 h-4 text-[#6554c0] mr-2.5 stroke-[3] shrink-0" />
                    <span>Social-ready 1:1 cards &amp; lower-thirds</span>
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
                Full transcripts &amp; instant translation
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed font-medium mb-3">
                Word-for-word message records with real-time multi-lingual subtitles.
              </p>
              {activeTab === 3 && (
                <ul className="space-y-2 text-sm sm:text-[15px] text-[#0f172a] font-bold border-t border-slate-200/80 pt-3">
                  <li className="flex items-center text-slate-800">
                    <Check className="w-4 h-4 text-[#00875a] mr-2.5 stroke-[3] shrink-0" />
                    <span>0.4s low-latency word-for-word speech capture</span>
                  </li>
                  <li className="flex items-center text-slate-800">
                    <Check className="w-4 h-4 text-[#00875a] mr-2.5 stroke-[3] shrink-0" />
                    <span>Real-time translation feeds (Spanish, Portuguese, French)</span>
                  </li>
                  <li className="flex items-center text-slate-800">
                    <Check className="w-4 h-4 text-[#00875a] mr-2.5 stroke-[3] shrink-0" />
                    <span>1-Click export to bulletin notes &amp; archive</span>
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
