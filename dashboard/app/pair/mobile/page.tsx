"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useCallback } from "react";
import { Loader2, Check, AlertCircle, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { authorizePairingCode } from "@/lib/api";

/**
 * /pair/mobile?code=XXXX-XXXX
 *
 * Mobile-optimized page for QR code login.
 * User scans QR on desktop → opens this page on phone → authenticates → authorizes pairing code.
 */

type Phase = "auth" | "authorizing" | "done" | "error";
type AuthMethod = "google" | "email";

function MobilePairContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const { mongoUser, loading: authLoading, signInWithEmail, signInWithGoogle } = useAuth();

  const [phase, setPhase] = useState<Phase>("auth");
  const [error, setError] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null);

  // Email auth state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  const doAuthorize = useCallback(async () => {
    if (!code) {
      setError(t("pair.mobile.noPairingCode"));
      setPhase("error");
      return;
    }

    setPhase("authorizing");

    try {
      await authorizePairingCode(code);
      setPhase("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("pair.mobile.failedToAuthorize")
      );
      setPhase("error");
    }
  }, [code, t]);

  // Auto-authorize if already signed in
  useEffect(() => {
    if (authLoading || !mongoUser || !code) return;
    if (phase === "auth" && !authMethod) {
      doAuthorize();
    }
  }, [authLoading, mongoUser, code, phase, authMethod, doAuthorize]);

  async function handleGoogleSignIn() {
    setAuthMethod("google");
    setError("");
    try {
      await signInWithGoogle();
      // After sign-in, mongoUser will update and useEffect above will authorize
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") {
        setError(t("pair.mobile.signInCancelled"));
      } else if (err?.code === "auth/popup-blocked") {
        setError(t("pair.mobile.popupBlocked"));
      } else {
        setError(t("pair.mobile.googleFailed"));
      }
      setPhase("error");
      setAuthMethod(null);
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailLoading(true);

    if (!email || !password) {
      setEmailError(t("pair.mobile.enterEmailPassword"));
      setEmailLoading(false);
      return;
    }

    try {
      await signInWithEmail(email, password);
      setAuthMethod("email");
      // After sign-in, mongoUser will update and useEffect above will authorize
    } catch (err: any) {
      setEmailError(err.message || t("pair.mobile.signInFailed"));
    } finally {
      setEmailLoading(false);
    }
  }

  // ── Render ──

  if (!code) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6">
        <div className="w-full max-w-xs text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-white">
            {t("pair.mobile.invalidQRCode")}
          </h1>
          <p className="text-[13px] text-slate-400">
            {t("pair.mobile.invalidQRDescription")}
          </p>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6">
        <div className="w-full max-w-xs text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-white">
            {t("pair.mobile.loading")}
          </h1>
        </div>
      </div>
    );
  }

  if (phase === "authorizing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6">
        <div className="w-full max-w-xs text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-white">
            {t("pair.mobile.authorizing")}
          </h1>
          <p className="text-[13px] text-slate-400">
            {t("pair.mobile.connectingApp")}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6">
        <div className="w-full max-w-xs text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
            <Check className="w-6 h-6 text-green-400" />
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-white">
            {t("pair.mobile.deviceAuthorized")}
          </h1>
          <p className="text-[13px] text-slate-400">
            {t("pair.mobile.deviceAuthorizedDescription")}
          </p>
        </div>
      </div>
    );
  }

  // Error state (non-recoverable)
  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6">
        <div className="w-full max-w-xs text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-white">
            {t("pair.mobile.somethingWentWrong")}
          </h1>
          <p className="mb-6 text-[13px] text-slate-400">{error}</p>
          <button
            onClick={() => {
              setError("");
              setPhase("auth");
              setAuthMethod(null);
            }}
            className="h-10 rounded-lg bg-blue-600 px-6 text-[13px] font-bold text-white transition-colors hover:bg-blue-700"
          >
            {t("pair.mobile.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  // Auth selection (phase === "auth", not signed in yet)
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6">
      <div className="w-full max-w-xs">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
            <Smartphone className="w-5 h-5 text-blue-400" />
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-white">
            {t("pair.mobile.signInToPair")}
          </h1>
          <p className="text-[13px] text-slate-400">
            {t("pair.mobile.authenticateDescription")}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
            {error}
          </div>
        )}

        {/* Google button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={!!authMethod}
          className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-bold text-slate-900 transition-colors hover:bg-slate-100 disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
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
          {t("auth.google.continueWith")}
        </button>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-700" />
          <span className="text-[11px] text-slate-500">{t("common.or")}</span>
          <div className="h-px flex-1 bg-slate-700" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailSignIn}>
          {emailError && (
            <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
              {emailError}
            </div>
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("pair.mobile.emailPlaceholder")}
            autoComplete="email"
            className="mb-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 text-[13px] text-white placeholder-slate-500 outline-none focus:border-blue-500"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("pair.mobile.passwordPlaceholder")}
            autoComplete="current-password"
            className="mb-3 h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 text-[13px] text-white placeholder-slate-500 outline-none focus:border-blue-500"
          />

          <button
            type="submit"
            disabled={emailLoading || !authMethod === null}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-[13px] font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {emailLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("pair.mobile.signIn")
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-slate-500">
          {t("pair.mobile.codeLabel", { code })}
        </p>
      </div>
    </div>
  );
}

export default function MobilePairPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        </div>
      }
    >
      <MobilePairContent />
    </Suspense>
  );
}
