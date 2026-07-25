"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Crown,
  X,
  Sparkles,
  Mic,
  Languages,
  Smartphone,
  MonitorPlay,
  Music,
  RefreshCw,
  Download,
  Zap,
  Shield,
  Users,
} from "lucide-react";

const STORAGE_KEY = "mce_premium_welcome";

const PLAN_DISPLAY: Record<
  string,
  { name: string; icon: React.ElementType; gradient: string; features: { icon: React.ElementType; label: string }[] }
> = {
  basic: {
    name: "Basic",
    icon: Zap,
    gradient: "from-blue-600 to-blue-700",
    features: [
      { icon: MonitorPlay, label: "Lower Thirds & Tickers" },
      { icon: Crown, label: "Slideshow mode" },
      { icon: Music, label: "30 songs, 20 images, 10 videos" },
      { icon: Zap, label: "50 AI credits/month" },
      { icon: Download, label: "2 devices, 20 Bible versions" },
    ],
  },
  growth: {
    name: "Growth",
    icon: Sparkles,
    gradient: "from-blue-600 to-indigo-700",
    features: [
      { icon: MonitorPlay, label: "Countdowns for on-time services" },
      { icon: Mic, label: "Speech-to-Scripture" },
      { icon: Smartphone, label: "Mobile Control" },
      { icon: Languages, label: "Live Translation" },
      { icon: Music, label: "EasyWorship import" },
      { icon: RefreshCw, label: "Unlimited themes & cloud sync" },
      { icon: Zap, label: "2,000 AI credits/month" },
      { icon: Crown, label: "MultiView for multi-camera" },
    ],
  },
  pro: {
    name: "Pro",
    icon: Crown,
    gradient: "from-indigo-600 to-purple-700",
    features: [
      { icon: Zap, label: "Unlimited AI credits" },
      { icon: Download, label: "200 GB cloud storage" },
      { icon: Users, label: "Team & campus management" },
      { icon: Crown, label: "Custom reports & API access" },
      { icon: Shield, label: "Priority support & onboarding" },
      { icon: Smartphone, label: "Everything in Growth" },
    ],
  },
};

interface PendingWelcome {
  reference: string;
  plan: string;
  planName?: string;
  billingCycle?: string;
}

export function PremiumWelcomeModal() {
  const [open, setOpen] = useState(false);
  const [planData, setPlanData] = useState<PendingWelcome | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data: PendingWelcome = JSON.parse(raw);
      if (!data.plan) return;

      setPlanData(data);
      const timer = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(timer);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  function handleDismiss() {
    setOpen(false);
    localStorage.removeItem(STORAGE_KEY);
    setPlanData(null);
  }

  if (!open || !planData) return null;

  const display = PLAN_DISPLAY[planData.plan];
  if (!display) {
    handleDismiss();
    return null;
  }

  const Icon = display.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200"
      onClick={handleDismiss}
    >
      <div
        className="w-full max-w-[440px] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`relative bg-gradient-to-br ${display.gradient} px-6 pt-8 pb-6 text-center`}>
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Icon className="w-7 h-7 text-white" />
          </div>
          <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-1">
            Payment Confirmed
          </p>
          <h2 className="text-xl font-bold text-white">
            Thank you for subscribing to {display.name}
          </h2>
          <p className="text-sm text-blue-100 mt-1">
            Your premium access is active now.
          </p>
        </div>

        {/* Features */}
        <div className="px-6 py-5">
          <div className="bg-slate-50 rounded-xl p-4 mb-5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              What you&apos;ve unlocked
            </p>
            <div className="grid grid-cols-2 gap-2">
              {display.features.map((feature, idx) => {
                const FeatureIcon = feature.icon;
                return (
                  <div key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    {feature.label}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="w-full h-11 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors"
          >
            Start Using {display.name}
          </button>
        </div>
      </div>
    </div>
  );
}
