"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Download, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLogo } from "@/components/AppLogo";

type ClaimResult = {
  success: true;
  alreadyClaimed: boolean;
  active: boolean;
  plan: "growth";
  durationDays: number;
  grantedAt: string | null;
  expiresAt: string | null;
};

const CAMPAIGN_KEY = "growth-reactivation-2026-09";

export default function ReactivationClaimPage() {
  return (
    <Suspense fallback={<ClaimLoading />}>
      <ReactivationClaimContent />
    </Suspense>
  );
}

function ClaimLoading() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-indigo-300" aria-label="Loading" />
    </main>
  );
}

function ReactivationClaimContent() {
  const { mongoUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestStarted = useRef(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!mongoUser) {
      const callbackUrl = `/reactivation/claim?campaign=${encodeURIComponent(CAMPAIGN_KEY)}`;
      router.replace(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }
    if (requestStarted.current) return;
    requestStarted.current = true;

    const requestedCampaign = searchParams.get("campaign");
    if (requestedCampaign !== CAMPAIGN_KEY) {
      setError("This Growth month link is not valid. Please open the link from your MakeChurchEasy email.");
      return;
    }

    setLoading(true);
    fetch("/api/trial/reactivation-gift", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignKey: CAMPAIGN_KEY }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "We couldn’t activate your Growth month.");
        setResult(payload as ClaimResult);
      })
      .catch((claimError) => {
        setError(claimError instanceof Error ? claimError.message : "We couldn’t activate your Growth month. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [authLoading, mongoUser, router, searchParams]);

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white flex items-center justify-center">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl shadow-black/30 sm:p-10">
        <div className="mb-8 flex justify-center"><AppLogo /></div>
        {loading || authLoading ? (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-indigo-300" />
            <h1 className="text-xl font-semibold">Activating your Growth month…</h1>
            <p className="mt-2 text-sm text-slate-400">We’re adding the free 30-day Growth plan to your account.</p>
          </div>
        ) : result ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-400" />
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-200">
              <Sparkles className="h-3.5 w-3.5" /> Growth plan gift
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {result.active ? "Your free Growth month is ready" : "Your Growth month was already claimed"}
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-300">
              {result.active
                ? `You now have the Growth plan for 30 days${result.expiresAt ? `, through ${new Date(result.expiresAt).toLocaleDateString()}` : ""}. Open MakeChurchEasy and explore it with your church.`
                : "This one-time Growth gift has already been used. You can still open MakeChurchEasy and continue with your current plan."}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/dashboard" className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400">
                Open MakeChurchEasy
              </Link>
              <a href="https://makechurcheazy.com/download" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/5">
                <Download className="h-4 w-4" /> Download the app
              </a>
            </div>
          </div>
        ) : error ? (
          <div className="py-6 text-center">
            <h1 className="text-2xl font-bold">We couldn’t activate this Growth month</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">{error}</p>
            <p className="mt-3 text-sm text-slate-400">Sign in with the MakeChurchEasy account that received the email. If you think this is a mistake, reply to the email and Tayo will help.</p>
            <Link href="/dashboard" className="mt-7 inline-flex rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/5">Go to MakeChurchEasy</Link>
          </div>
        ) : (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-indigo-300" />
            <h1 className="text-xl font-semibold">Preparing your Growth month…</h1>
          </div>
        )}
      </section>
    </main>
  );
}
