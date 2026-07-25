"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import {
  Loader2,
  Check,
  AlertCircle,
  Mail,
  RefreshCw,
  Clock,
  XCircle,
  Smartphone,
  Shield,
  ServerCrash,
} from "lucide-react";
import {
  authorizePairingCode,
  rejectPairingCode,
  resendVerificationEmail,
  checkVerificationStatus,
  ApiError,
} from "@/lib/api";

type ErrorType =
  | "invalid"
  | "expired"
  | "used"
  | "email_not_verified"
  | "device_limit_reached"
  | "unknown";

function DeviceAuthContent() {
  const t = useTranslations();
  const { mongoUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [loading, setLoading] = useState(false);

  const [manualCode, setManualCode] = useState("");

  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleConfirmAuthorize() {
    const codeToUse = code || manualCode;
    if (!codeToUse) return;

    setLoading(true);
    setError("");
    setErrorType(null);

    try {
      await authorizePairingCode(codeToUse);
      setAuthorized(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to authorize device";

      let type: ErrorType = "unknown";
      if (err instanceof ApiError) {
        if (msg === "Invalid code") type = "invalid";
        else if (msg === "Code expired") type = "expired";
        else if (msg === "Code already used") type = "used";
        else if (msg === "email_not_verified") type = "email_not_verified";
        else if (msg === "device_limit_reached") type = "device_limit_reached";
      }

      // If code was already used or expired, clear it so user gets a fresh state
      if (type === "used" || type === "expired") {
        setManualCode("");
        router.replace("/device");
      }

      setError(msg);
      setErrorType(type);
      setLoading(false);
    }
  }

  function handleDenyAuthorize() {
    const codeToUse = code || manualCode;
    if (codeToUse) {
      rejectPairingCode(codeToUse).catch(() => { });
    }
    setError("Login not successful. Authorization was cancelled.");
    setErrorType(null);
  }

  async function handleResendVerification() {
    setResending(true);
    setResendSuccess(false);
    setResendError("");

    try {
      const result = await resendVerificationEmail();
      if (result.alreadyVerified) {
        setErrorType(null);
        setError("");
      } else {
        setResendSuccess(true);
        setCooldown(60);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send email";
      setResendError(msg);
    } finally {
      setResending(false);
    }
  }

  async function handleCheckVerification() {
    const codeToUse = code || manualCode;
    if (!codeToUse) return;

    setChecking(true);
    setError("");
    try {
      const result = await checkVerificationStatus(codeToUse);
      if (result.verified) {
        setErrorType(null);
        setError("");
      } else {
        setError("Your email is still not verified. Please check your inbox and verify, then try again.");
      }
    } catch {
      setError("Could not check verification status. The pairing code may have expired — go back and enter a new code.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!authLoading && !mongoUser) {
      const callbackUrl = code ? `/device?code=${code}` : "/device";
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
  }, [authLoading, mongoUser, code, router]);

  if (authLoading || !mongoUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      </div>
    );
  }

  // ── Authorized success screen ──────────────────────────────────────────────
  if (authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xs text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="mb-1 text-lg font-bold text-slate-900">
            {t("device.authorized.title")}
          </h1>
          <p className="text-sm text-slate-500">
            {t("device.authorized.description")}
          </p>
        </div>
      </div>
    );
  }

  // ── Email verification required ────────────────────────────────────────────
  if (errorType === "email_not_verified") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xs rounded-xl bg-white p-6 shadow-xl border border-slate-200">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <Mail className="w-6 h-6 text-amber-600" />
          </div>
          <h2 className="mb-1 text-base font-bold text-slate-900">
            {t("device.emailVerify.title")}
          </h2>
          <p className="mb-5 text-sm text-slate-500 leading-relaxed">
            {t("device.emailVerify.description")}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleCheckVerification}
              disabled={checking}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {checking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("device.emailVerify.checking")}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> {t("device.emailVerify.checkAgain")}
                </>
              )}
            </button>
            <button
              onClick={handleResendVerification}
              disabled={resending || cooldown > 0}
              className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {resending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("device.emailVerify.sending")}
                </>
              ) : cooldown > 0 ? (
                <>
                  <Clock className="w-4 h-4" /> {t("device.emailVerify.tryAgainIn", { seconds: cooldown })}
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> {t("device.emailVerify.resend")}
                </>
              )}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-center text-xs text-red-600">
              {error}
            </p>
          )}
          {resendSuccess && cooldown > 0 && (
            <p className="mt-3 text-center text-xs text-green-600">
              {t("device.emailVerify.sent")}
            </p>
          )}
          {resendError && (
            <p className="mt-3 text-center text-xs text-red-600">
              {resendError}
            </p>
          )}
          <button
            onClick={() => {
              setErrorType(null);
              setError("");
              setResendError("");
              setResendSuccess(false);
            }}
            className="mt-4 h-10 w-full rounded-lg bg-slate-100 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200"
          >
            {t("common.back")}
          </button>
        </div>
      </div>
    );
  }

  // ── Code expired ───────────────────────────────────────────────────────────
  if (errorType === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xs rounded-xl bg-white p-6 shadow-xl border border-slate-200">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
            <Clock className="w-6 h-6 text-orange-600" />
          </div>
          <h2 className="mb-1 text-base font-bold text-slate-900">
            {t("device.codeExpired.title")}
          </h2>
          <p className="mb-5 text-sm text-slate-500 leading-relaxed">
            {t("device.codeExpired.description")}
          </p>
          <button
            onClick={() => {
              setErrorType(null);
              setError("");
              router.replace("/device");
            }}
            className="h-10 w-full rounded-lg bg-blue-600 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            {t("device.codeExpired.enterNewCode")}
          </button>
        </div>
      </div>
    );
  }

  // ── Code already used ──────────────────────────────────────────────────────
  if (errorType === "used") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xs rounded-xl bg-white p-6 shadow-xl border border-slate-200">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <Shield className="w-6 h-6 text-amber-600" />
          </div>
          <h2 className="mb-1 text-base font-bold text-slate-900">
            {t("device.codeUsed.title")}
          </h2>
          <p className="mb-5 text-sm text-slate-500 leading-relaxed">
            {t("device.codeUsed.description")}
          </p>
          <button
            onClick={() => {
              setErrorType(null);
              setError("");
              router.replace("/device");
            }}
            className="h-10 w-full rounded-lg bg-blue-600 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            {t("device.codeExpired.enterNewCode")}
          </button>
        </div>
      </div>
    );
  }

  // ── Device limit reached ───────────────────────────────────────────────────
  if (errorType === "device_limit_reached") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xs rounded-xl bg-white p-6 shadow-xl border border-slate-200">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <Smartphone className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="mb-1 text-base font-bold text-slate-900">
            {t("device.deviceLimit.title")}
          </h2>
          <p className="mb-5 text-sm text-slate-500 leading-relaxed">
            {t("device.deviceLimit.description")}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push("/devices")}
              className="h-10 w-full rounded-lg bg-blue-600 text-sm font-bold text-white transition-colors hover:bg-blue-700"
            >
              {t("device.deviceLimit.manageDevices")}
            </button>
            <button
              onClick={() => router.push("/subscription/plans")}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              {t("device.deviceLimit.upgradePlan")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Invalid code ───────────────────────────────────────────────────────────
  if (errorType === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xs rounded-xl bg-white p-6 shadow-xl border border-slate-200">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <XCircle className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="mb-1 text-base font-bold text-slate-900">
            {t("device.invalidCode.title")}
          </h2>
          <p className="mb-5 text-sm text-slate-500 leading-relaxed">
            {t("device.invalidCode.description")}
          </p>
          <button
            onClick={() => {
              setErrorType(null);
              setError("");
              router.replace("/device");
            }}
            className="h-10 w-full rounded-lg bg-blue-600 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Unknown error (fallback) ───────────────────────────────────────────────
  if (errorType === "unknown") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xs rounded-xl bg-white p-6 shadow-xl border border-slate-200">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <ServerCrash className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="mb-1 text-base font-bold text-slate-900">
            Something Went Wrong
          </h2>
          <p className="mb-5 text-sm text-slate-500 leading-relaxed">
            An unexpected error occurred. Please try again or contact support
            if the problem persists.
          </p>
          <button
            onClick={() => {
              setErrorType(null);
              setError("");
            }}
            className="h-10 w-full rounded-lg bg-blue-600 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Code in URL → authorization modal ──────────────────────────────────────
  if (code) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xs rounded-xl bg-white p-6 text-center shadow-xl border border-slate-200">
          {error && !errorType ? (
            <>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <p className="mb-4 text-sm font-medium text-red-700">{error}</p>
              <button
                onClick={() => {
                  setError("");
                  setErrorType(null);
                  router.replace("/device");
                }}
                className="h-10 w-full rounded-lg bg-slate-100 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200"
              >
                Try Again
              </button>
            </>
          ) : (
            <>
              <h2 className="mb-1 text-base font-bold text-slate-900">
                Are you trying to authorize this device?
              </h2>
              <p className="mb-5 text-sm text-slate-500">
                A MakeChurchEasy app is requesting access to your account.
              </p>
              {loading ? (
                <div className="flex h-10 items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Authorizing...
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={handleDenyAuthorize}
                    className="h-10 flex-1 rounded-lg border border-slate-200 bg-white text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
                  >
                    No
                  </button>
                  <button
                    onClick={handleConfirmAuthorize}
                    className="h-10 flex-1 rounded-lg bg-blue-600 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                  >
                    Yes
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── No code → manual entry ─────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mb-1 text-lg font-bold text-slate-900">
            Enter Pairing Code
          </h1>
          <p className="text-sm text-slate-500">
            Enter the code shown in your MakeChurchEasy app.
          </p>
        </div>

        {error && !errorType && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <input
          type="text"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value.toUpperCase())}
          placeholder="ABCD-1234"
          maxLength={9}
          onKeyDown={(e) =>
            e.key === "Enter" &&
            manualCode.length >= 8 &&
            handleConfirmAuthorize()
          }
          className="mb-4 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-center font-mono text-lg font-bold tracking-widest text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />

        <button
          onClick={handleConfirmAuthorize}
          disabled={!manualCode || manualCode.length < 8 || loading}
          className="h-11 w-full rounded-lg bg-blue-600 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Authorizing...
            </span>
          ) : (
            "Authorize"
          )}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Signed in as {mongoUser.email}
        </p>
      </div>
    </div>
  );
}

export default function DevicePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        </div>
      }
    >
      <DeviceAuthContent />
    </Suspense>
  );
}
