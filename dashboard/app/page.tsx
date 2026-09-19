"use client";

import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  Languages,
  Mic,
  MonitorPlay,
  Music,
  Play,
  Radio,
  Tv,
  Wifi,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const features = [
  {
    icon: Mic,
    title: "Speech-to-Scripture",
    description:
      "Listen during a sermon, detect spoken Bible references, and prepare the right scripture for display without frantic searching.",
  },
  {
    icon: BookOpen,
    title: "Bible presentation",
    description:
      "Search installed Bible versions, compare translations, and present scripture as fullscreen slides or lower thirds.",
  },
  {
    icon: Music,
    title: "Worship lyrics",
    description:
      "Build a song library, import lyrics, split sections into slides, and send worship content live from the same dock.",
  },
  {
    icon: MonitorPlay,
    title: "OBS production tools",
    description:
      "Control overlays, multiview, tickers, lower thirds, media, and ministry graphics from one focused presentation workspace.",
  },
  {
    icon: Wifi,
    title: "Browser presentation link",
    description:
      "Open a local presentation URL on another laptop, browser tab, or projector screen and update it instantly from the dock.",
  },
  {
    icon: Languages,
    title: "Transcripts and translation",
    description:
      "Use AI credits for sermon transcription, scripture detection, summaries, notes, and translation workflows.",
  },
];

const planHighlights = [
  "Free includes 50 credits, 3 songs, 3 images, 2 videos, and 3 Bible versions.",
  "Basic includes 300 monthly credits, 50 media items, lower thirds, tickers, and multiview.",
  "Growth unlocks presentation mode, remote control, bulk imports, cloud sync, 10 devices, and 1,000 monthly credits.",
];

const faq = [
  {
    question: "Does MakeChurchEasy work without OBS?",
    answer:
      "Yes. OBS is the main workflow, but presentation links let you show the same live content in a browser on another laptop, tab, or extended display.",
  },
  {
    question: "Do local presentation actions need internet?",
    answer:
      "Most Bible, worship, theme, media, and browser-link presentation actions run locally after setup. Internet is mainly needed for sign-in, sync, downloads, billing, AI, and updates.",
  },
  {
    question: "Can I use my own Bible and worship styles?",
    answer:
      "Yes. You can customize fullscreen and lower-third themes, backgrounds, reference styling, typography, layouts, and worship slide appearance.",
  },
  {
    question: "Can I import existing worship songs?",
    answer:
      "Yes. Paid plans support larger libraries, and Growth adds bulk import flows for moving existing song resources faster.",
  },
];

type DesktopOS = "mac" | "windows" | "other";

function getDesktopOS(): DesktopOS {
  if (typeof window === "undefined") return "mac";
  const ua = window.navigator.userAgent;
  if (/windows/i.test(ua)) return "windows";
  if (/mac os|macintosh/i.test(ua)) return "mac";
  return "other";
}

