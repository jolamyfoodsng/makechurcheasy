"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, CheckCircle2, Zap, ArrowRight, Award } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAmbassadorInfo } from "@/lib/ambassadorUtils";

export function AmbassadorWelcomeModal() {
  const { mongoUser } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const ambassadorInfo = getAmbassadorInfo(mongoUser?.ambassador, mongoUser?.role);

  useEffect(() => {
    if (!mongoUser?._id || !ambassadorInfo.isAmbassador) return;

    const storageKey = `mce_ambassador_welcome_shown_${mongoUser._id}_${mongoUser.ambassador?.grantedAt || "v1"}`;
    if (typeof window !== "undefined" && localStorage.getItem(storageKey) === "true") {
      return;
    }

    const timer = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(timer);
  }, [mongoUser?._id, ambassadorInfo.isAmbassador, mongoUser?.ambassador?.grantedAt]);

  const handleDismiss = () => {
    if (mongoUser?._id) {
      const storageKey = `mce_ambassador_welcome_shown_${mongoUser._id}_${mongoUser.ambassador?.grantedAt || "v1"}`;
      localStorage.setItem(storageKey, "true");
    }
    setOpen(false);
  };

  const handleGoCredits = () => {
    handleDismiss();
    router.push("/credits");
  };

  if (!open || !ambassadorInfo.isAmbassador) return null;

  const firstName = mongoUser?.name?.split(" ")[0] || "there";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-200">
        {/* Top Gradient Header */}
        <div className="relative p-6 sm:p-8 bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 text-white overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-36 h-36 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />

          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 text-white/60 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-500/25 text-purple-200 border border-purple-500/30 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            Ambassador Program
          </div>

          <h2 className="text-2xl font-bold text-white tracking-tight">
            Welcome as an Ambassador, {firstName}!
          </h2>
          <p className="mt-1 text-sm text-purple-200/90 leading-relaxed">
            You have been granted a <strong>{ambassadorInfo.tenureLabel}</strong> VIP Ambassador Partnership ({ambassadorInfo.remainingLabel}).
          </p>
        </div>

        {/* Benefits Body */}
        <div className="p-6 sm:p-8 space-y-5">
          <p className="text-sm text-slate-600 leading-relaxed">
            We are honored to partner with you to help make church presentations seamless and stress-free for your community. Here is what is active on your account right now:
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-purple-50/70 border border-purple-100">
              <CheckCircle2 className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">Growth Plan Fully Unlocked</p>
                <p className="text-xs text-slate-600 mt-0.5">Automated OBS scene routing, cloud backup & sync, MultiView, and custom themes.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-purple-50/70 border border-purple-100">
              <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {ambassadorInfo.creditsGranted > 0
                    ? `${ambassadorInfo.creditsGranted.toLocaleString()} AI Credits Granted`
                    : "Monthly AI Credits Allocation"}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">Power Speech-to-Scripture, live translation, sermon transcripts, and hymn lookups.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-purple-50/70 border border-purple-100">
              <Award className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">VIP Ambassador Badge & Support</p>
                <p className="text-xs text-slate-600 mt-0.5">Recognized status across your dashboard and priority technical assistance.</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleGoCredits}
              className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-all shadow-md shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Explore AI Credits</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleDismiss}
              className="w-full sm:w-auto py-3 px-5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-sm transition-colors cursor-pointer"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
