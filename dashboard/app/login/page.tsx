"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Loader2, Mail, ArrowLeft, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { countries } from "@/lib/countries";
import { AppLogo } from "@/components/AppLogo";
import { useTranslations } from "next-intl";
import {
  verifyEmailCode as apiVerifyEmailCode,
  sendVerificationEmail as apiSendVerificationEmail,
  sendPasswordResetEmail as apiSendPasswordResetEmail,
} from "@/lib/api";
import Link from "next/link";

type Mode = "login" | "signup" | "forgot-password" | "check-email" | "signup-success" | "migrate" | "verify-email";

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
  const [country, setCountry] = useState("");
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
      const result = await signUpWithEmail(email, password, name, churchName, country);
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px]">
          <div className="flex flex-col items-center mb-8">
            <AppLogo className="h-14 w-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">MakeChurchEasy</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("auth.migration.title")}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t("auth.migration.description")}
            </p>

            {migrateError && (
              <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                {migrateError}
              </div>
            )}

            <form onSubmit={handleMigrate} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("common.email")}</label>
                <input
                  type="email"
                  value={migrateEmail}
                  readOnly
                  className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 text-sm text-slate-600 dark:text-slate-400 outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("auth.passwordReset.newPasswordLabel")}</label>
                <input
                  type="password"
                  value={migratePassword}
                  onChange={(e) => setMigratePassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                  placeholder={t("auth.signup.passwordPlaceholder")}
                />
              </div>
              <button
                type="submit"
                disabled={migrateLoading}
                className="mt-0.5 h-11 rounded-xl bg-blue-700 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {migrateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("auth.migration.sendButton")}
              </button>
            </form>

            <button
              onClick={() => { setMode("login"); setMigrateError(""); }}
              className="mt-4 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium flex items-center gap-1 justify-center w-full"
            >
              <ArrowLeft className="w-3 h-3" />
              {t("auth.forgotPassword.backToSignIn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Verify-email screen — 6-digit PIN entry
  if (mode === "verify-email") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px]">
          <div className="flex flex-col items-center mb-8">
            <AppLogo className="h-14 w-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">MakeChurchEasy</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("auth.emailVerification.title")}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t("auth.emailVerification.title")}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("auth.emailVerification.notVerifiedMessage")}</p>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              {t("auth.emailVerification.sentTo")}
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-4">{email}</p>

            {verifyEmailError && (
              <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {verifyEmailError}
              </div>
            )}

            {verifyEmailNotice && (
              <div className="mb-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                {verifyEmailNotice}
              </div>
            )}

            <form onSubmit={handleVerifyEmail} className="flex flex-col gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyEmailCode}
                onChange={(e) => setVerifyEmailCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
                className="h-12 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50"
              />
              <button
                type="submit"
                disabled={verifyEmailLoading || verifyEmailCode.length !== 6}
                className="h-11 rounded-xl bg-blue-700 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {verifyEmailLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {verifyEmailLoading ? t("auth.emailVerification.verifying") : t("auth.emailVerification.verifyButton")}
              </button>
            </form>

            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={handleResendVerificationCode}
                disabled={verifyEmailResendTimer > 0}
                className="text-xs text-blue-600 font-bold hover:underline disabled:text-slate-400 disabled:cursor-not-allowed disabled:no-underline"
              >
                {verifyEmailResendTimer > 0
                  ? t("auth.emailVerification.resendCooldown", { seconds: verifyEmailResendTimer })
                  : t("auth.emailVerification.resendCode")}
              </button>
              <button
                onClick={() => { setMode("login"); setVerifyEmailCode(""); setVerifyEmailError(""); setVerifyEmailNotice(""); setError(""); }}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                {t("auth.emailVerification.backToSignIn")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Two-Factor Authentication screen
  if (requiresTwoFactor) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px]">
          <div className="flex flex-col items-center mb-8">
            <AppLogo className="h-14 w-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">MakeChurchEasy</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("auth.twoFactor.title")}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t("auth.twoFactor.enterCode")}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("auth.twoFactor.description")}</p>
              </div>
            </div>

            {twoFactorError && (
              <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {twoFactorError}
              </div>
            )}

            <form onSubmit={handleTwoFactorVerify} className="flex flex-col gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={twoFactorToken}
                onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
                className="h-12 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50"
              />
              <button
                type="submit"
                disabled={twoFactorLoading || twoFactorToken.length !== 6}
                className="h-11 rounded-xl bg-blue-700 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {twoFactorLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {twoFactorLoading ? t("common.verifying") : t("auth.twoFactor.verifyButton")}
              </button>
            </form>

            <button
              onClick={() => { cancelTwoFactor(); setTwoFactorToken(""); setTwoFactorError(""); }}
              className="mt-4 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium flex items-center gap-1 justify-center w-full"
            >
              <ArrowLeft className="w-3 h-3" />
              {t("auth.forgotPassword.backToSignIn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check-email confirmation screen (used for forgot-password and migration)
  if (mode === "check-email") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px]">
          <div className="flex flex-col items-center mb-8">
            <AppLogo className="h-14 w-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">MakeChurchEasy</h1>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t("auth.checkEmail.title")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {t("auth.checkEmail.sentTo")}<br />
              <span className="font-semibold text-slate-900 dark:text-white">{email}</span>
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
              {t("auth.checkEmail.instruction")}
            </p>
            <button
              onClick={() => { setMode("login"); setError(""); setEmail(""); setPassword(""); }}
              className="w-full h-11 rounded-xl bg-slate-900 dark:bg-white text-sm font-semibold text-white dark:text-slate-900 transition-colors hover:bg-slate-800 dark:hover:bg-slate-100 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("auth.checkEmail.backToSignIn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Signup success — redirect to dashboard
  if (mode === "signup-success") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px]">
          <div className="flex flex-col items-center mb-8">
            <AppLogo className="h-14 w-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">MakeChurchEasy</h1>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t("auth.signup.accountCreated")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {t("auth.trialStarted.message")}
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  // Forgot password screen
  if (mode === "forgot-password") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px]">
          <div className="flex flex-col items-center mb-8">
            <AppLogo className="h-14 w-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">MakeChurchEasy</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("auth.forgotPassword.title")}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t("auth.forgotPassword.description")}
            </p>

            {error && (
              <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("common.email")}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                  placeholder={t("auth.login.emailPlaceholder")}
                />
              </div>
              <button
                type="submit"
                disabled={forgotPasswordLoading}
                className="mt-0.5 h-11 rounded-xl bg-blue-700 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {forgotPasswordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("auth.forgotPassword.sendButton")}
              </button>
            </form>

            <button
              onClick={() => { setMode("login"); setError(""); }}
              className="mt-4 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium flex items-center gap-1 justify-center w-full"
            >
              <ArrowLeft className="w-3 h-3" />
              {t("auth.forgotPassword.backToSignIn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-[480px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <AppLogo className="h-14 w-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">MakeChurchEasy</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("auth.login.title")}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
          {/* Google button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-11 flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 disabled:opacity-50"
          >
            <svg width="15" height="15" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t("auth.google.continueWith")}
          </button>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
            <span className="text-xs text-slate-400 dark:text-slate-500">{t("common.or")}</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Forms */}
          {mode === "login" ? (
            <>
              <form onSubmit={handleLogin} className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("common.email")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                    placeholder={t("auth.login.emailPlaceholder")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("common.password")}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                    placeholder={t("auth.login.passwordPlaceholder")}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setMode("forgot-password"); setError(""); }}
                    className="text-xs text-blue-600 font-bold hover:underline"
                  >
                    {t("auth.login.forgotPassword")}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-0.5 h-11 rounded-xl bg-blue-700 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? t("auth.login.loading") : t("auth.login.button")}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-600">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-3">
                  New to MakeChurchEasy?
                </p>
                <div className="flex flex-col gap-2">
                  <Link
                    href="/download"
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] text-sm font-semibold text-white transition-all hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download the Desktop App
                  </Link>
                  <button
                    onClick={() => { setMode("signup"); setError(""); }}
                    className="w-full h-11 rounded-xl border border-blue-700 text-sm font-semibold text-blue-700 transition-all hover:bg-blue-50 flex items-center justify-center gap-2"
                  >
                    Sign Up Free
                  </button>
                </div>
              </div>
            </>
          ) : mode === "signup" ? (
            <>
              <form onSubmit={handleSignup} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("common.fullName")}</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                      placeholder={t("auth.signup.namePlaceholder")}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("common.country")}</label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      required
                      className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                    >
                      <option value="">{t("common.selectCountry")}</option>
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("common.churchName")}</label>
                  <input
                    type="text"
                    value={churchName}
                    onChange={(e) => setChurchName(e.target.value)}
                    required
                    className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                    placeholder={t("auth.signup.churchPlaceholder")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("common.email")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                    placeholder={t("auth.login.emailPlaceholder")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("common.password")}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                    placeholder={t("auth.signup.passwordPlaceholder")}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-0.5 h-11 rounded-xl bg-blue-700 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Creating account\u2026" : "Create Account"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Already have an account?{" "}
                  <button
                    onClick={() => { setMode("login"); setError(""); setPassword(""); }}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    Log in
                  </button>
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <Download className="w-10 h-10 text-blue-600 mx-auto mb-3" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                Download the App First
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Create your account on the website first, then open the app to get started.
              </p>
              <Link
                href="/download"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] text-sm font-semibold text-white transition-all hover:shadow-lg"
              >
                <Download className="w-4 h-4" />
                Download Now
              </Link>
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("login"); setError(""); }}
                  className="text-blue-600 font-bold hover:underline"
                >
                  Log in
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
