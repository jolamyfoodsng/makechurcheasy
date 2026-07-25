"use client";

import { ArrowRight, LockKeyhole, Sparkles, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isTrialExpiredForUpgrade } from "@/lib/trialState";

const TRIAL_EXPIRED_CHECKOUT_PATH =
  "/subscription/plans?checkout=growth&billingCycle=monthly&reason=trial_expired";

const DISMISSED_KEY = "trial_expired_dismissed";

export function TrialExpiredUpgradeModal() {
  const router = useRouter();
  const pathname = usePathname();
  const { mongoUser, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(DISMISSED_KEY);
    if (stored === "true") setDismissed(true);
  }, []);

  const shouldShow = useMemo(() => {
    if (loading || !mongoUser || dismissed) return false;
    if (mongoUser.role === "admin") return false;
    if (pathname.startsWith("/subscription/plans")) return false;
    if (pathname.startsWith("/billing")) return false;
    return isTrialExpiredForUpgrade(mongoUser);
  }, [loading, mongoUser, pathname, dismissed]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, "true");
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleDismiss();
    },
    [handleDismiss],
  );

  if (!shouldShow) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="false"
      aria-labelledby="trial-expired-title"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            <LockKeyhole className="h-3.5 w-3.5" />
            Free trial ended
          </div>
          <h2
            id="trial-expired-title"
            className="text-2xl font-bold tracking-tight text-slate-950"
          >
            Upgrade to continue using MakeChurchEasy
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Your free trial has ended. Choose Growth to keep presentation,
            broadcast, library, and team tools active for your church.
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-950">Growth plan</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Clicking upgrade opens the secure Paystack checkout so your
                  account can continue immediately after payment.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push(TRIAL_EXPIRED_CHECKOUT_PATH)}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Upgrade to continue
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Continue with Free plan
          </button>
        </div>
      </div>
    </div>
  );
}
