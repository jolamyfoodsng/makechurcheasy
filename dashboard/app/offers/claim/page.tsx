"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Download, Gift, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLogo } from "@/components/AppLogo";

type ActiveOffer = {
  offerId: string;
  ladderId: string;
  rungId: string;
  kind: "percent_off" | "free_period" | "trial_extension";
  status: string;
  title: string;
  message: string;
  ctaLabel: string;
  code: string | null;
  percentOff: number;
  discountMonths: number;
  freeDays: number;
  trialExtensionDays: number;
  plans: string[];
  billingCycle: string;
  closesAt: string;
  freeUntil: string | null;
  needsClaim: boolean;
};

type ClaimResult = {
  success: true;
  alreadyClaimed: boolean;
  kind: "percent_off" | "free_period" | "trial_extension";
  plan: "basic" | null;
  freeUntil: string;
  percentOff: number;
  discountMonths: number;
  code: string | null;
  plansUrl: string | null;
};

const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";

export default function OfferClaimPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OfferClaimContent />
    </Suspense>
  );
}

function Loading() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-indigo-300" aria-label="Loading" />
    </main>
  );
}

function OfferClaimContent() {
  const { mongoUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ladderId = searchParams.get("ladder") || "";
  const rungId = searchParams.get("rung") || "";

  const [offer, setOffer] = useState<ActiveOffer | null>(null);
  const [loadingOffer, setLoadingOffer] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!mongoUser) {
      const callbackUrl = `/offers/claim?ladder=${encodeURIComponent(ladderId)}&rung=${encodeURIComponent(rungId)}`;
      router.replace(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }
    if (!ladderId || !rungId) {
      setLoadingOffer(false);
      setError("This offer link is not valid. Please open the link from your MakeChurchEasy email.");
      return;
    }

    let cancelled = false;
    fetch("/api/user/offers/active", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "We could not load your offer.");
        const match = ((payload.offers || []) as ActiveOffer[]).find(
          (candidate) => candidate.ladderId === ladderId && candidate.rungId === rungId,
        );
        if (!cancelled) setOffer(match || null);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "We could not load your offer.");
      })
      .finally(() => {
        if (!cancelled) setLoadingOffer(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, mongoUser, router, ladderId, rungId]);

  async function claim() {
    setClaiming(true);
    setError("");
    try {
      const response = await fetch("/api/offers/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ladderId, rungId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "We could not activate your offer.");
      setResult(payload as ClaimResult);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "We could not activate your offer. Please try again.");
    } finally {
      setClaiming(false);
    }
  }

  const busy = authLoading || loadingOffer;

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white flex items-center justify-center">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl shadow-black/30 sm:p-10">
        <div className="mb-8 flex justify-center"><AppLogo /></div>

        {busy ? (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-indigo-300" />
            <h1 className="text-xl font-semibold">Finding your offer…</h1>
          </div>
        ) : result ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-400" />
            <h1 className="text-2xl font-bold sm:text-3xl">
              {result.alreadyClaimed ? "You already claimed this" : result.kind === "trial_extension" ? "Your trial has been extended" : "Your free Basic plan is ready"}
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-300">
              {result.kind === "trial_extension"
                ? `You now have full access until ${formatDate(result.freeUntil)}. Open MakeChurchEasy and try it on a real service.`
                : `You have the Basic plan until ${formatDate(result.freeUntil)}, no card needed. If you don't subscribe, your account simply returns to the Free plan.`}
            </p>
            {result.plansUrl && result.percentOff > 0 && (
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-300">
                Want to keep going afterwards? Subscribe at {result.percentOff}% off for your first {result.discountMonths} month
                {result.discountMonths === 1 ? "" : "s"}.{" "}
                <Link href={result.plansUrl} className="font-semibold text-indigo-300 underline">See the plans</Link>
              </p>
            )}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/dashboard" className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400">
                Open MakeChurchEasy
              </Link>
              <a href="https://makechurcheazy.com/download" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/5">
                <Download className="h-4 w-4" /> Download the app
              </a>
            </div>
          </div>
        ) : offer && offer.needsClaim ? (
          <div className="text-center">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-200">
              <Gift className="h-3.5 w-3.5" /> Your offer
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">{offer.title}</h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-300">{offer.message}</p>
            <p className="mt-3 text-xs text-slate-400">Open until {formatDate(offer.closesAt)}</p>
            {error && <p className="mx-auto mt-4 max-w-md text-sm text-rose-300">{error}</p>}
            <button
              type="button"
              onClick={claim}
              disabled={claiming}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
            >
              {claiming && <Loader2 className="h-4 w-4 animate-spin" />}
              {offer.ctaLabel}
            </button>
          </div>
        ) : (
          <div className="py-6 text-center">
            <h1 className="text-2xl font-bold">This offer isn’t available</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              {error ||
                (offer
                  ? "This offer is already in use on your account."
                  : "It may have ended, or it may have been sent to a different account.")}
            </p>
            <p className="mt-3 text-sm text-slate-400">Sign in with the MakeChurchEasy account that received the offer. If you think this is a mistake, reply to the email and we’ll help.</p>
            <Link href="/dashboard" className="mt-7 inline-flex rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/5">Go to MakeChurchEasy</Link>
          </div>
        )}
      </section>
    </main>
  );
}
