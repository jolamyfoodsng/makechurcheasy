"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertOctagon, CheckCircle2, ChevronRight, X, AlertTriangle, Shield, Download, Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";

export default function DeactivateAccount() {
  const t = useTranslations();
  const { reauthenticate, hasPasswordProvider, deleteAccount } = useAuth();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isPasswordUser = hasPasswordProvider();

  const handleDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPasswordUser && !password) return;
    setError("");
    setLoading(true);
    try {
      await reauthenticate(password);
      await deleteAccount();
      setStep(3);
    } catch (err: any) {
      setLoading(false);
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError(t("settings.deactivate.incorrectPassword"));
      } else {
        setError(t("common.somethingWentWrong"));
      }
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setStep(1);
    setPassword("");
    setError("");
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full pb-16">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6 font-medium">
        <Link href="/settings" className="hover:text-slate-900 transition-colors">{t("settings.deactivate.accountLabel")}</Link>
        <ChevronRight className="w-4 h-4" />
        <Link href="/settings" className="hover:text-slate-900 transition-colors">{t("settings.deactivate.profileLabel")}</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-red-600 font-bold">{t("settings.deactivate.title")}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 md:p-10 border-b border-slate-100 bg-red-50/30">
          <div className="flex items-start gap-4">
            <div className="p-4 bg-red-100 text-red-600 rounded-sm shrink-0 mt-1">
              <AlertOctagon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t("settings.deactivate.title")}</h1>
              <p className="text-slate-600 mt-2 text-sm leading-relaxed max-w-2xl">
                {t("settings.deactivate.description")}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-10">
          <h3 className="font-bold text-slate-900 mb-4">{t("settings.deactivate.whatHappens")}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div className="flex gap-4 p-5 rounded-xl border border-slate-100 bg-slate-50/50">
              <Shield className="w-6 h-6 text-slate-400 shrink-0" />
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{t("settings.deactivate.profileDeleted")}</h4>
                <p className="text-sm text-slate-500 mt-1">{t("settings.deactivate.profileDeletedDescription")}</p>
              </div>
            </div>

            <div className="flex gap-4 p-5 rounded-xl border border-slate-100 bg-slate-50/50">
              <Download className="w-6 h-6 text-slate-400 shrink-0" />
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{t("settings.deactivate.dataRemoval")}</h4>
                <p className="text-sm text-slate-500 mt-1">{t("settings.deactivate.dataRemovalDescription")}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-8 flex flex-col sm:flex-row items-center gap-4 justify-between">
            <p className="text-sm text-slate-500 font-medium text-center sm:text-left">
              {t("settings.deactivate.confirmPrompt")}
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full sm:w-auto px-8 h-11 bg-red-600 text-white rounded-xl text-sm font-semibold shadow-md shadow-red-600/20 hover:bg-red-700 transition-all active:scale-95"
            >
              {t("settings.deactivate.continueToDeactivation")}
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeModal}></div>

          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                {t("settings.deactivate.modalTitle")}
              </h3>
              <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {step === 1 && (
                <div className="space-y-6">
                  <div className="bg-red-50 border border-red-100 p-4 rounded-xl">
                    <h4 className="font-bold text-red-900 text-sm mb-1">{t("settings.deactivate.areYouSure")}</h4>
                    <p className="text-sm text-red-800/80">
                      {t("settings.deactivate.permanentWarning")}
                    </p>
                  </div>

                  <button
                    onClick={() => setStep(2)}
                    className="w-full h-11 bg-red-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-red-700 transition-all"
                  >
                    {t("settings.deactivate.yesUnderstand")}
                  </button>
                  <button
                    onClick={closeModal}
                    className="w-full h-11 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold shadow-sm hover:bg-slate-50 transition-all"
                  >
                    {t("settings.deactivate.cancelKeepAccount")}
                  </button>
                </div>
              )}

              {step === 2 && (
                <form onSubmit={handleDeactivate} className="space-y-6">
                  <p className="text-sm text-slate-600">
                    {isPasswordUser
                      ? t("settings.deactivate.enterPasswordDescription")
                      : t("settings.deactivate.googleVerificationDescription")}
                  </p>

                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                      {error}
                    </div>
                  )}

                  {isPasswordUser ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">{t("settings.deactivate.passwordLabel")}</label>
                      <div className="relative">
                        <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="w-full h-11 pl-10 pr-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-600/25 focus:border-red-600 outline-none"
                          placeholder={t("settings.deactivate.passwordPlaceholder")}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center gap-4">
                      <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">{t("settings.deactivate.signedInWithGoogle")}</p>
                        <p className="text-xs text-slate-500">{t("settings.deactivate.clickDeactivateGoogle")}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setStep(1); setError(""); }}
                      className="flex-1 h-11 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all"
                    >
                      {t("common.back")}
                    </button>
                    <button
                      type="submit"
                      disabled={loading || (isPasswordUser && !password)}
                      className="flex-1 h-11 bg-red-600 disabled:bg-red-400 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {loading ? t("common.deleting") : t("settings.deactivate.deactivateButton")}
                    </button>
                  </div>
                </form>
              )}

              {step === 3 && (
                <div className="py-6 flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-8 h-8 text-slate-500" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">{t("settings.deactivate.deleted")}</h4>
                  <p className="text-sm text-slate-500 max-w-xs">
                    {t("settings.deactivate.deletedMessage")}
                  </p>
                  <button
                    onClick={() => router.push("/login")}
                    className="w-full mt-4 h-11 bg-slate-900 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-slate-800 transition-all"
                  >
                    {t("settings.deactivate.returnToSignIn")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
