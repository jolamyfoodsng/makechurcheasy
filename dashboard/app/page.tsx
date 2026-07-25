"use client";

import { FAQItem } from "@/components/FAQItem";
import {
  BookOpen,
  CheckCircle,
  Clapperboard,
  Download,
  Globe,
  MonitorPlay,
  Music,
  Play,
  Radio,
  Tv,
  X
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function detectOS(): string {
  if (typeof window === "undefined") return "mac";
  const ua = navigator.userAgent;
  if (/mac os/i.test(ua)) return "mac";
  if (/windows/i.test(ua)) return "windows";
  return "other";
}

export default function LandingPage() {
  const [isDemoVideoModalOpen, setDemoVideoModalOpen] = useState(false);
  const os = detectOS();

  const ctaLabel = os === "mac"
    ? "Download for Mac"
    : os === "windows"
    ? "Download for Windows"
    : "Download the App";

  return (
    <div className="bg-[#F8FAFC] text-[#0F172A] antialiased min-h-screen flex flex-col selection:bg-[#1D4ED8]/15 selection:text-[#1D4ED8]" style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#CBD5E1]/60">
        <div className="max-w-[1440px] mx-auto px-6 md:px-10 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto" />
            <span className="text-sm font-bold text-[#0F172A] hidden sm:inline">MakeChurchEasy</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-semibold text-[#334155] hover:text-[#0F172A] transition-colors px-4 py-2"
            >
              Log in
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-28 md:pt-36 pb-20 overflow-hidden flex-1">
        {/* ─── Hero ─── */}
        <section className="max-w-[1440px] mx-auto px-8 md:px-10 gap-16 items-center mb-36 flex flex-col text-center">
          <div className="space-y-8 text-center flex flex-col items-center">
            <h1 className="text-[40px] md:text-[48px] lg:text-[56px] font-bold leading-[1.08] text-[#0F172A] tracking-tight">
              Church Production <br />
              <span className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] bg-clip-text text-transparent">Made Simple.</span>
            </h1>

            <p className="text-base md:text-lg text-[#64748B] leading-relaxed max-w-xl">
              Everything you need to present Bible, worship, media, and more \u2014 right inside OBS Studio.
            </p>

            <Link
              href="/download"
              className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] text-white px-8 py-4 rounded-xl text-base font-bold flex items-center justify-center gap-3 hover:shadow-lg transition-all transform hover:-translate-y-0.5 group"
            >
              <Download className="h-5 w-5 group-hover:-translate-y-0.5 transition-transform" />
              {ctaLabel}
            </Link>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#64748B]">
              <Link href="/download" className="font-semibold text-[#1D4ED8] hover:underline">
                Other platforms &rarr;
              </Link>
              <Link href="/login" className="font-semibold text-[#1D4ED8] hover:underline">
                Already have the app? Log in
              </Link>
              <button
                onClick={() => setDemoVideoModalOpen(true)}
                className="text-[#64748B] hover:text-[#0F172A] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Play className="h-3 w-3" />
                Watch Demo
              </button>
            </div>

            <div className="flex flex-wrap gap-8 pt-4 text-xs text-[#64748B] justify-center font-semibold">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#64748B]" /> Free Credits Included
              </div>
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-[#64748B]" /> Works with OBS Studio
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#64748B]" /> No account required to download
              </div>
            </div>
          </div>

          {/* Video mockup */}
          <div className="relative w-full overflow-hidden bg-[#F1F5F9] shadow-xl border border-[#CBD5E1]/40 p-1 md:p-3 max-w-4xl transform hover:scale-[1.01] transition-transform duration-500">
            <img
              className="w-full h-full object-cover rounded-sm"
              src="/assets/bible-onboarding.gif"
              alt="MakeChurchEasy Bible presentation in OBS"
            />
          </div>
        </section>

        {/* ─── Product Showcase ─── */}
        <section id="showcase" className="max-w-[1440px] mx-auto px-6 mb-40">
          <div className="text-center mb-24">
            <div className="text-xs font-bold tracking-[0.2em] text-[#1D4ED8] uppercase mb-3">
              Everything You Need
            </div>
            <h2 className="text-[32px] md:text-[40px] font-bold text-[#0F172A] tracking-tight mb-4">
              Built For Modern Church Production
            </h2>
            <p className="text-base text-[#64748B] leading-relaxed max-w-2xl mx-auto">
              Bible presentation, worship lyrics, live scripture detection, translation, media management, and production control \u2014 all inside OBS Studio.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-7 hover:shadow-lg hover:border-[#1D4ED8]/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#1D4ED8]/10 flex items-center justify-center mb-5">
                <Radio className="h-5 w-5 text-[#1D4ED8]" />
              </div>
              <h3 className="text-lg font-bold text-[#0F172A] mb-2">Speech-to-Scripture\u2122</h3>
              <p className="text-sm text-[#64748B] leading-relaxed mb-5">Detects Bible references from the pastor&apos;s voice in real time and presents matching verses inside OBS.</p>
              <ul className="space-y-2.5 text-[#334155] text-sm">
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Real-time scripture detection</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Automatic verse matching</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Live sermon transcripts</li>
              </ul>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-7 hover:shadow-lg hover:border-[#1D4ED8]/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/10 flex items-center justify-center mb-5">
                <BookOpen className="h-5 w-5 text-[#7C3AED]" />
              </div>
              <h3 className="text-lg font-bold text-[#0F172A] mb-2">10,000+ Bible Translations</h3>
              <p className="text-sm text-[#64748B] leading-relaxed mb-5">Search, present, and project scripture from a vast library. Fullscreen or lower thirds with beautiful themes.</p>
              <ul className="space-y-2.5 text-[#334155] text-sm">
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Fullscreen &amp; lower thirds</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Customizable themes</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Seamless OBS integration</li>
              </ul>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-7 hover:shadow-lg hover:border-[#1D4ED8]/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/10 flex items-center justify-center mb-5">
                <Music className="h-5 w-5 text-[#F59E0B]" />
              </div>
              <h3 className="text-lg font-bold text-[#0F172A] mb-2">Worship Presentation</h3>
              <p className="text-sm text-[#64748B] leading-relaxed mb-5">Manage your song library, import lyrics online, and generate worship slides automatically with stunning themes.</p>
              <ul className="space-y-2.5 text-[#334155] text-sm">
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Song library &amp; lyric imports</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Auto slide generation</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Worship themes</li>
              </ul>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-7 hover:shadow-lg hover:border-[#1D4ED8]/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#22C55E]/10 flex items-center justify-center mb-5">
                <Globe className="h-5 w-5 text-[#22C55E]" />
              </div>
              <h3 className="text-lg font-bold text-[#0F172A] mb-2">Live Translation</h3>
              <p className="text-sm text-[#64748B] leading-relaxed mb-5">Instantly translate sermon transcripts into dozens of languages. Save and export for your multilingual community.</p>
              <ul className="space-y-2.5 text-[#334155] text-sm">
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Transcript translation</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Saved translation history</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Export PDF &amp; DOCX</li>
              </ul>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-7 hover:shadow-lg hover:border-[#1D4ED8]/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#EF4444]/10 flex items-center justify-center mb-5">
                <MonitorPlay className="h-5 w-5 text-[#EF4444]" />
              </div>
              <h3 className="text-lg font-bold text-[#0F172A] mb-2">Production Control</h3>
              <p className="text-sm text-[#64748B] leading-relaxed mb-5">Multi-view layouts, scene sync, output monitoring, and production control \u2014 all in one workspace for church broadcasts.</p>
              <ul className="space-y-2.5 text-[#334155] text-sm">
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Multi-view layouts</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Scene synchronization</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Output monitoring</li>
              </ul>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-7 hover:shadow-lg hover:border-[#1D4ED8]/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#0EA5E9]/10 flex items-center justify-center mb-5">
                <Clapperboard className="h-5 w-5 text-[#0EA5E9]" />
              </div>
              <h3 className="text-lg font-bold text-[#0F172A] mb-2">Media Management</h3>
              <p className="text-sm text-[#64748B] leading-relaxed mb-5">Organize and present images, videos, and countdowns. Drag-and-drop media directly into your OBS scenes.</p>
              <ul className="space-y-2.5 text-[#334155] text-sm">
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Image &amp; video playback</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Pre-service countdown</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" /> Drag-and-drop to OBS</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ─── OBS Integration ─── */}
        <section id="integration" className="max-w-[1440px] mx-auto px-8 md:px-10 mb-40 bg-[#0F172A] text-white p-10 md:p-14 lg:p-16 border border-[#334155] shadow-xl relative overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#1D4ED8]/5 blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#7C3AED]/5 blur-[120px] pointer-events-none" />

          <div className="relative z-10 text-center max-w-[720px] mx-auto">
            <div className="text-[#22C55E] font-bold text-xs tracking-widest uppercase mb-3">BUILT FOR OBS STUDIO</div>
            <h2 className="text-[28px] md:text-[32px] font-extrabold text-white tracking-tight leading-tight mb-4">Everything You Need. Inside OBS.</h2>
            <p className="text-sm text-[#CBD5E1] leading-relaxed mb-10">
              Run scripture presentation, lower thirds, live translations, and sermon overlays directly inside OBS Studio. No extra presentation software. No duplicate workflows.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 text-left">
              <div className="p-4 rounded-xl border border-[#334155] bg-[#1F2937]/50 hover:bg-[#1F2937]/80 transition-all space-y-1.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-[#22C55E]/20 flex items-center justify-center text-[#22C55E] border border-[#22C55E]/40">
                  <Tv className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-[#F8FAFC]">Runs Natively in OBS</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">Control verses, overlays, and presentations without leaving OBS Studio.</p>
              </div>

              <div className="p-4 rounded-xl border border-[#334155] bg-[#1F2937]/50 hover:bg-[#1F2937]/80 transition-all space-y-1.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-[#22C55E]/20 flex items-center justify-center text-[#22C55E] border border-[#22C55E]/40">
                  <BookOpen className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-[#F8FAFC]">10,000+ Bible Translations</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">Access scripture translations from churches and ministries around the world.</p>
              </div>

              <div className="p-4 rounded-xl border border-[#334155] bg-[#1F2937]/50 hover:bg-[#1F2937]/80 transition-all space-y-1.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-[#22C55E]/20 flex items-center justify-center text-[#22C55E] border border-[#22C55E]/40">
                  <Globe className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-[#F8FAFC]">Live Translation</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">Translate verses and sermon content instantly for multilingual congregations.</p>
              </div>
            </div>

            <div className="pt-8 flex justify-center">
              <Link
                href="/download"
                className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] text-white px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg inline-flex items-center gap-1.5 transform hover:-translate-y-0.5"
              >
                Download the App
              </Link>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="max-w-[1440px] mx-auto px-8 md:px-10 mb-40">
          <div className="max-w-[780px] mx-auto">
            <div className="text-center mb-16">
              <div className="text-xs font-bold tracking-[0.2em] text-[#1D4ED8] uppercase mb-3">
                FAQ
              </div>
              <h2 className="text-[32px] md:text-[40px] font-bold text-[#0F172A] tracking-tight mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-base text-[#64748B] leading-relaxed">
                Everything you need to know about MakeChurchEasy.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { q: "What is MakeChurchEasy?", a: "MakeChurchEasy is an all-in-one church presentation and broadcasting platform built specifically for OBS. It helps churches display Bible verses, worship lyrics, announcements, media, lower thirds, AI-powered ministry tools, and livestream graphics from one simple application." },
                { q: "Does MakeChurchEasy work with OBS Studio?", a: "Yes. MakeChurchEasy is designed specifically for OBS Studio. It integrates directly with OBS to display Bible verses, worship lyrics, media, lower thirds, tickers, announcements, and other presentation elements in real time." },
                { q: "Do I need an account to download the app?", a: "No. You can download the installer without signing up. When you open the app for the first time, you\u2019ll be guided through creating an account or logging in directly inside the application." },
                { q: "Can I download the app on one computer and sign in on another?", a: "Yes. Your account works on any device. Download the app, install it, and sign in with your existing credentials." },
                { q: "What is Speech to Scripture?", a: "Speech to Scripture is an AI-powered feature that listens to a sermon in real time and automatically detects Bible references as they're mentioned. When a verse is recognized, MakeChurchEasy can instantly display the correct scripture inside OBS without requiring manual searching." },
                { q: "What happens if the preacher paraphrases a Bible verse?", a: "Speech to Scripture is designed to recognize many natural ways people reference scripture, including common paraphrases and conversational phrasing. While no AI is perfect, the system is built to handle natural preaching styles rather than relying only on exact quotations." },
                { q: "Do we still need a media operator?", a: "Yes\u2014but their job becomes much easier. Instead of constantly searching for Bible passages or manually advancing scripture slides, the operator can focus on the overall production while MakeChurchEasy handles repetitive presentation tasks." },
                { q: "Can I import my existing worship songs?", a: "Yes. MakeChurchEasy is designed to help churches migrate from other presentation software. Support includes importing worship resources from EasyWorship, ProPresenter, OpenLP, PowerPoint, PDF, plain text, and other supported formats, reducing the need to rebuild your library from scratch." },
                { q: "Is MakeChurchEasy difficult to set up?", a: "No. Most churches can get started in just a few minutes. Download the desktop application, connect it to OBS, pair it with your account, and you're ready to begin presenting Bible verses, worship lyrics, and media." },
                { q: "Can I customize how Bible verses and lyrics look?", a: "Absolutely. You can create and save your own themes for Bible verses, worship lyrics, lower thirds, and fullscreen presentations. Customize fonts, colors, backgrounds, positioning, animations, spacing, and layouts to match your church's branding." },
                { q: "Does MakeChurchEasy support multiple Bible translations?", a: "Yes. You can download and use supported Bible translations within the platform, making it easy to present scripture in the version your church prefers." },
                { q: "Can multiple people use MakeChurchEasy?", a: "Yes. Multiple presentation computers and supported devices can be securely paired with your church account. Administrators can manage connected devices, permissions, and user access from the dashboard." },
                { q: "Does MakeChurchEasy require an internet connection?", a: "Not for most presentation features. Once your required resources are downloaded and configured, Bible presentation, worship lyrics, themes, and OBS integration continue to work locally. Internet access is mainly required for account verification, updates, AI-powered features, and downloading new resources." },
                { q: "Is MakeChurchEasy suitable for small churches?", a: "Yes. MakeChurchEasy is designed for churches of every size\u2014from small congregations with a single volunteer to larger production teams managing complex livestreams. The goal is to simplify church presentations without requiring expensive hardware or complicated workflows." },
              ].map((item, i) => (
                <FAQItem key={i} question={item.q} answer={item.a} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── Bottom CTA ─── */}
        <section className="max-w-[720px] mx-auto px-8 md:px-10 text-center mb-20">
          <h2 className="text-[24px] md:text-[28px] font-bold text-[#0F172A] mb-3 tracking-tight">Ready to simplify your church production?</h2>
          <p className="text-sm text-[#64748B] mb-8">Join thousands of tech teams globally using MakeChurchEasy.</p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/download"
              className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] text-white px-7 py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:shadow-lg transition-all transform hover:-translate-y-0.5 group"
            >
              <Download className="h-4 w-4 group-hover:-translate-y-0.5 transition-transform" />
              {ctaLabel}
            </Link>
            <Link
              href="/login"
              className="bg-white border border-[#CBD5E1] text-[#334155] px-7 py-3.5 rounded-xl text-sm font-semibold hover:bg-[#F1F5F9] hover:border-[#94A3B8] transition-colors"
            >
              Log in
            </Link>
          </div>
          <p className="mt-5 text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Includes 30 free AI credits. No credit card required.</p>
        </section>
      </main>

      {/* ─── Demo Video Modal ─── */}
      {isDemoVideoModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0F172A]/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setDemoVideoModalOpen(false)}
        >
          <div
            className="bg-black w-full max-w-4xl rounded-xl overflow-hidden shadow-2xl border border-[#334155]/80 transform scale-95 md:scale-100 transition-all relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#111827] px-5 py-3.5 flex justify-between items-center border-b border-[#334155]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-[#EF4444] rounded-full animate-pulse" />
                <span className="text-xs font-bold text-[#CBD5E1] uppercase tracking-widest">MakeChurchEasy Demo Tour</span>
              </div>
              <button onClick={() => setDemoVideoModalOpen(false)} className="text-[#94A3B8] hover:text-white p-1 hover:bg-[#1F2937] rounded-lg transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative pb-[56.25%] h-0 bg-black">
              <iframe
                className="absolute top-0 left-0 w-full h-full"
                src="https://www.youtube.com/embed/NmneQhxY2jQ?autoplay=1&mute=1&playsinline=1&rel=0"
                title="MakeChurchEasy OBS Presentation Video Demo"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Footer ─── */}
      <footer className="bg-[#0F172A] text-[#CBD5E1] border-t border-[#334155] w-full py-16 px-8 md:px-10">
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8 text-center md:text-left">
          <div className="space-y-2">
            <div className="text-lg font-bold text-white flex items-center justify-center md:justify-start gap-2">
              <img src="/logos/make_church_easy_white_logo.png" alt="MakeChurchEasy" className="h-12 w-auto" />
              MakeChurchEasy
            </div>
            <div className="text-xs text-[#94A3B8]">\u00a9 2026 MakeChurchEasy. Elevating worship through intelligent automation.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
