"use client";

import { useSubscription } from "@/lib/useSubscription";
import { useTranslations } from "next-intl";
import { formatTrialEndDate } from "@/lib/trialState";
import Link from "next/link";
import { ArrowUpRight, Timer, Zap } from "lucide-react";

export function TrialBanner() {
  const t = useTranslations();
  const { isOnTrial, isFreePlan, trialDaysLeft, trialEndsAt } = useSubscription();

  if (!isOnTrial && !isFreePlan) return null;

  if (!isOnTrial) {
    return (
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-medium shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-white/20 text-white shrink-0">
            <Zap className="w-3.5 h-3.5 fill-current text-amber-300" />
            Free Plan
          </span>
          <span className="text-blue-100 truncate">
            {t("trial.freePlanNotice", {
              defaultValue:
                "You are currently on the Free plan. Subscribe now to unlock unlimited Bible translations, direct OBS automation, cloud sync, and all features.",
            })}
          </span>
        </div>
        <Link
          href="/subscription/plans"
          className="inline-flex items-center gap-1.5 bg-white text-indigo-700 font-bold px-3.5 py-1.5 rounded-lg text-xs hover:bg-blue-50 transition-colors shrink-0 shadow-sm whitespace-nowrap"
        >
          <span>{t("trial.subscribeNow", { defaultValue: "Subscribe Now" })}</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  const dayLabel = trialDaysLeft === 1 ? t("trial.dayRemaining") : t("trial.daysRemaining", { days: trialDaysLeft });
  const endDate = trialEndsAt ? formatTrialEndDate(trialEndsAt.toISOString()) : "";

  return (
    <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-medium">
      <div className="flex items-center gap-3 min-w-0">
        <Timer className="w-4 h-4 shrink-0 opacity-90" />
        <span className="font-semibold whitespace-nowrap">{t("trial.growthTrialActive")}</span>
        <span className="text-amber-100 hidden sm:inline">·</span>
        <span className="text-amber-100 whitespace-nowrap">{dayLabel}</span>
        {endDate && (
          <>
            <span className="text-amber-100 hidden sm:inline">·</span>
            <span className="text-amber-100 whitespace-nowrap hidden sm:inline">{t("trial.ends")} {endDate}</span>
          </>
        )}
      </div>
      <Link
        href="/subscription/plans"
        className="inline-flex items-center gap-1.5 bg-white text-amber-600 font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-50 transition-colors shrink-0"
      >
        {t("trial.upgrade")}
        <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
