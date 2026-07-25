"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldOff,
  Loader2,
  Copy,
  Check,
  ChevronLeft,
  AlertTriangle,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { setup2FA, verify2FA, get2FAStatus, disable2FA } from "@/lib/api";
import { useTranslations } from "next-intl";

type Step = "loading" | "idle" | "scanning" | "verifying" | "enabled" | "recovery" | "disable";

export default function TwoFactorPage() {
  const router = useRouter();
  const t = useTranslations();
  const [status, setStatus] = useState<"loading" | "enabled" | "disabled">("loading");
  const [step, setStep] = useState<Step>("loading");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [token, setToken] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [codesSaved, setCodesSaved] = useState(false);

  useEffect(() => {
    get2FAStatus()
      .then((res) => {
        setStatus(res.enabled ? "enabled" : "disabled");
        setStep(res.enabled ? "enabled" : "idle");
      })
      .catch(() => {
        setStatus("disabled");
        setStep("idle");
      });
  }, []);

  const handleSetup = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await setup2FA();
      setSecret(res.secret);
      setOtpauthUrl(res.otpauthUrl);
      setStep("scanning");
    } catch (e: any) {
      setError(e.message || t("security.twoFA.failedToStart"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleVerify = useCallback(async () => {
    if (token.length !== 6) {
      setError(t("security.twoFA.enterCode"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await verify2FA(token, secret);
      if (res.success) {
        setRecoveryCodes(res.recoveryCodes || []);
        setStep("recovery");
        setStatus("enabled");
      }
    } catch (e: any) {
      setError(e.message || t("security.twoFA.invalidToken"));
    } finally {
      setLoading(false);
      setToken("");
    }
  }, [token, secret, t]);

  const handleDisable = useCallback(async () => {
    if (disableToken.length !== 6) {
      setError(t("security.twoFA.enterCode"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await disable2FA(disableToken);
      setStatus("disabled");
      setStep("idle");
      setDisableToken("");
    } catch (e: any) {
      setError(e.message || t("security.twoFA.invalidTokenDisable"));
    } finally {
      setLoading(false);
    }
  }, [disableToken, t]);

  const copyToClipboard = useCallback(async (text: string, type: "secret" | "codes") => {
    await navigator.clipboard.writeText(text);
    if (type === "secret") {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  }, []);

  const qrCodeUrl = otpauthUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`
    : "";

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto w-full space-y-6 pb-16">
      {/* Back button */}
      <button
        onClick={() => router.push("/security")}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> {t("security.twoFA.backToSecurity")}
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-600" />
          {t("security.twoFA.title")}
        </h1>
        <p className="text-sm text-slate-500">
          {t("security.twoFA.setupDescription")}
        </p>
      </div>

      {/* Status Card */}
      {status !== "loading" && (
        <div className={`rounded-2xl border p-6 flex items-center gap-4 ${status === "enabled"
          ? "bg-green-50 border-green-200"
          : "bg-slate-50 border-slate-200"
          }`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${status === "enabled" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
            }`}>
            {status === "enabled" ? <ShieldCheck className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {status === "enabled" ? t("security.twoFA.enabledMessage") : t("security.twoFA.notConfiguredMessage")}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {status === "enabled"
                ? t("security.twoFA.enabledDescription")
                : t("security.twoFA.notConfiguredDescription")}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading */}
      {step === "loading" && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      )}

      {/* Step: Idle — Show Enable button */}
      {step === "idle" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-2">{t("security.twoFA.authenticatorApp")}</h2>
          <p className="text-sm text-slate-500 mb-6">
            {t("security.twoFA.setupInstruction")}
          </p>
          <button
            onClick={handleSetup}
            disabled={loading}
            className="flex items-center gap-2 h-11 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {t("security.twoFA.enableButton")}
          </button>
        </div>
      )}

      {/* Step: Scanning — Show QR code */}
      {step === "scanning" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">{t("security.twoFA.step1Scan")}</h2>
            <p className="text-sm text-slate-500">
              {t("security.twoFA.scanInstruction")}
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              {qrCodeUrl && (
                <img src={qrCodeUrl} alt="2FA QR Code" className="w-[200px] h-[200px]" />
              )}
            </div>

            {/* Manual entry */}
            <div className="w-full">
              <p className="text-xs text-slate-400 font-medium mb-2 text-center">
                {t("security.twoFA.manualCode")}
              </p>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <code className={`flex-1 text-sm font-mono font-bold tracking-wider text-slate-900 break-all ${showSecret ? "" : "blur-sm select-none"}`}>
                  {secret}
                </code>
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => copyToClipboard(secret, "secret")}
                  className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                >
                  {copiedSecret ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Verify */}
          <div className="border-t border-slate-100 pt-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">{t("security.twoFA.step2Verify")}</h2>
            <p className="text-sm text-slate-500 mb-4">
              {t("security.twoFA.verifyInstruction")}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="flex-1 max-w-[200px] h-11 px-4 py-3 bg-white border border-slate-200 rounded-lg text-center font-mono text-sm font-bold tracking-[0.3em] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600 transition-colors"
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              />
              <button
                onClick={handleVerify}
                disabled={loading || token.length !== 6}
                className="flex items-center gap-2 h-11 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t("security.twoFA.verifyEnable")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Recovery Codes */}
      {step === "recovery" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">{t("security.twoFA.recoveryCodes")}</h2>
            <p className="text-sm text-slate-500">
              {t("security.twoFA.recoveryInstruction")}
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> {t("security.twoFA.recoveryWarning")}
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {recoveryCodes.map((code, i) => (
                <code key={i} className="text-sm font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded px-3 py-2 text-center">
                  {code}
                </code>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => copyToClipboard(recoveryCodes.join("\n"), "codes")}
              className="flex items-center gap-2 h-11 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition-colors shadow-sm text-sm"
            >
              {copiedCodes ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copiedCodes ? t("common.copied") : t("security.twoFA.copiedAll")}
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={codesSaved}
                onChange={(e) => setCodesSaved(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {t("security.twoFA.savedCodes")}
            </label>
          </div>

          <button
            onClick={() => setStep("enabled")}
            disabled={!codesSaved}
            className="w-full flex items-center justify-center gap-2 h-11 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            {t("common.done")}
          </button>
        </div>
      )}

      {/* Step: Enabled — Show status + disable option */}
      {step === "enabled" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">{t("security.twoFA.authenticatorApp")}</h2>
            <p className="text-sm text-slate-500">
              {t("security.twoFA.disableDescription")}
            </p>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h3 className="text-sm font-bold text-slate-900 mb-3">{t("security.twoFA.disable2FA")}</h3>
            <p className="text-sm text-slate-500 mb-4">
              {t("security.twoFA.disableInstruction")}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={disableToken}
                onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="flex-1 max-w-[200px] h-11 px-4 py-3 bg-white border border-slate-200 rounded-lg text-center font-mono text-sm font-bold tracking-[0.3em] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                onKeyDown={(e) => e.key === "Enter" && handleDisable()}
              />
              <button
                onClick={handleDisable}
                disabled={loading || disableToken.length !== 6}
                className="flex items-center gap-2 h-11 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                {t("security.twoFA.disableButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
