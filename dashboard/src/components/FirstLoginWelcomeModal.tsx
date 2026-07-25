"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PartyPopper, Download, X, CheckCircle2, Church, Presentation, Smartphone, BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";

const WELCOME_KEY = "mce_first_login_welcome_shown";

const STEPS = [
  { key: "completeChurchProfile", icon: Church, route: "/church-profile" },
  { key: "setupFirstPresentation", icon: Presentation, route: "/presentations" },
  { key: "connectDevice", icon: Smartphone, route: "/devices" },
  { key: "exploreTutorials", icon: BookOpen, route: "/tutorials" },
] as const;

export function FirstLoginWelcomeModal() {
  const t = useTranslations("dashboard");
  const { mongoUser, refreshMongoUser } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!mongoUser) return;
    if (mongoUser.onboarding?.completedWelcome) return;
    if (localStorage.getItem(WELCOME_KEY) === "true") return;
    const timer = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(timer);
  }, [mongoUser]);

  async function handleDownload() {
    setOpen(false);
    localStorage.setItem(WELCOME_KEY, "true");
    try {
      await fetch("/api/auth/welcome-complete", { method: "POST", credentials: "include" });
      await refreshMongoUser();
    } catch { /* best-effort */ }
    router.push("/downloads");
  }

  async function handleStep(route: string) {
    setOpen(false);
    localStorage.setItem(WELCOME_KEY, "true");
    try {
      await fetch("/api/auth/welcome-complete", { method: "POST", credentials: "include" });
      await refreshMongoUser();
    } catch { /* best-effort */ }
    router.push(route);
  }

  async function handleDismiss() {
    setOpen(false);
    localStorage.setItem(WELCOME_KEY, "true");
    try {
      await fetch("/api/auth/welcome-complete", { method: "POST", credentials: "include" });
      await refreshMongoUser();
    } catch { /* best-effort */ }
  }

  if (!open) return null;

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
          <h2 className="text-xl font-bold text-white">{t("onboarding.welcomeTitle")}</h2>
          <p className="text-sm text-blue-100 mt-1">
            {t("onboarding.welcomeSubtitle")}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm text-slate-600 mb-4 text-center">
            {t("onboarding.welcomeDescription")}
          </p>

          {/* Onboarding Steps */}
          <div className="bg-slate-50 rounded-xl p-4 mb-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              {t("onboarding.getStarted")}
            </p>
            <div className="space-y-1">
              {STEPS.map(({ key, icon: Icon, route }) => (
                <button
                  key={key}
                  onClick={() => handleStep(route)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-100 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-sm text-slate-700 font-medium">{t(`onboarding.${key}`)}</span>
                  <CheckCircle2 className="w-4 h-4 text-slate-300 ml-auto shrink-0" />
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleDownload}
            className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-2 mb-3"
          >
            <Download className="w-4 h-4" />
            {t("onboarding.welcomeDownload")}
          </button>

          <button
            onClick={handleDismiss}
            className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors py-1"
          >
            {t("onboarding.welcomeDismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
