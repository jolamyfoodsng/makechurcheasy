"use client";

import { useEffect, useState } from "react";
import { Mail, Send, Loader2, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import {
  getEmailCooldownStatus,
  requestEmailChange,
  type EmailCooldownStatus,
} from "@/lib/api";

type Step = "form" | "sent";

export default function ChangeEmail() {
  const t = useTranslations();
  const { mongoUser } = useAuth();
  const [step, setStep] = useState<Step>("form");
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState<EmailCooldownStatus | null>(null);
  const [cooldownLoading, setCooldownLoading] = useState(true);
  const [resendLoading, setResendLoading] = useState(false);
  const [resent, setResent] = useState(false);

  const currentEmail = mongoUser?.email ?? "";

  useEffect(() => {
    getEmailCooldownStatus()
      .then((status) => setCooldown(status))
      .catch(() => { })
      .finally(() => setCooldownLoading(false));
  }, []);

  const isInCooldown = cooldown?.inCooldown ?? false;
  const nextChangeDate = cooldown?.nextEmailChangeAt
    ? new Date(cooldown.nextEmailChangeAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : null;
  const pendingEmail = cooldown?.pendingEmail ?? null;

  // Compute remaining time for pending email token
  const tokenExpiresAt = cooldown?.emailChangeTokenExpires
    ? new Date(cooldown.emailChangeTokenExpires).getTime()
    : 0;
  const [tokenRemaining, setTokenRemaining] = useState(0);

  useEffect(() => {
    if (!tokenExpiresAt) { setTokenRemaining(0); return; }
    const update = () => {
      const diff = Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000));
      setTokenRemaining(diff);
      if (diff <= 0 && pendingEmail) {
        // Token expired — refresh status to clear pending from DB
        getEmailCooldownStatus()
          .then((s) => setCooldown(s))
          .catch(() => { });
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [tokenExpiresAt, pendingEmail]);

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newEmail !== confirmEmail) {
      setError(t("settings.email.emailMismatch"));
      return;
    }

    if (newEmail === currentEmail) {
      setError(t("settings.email.emailSameAsCurrent"));
      return;
    }

    setLoading(true);
    try {
      await requestEmailChange(newEmail);
      setStep("sent");
    } catch (err: any) {
      setLoading(false);
      setError(err.message || t("common.somethingWentWrong"));
    }
  }

  async function handleResend() {
    setResendLoading(true);
    setResent(false);
    try {
      await requestEmailChange(newEmail);
      setResent(true);
    } catch (err: any) {
      setError(err.message || t("settings.email.failedToResend"));
    } finally {
      setResendLoading(false);
    }
  }

  if (step === "sent") {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-h-[calc(100vh-80px)] flex flex-col justify-center items-center pb-16">
        <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 md:p-12 text-center relative overflow-hidden flex flex-col items-center">
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-8">
            <CheckCircle2 className="w-12 h-12 text-green-600 fill-green-100" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">
            {t("settings.email.verificationSent")}
          </h1>

          <p className="text-slate-600 text-sm max-w-md mx-auto mb-8">
            {t("settings.email.verificationSentDescription", { email: newEmail })}
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-md mx-auto mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {t("settings.email.verificationExpires")}
            </p>
          </div>

          <button
            onClick={handleResend}
            disabled={resendLoading}
            className="text-sm text-slate-500 hover:text-blue-600 transition-colors mb-8 disabled:opacity-50 flex items-center gap-1.5 mx-auto"
          >
            {resendLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {resent ? t("settings.email.emailResent") : t("settings.email.resend")}
          </button>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
            <Link
              href="/settings"
              className="w-full sm:w-auto px-8 py-3 bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-600/20 hover:bg-blue-800 transition-all"
            >
              {t("settings.email.returnToSettings")}
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto px-8 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold shadow-sm hover:bg-slate-50 transition-all"
            >
              {t("settings.email.goToDashboard")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("settings.email.title")}</h1>
        <p className="text-slate-500 mt-1 text-sm">
          {t("settings.email.description")}
        </p>
      </div>

      {isInCooldown && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-amber-100 text-amber-600 flex items-center justify-center rounded-full shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 mb-1">{t("settings.email.cooldownActive")}</p>
            <p className="text-sm text-slate-600">
              {t("settings.email.cooldownNote")}
              {nextChangeDate && (
                <> {t("settings.email.cooldownMessage", { date: nextChangeDate })}</>
              )}
            </p>
          </div>
        </div>
      )}

      {pendingEmail && !isInCooldown && tokenRemaining > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-amber-100 text-amber-600 flex items-center justify-center rounded-full shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 mb-1">{t("settings.email.verificationExpiresIn", { countdown: formatCountdown(tokenRemaining) })}</p>
            <p className="text-sm text-slate-600">
              {t("settings.email.verificationSentTo", { email: pendingEmail })}
            </p>
          </div>
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-start gap-4">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 flex items-center justify-center rounded-full shrink-0">
          <Mail className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("settings.email.currentEmail")}</span>
            <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-green-100">
              {t("common.verified")}
            </span>
          </div>
          <p className="text-base sm:text-lg font-semibold text-slate-900 truncate">{currentEmail || t("settings.notSet")}</p>
        </div>
      </section>

      <section className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-sm ${isInCooldown ? "opacity-60" : ""}`}>
        <h2 className="text-base font-bold text-slate-900">{t("settings.email.enterNewEmail")}</h2>
        <p className="text-sm text-slate-500 mb-6 mt-1">
          {t("settings.email.enterNewEmailDescription")}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="new_email">
              {t("settings.email.newEmail")}
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="new_email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={isInCooldown}
                className="w-full h-11 pl-10 pr-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600 transition-all text-sm outline-none shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="newemail@church.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="confirm_email">
              {t("settings.email.confirmNewEmail")}
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="confirm_email"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                disabled={isInCooldown}
                className="w-full h-11 pl-10 pr-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600 transition-all text-sm outline-none shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="newemail@church.com"
                required
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
            <Link
              href="/settings"
              className="w-full sm:w-auto px-6 h-11 border border-slate-200 bg-white text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm text-center"
            >
              {t("common.cancel")}
            </Link>
            <button
              type="submit"
              disabled={loading || isInCooldown || !newEmail || !confirmEmail}
              className="w-full sm:w-auto px-6 h-11 bg-blue-700 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? t("settings.email.sending") : t("settings.email.sendConfirmation")}
            </button>
          </div>
        </form>
      </section>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center shrink-0 shadow-sm text-slate-600">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-1">{t("settings.email.howItWorks")}</h3>
          <ul className="text-sm text-slate-600 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">1.</span>
              {t("settings.email.step1")}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">2.</span>
              {t("settings.email.step2")}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">3.</span>
              {t("settings.email.step3")}
            </li>
          </ul>
          <p className="text-xs text-slate-400 mt-3">
            {t("settings.email.cooldownNote")}
          </p>
        </div>
      </div>
    </div>
  );
}
