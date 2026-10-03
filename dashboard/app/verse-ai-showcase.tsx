"use client";

import { useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
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
            Follow the sermon. Find the scripture. Capture the message.
          </h2>
          <p className={styles.lead}>
            Verse AI brings speech-to-scripture, sermon quote capture, and transcripts into your OBS workflow.
          </p>
          <p className={styles.description}>
            Connect a microphone or OBS audio input and Verse AI listens to the sermon. When it recognizes a spoken Bible reference, it suggests the passage so your operator can review it, choose a translation, and prepare it for presentation without leaving OBS. The speech tools also help your team follow the message, capture quotes, and work with transcripts.
          </p>
          <p className={styles.serviceNote}>Speech recognition and AI features require an internet connection and depend on your plan and available credits.</p>
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
                Find spoken Bible references
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed font-medium mb-3">
                When a preacher says a reference such as “John chapter three, verse sixteen,” Verse AI turns the spoken words into a scripture suggestion. Your operator checks the suggested passage before sending it to the screen.
              </p>
              {activeTab === 1 && (
                <ul className="space-y-2.5 text-sm sm:text-[15px] text-[#0f172a] font-bold border-t border-slate-200/80 pt-3">
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00c7e5] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Review before presenting:</strong> Check the suggested reference and verse before choosing what appears on screen.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00c7e5] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Choose a translation:</strong> Prepare the verse using an available Bible translation.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00c7e5] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Present from the OBS workflow:</strong> Send the reviewed verse to your presentation output.</span>
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
                Capture and prepare sermon quotes
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed font-medium mb-3">
                Capture meaningful lines from the message, then review and edit the wording before your team puts a quote on screen.
              </p>
              {activeTab === 2 && (
                <ul className="space-y-2.5 text-sm sm:text-[15px] text-[#0f172a] font-bold border-t border-slate-200/80 pt-3">
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#6554c0] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Review and edit:</strong> Refine a captured quote in the dock before it is shown to viewers.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#6554c0] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Prepare a visual:</strong> Use a sermon quote in a lower third or other available presentation format.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#6554c0] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Keep the key point:</strong> Capture a sermon takeaway for your team to reuse after the service.</span>
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
                Follow the sermon with a transcript
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed font-medium mb-3">
                View the spoken message as text and use transcript tools to review what was said. Translation and export options help your team work with the transcript after it is captured.
              </p>
              {activeTab === 3 && (
                <ul className="space-y-2.5 text-sm sm:text-[15px] text-[#0f172a] font-bold border-t border-slate-200/80 pt-3">
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00875a] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Review the transcript:</strong> Return to the captured words to find a reference or sermon point.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00875a] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Translate the message:</strong> Use the available translation controls to create another language version.</span>
                  </li>
                  <li className="flex items-start text-slate-800">
                    <Check className="w-4 h-4 text-[#00875a] mr-2.5 mt-0.5 stroke-[3] shrink-0" />
                    <span><strong>Export a copy:</strong> Keep a transcript for your church’s records or later review.</span>
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
