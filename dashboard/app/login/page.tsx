"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  Loader2,
  Mail,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Check,
  Monitor,
  Sparkles,
  ArrowRight,
  Gift,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLogo } from "@/components/AppLogo";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  verifyEmailCode as apiVerifyEmailCode,
  sendVerificationEmail as apiSendVerificationEmail,
  sendPasswordResetEmail as apiSendPasswordResetEmail,
} from "@/lib/api";
import Link from "next/link";

type Mode = "login" | "signup" | "forgot-password" | "check-email" | "signup-success" | "migrate" | "verify-email";

const PENDING_REFERRAL_CODE_KEY = "mce_pending_referral_code";

function normalizeReferralCode(value: string | null): string {
  return (value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const {
    mongoUser,
    loading: authLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    requiresTwoFactor,
    verifyTwoFactor,
    cancelTwoFactor,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();
  const callbackUrlParam = searchParams.get("callbackUrl") || "/dashboard";
  const safeCallbackUrl =
    callbackUrlParam.startsWith("/") && !callbackUrlParam.startsWith("//")
      ? callbackUrlParam
      : "/dashboard";
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [churchName, setChurchName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState("");
  const [migrateEmail, setMigrateEmail] = useState("");
  const [migratePassword, setMigratePassword] = useState("");
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateError, setMigrateError] = useState("");
  const [verifyEmailCode, setVerifyEmailCode] = useState("");
  const [verifyEmailLoading, setVerifyEmailLoading] = useState(false);
  const [verifyEmailError, setVerifyEmailError] = useState("");
  const [verifyEmailNotice, setVerifyEmailNotice] = useState("");
  const [verifyEmailResendTimer, setVerifyEmailResendTimer] = useState(0);
  const verifyResendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const rawRef =
      searchParams.get("ref") ||
      searchParams.get("referral") ||
      searchParams.get("referralCode");
    const storedRef = typeof window !== "undefined" ? localStorage.getItem(PENDING_REFERRAL_CODE_KEY) : null;
    const refCode = normalizeReferralCode(rawRef || storedRef);
    if (refCode) {
      setReferralCode(refCode);
      localStorage.setItem(PENDING_REFERRAL_CODE_KEY, refCode);
    }

    const modeParam = searchParams.get("mode");
    if (modeParam === "signup") {
      setMode("signup");
    }
    const errorParam = searchParams.get("error");
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        google_cancelled: "Google sign-in was cancelled",
        no_code: "Google sign-in failed — no authorization code received",
        google_not_configured: "Google sign-in is not configured",
        token_exchange_failed: "Google sign-in failed — could not complete authentication",
        no_email: "Google account has no email address",
        google_auth_failed: "Google sign-in failed. Please try again.",
        registrations_disabled: "New account registration is currently disabled.",
      };
      setError(errorMessages[errorParam] || `Google sign-in error: ${errorParam}`);
    }
  }, [searchParams]);

  useEffect(() => {
    if (authLoading || requiresTwoFactor) {
      return;
    }

    if (mongoUser && mongoUser.emailVerified !== false) {
      router.replace(safeCallbackUrl);
    }
  }, [authLoading, mongoUser, requiresTwoFactor, router, safeCallbackUrl]);

  // Auto-redirect to dashboard after signup success
  useEffect(() => {
    if (mode === "signup-success") {
      const t = setTimeout(() => router.push(safeCallbackUrl), 1500);
      return () => clearTimeout(t);
    }
  }, [mode, router, safeCallbackUrl]);

  // Cleanup resend timer interval
  useEffect(() => {
    return () => {
      if (verifyResendIntervalRef.current) clearInterval(verifyResendIntervalRef.current);
    };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signInWithEmail(email, password);
      if (result.needsMigration) {
        setMigrateEmail(result.email || email);
        setMode("migrate");
        setLoading(false);
        return;
      }
      if (result.emailNotVerified) {
        setMode("verify-email");
        setVerifyEmailCode("");
        setVerifyEmailError("");
        setVerifyEmailNotice("");
        setVerifyEmailResendTimer(60);
        startResendTimer();
        setLoading(false);
        return;
      }
      if (!result.needsMigration && !requiresTwoFactor) {
        router.push(safeCallbackUrl);
      }
      // If needs2FA, the component re-renders and shows the 2FA screen
    } catch (err: any) {
      setLoading(false);
      if (err.code === "migration-required") {
        setMigrateEmail(email);
        setMode("migrate");
      } else if (err.message?.includes("Invalid") || err.message?.includes("invalid")) {
        setError(t("auth.login.invalidCredentials"));
      } else {
        setError(err.message || t("common.somethingWentWrong"));
      }
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const finalReferralCode = normalizeReferralCode(
        referralCode || localStorage.getItem(PENDING_REFERRAL_CODE_KEY),
      );
      const result = await signUpWithEmail(
        email,
        password,
        name,
        churchName,
        finalReferralCode || undefined,
      );
      if (result.needsEmailVerification) {
        setMode("verify-email");
        setVerifyEmailCode("");
        setVerifyEmailError("");
        setVerifyEmailNotice(
          result.existingAccount
            ? "This email already has an account. A fresh verification code was sent, but your original password is still the one on the account."
            : ""
        );
        setVerifyEmailResendTimer(60);
        startResendTimer();
        setLoading(false);
        return;
      }
      setMode("signup-success");
    } catch (err: any) {
      setLoading(false);
      if (err.message?.includes("already") || err.message?.includes("exists")) {
        setMode("login");
        setError(t("auth.signup.emailAlreadyRegistered"));
      } else if (err.message?.includes("Password")) {
        setError(t("auth.signup.passwordMinLength"));
      } else {
        setError(err.message || t("common.somethingWentWrong"));
      }
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      const needs2FA = await signInWithGoogle(safeCallbackUrl);
      if (!needs2FA) router.push(safeCallbackUrl);
    } catch (err: any) {
      setLoading(false);
      console.error("[auth] Google sign-in error:", err);
      setError(t("auth.google.failed"));
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setForgotPasswordLoading(true);
    try {
      await apiSendPasswordResetEmail(email);
      setMode("check-email");
    } catch (err: any) {
      setError(err.message || t("common.somethingWentWrong"));
    } finally {
      setForgotPasswordLoading(false);
    }
  }

  async function handleTwoFactorVerify(e: React.FormEvent) {
    e.preventDefault();
    setTwoFactorError("");
    setTwoFactorLoading(true);
    try {
      await verifyTwoFactor(twoFactorToken);
      router.push(safeCallbackUrl);
    } catch (err: any) {
      setTwoFactorLoading(false);
      setTwoFactorError(err.message || t("auth.twoFactor.invalidCode"));
      setTwoFactorToken("");
    }
  }

  async function handleMigrate(e: React.FormEvent) {
    e.preventDefault();
    setMigrateError("");
    if (migratePassword.length < 6) {
      setMigrateError(t("auth.passwordReset.passwordMinLength"));
      return;
    }
    setMigrateLoading(true);
    try {
      // Send migration link to the user's email
      const res = await fetch("/api/auth/send-migration-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: migrateEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMigrateLoading(false);
        setMigrateError(data.error || t("auth.migration.failed"));
        return;
      }
      setMigrateLoading(false);
      setMode("check-email");
    } catch {
      setMigrateLoading(false);
      setMigrateError(t("common.somethingWentWrong"));
    }
  }

  function startResendTimer() {
    if (verifyResendIntervalRef.current) clearInterval(verifyResendIntervalRef.current);
    verifyResendIntervalRef.current = setInterval(() => {
      setVerifyEmailResendTimer((prev) => {
        if (prev <= 1) {
          if (verifyResendIntervalRef.current) clearInterval(verifyResendIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleVerifyEmail(e: React.FormEvent) {
    e.preventDefault();
    setVerifyEmailError("");
    setVerifyEmailLoading(true);
    try {
      await apiVerifyEmailCode(email, verifyEmailCode);
      router.push(safeCallbackUrl);
    } catch (err: any) {
      setVerifyEmailLoading(false);
      if (err.status === 429) {
        // Rate limit hit or max attempts exceeded — code was cleared server-side
        setVerifyEmailError(t("auth.emailVerification.maxAttempts"));
        setVerifyEmailResendTimer(60);
        startResendTimer();
      } else if (err.status === 410) {
        // Code expired — server cleared it, user must request a new one
        setVerifyEmailError(t("auth.emailVerification.invalidCode"));
        setVerifyEmailResendTimer(60);
        startResendTimer();
      } else if (err.status === 400 || err.status === 401) {
        setVerifyEmailError(t("auth.emailVerification.invalidCode"));
      } else {
        setVerifyEmailError(err.message || t("common.somethingWentWrong"));
      }
      setVerifyEmailCode("");
    }
  }

  async function handleResendVerificationCode() {
    setVerifyEmailError("");
    try {
      await apiSendVerificationEmail(email);
      setVerifyEmailResendTimer(60);
      startResendTimer();
    } catch (err: any) {
      setVerifyEmailError(err.message || t("common.somethingWentWrong"));
    }
  }

  // Migration screen — user has Firebase account, needs to set a password
  if (mode === "migrate") {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t("auth.migration.title")}</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              {t("auth.migration.description")}
            </p>
          </div>

          {migrateError && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{migrateError}</span>
            </div>
          )}

          <form onSubmit={handleMigrate} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">{t("common.email")}</label>
              <input
                type="email"
                value={migrateEmail}
                readOnly
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-600 outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">{t("auth.passwordReset.newPasswordLabel")}</label>
              <input
                type="password"
                value={migratePassword}
                onChange={(e) => setMigratePassword(e.target.value)}
                required
                minLength={6}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                placeholder={t("auth.signup.passwordPlaceholder")}
              />
            </div>
            <button
              type="submit"
              disabled={migrateLoading}
              className="mt-1 h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {migrateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("auth.migration.sendButton")}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setMode("login"); setMigrateError(""); }}
            className="mt-6 text-xs text-slate-500 hover:text-slate-900 transition-colors font-semibold flex items-center gap-1.5 justify-center w-full cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("auth.forgotPassword.backToSignIn")}
          </button>
        </div>
      </AuthShell>
    );
  }

  // Verify-email screen — 6-digit PIN entry
  if (mode === "verify-email") {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">{t("auth.emailVerification.title")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t("auth.emailVerification.notVerifiedMessage")}</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 mb-5 text-xs text-slate-600">
            <span className="text-slate-400 block text-[11px] uppercase font-semibold tracking-wider mb-0.5">{t("auth.emailVerification.sentTo")}</span>
            <span className="font-bold text-slate-900 break-all">{email}</span>
          </div>

          {verifyEmailError && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{verifyEmailError}</span>
            </div>
          )}

          {verifyEmailNotice && (
            <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5 text-xs text-blue-700">
              {verifyEmailNotice}
            </div>
          )}

          <form onSubmit={handleVerifyEmail} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 text-center">Enter 6-digit verification code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyEmailCode}
                onChange={(e) => setVerifyEmailCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
                className="h-13 w-full rounded-xl border border-slate-200 bg-white px-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
              />
            </div>
            <button
              type="submit"
              disabled={verifyEmailLoading || verifyEmailCode.length !== 6}
              className="h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {verifyEmailLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {verifyEmailLoading ? t("common.verifying") : t("auth.emailVerification.verifyButton")}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleResendVerificationCode}
              disabled={verifyEmailResendTimer > 0}
              className="text-blue-600 font-semibold hover:underline disabled:text-slate-400 disabled:no-underline cursor-pointer"
            >
              {verifyEmailResendTimer > 0
                ? `Resend code in ${verifyEmailResendTimer}s`
                : t("auth.emailVerification.resendCode")}
            </button>
            <button
              type="button"
              onClick={() => { setMode("login"); setVerifyEmailError(""); }}
              className="text-slate-500 hover:text-slate-800 transition-colors font-medium flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t("auth.forgotPassword.backToSignIn")}
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  // Two-Factor Authentication screen
  if (requiresTwoFactor) {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">{t("auth.twoFactor.enterCode")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t("auth.twoFactor.description")}</p>
            </div>
          </div>

          {twoFactorError && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{twoFactorError}</span>
            </div>
          )}

          <form onSubmit={handleTwoFactorVerify} className="flex flex-col gap-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={twoFactorToken}
              onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoFocus
              className="h-13 w-full rounded-xl border border-slate-200 bg-white px-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
            />
            <button
              type="submit"
              disabled={twoFactorLoading || twoFactorToken.length !== 6}
              className="h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {twoFactorLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {twoFactorLoading ? t("common.verifying") : t("auth.twoFactor.verifyButton")}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { cancelTwoFactor(); setTwoFactorToken(""); setTwoFactorError(""); }}
            className="mt-6 text-xs text-slate-500 hover:text-slate-900 transition-colors font-semibold flex items-center gap-1.5 justify-center w-full cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("auth.forgotPassword.backToSignIn")}
          </button>
        </div>
      </AuthShell>
    );
  }

  // Check-email confirmation screen (used for forgot-password and migration)
  if (mode === "check-email") {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-14 h-14 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Mail className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">{t("auth.checkEmail.title")}</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            {t("auth.checkEmail.sentTo")}<br />
            <span className="font-semibold text-slate-900">{email}</span>
          </p>
          <p className="text-xs text-slate-400 mb-6 bg-slate-50 border border-slate-100 rounded-xl p-3">
            {t("auth.checkEmail.instruction")}
          </p>
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); setEmail(""); setPassword(""); }}
            className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white transition-all hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("auth.checkEmail.backToSignIn")}
          </button>
        </div>
      </AuthShell>
    );
  }

  // Signup success — redirect to dashboard
  if (mode === "signup-success") {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-14 h-14 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">{t("auth.signup.accountCreated")}</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            {t("auth.trialStarted.message")}
          </p>
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
        </div>
      </AuthShell>
    );
  }

  // Forgot password screen
  if (mode === "forgot-password") {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t("auth.forgotPassword.title")}</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              {t("auth.forgotPassword.description")}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">{t("common.email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                placeholder={t("auth.login.emailPlaceholder")}
              />
            </div>
            <button
              type="submit"
              disabled={forgotPasswordLoading}
              className="mt-1 h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {forgotPasswordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("auth.forgotPassword.sendButton")}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); }}
            className="mt-6 text-xs text-slate-500 hover:text-slate-900 transition-colors font-semibold flex items-center gap-1.5 justify-center w-full cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("auth.forgotPassword.backToSignIn")}
          </button>
        </div>
      </AuthShell>
    );
  }

  // Main login and signup modes
  return (
    <AuthShell>
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl mb-6 border border-slate-200/60">
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); }}
            className={cn(
              "py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer",
              mode === "login"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/50"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); }}
            className={cn(
              "py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer",
              mode === "signup"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/50"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Create Account
          </button>
        </div>

        {/* Title and subtitle */}
        <div className="mb-5">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {mode === "login" ? "Welcome back" : "Start your 14-day free trial"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
            {mode === "login"
              ? "Sign in to manage your sanctuary displays, licenses, and AI credits."
              : "Full access to offline Bibles, Studio, and AI speech-to-scripture. No credit card required."}
          </p>
        </div>

        {/* Google 1-Click Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 hover:shadow-xs active:bg-slate-100 disabled:opacity-50 cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          <span>{mode === "signup" ? "Sign up with Google" : t("auth.google.continueWith") || "Continue with Google"}</span>
        </button>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">or with email</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Error alert */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Forms */}
        {mode === "login" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">{t("common.email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                placeholder={t("auth.login.emailPlaceholder")}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">{t("common.password")}</label>
                <button
                  type="button"
                  onClick={() => { setMode("forgot-password"); setError(""); }}
                  className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
                >
                  {t("auth.login.forgotPassword")}
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                placeholder={t("auth.login.passwordPlaceholder")}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-1.5 h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? t("auth.login.loading") : t("auth.login.button")}
            </button>

            {/* Desktop App Download Prompt */}
            <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4 text-blue-600" />
                </div>
                <div className="leading-tight">
                  <span className="text-xs font-bold text-slate-900 block">Sanctuary PC or Mac?</span>
                  <span className="text-[11px] text-slate-500 block">Run services with MakeChurchEasy Studio</span>
                </div>
              </div>
              <Link
                href="/downloads"
                className="text-xs font-bold text-blue-700 hover:text-blue-800 whitespace-nowrap hover:underline"
              >
                Download Studio →
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">{t("common.fullName")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                  placeholder={t("auth.signup.namePlaceholder")}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">{t("common.churchName")}</label>
                <input
                  type="text"
                  value={churchName}
                  onChange={(e) => setChurchName(e.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                  placeholder="e.g. Grace Fellowship"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">{t("common.email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                placeholder={t("auth.login.emailPlaceholder")}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">{t("common.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                placeholder={t("auth.signup.passwordPlaceholder")}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Referral Code <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                {referralCode && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Code applied
                  </span>
                )}
              </div>
              <div className="relative">
                <Gift className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => {
                    const val = normalizeReferralCode(e.target.value);
                    setReferralCode(val);
                    if (val) {
                      localStorage.setItem(PENDING_REFERRAL_CODE_KEY, val);
                    } else {
                      localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
                    }
                  }}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm font-mono uppercase tracking-wider text-slate-900 outline-none transition-all placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                  placeholder="e.g. MCEABC12"
                  maxLength={16}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1.5 h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Creating account…" : "Start 14-Day Free Trial"}
            </button>

            {/* Feature Perks */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                <span>14-day free trial with full Growth plan features</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                <span>No credit card required to start</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                <span>Unlimited offline Bible access (KJV, NIV, ESV...)</span>
              </div>
            </div>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

// Reusable responsive layout shell for authentication views
function AuthShell({ children }: { children: React.ReactNode }) {
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

function AuthShowcase() {
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
          Instantly project Bible verses, automate scripture lookup with speech AI, and drive flawless OBS lower thirds for your sanctuary and broadcast.
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
            <span className="font-mono text-[11px] text-slate-400">MakeChurchEasy Studio · Sanctuary Output</span>
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
