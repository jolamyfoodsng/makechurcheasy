"use client";

import React from "react";
import Link from "next/link";
import { AppLogo } from "@/components/AppLogo";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left panel: Form */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-16 max-w-xl mx-auto w-full lg:max-w-none">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <AppLogo className="h-9 w-auto object-contain transition-transform group-hover:scale-105" mode="dark" />
            <div>
              <span className="text-base font-bold text-slate-900 block leading-tight">MakeChurchEasy</span>
              <span className="text-[11px] font-medium text-slate-500 block">Church Presentation Studio</span>
            </div>
          </Link>
          <Link
            href="https://makechurcheasy.com"
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← Back to website
          </Link>
        </div>

        <div className="my-auto py-2">
          {children}
        </div>

        <div className="pt-6 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
          <span>&copy; {new Date().getFullYear()} MakeChurchEasy Inc. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-slate-600 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
            <Link href="/support" className="hover:text-slate-600 transition-colors">Support</Link>
          </div>
        </div>
      </div>

      {/* Right panel: Showcase on lg screens */}
      <AuthShowcase />
    </div>
  );
}

export function AuthShowcase() {
  return (
    <div className="hidden lg:flex lg:w-1/2 xl:w-[52%] relative bg-gradient-to-br from-slate-950 via-[#0B1120] to-[#1E1B4B] text-white flex-col justify-between p-10 xl:p-14 overflow-hidden border-l border-slate-800">
      {/* Ambient background glow */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Badge */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-slate-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          MakeChurchEasy Studio · Sunday Ready
        </div>
        <span className="text-xs text-slate-400">Desktop & Remote</span>
      </div>

      {/* Centerpiece: Headline + App Screenshot Mockup */}
      <div className="relative z-10 my-auto py-8">
        <h2 className="text-2xl xl:text-3xl font-extrabold tracking-tight text-white mb-3 leading-snug">
          Church Presentation Without the Technical Friction
        </h2>
        <p className="text-sm xl:text-base text-slate-300 max-w-lg mb-6 leading-relaxed">
          Instantly project Bible verses, automate scripture lookup with speech AI, and drive flawless OBS lower thirds for your church and broadcast.
        </p>

        {/* Desktop App Window Card */}
        <div className="relative rounded-2xl border border-white/15 bg-slate-900/80 shadow-2xl shadow-black/60 overflow-hidden backdrop-blur-sm">
          {/* Window Titlebar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-white/10 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <span className="font-mono text-[11px] text-slate-400">MakeChurchEasy Studio · Church Output</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded">ON AIR</span>
          </div>

          {/* Screenshot */}
          <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/features/verse-ai-live-preaching-obs-studio.jpg"
              alt="MakeChurchEasy Studio live presentation interface"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>

        {/* 3 Key Feature Checkmarks */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
            <p className="text-xs font-bold text-white">Speech-to-Scripture</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Real-time sermon AI</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
            <p className="text-xs font-bold text-white">Offline Bibles</p>
            <p className="text-[11px] text-slate-400 mt-0.5">KJV, NIV, ESV & more</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
            <p className="text-xs font-bold text-white">OBS & Remote Sync</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Multi-screen lower thirds</p>
          </div>
        </div>
      </div>

      {/* Bottom Quote & Trust */}
      <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
        <p className="italic max-w-md text-slate-300">
          &ldquo;MakeChurchEasy saved our Sunday mornings. The instant scripture lookup and OBS lower-thirds just work.&rdquo;
        </p>
        <span className="font-semibold text-white">1,200+ Churches</span>
      </div>
    </div>
  );
}
