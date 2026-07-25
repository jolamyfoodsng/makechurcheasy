"use client";

import { Chrome, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";

export default function ManageGoogle() {
  const t = useTranslations();
  const { isGoogleLinked, hasPasswordProvider } = useAuth();
  const linked = isGoogleLinked();
  const hasPassword = hasPasswordProvider();

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto w-full space-y-6 pb-16">
      {/* Header */}
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> {t("settings.google.backToSettings")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t("settings.google.title")}</h1>
        <p className="text-slate-500 mt-1 text-sm">{t("settings.google.description")}</p>
      </div>

      {/* Status Card */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center shrink-0">
            <Chrome className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t("settings.google.googleSignIn")}</h2>
            <p className="text-sm text-slate-500">
              {linked
                ? t("settings.google.signedUpWithGoogle")
                : t("settings.google.signedUpWithEmail")}
            </p>
          </div>
        </div>

        {/* Current Status */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 mb-6">
          <div className={`w-3 h-3 rounded-full shrink-0 ${linked ? "bg-green-500" : "bg-slate-300"}`} />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {linked ? t("settings.google.googleConnected") : t("settings.google.emailPassword")}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {linked
                ? t("settings.google.canSignInWithGoogle")
                : t("settings.google.signInWithEmail")}
            </p>
          </div>
        </div>

        {linked && hasPassword && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 border border-green-200 mb-6">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-green-800">{t("settings.google.fullAccess")}</p>
              <p className="text-xs text-green-700 mt-1">{t("settings.google.fullAccessDescription")}</p>
            </div>
          </div>
        )}

        {!linked && !hasPassword && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 mb-6">
            <p className="text-xs text-blue-700">
              {t("settings.google.addGoogleInfo")}
            </p>
          </div>
        )}

        <Link
          href="/settings"
          className="flex items-center justify-center gap-2 px-5 py-2.5 h-11 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors bg-white shadow-sm w-full sm:w-auto"
        >
          {t("common.done")}
        </Link>
      </section>

      {/* Info */}
      <section className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-blue-900 mb-2">{t("settings.google.aboutGoogleSignIn")}</h3>
        <ul className="space-y-1.5 text-xs text-blue-800">
          <li>• {t("settings.google.infoList[0]")}</li>
          <li>• {t("settings.google.infoList[1]")}</li>
          <li>• {t("settings.google.infoList[2]")}</li>
          <li>• {t("settings.google.infoList[3]")}</li>
        </ul>
      </section>
    </div>
  );
}
