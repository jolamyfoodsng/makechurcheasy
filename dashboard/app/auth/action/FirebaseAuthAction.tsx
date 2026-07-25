"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle, Lock, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

type ActionMode = "resetPassword" | "verifyEmail" | "recoverEmail" | "migrateAccount" | "unknown";

export default function FirebaseAuthAction() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const router = useRouter();

  const mode = (searchParams.get("mode") as ActionMode) || "unknown";
  const token = searchParams.get("token") || "";

  const [status, setStatus] = useState<"loading" | "ready" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Migration state
  const [migrateEmail, setMigrateEmail] = useState("");

  useEffect(() => {
    if (mode === "resetPassword" || mode === "migrateAccount") {
      if (!token) {
        setStatus("error");
        setError(t("auth.firebaseAction.invalidOrExpired"));
        return;
      }
      // Token is validated on submit — show form immediately
      setStatus("ready");
    } else if (mode === "verifyEmail") {
      if (!token) {
        setStatus("error");
        setError(t("auth.firebaseAction.invalidOrExpired"));
        return;
      }
      // Verify email via API
      fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok && data.success) {
            setStatus("success");
          } else {
            setStatus("error");
            setError(data.error || "This email verification link is invalid or has expired.");
          }
        })
        .catch(() => {
          setStatus("error");
          setError(t("auth.firebaseAction.invalidVerificationLink"));
        });
    } else {
      setStatus("error");
      setError(t("auth.firebaseAction.unknownAction"));
    }
  }, [mode, token]);

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError(t("auth.firebaseAction.passwordMinLength"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoading(false);
        setError(data.error || t("auth.firebaseAction.failedToReset"));
        return;
      }
      setStatus("success");
    } catch {
      setLoading(false);
      setError(t("auth.firebaseAction.failedToReset"));
    }
  }

  async function handleMigrateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError(t("auth.firebaseAction.passwordMinLength"));
      return;
    }
    if (!migrateEmail) {
      setError(t("auth.firebaseAction.emailRequired"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/migrate-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: migrateEmail, password: newPassword, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoading(false);
        setError(data.error || t("auth.firebaseAction.migrationFailedError"));
        return;
      }
      setStatus("success");
    } catch {
      setLoading(false);
      setError(t("auth.firebaseAction.migrationFailedError"));
    }
  }

  // ─── Verify Email Result ────────────────────────────────────────────────
  if (mode === "verifyEmail") {
    if (status === "loading") {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-500">{t("auth.firebaseAction.verifyingEmail")}</p>
          </div>
        </div>
      );
    }

    if (status === "success") {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px]">
            <div className="flex flex-col items-center mb-6">
              <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto mb-3" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">{t("auth.firebaseAction.verifyEmail")}</h2>
              <p className="text-sm text-slate-500 mb-6">{t("auth.firebaseAction.emailVerifiedDescription")}</p>
              <button
                onClick={() => router.push("/login")}
                className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                {t("auth.firebaseAction.signIn")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          <div className="flex flex-col items-center mb-6">
            <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto mb-3" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">{t("auth.firebaseAction.verificationFailed")}</h2>
            <p className="text-sm text-slate-500 mb-6">{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              {t("auth.firebaseAction.goToSignIn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Password Reset ─────────────────────────────────────────────────────
  if (mode === "resetPassword") {
    if (status === "loading") {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-500">{t("auth.firebaseAction.verifyingResetLink")}</p>
          </div>
        </div>
      );
    }

    if (status === "success") {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px]">
            <div className="flex flex-col items-center mb-6">
              <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto mb-3" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Password Reset</h2>
              <p className="text-sm text-slate-500 mb-6">Your password has been updated. You can now sign in with your new password.</p>
              <button
                onClick={() => router.push("/login")}
                className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px]">
            <div className="flex flex-col items-center mb-6">
              <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto mb-3" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Invalid Link</h2>
              <p className="text-sm text-slate-500 mb-6">{error}</p>
              <button
                onClick={() => router.push("/login")}
                className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Go to Sign In
              </button>
            </div>
          </div>
        </div>
      );
    }

    // status === "ready" — show new password form
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          <div className="flex flex-col items-center mb-6">
            <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto mb-3" />
            <h1 className="text-lg font-bold text-slate-900">MakeChurchEasy</h1>
            <p className="text-sm text-slate-500 mt-1">Reset your password</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            {error && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handlePasswordReset} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                    placeholder="6+ characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || newPassword.length < 6}
                className="mt-0.5 h-11 rounded-xl bg-blue-700 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Reset Password
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── Account Migration ──────────────────────────────────────────────────
  if (mode === "migrateAccount") {
    if (status === "loading") {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-500">Setting your password...</p>
          </div>
        </div>
      );
    }

    if (status === "success") {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px]">
            <div className="flex flex-col items-center mb-6">
              <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto mb-3" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Password Set</h2>
              <p className="text-sm text-slate-500 mb-6">Your password has been updated. You can now sign in with your email and password.</p>
              <button
                onClick={() => router.push("/login")}
                className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px]">
            <div className="flex flex-col items-center mb-6">
              <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto mb-3" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Migration Failed</h2>
              <p className="text-sm text-slate-500 mb-6">{error}</p>
              <button
                onClick={() => router.push("/login")}
                className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Go to Sign In
              </button>
            </div>
          </div>
        </div>
      );
    }

    // status === "ready" — show migration form
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          <div className="flex flex-col items-center mb-6">
            <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto mb-3" />
            <h1 className="text-lg font-bold text-slate-900">MakeChurchEasy</h1>
            <p className="text-sm text-slate-500 mt-1">Set your new password</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-4">
              We&apos;ve upgraded our authentication system. Please set a new password for your account.
            </p>

            {error && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleMigrateAccount} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={migrateEmail}
                  onChange={(e) => setMigrateEmail(e.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                  placeholder="you@church.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600"
                    placeholder="6+ characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || newPassword.length < 6 || !migrateEmail}
                className="mt-0.5 h-11 rounded-xl bg-blue-700 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Set Password
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── Unknown mode ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-6">
          <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto mb-3" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-500 mb-4">This link is not valid.</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
