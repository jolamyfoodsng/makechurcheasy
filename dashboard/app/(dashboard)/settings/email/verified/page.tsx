"use client";

import { CheckCircle2, RotateCcw, Shield, Activity, Mail } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";

export default function EmailVerified() {
  const t = useTranslations();
  const { mongoUser } = useAuth();
  const displayName = mongoUser?.name || "there";
  const email = mongoUser?.email || "";

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-h-[calc(100vh-80px)] flex flex-col justify-center items-center pb-16">

      <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 md:p-12 text-center relative overflow-hidden flex flex-col items-center">
        {/* Decorative background blobs */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-60"></div>
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-green-50 rounded-full blur-3xl opacity-60"></div>

        <div className="relative z-10 w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-8 animate-in zoom-in duration-500">
          <div className="absolute inset-0 rounded-full border-4 border-green-500/20 animate-ping delay-150"></div>
          <CheckCircle2 className="w-12 h-12 text-green-600 fill-green-100" />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 relative z-10 tracking-tight">
          {t("settings.emailVerified.title")}
        </h1>

        <p className="text-slate-600 text-sm md:text-base max-w-md mx-auto mb-8 relative z-10">
          {t("settings.emailVerified.description", { name: displayName })}
        </p>

        <div className="w-full max-w-md bg-slate-50 border border-slate-200/60 rounded-xl p-5 mb-8 flex items-center gap-4 relative z-10 mx-auto text-left">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-sm shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">{t("settings.emailVerified.verifiedEmail")}</p>
            <p className="text-sm sm:text-base font-semibold text-slate-900 truncate">{email || t("settings.emailVerified.yourEmail")}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full relative z-10">
          <Link
            href="/settings"
            className="w-full sm:w-auto px-5 py-2.5 h-11 bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-600/20 hover:bg-blue-800 transition-all"
          >
            {t("settings.emailVerified.returnToProfile")}
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 h-11 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold shadow-sm hover:bg-slate-50 transition-all"
          >
            {t("settings.emailVerified.goToDashboard")}
          </Link>
        </div>
      </div>

      {/* Quick Links Section */}
      <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
        <Link href="/security" className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:border-blue-200 transition-shadow flex items-start gap-4 group">
          <div className="w-10 h-10 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{t("settings.emailVerified.updatePassword")}</h3>
            <p className="text-xs text-slate-500 mt-1">{t("settings.emailVerified.updatePasswordDescription")}</p>
          </div>
        </Link>
        <Link href="/security" className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:border-blue-200 transition-shadow flex items-start gap-4 group">
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{t("settings.emailVerified.setup2FA")}</h3>
            <p className="text-xs text-slate-500 mt-1">{t("settings.emailVerified.setup2FADescription")}</p>
          </div>
        </Link>
        <Link href="/security" className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:border-blue-200 transition-shadow flex items-start gap-4 group">
          <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-purple-600 transition-colors">{t("settings.emailVerified.activityLogs")}</h3>
            <p className="text-xs text-slate-500 mt-1">{t("settings.emailVerified.activityLogsDescription")}</p>
          </div>
        </Link>
      </div>

    </div>
  );
}