export default function LandingPage() {
  const [os, setOs] = useState<DesktopOS>("mac");
  const [isDemoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    setOs(getDesktopOS());
  }, []);

  const ctaLabel =
    os === "windows" ? "Download for Windows" : os === "mac" ? "Download for Mac" : "Download the App";

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased selection:bg-[#1D4ED8]/15 selection:text-[#1D4ED8]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#CBD5E1]/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2" aria-label="MakeChurchEasy home">
            <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-9 w-auto" />
            <span className="hidden text-sm font-bold tracking-tight text-[#0F172A] sm:inline">MakeChurchEasy</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-[#334155] md:flex">
            <a href="#features" className="hover:text-[#1D4ED8]">
              Features
            </a>
            <a href="#plans" className="hover:text-[#1D4ED8]">
              Plans
            </a>
            <Link href="/download" className="hover:text-[#1D4ED8]">
              Download
            </Link>
            <Link href="/support" className="hover:text-[#1D4ED8]">
              Support
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-[#334155] hover:bg-[#F1F5F9] hover:text-[#0F172A] sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1E40AF]"
            >
              <Download className="h-4 w-4" />
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-16">
        <section className="border-b border-[#E2E8F0] bg-white">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 md:px-8 md:py-24 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#334155]">
                <Radio className="h-4 w-4 text-[#22C55E]" />
                Version 3.0: OBS and browser presentation
              </div>

              <h1 className="text-[40px] font-bold leading-[1.06] tracking-tight text-[#0F172A] md:text-[56px]">
                Everything your church needs to present beautifully in OBS.
              </h1>

              <p className="mt-7 max-w-xl text-lg leading-8 text-[#64748B]">
                Present Bible verses, worship lyrics, media, lower thirds, tickers, countdowns, and announcements from one simple workspace built for church media teams.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/download"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-[#1E40AF]"
                >
                  <Download className="h-5 w-5" />
                  {ctaLabel}
                </Link>
                <button
                  type="button"
                  onClick={() => setDemoOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-6 py-3.5 text-base font-bold text-[#334155] transition hover:bg-[#F1F5F9]"
                >
                  <Play className="h-5 w-5" />
                  Watch Demo
                </button>
              </div>

              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-[#64748B]">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#22C55E]" />
                  2-week trial
                </span>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#22C55E]" />
                  No credit card required
                </span>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#22C55E]" />
                  Windows and macOS
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-lg border border-[#334155] bg-[#0F172A] p-2 shadow-2xl">
                <img
                  src="/assets/bible-onboarding.gif"
                  alt="MakeChurchEasy Bible presentation workflow"
                  className="aspect-video w-full rounded-md object-cover"
                />
              </div>
              <p className="mt-5 text-center text-sm font-semibold italic text-[#64748B]">
                Control your church presentation. Preview every output. Send it live when your team is ready.
              </p>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#1D4ED8]">
              Everything You Need
            </div>
            <h2 className="text-[32px] font-bold tracking-tight text-[#0F172A] md:text-[40px]">
              Built for modern church production
            </h2>
            <p className="mt-4 text-base leading-7 text-[#64748B]">
              Keep Bible, worship, media, announcements, AI tools, and presentation output in one workflow that volunteers can operate quickly.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-sm transition hover:border-[#1D4ED8]/30 hover:shadow-md"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8]">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-[#0F172A]">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#64748B]">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-[#334155] bg-[#0F172A] px-5 py-20 text-white md:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#22C55E]">
                Built for OBS Studio
              </div>
              <h2 className="text-[32px] font-bold leading-tight tracking-tight md:text-[40px]">
                Use OBS when you have it. Use a browser link when you do not.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#CBD5E1]">
                MakeChurchEasy gives your media team the same dock-driven presentation workflow for OBS sources and browser projection screens.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Tv,
                  title: "OBS overlays",
                  copy: "Bible, worship, lower thirds, tickers, countdowns, and media.",
                },
                {
                  icon: Wifi,
                  title: "Local links",
                  copy: "Project from another laptop, browser tab, or extended display.",
                },
                {
                  icon: ArrowLeftRight,
                  title: "Instant updates",
                  copy: "Every dock click updates the active output target.",
                },
              ].map((item) => (
                <article key={item.title} className="rounded-lg border border-[#334155] bg-[#111827] p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-[#F8FAFC]">{item.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-[#94A3B8]">{item.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="plans" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#1D4ED8]">
                Free, Basic, and Growth
              </div>
              <h2 className="text-[32px] font-bold tracking-tight text-[#0F172A] md:text-[40px]">
                Start free. Upgrade when your production grows.
              </h2>
              <p className="mt-4 text-base leading-7 text-[#64748B]">
                Plans follow the current MakeChurchEasy source of truth: Free, Basic, and Growth. Pro is no longer offered as a public plan.
              </p>
              <Link
                href="/subscription/plans"
                className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1E40AF]"
              >
                View Plans
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-sm">
              <ul className="space-y-4">
                {planHighlights.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6 text-[#334155]">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#22C55E]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8 md:pb-24">
          <div className="mx-auto max-w-3xl">
            <div className="mb-10 text-center">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#1D4ED8]">FAQ</div>
              <h2 className="text-[32px] font-bold tracking-tight text-[#0F172A] md:text-[40px]">
                Common questions
              </h2>
            </div>

            <div className="space-y-3">
              {faq.map((item) => (
                <article key={item.question} className="rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-[#0F172A]">{item.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#64748B]">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[#CBD5E1] bg-[#F1F5F9] px-5 py-16 text-center md:px-8">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-[30px] font-bold leading-tight tracking-tight text-[#0F172A] md:text-[42px]">
              Present every service with confidence.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#64748B]">
              Download MakeChurchEasy, connect OBS or open a presentation link, and run your church media workflow from one workspace.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/download"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#1E40AF]"
              >
                <Download className="h-4 w-4" />
                {ctaLabel}
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-6 py-3.5 text-sm font-bold text-[#334155] transition hover:bg-[#F8FAFC]"
              >
                Log in
              </Link>
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#64748B]">
              Start with free credits. Upgrade anytime to unlock more capacity.
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-[#0F172A] px-5 py-12 text-[#CBD5E1] md:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.1fr_2fr]">
          <div>
            <div className="flex items-center gap-2">
              <img src="/logos/make_church_easy_white_logo.png" alt="MakeChurchEasy" className="h-10 w-auto" />
              <span className="text-sm font-bold text-white">MakeChurchEasy</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[#94A3B8]">
              Everything your church media team needs to present scriptures, worship lyrics, media, and ministry graphics beautifully.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white">Product</h3>
              <nav className="mt-4 flex flex-col gap-3 text-sm text-[#94A3B8]">
                <a href="#features" className="hover:text-white">Features</a>
                <a href="#plans" className="hover:text-white">Plans</a>
                <Link href="/download" className="hover:text-white">Download</Link>
              </nav>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white">Resources</h3>
              <nav className="mt-4 flex flex-col gap-3 text-sm text-[#94A3B8]">
                <Link href="/support" className="hover:text-white">Support</Link>
                <Link href="/tutorials" className="hover:text-white">Tutorials</Link>
                <Link href="/login" className="hover:text-white">Account</Link>
              </nav>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white">Core Tools</h3>
              <div className="mt-4 flex flex-col gap-3 text-sm text-[#94A3B8]">
                <span>Bible</span>
                <span>Worship</span>
                <span>Presentation</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 border-t border-[#334155] pt-6 text-xs text-[#94A3B8] md:flex-row md:items-center md:justify-between">
          <span>© 2026 MakeChurchEasy. Built for church media teams.</span>
          <span>Church presentation and livestream software for OBS.</span>
        </div>
      </footer>

      {isDemoOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0F172A]/80 p-4 backdrop-blur-md"
          onClick={() => setDemoOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-lg border border-[#334155] bg-black shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#334155] bg-[#111827] px-5 py-3.5">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#CBD5E1]">
                MakeChurchEasy Demo Tour
              </span>
              <button
                type="button"
                onClick={() => setDemoOpen(false)}
                className="rounded-lg p-2 text-[#94A3B8] transition hover:bg-[#1F2937] hover:text-white"
                aria-label="Close demo video"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative aspect-video bg-black">
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube.com/embed/NmneQhxY2jQ?autoplay=1&mute=1&playsinline=1&rel=0"
                title="MakeChurchEasy OBS Presentation Video Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
