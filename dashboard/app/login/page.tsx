"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Mail,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Monitor,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/AuthLayout";
import {
  verifyEmailCode as apiVerifyEmailCode,
  sendVerificationEmail as apiSendVerificationEmail,
  sendPasswordResetEmail as apiSendPasswordResetEmail,
} from "@/lib/api";

type Mode = "login" | "forgot-password" | "check-email" | "migrate" | "verify-email";

export default function Login() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const {
    mongoUser,
    loading: authLoading,
    signInWithEmail,
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);

  // 2FA state
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState("");

  // Migration state
  const [migrateEmail, setMigrateEmail] = useState("");
  const [migratePassword, setMigratePassword] = useState("");
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateError, setMigrateError] = useState("");

  // Email verification state (when signing in with unverified email)
  const [verifyEmailCode, setVerifyEmailCode] = useState("");
  const [verifyEmailLoading, setVerifyEmailLoading] = useState(false);
  const [verifyEmailError, setVerifyEmailError] = useState("");
  const [verifyEmailNotice, setVerifyEmailNotice] = useState("");
  const [verifyEmailResendTimer, setVerifyEmailResendTimer] = useState(0);
  const verifyResendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // If someone visits /login?mode=signup, forward to dedicated /signup page
    const modeParam = searchParams.get("mode");
    if (modeParam === "signup") {
      const ref =
        searchParams.get("ref") ||
        searchParams.get("referral") ||
        searchParams.get("referralCode");
      router.replace(ref ? `/signup?ref=${encodeURIComponent(ref)}` : "/signup");
      return;
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
  }, [searchParams, router]);

  useEffect(() => {
    if (authLoading || requiresTwoFactor) return;
    if (mongoUser && mode === "login") {
      router.replace(safeCallbackUrl);
    }
  }, [authLoading, mongoUser, requiresTwoFactor, mode, router, safeCallbackUrl]);

  useEffect(() => {
    return () => {
      if (verifyResendIntervalRef.current) clearInterval(verifyResendIntervalRef.current);
    };
  }, []);

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
    } catch (err: any) {
      setLoading(false);
      if (err.code === "migration-required") {
        setMigrateEmail(email);
        setMode("migrate");
      } else if (err.message?.includes("Invalid") || err.message?.includes("invalid")) {
        setError(t("auth.login.invalidCredentials") || "Invalid email or password");
      } else {
        setError(err.message || t("common.somethingWentWrong") || "Something went wrong. Please try again.");
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
      setError(t("auth.google.failed") || "Google sign-in failed. Please try again.");
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
      setError(err.message || t("common.somethingWentWrong") || "Failed to send reset email.");
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
      setTwoFactorError(err.message || t("auth.twoFactor.invalidCode") || "Invalid 2FA code");
      setTwoFactorToken("");
    }
  }

  async function handleMigrate(e: React.FormEvent) {
    e.preventDefault();
    setMigrateError("");
    if (migratePassword.length < 6) {
      setMigrateError(t("auth.passwordReset.passwordMinLength") || "Password must be at least 6 characters");
      return;
    }
    setMigrateLoading(true);
    try {
      const res = await fetch("/api/auth/send-migration-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: migrateEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMigrateLoading(false);
        setMigrateError(data.error || t("auth.migration.failed") || "Migration failed");
        return;
      }
      setMigrateLoading(false);
      setMode("check-email");
    } catch {
      setMigrateLoading(false);
      setMigrateError(t("common.somethingWentWrong") || "Something went wrong");
    }
  }

  async function handleVerifyEmail(e: React.FormEvent) {
    e.preventDefault();
    const code = verifyEmailCode.trim();
    if (!code || code.length !== 6) {
      setVerifyEmailError("Please enter the 6-digit code sent to your email.");
      return;
    }
    setVerifyEmailError("");
    setVerifyEmailLoading(true);
    try {
      await apiVerifyEmailCode(email, code);
      router.push(safeCallbackUrl);
    } catch (err: any) {
      setVerifyEmailLoading(false);
      setVerifyEmailError(err.message || "Invalid or expired verification code.");
      setVerifyEmailCode("");
    }
  }

  async function handleResendVerificationEmail() {
    if (verifyEmailResendTimer > 0) return;
    setVerifyEmailError("");
    try {
      await apiSendVerificationEmail(email);
      setVerifyEmailResendTimer(60);
      startResendTimer();
    } catch (err: any) {
      setVerifyEmailError(err.message || "Failed to resend verification email.");
    }
  }

  // ── Mode: Two-Factor Authentication ──
  if (requiresTwoFactor) {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3.5 mb-5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {t("auth.twoFactor.enterCode") || "Two-Factor Authentication"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("auth.twoFactor.description") || "Enter the 6-digit code from your authenticator app"}
              </p>
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
              {twoFactorLoading ? (t("common.verifying") || "Verifying…") : (t("auth.twoFactor.verifyButton") || "Verify and Continue")}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              cancelTwoFactor();
              setTwoFactorToken("");
              setTwoFactorError("");
            }}
            className="mt-6 text-xs text-slate-500 hover:text-slate-900 transition-colors font-semibold flex items-center gap-1.5 justify-center w-full cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("auth.forgotPassword.backToSignIn") || "Back to sign in"}
          </button>
        </div>
      </AuthShell>
    );
  }

  // ── Mode: Check Email (forgot-password or migration) ──
  if (mode === "check-email") {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-14 h-14 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Mail className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {t("auth.checkEmail.title") || "Check your email"}
          </h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            {t("auth.checkEmail.sentTo") || "We sent instructions to"}<br />
            <span className="font-semibold text-slate-900">{email}</span>
          </p>
          <p className="text-xs text-slate-400 mb-6 bg-slate-50 border border-slate-100 rounded-xl p-3">
            {t("auth.checkEmail.instruction") || "Click the link in the email to proceed. If you don't see it, check your spam folder."}
          </p>
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
              setEmail("");
              setPassword("");
            }}
            className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white transition-all hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("auth.checkEmail.backToSignIn") || "Back to sign in"}
          </button>
        </div>
      </AuthShell>
    );
  }

  // ── Mode: Forgot Password ──
  if (mode === "forgot-password") {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {t("auth.forgotPassword.title") || "Reset your password"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              {t("auth.forgotPassword.description") || "Enter your email address and we'll send you a link to reset your password."}
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                {t("common.email") || "Email"}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                placeholder={t("auth.login.emailPlaceholder") || "pastor@church.org"}
              />
            </div>
            <button
              type="submit"
              disabled={forgotPasswordLoading}
              className="mt-1 h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {forgotPasswordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("auth.forgotPassword.sendButton") || "Send Reset Link"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className="mt-6 text-xs text-slate-500 hover:text-slate-900 transition-colors font-semibold flex items-center gap-1.5 justify-center w-full cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("auth.forgotPassword.backToSignIn") || "Back to sign in"}
          </button>
        </div>
      </AuthShell>
    );
  }

  // ── Mode: Verify Email (unverified sign-in) ──
  if (mode === "verify-email") {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3.5 mb-5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Verify your email</h2>
              <p className="text-xs text-slate-500 mt-0.5">We sent a 6-digit code to {email}</p>
            </div>
          </div>

          {verifyEmailNotice && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800">
              {verifyEmailNotice}
            </div>
          )}

          {verifyEmailError && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{verifyEmailError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyEmail} className="flex flex-col gap-4">
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
            <button
              type="submit"
              disabled={verifyEmailLoading || verifyEmailCode.length !== 6}
              className="h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {verifyEmailLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {verifyEmailLoading ? "Verifying…" : "Verify and Continue"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
            <span>Didn&apos;t receive a code?</span>
            <button
              type="button"
              onClick={handleResendVerificationEmail}
              disabled={verifyEmailResendTimer > 0}
              className="font-semibold text-blue-600 hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
            >
              {verifyEmailResendTimer > 0 ? `Resend in ${verifyEmailResendTimer}s` : "Resend code"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setMode("login");
              setVerifyEmailError("");
            }}
            className="mt-6 text-xs text-slate-500 hover:text-slate-900 transition-colors font-semibold flex items-center gap-1.5 justify-center w-full cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  // ── Mode: Account Migration ──
  if (mode === "migrate") {
    return (
      <AuthShell>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Account Upgrade Required</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              We&apos;ve upgraded our security system. We&apos;ll send a verification link to your email to securely set up your upgraded login.
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                {t("common.email") || "Email"}
              </label>
              <input
                type="email"
                value={migrateEmail}
                disabled
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-600 outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                New Password
              </label>
              <input
                type="password"
                value={migratePassword}
                onChange={(e) => setMigratePassword(e.target.value)}
                required
                minLength={6}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                placeholder="Choose a new password"
              />
            </div>
            <button
              type="submit"
              disabled={migrateLoading}
              className="mt-1 h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {migrateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Send Upgrade Link
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMigrateError("");
            }}
            className="mt-6 text-xs text-slate-500 hover:text-slate-900 transition-colors font-semibold flex items-center gap-1.5 justify-center w-full cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  // ── Main Dedicated Login Screen ──
  return (
    <AuthShell>
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        {/* Title and subtitle */}
        <div className="mb-5">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Welcome back
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
            Sign in to manage your sanctuary displays, licenses, and AI credits.
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
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>{t("auth.google.continueWith") || "Continue with Google"}</span>
        </button>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            or with email
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Error alert */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              {t("common.email") || "Email"}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
              placeholder={t("auth.login.emailPlaceholder") || "pastor@church.org"}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                {t("common.password") || "Password"}
              </label>
              <button
                type="button"
                onClick={() => {
                  setMode("forgot-password");
                  setError("");
                }}
                className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                {t("auth.login.forgotPassword") || "Forgot password?"}
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
              placeholder={t("auth.login.passwordPlaceholder") || "••••••••"}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-1.5 h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? (t("auth.login.loading") || "Signing in…") : (t("auth.login.button") || "Sign In")}
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

        {/* Dedicated Link to Signup */}
        <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs sm:text-sm text-slate-500">
          <span>Don&apos;t have an account? </span>
          <Link
            href="/signup"
            className="text-blue-600 font-semibold hover:text-blue-700 hover:underline cursor-pointer"
          >
            Create an account
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
