"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Crown,
  Download,
  Loader2,
  Shield,
  Calendar,
  Zap,
  MonitorPlay,
  Smartphone,
  Mic,
  Languages,
  Music,
  RefreshCw,
} from "lucide-react";

// ─── Plan feature maps ─────────────────────────────────────────────────────

const PLAN_FEATURES: Record<string, { icon: React.ElementType; label: string }[]> = {
  basic: [
    { icon: MonitorPlay, label: "Lower Thirds & Tickers for your services" },
    { icon: Music, label: "30 songs, 20 images, 10 videos in your library" },
    { icon: Zap, label: "50 AI credits for Speech-to-Scripture" },
    { icon: Crown, label: "Slideshow mode" },
    { icon: Download, label: "2 devices, 20 Bible versions" },
  ],
  growth: [
    { icon: MonitorPlay, label: "Countdowns to keep services on time" },
    { icon: Mic, label: "Speech-to-Scripture — never type a verse again" },
    { icon: Smartphone, label: "Mobile Control from your phone" },
    { icon: Languages, label: "Live Translation for multilingual congregations" },
    { icon: Music, label: "Import EasyWorship library in one click" },
    { icon: Mic, label: "Free sermon transcription with every service" },
    { icon: RefreshCw, label: "Unlimited themes, devices, and cloud sync" },
    { icon: Zap, label: "2,000 AI credits per month" },
  ],
  pro: [
    { icon: MonitorPlay, label: "Everything in Growth, plus:" },
    { icon: Zap, label: "Unlimited AI credits — never hit a limit" },
    { icon: Download, label: "200 GB cloud storage for your media library" },
    { icon: Crown, label: "Custom reports and full API access" },
    { icon: Smartphone, label: "Team & multi-campus management" },
    { icon: Shield, label: "Dedicated onboarding and priority support" },
  ],
};

// ─── Verify result type ────────────────────────────────────────────────────

interface VerifyResult {
  success: boolean;
  type?: "subscription" | "credits";
  plan: string;
  planName: string;
  credits: number;
  expiresAt: string;
  billingCycle: string;
  currency: string;
  lockedPrice: number;
  billingTransaction?: {
    reference: string;
    amount: number;
    currency: string;
    paidAt: string;
    expiresAt: string;
  };
  error?: string;
}

interface PendingPayment {
  type?: "subscription" | "credits";
  reference?: string;
  planId?: string;
  billingCycle?: "monthly" | "yearly" | "lifetime";
  creditPackId?: string;
}

// ─── Success page content ──────────────────────────────────────────────────

function SuccessPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get("reference") || searchParams.get("trxref") || "";
  const paymentType = searchParams.get("type") || "";

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const verifyPayment = useCallback(async () => {
    if (!reference) {
      setStatus("error");
      setErrorMsg("No payment reference found. Please check your email for confirmation.");
      return;
    }

    // Check localStorage for plan info (stored before Paystack redirect)
    let planId = "";
    let billingCycle: "monthly" | "yearly" | "lifetime" | undefined;
    let pendingType = paymentType === "credits" ? "credits" : "";
    try {
      const pending = JSON.parse(localStorage.getItem("mce_pending_payment") || "null") as PendingPayment | null;
      if (pending?.reference === reference) {
        pendingType = pending.type || pendingType;
        planId = pending.planId || "";
        billingCycle = pending.billingCycle;
        localStorage.removeItem("mce_pending_payment");
      }
    } catch { /* empty */ }

    try {
      const res = await fetch(pendingType === "credits" ? "/api/credits/purchase/verify" : "/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pendingType === "credits"
          ? JSON.stringify({ reference })
          : JSON.stringify({
              reference,
              ...(planId ? { planId } : {}),
              ...(billingCycle ? { billingCycle } : {}),
            }),
      });
      const data: VerifyResult & { error?: string } = await res.json();

      if (data.success) {
        setResult(data);
        setStatus("success");
        // Trigger PremiumWelcomeModal on dashboard load
        if (pendingType !== "credits") try {
          localStorage.setItem(
            "mce_premium_welcome",
            JSON.stringify({
              reference,
              plan: data.plan,
              planName: data.planName,
              billingCycle: data.billingCycle,
            })
          );
        } catch { /* best-effort */ }
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Payment verification failed. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong while verifying your payment. Your card was not charged.");
    }
  }, [reference]);

  useEffect(() => {
    verifyPayment();
  }, [verifyPayment]);

  // ── Verifying state ──
  if (status === "verifying") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-8 h-8 text-blue-700 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Verifying your payment</h2>
          <p className="text-slate-500 text-sm">This will only take a moment...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md mx-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment verification failed</h2>
          <p className="text-slate-500 text-sm mb-8">{errorMsg}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push("/")}
              className="px-6 h-11 py-2.5 rounded-xl font-semibold border border-slate-200 text-slate-500 hover:bg-gray-50 transition-colors text-sm"
            >
              Go Back
            </button>
            <button
              onClick={() => { setStatus("verifying"); verifyPayment(); }}
              className="px-6 h-11 py-2.5 rounded-xl font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Success state ──
  if (!result) return null;

  const planName = result.planName || result.plan;
  const features = PLAN_FEATURES[result.plan] || [];
  const isCreditPurchase = result.type === "credits";
  const renewDate = result.billingCycle === "lifetime"
    ? "Lifetime"
    : result.expiresAt
    ? new Date(result.expiresAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : null;
  const paidAmount = result.lockedPrice
    ? `${result.currency} ${result.lockedPrice}`
    : result.billingTransaction?.amount
      ? `${result.billingTransaction.currency} ${result.billingTransaction.amount}`
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center max-w-lg mx-4 py-12">
        {/* Success check */}
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-8 animate-in zoom-in duration-300">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>

        {/* Heading */}
        <p className="text-blue-700 text-sm font-semibold uppercase tracking-wider mb-3">
          Payment Confirmed
        </p>
        <h1 className="text-4xl font-bold text-slate-900 mb-3">
          {isCreditPurchase ? "Credits added" : `Welcome to ${planName}!`}
        </h1>
        <p className="text-slate-500 text-base mb-8 max-w-sm mx-auto">
          {isCreditPurchase
            ? `${result.credits.toLocaleString()} credits are now available for your AI workflows.`
            : "Your ministry just leveled up. Here's everything you now have access to."}
        </p>

        {/* Feature checklist */}
        {isCreditPurchase ? (
          <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-left">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Ready to use
            </h3>
            <ul className="space-y-3">
              {[
                "Speech-to-Scripture sessions",
                "Live translation minutes",
                "AI summaries, notes, and sermon points",
              ].map((label) => (
                <li key={label} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap className="w-3 h-3 text-emerald-600" />
                  </div>
                  <span className="text-sm text-slate-700">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : features.length > 0 && (
          <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-left">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              What you&apos;ve unlocked
            </h3>
            <ul className="space-y-3">
              {features.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="text-sm text-slate-700">{feature.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Payment details */}
        <div className="flex items-center justify-center gap-6 text-sm text-slate-500 mb-8">
          {paidAmount && (
            <div className="text-center">
              <p className="font-bold text-slate-900 text-lg">{paidAmount}</p>
              <p className="text-xs">
                {result.billingCycle === "lifetime"
                  ? "one-time"
                  : result.billingCycle === "yearly"
                    ? "per year"
                    : "per month"}
              </p>
            </div>
          )}
          {!isCreditPurchase && paidAmount && renewDate && <div className="w-px h-8 bg-gray-200" />}
          {!isCreditPurchase && renewDate && (
            <div className="text-center">
              <p className="font-bold text-slate-900 text-lg">{renewDate}</p>
              <p className="text-xs">
                {result.billingCycle === "lifetime"
                  ? "lifetime access"
                  : result.billingCycle === "yearly"
                    ? "next renewal"
                    : "renews monthly"}
              </p>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push(isCreditPurchase ? "/credits" : "/")}
          className="px-8 h-12 rounded-xl font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors text-sm"
        >
          {isCreditPurchase ? "Go to Credits" : "Go to Dashboard"}
        </button>
      </div>
    </div>
  );
}

// ─── Page export with Suspense boundary (required for useSearchParams) ─────

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 text-blue-700 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Loading...</h2>
          </div>
        </div>
      }
    >
      <SuccessPageContent />
    </Suspense>
  );
}
