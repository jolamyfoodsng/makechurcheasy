"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useCallback } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { authorizePairingCode } from "@/lib/api";

/**
 * /pair/google?code=XXXX-XXXX&os=macOS
 *
 * Standalone page for the desktop app's "Login with Google" button.
 * Redirects to Google OAuth flow, then auto-authorizes the pairing code.
 */

type Phase = "auth" | "authorizing" | "done" | "error";

function GooglePairContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const { mongoUser, loading: authLoading, signInWithGoogle } = useAuth();

  const [phase, setPhase] = useState<Phase>("auth");
  const [error, setError] = useState("");

  const doAuthorize = useCallback(async () => {
    if (!code) {
      setError(t("pair.google.noPairingCode"));
      setPhase("error");
      return;
    }

    setPhase("authorizing");

    try {
      await authorizePairingCode(code);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pair.google.failedToAuthorize"));
      setPhase("error");
    }
  }, [code, t]);

  // Once auth is resolved, either auto-authorize or trigger Google sign-in
  useEffect(() => {
    if (authLoading) return;

    if (!code) {
      setError(t("pair.google.noPairingCode"));
      setPhase("error");
      return;
    }

    if (mongoUser) {
      // Already signed in — go straight to authorize
      doAuthorize();
    } else {
      // Not signed in — redirect to Google OAuth
      setPhase("auth");
      signInWithGoogle();
    }
  }, [authLoading, mongoUser, code, signInWithGoogle, doAuthorize]);

  // After Google sign-in completes (mongoUser becomes non-null), authorize
  useEffect(() => {
    if (mongoUser && phase === "auth" && code) {
      doAuthorize();
    }
  }, [mongoUser, phase, code, doAuthorize]);

  // ── Render ──

  const container = "flex min-h-screen items-center justify-center bg-slate-50 px-6";

  if (authLoading || (phase === "auth" && !mongoUser)) {
    return (
      <div className={container}>
        <div className="w-full max-w-xs text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-slate-900">{t("pair.google.signingIn")}</h1>
          <p className="text-[13px] text-slate-500">
            {t("pair.google.redirecting")}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "authorizing") {
    return (
      <div className={container}>
        <div className="w-full max-w-xs text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-slate-900">{t("pair.google.authorizing")}</h1>
          <p className="text-[13px] text-slate-500">{t("pair.google.connectingApp")}</p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className={container}>
        <div className="w-full max-w-xs text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-slate-900">{t("pair.google.deviceAuthorized")}</h1>
          <p className="text-[13px] text-slate-500">
            {t("pair.google.deviceAuthorizedDescription")}
          </p>
        </div>
      </div>
    );
  }

  // Error
  return (
    <div className={container}>
      <div className="w-full max-w-xs text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <AlertCircle className="w-6 h-6 text-red-600" />
        </div>
        <h1 className="mb-1 text-[18px] font-bold text-slate-900">{t("pair.google.somethingWentWrong")}</h1>
        <p className="mb-6 text-[13px] text-slate-500">{error}</p>
        <button
          onClick={() => {
            setError("");
            setPhase("auth");
          }}
          className="h-10 rounded-lg bg-blue-600 px-6 text-[13px] font-bold text-white transition-colors hover:bg-blue-700"
        >
          {t("pair.google.tryAgain")}
        </button>
      </div>
    </div>
  );
}

export default function GooglePairPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        </div>
      }
    >
      <GooglePairContent />
    </Suspense>
  );
}
