"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, PartyPopper, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/lib/useSubscription";

const TRIAL_WELCOME_KEY = "mce_trial_welcome_shown";

const TRIAL_FEATURE_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

export function TrialWelcomeModal() {
  const t = useTranslations();
  const { mongoUser } = useAuth();
  const { isOnTrial, trialEndsAt } = useSubscription();
  const [open, setOpen] = useState(false);
  const trialDays = mongoUser?.trial?.durationDays ?? 20;

  useEffect(() => {
    if (!isOnTrial || !mongoUser) return;
    if (mongoUser.trial?.welcomeShown) return;
    if (localStorage.getItem(TRIAL_WELCOME_KEY) === "true") return;
    const timer = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(timer);
  }, [isOnTrial, mongoUser]);

  async function handleDismiss() {
    setOpen(false);
    localStorage.setItem(TRIAL_WELCOME_KEY, "true");
    try {
      await fetch("/api/auth/trial-welcome", { method: "POST", credentials: "include" });
    } catch { /* best-effort */ }
  }

  if (!open) return null;

  const endDate = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200"
      onClick={handleDismiss}
    >
      <div
        className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-blue-600 to-indigo-700 px-6 pt-8 pb-6 text-center">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <PartyPopper className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">{t("trial.welcomeTitle")}</h2>
          <p className="text-sm text-blue-100 mt-1">
            {t("trial.welcomeSubtitle")}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm text-slate-600 mb-4 text-center">
            {t("trial.fullAccessDescription", { days: trialDays })}
          </p>

          <div className="bg-slate-50 rounded-xl p-4 mb-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              {t("trial.includedInTrial")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TRIAL_FEATURE_INDICES.map((i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  {t(`trial.features.${i}`)}
                </div>
              ))}
            </div>
          </div>

          {endDate && (
            <p className="text-xs text-slate-400 text-center mb-4">
              {t("trial.trialEndsOn")} <span className="font-semibold text-slate-600">{endDate}</span>
            </p>
          )}

          <button
            onClick={handleDismiss}
            className="w-full h-11 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors"
          >
            {t("trial.getStarted")}
          </button>
        </div>
      </div>
    </div>
  );
}
