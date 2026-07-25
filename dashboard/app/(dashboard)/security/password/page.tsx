"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronRight, CheckCircle2, Lock, Eye, EyeOff, Info, ArrowRight, Mail, AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { updateUser, changePassword } from "@/lib/api";
import { getUserId } from "@/lib/userId";
import { useTranslations } from "next-intl";

type Step = 1 | 2 | 3 | 4 | "forgot" | "sent";

function getPasswordStrength(pw: string, t: ReturnType<typeof useTranslations>): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: t("security.password.strengthWeak"), color: "bg-red-500" };
  if (score === 2) return { score: 2, label: t("security.password.strengthFair"), color: "bg-orange-500" };
  if (score === 3) return { score: 3, label: t("security.password.strengthGood"), color: "bg-yellow-500" };
  return { score: 4, label: t("security.password.strengthStrong"), color: "bg-green-500" };
}

export default function ChangePassword() {
  const t = useTranslations();
  const { reauthenticate, hasPasswordProvider, updatePassword, sendPasswordResetEmail, mongoUser } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isPasswordUser = hasPasswordProvider();

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getPasswordStrength(newPassword, t), [newPassword, t]);
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasNumberOrSymbol = /[0-9]/.test(newPassword) || /[^A-Za-z0-9]/.test(newPassword);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await reauthenticate(currentPassword);
      setLoading(false);
      setStep(2);
    } catch (err: any) {
      setLoading(false);
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError(t("security.password.incorrectPassword"));
      } else {
        setError(t("common.somethingWentWrong"));
      }
    }
  }

  function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError(t("security.password.passwordMinLength"));
      return;
    }
    setError("");
    setStep(3);
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t("security.password.passwordsDoNotMatch"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      // Update Firebase Auth password
      await updatePassword(newPassword);
      // Also update MongoDB password hash (so desktop app login stays in sync)
      changePassword(newPassword).catch(() => { });
      const userId = getUserId();
      if (userId) {
        await updateUser(userId, { passwordLastChanged: new Date().toISOString() }).catch(() => { });
      }
      setLoading(false);
      setStep(4);
    } catch (err: any) {
      setLoading(false);
      if (err.code === "auth/requires-recent-login") {
        setError(t("security.password.pleaseSignIn"));
      } else if (err.code === "auth/weak-password") {
        setError(t("security.password.passwordTooWeak"));
      } else {
        setError(t("common.somethingWentWrong"));
      }
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(mongoUser?.email ?? "");
      setLoading(false);
      setStep("sent");
    } catch (err: any) {
      setLoading(false);
      if (err.code === "auth/user-not-found") {
        setError(t("security.password.noAccountFound"));
      } else {
        setError(t("common.somethingWentWrong"));
      }
    }
  }

  const StepIndicator = ({ num, current, label }: { num: number; current: number; label: string }) => {
    const isCompleted = current > num;
    const isActive = current === num;

    return (
      <div className="flex flex-col items-center gap-2 relative z-10">
        <div className={cn(
          "w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-base border-2 transition-colors",
          isCompleted ? "bg-blue-700 border-blue-700 text-white" :
            isActive ? "bg-blue-700 border-blue-700 text-white shadow-md" :
              "bg-slate-50 border-slate-200 text-slate-400"
        )}>
          {isCompleted ? <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6" /> : num}
        </div>
        <span className={cn(
          "text-[10px] md:text-xs font-bold uppercase tracking-wider text-center hidden sm:block",
          isCompleted || isActive ? "text-blue-600" : "text-slate-400"
        )}>
          {label}
        </span>
      </div>
    );
  };

  const StepLine = ({ active }: { active: boolean }) => (
    <div className={cn(
      "flex-1 h-1 rounded-full mx-2 transition-colors",
      active ? "bg-blue-700" : "bg-slate-200"
    )} />
  );

  if (step === "forgot" || step === "sent") {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto w-full min-h-[calc(100vh-80px)] flex flex-col justify-center pb-16">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          {step === "forgot" ? (
            <>
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("security.password.resetPassword")}</h2>
              <p className="text-slate-500 text-sm mb-8">
                {t("security.password.resetDescription")}
              </p>
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
              <form onSubmit={handleForgot} className="space-y-6">
                <div>
                  <input
                    type="email"
                    required
                    value={mongoUser?.email ?? ""}
                    readOnly
                    className="w-full h-11 px-4 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 text-sm outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-blue-700 text-white rounded-xl font-semibold hover:bg-blue-800 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("security.password.sendResetLink")}
                </button>
              </form>
              <div className="mt-6">
                <button onClick={() => { setStep(1); setError(""); }} className="text-blue-600 text-sm font-bold hover:underline">
                  {t("security.password.backToVerify")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("security.password.checkYourEmail")}</h2>
              <p className="text-slate-500 text-sm mb-8">
                {t("security.password.resetSentDescription")}
              </p>
              <button onClick={() => { setStep(1); setError(""); }} className="w-full h-11 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors shadow-sm">
                {t("security.password.returnToSecurity")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-h-[calc(100vh-80px)] flex flex-col pb-16">

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-8 font-medium">
        <Link href="/settings" className="hover:text-slate-900 transition-colors">Account</Link>
        <ChevronRight className="w-4 h-4" />
        <Link href="/security" className="hover:text-slate-900 transition-colors">{t("security.title")}</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-blue-600 font-bold">{t("security.changePassword")}</span>
      </div>

      {/* Stepper */}
      <div className="w-full max-w-3xl mx-auto mb-12">
        <div className="flex items-center justify-between px-2">
          <StepIndicator num={1} current={step as number} label="Verify" />
          <StepLine active={(step as number) > 1} />
          <StepIndicator num={2} current={step as number} label={t("security.password.newPassword")} />
          <StepLine active={(step as number) > 2} />
          <StepIndicator num={3} current={step as number} label={t("common.confirm")} />
          <StepLine active={(step as number) > 3} />
          <StepIndicator num={4} current={step as number} label="Success" />
        </div>
      </div>

      <div className="flex-1 flex justify-center w-full">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden h-fit">

          {/* Error banner */}
          {error && (
            <div className="mx-6 mt-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
              <button onClick={() => setError("")} className="ml-auto shrink-0 text-red-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">1</div>
                <h2 className="text-xl font-bold text-slate-900">{t("security.password.verifyIdentity")}</h2>
              </div>
              <p className="text-sm text-slate-500 mb-8">
                {isPasswordUser
                  ? t("security.password.verifyDescription")
                  : t("security.password.verifyGoogleDescription")}
              </p>

              <form onSubmit={handleVerify} className="space-y-6">
                {isPasswordUser ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">{t("security.password.currentPassword")}</label>
                    <div className="relative">
                      <input
                        type={showCurrent ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        placeholder="••••••••••••"
                        className="w-full h-11 px-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600 outline-none transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
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
                      <p className="text-sm font-semibold text-slate-900">Signed in with Google</p>
                      <p className="text-xs text-slate-500">Click &quot;Continue&quot; to verify with your Google account</p>
                    </div>
                  </div>
                )}

                {isPasswordUser && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setStep("forgot"); setError(""); }} className="text-sm text-blue-600 font-bold hover:underline">
                      {t("auth.login.forgotPassword")}
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || (!isPasswordUser ? false : !currentPassword)}
                  className="w-full h-11 bg-blue-700 text-white rounded-xl font-semibold hover:bg-blue-800 transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("common.continue")}
                </button>
              </form>
            </div>
          )}

          {step === 2 && (
            <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">2</div>
                <h2 className="text-xl font-bold text-slate-900">{t("security.password.createNewPassword")}</h2>
              </div>
              <p className="text-sm text-slate-500 mb-8">
                {t("security.password.newPasswordDescription")}
              </p>

              <form onSubmit={handleNewPassword} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t("security.password.newPassword")}</label>
                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder={t("security.password.newPasswordPlaceholder")}
                      className="w-full h-11 px-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600 outline-none transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Dynamic Password Strength */}
                {newPassword.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700">{t("security.password.passwordStrength")}</span>
                      <span className={cn(
                        "text-xs font-bold",
                        strength.score === 1 && "text-red-600",
                        strength.score === 2 && "text-orange-600",
                        strength.score === 3 && "text-yellow-600",
                        strength.score === 4 && "text-green-600"
                      )}>
                        {strength.label}
                      </span>
                    </div>
                    <div className="flex gap-1 h-1.5 w-full">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex-1 rounded-full transition-colors",
                            i <= strength.score ? strength.color : "bg-slate-200"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("security.password.requirements")}</p>
                  <ul className="space-y-2">
                    <li className={cn("flex items-center gap-2 text-sm", hasMinLength ? "text-green-600" : "text-slate-400")}>
                      {hasMinLength ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                      {t("security.password.requirementMinLength")}
                    </li>
                    <li className={cn("flex items-center gap-2 text-sm", hasUpper ? "text-green-600" : "text-slate-400")}>
                      {hasUpper ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                      {t("security.password.requirementUppercase")}
                    </li>
                    <li className={cn("flex items-center gap-2 text-sm", hasNumberOrSymbol ? "text-green-600" : "text-slate-400")}>
                      {hasNumberOrSymbol ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                      {t("security.password.requirementNumber")}
                    </li>
                  </ul>
                </div>

                <button
                  type="submit"
                  disabled={!hasMinLength}
                  className="w-full h-11 bg-blue-700 text-white rounded-xl font-semibold hover:bg-blue-800 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {t("common.continue")} <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">3</div>
                <h2 className="text-xl font-bold text-slate-900">{t("security.password.confirmPassword")}</h2>
              </div>
              <p className="text-sm text-slate-500 mb-8">
                {t("security.password.confirmDescription")}
              </p>

              <form onSubmit={handleConfirm} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t("security.password.confirmNewPassword")}</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      placeholder="••••••••••••"
                      className={cn(
                        "w-full h-11 px-4 border rounded-lg focus:ring-2 focus:border-transparent outline-none transition-all font-mono",
                        confirmPassword && newPassword !== confirmPassword
                          ? "border-red-300 focus:ring-red-200"
                          : "border-slate-200 focus:ring-blue-600/25 focus:border-blue-600"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> {t("security.password.passwordsDoNotMatch")}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Must match the password entered in the previous step.
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={loading || !confirmPassword || newPassword !== confirmPassword}
                    className="w-full h-11 bg-blue-700 text-white rounded-xl font-semibold hover:bg-blue-800 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    {loading ? t("security.password.updating") : t("security.password.updatePassword")}
                  </button>
                  <button type="button" onClick={() => { setStep(2); setError(""); }} className="w-full h-11 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition-colors">
                    {t("common.back")}
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === 4 && (
            <div className="p-10 flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6 relative">
                <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">{t("security.password.passwordUpdated")}</h2>
              <p className="text-sm text-slate-500 mb-8 max-w-xs">
                {t("security.password.updatedDescription")}
              </p>
              <Link
                href="/security"
                className="w-full h-11 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {t("security.password.returnToSecurity")} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

        </div>
      </div>

      {(step as number) < 4 && (
        <div className="mt-8 text-center">
          <Link href="/security" className="text-sm text-slate-500 hover:text-slate-900 transition-colors font-medium">
            {t("security.password.cancelReturn")}
          </Link>
        </div>
      )}

    </div>
  );
}
