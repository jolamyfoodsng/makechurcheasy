"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ShieldCheck,
  Rocket,
  Info,
  CheckCircle2,
  Circle,
  Loader2,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "../../lib/utils";
import { useSubscription } from "../../lib/useSubscription";

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <ShieldCheck className="w-6 h-6" />,
  basic: <Zap className="w-6 h-6" />,
  growth: <Rocket className="w-6 h-6" />,
  pro: <ShieldCheck className="w-6 h-6" />,
};

function getPlanDescription(t: (key: string) => string, tierKey: string): string {
  const map: Record<string, string> = {
    free: t("subscription.changePlan.descriptionFree"),
    basic: t("subscription.changePlan.descriptionBasic"),
    growth: t("subscription.changePlan.descriptionGrowth"),
    pro: t("subscription.changePlan.descriptionPro"),
  };
  return map[tierKey] || "";
}

function formatCurrency(amount: number) {
  if (amount === 0) return "Free";
  return `₦${amount.toLocaleString()}`;
}

function formatCredits(amount: number) {
  if (amount === -1) return "Unlimited";
  return amount.toLocaleString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPlanFeatures(t: any, tier: { credits: number; entitlements?: any }): string[] {
  const features: string[] = [];
  const e: Record<string, number | boolean> = tier.entitlements || {};

  if (tier.credits === -1) {
    features.push(t("subscription.changePlan.unlimitedCredits"));
  } else if (tier.credits > 0) {
    features.push(t("subscription.changePlan.creditsPerMonth", { count: tier.credits.toLocaleString() }));
  }

  const limits: [string, string][] = [
    ["songs", t("subscription.changePlan.featureLabels.songs")],
    ["images", t("subscription.changePlan.featureLabels.images")],
    ["videos", t("subscription.changePlan.featureLabels.videos")],
    ["themes", t("subscription.changePlan.featureLabels.themes")],
    ["devices", t("subscription.changePlan.featureLabels.devices")],
    ["bibleVersions", t("subscription.changePlan.featureLabels.bibleVersions")],
    ["multiviewTemplates", t("subscription.changePlan.featureLabels.multiviewTemplates")],
    ["tickerThemes", t("subscription.changePlan.featureLabels.tickerThemes")],
    ["themePresets", t("subscription.changePlan.featureLabels.themePresets")],
    ["cloudStorageGB", t("subscription.changePlan.featureLabels.cloudStorageGB")],
  ];
  for (const [key, label] of limits) {
    const val = e[key];
    if (typeof val === "number" && val > 0) {
      features.push(`${val === -1 ? t("subscription.changePlan.unlimited") : val.toLocaleString()} ${label}`);
    }
  }

  const flags: [string, string][] = [
    ["translation", t("subscription.changePlan.featureLabels.translation")],
    ["speechToScripture", t("subscription.changePlan.featureLabels.speechToScripture")],
    ["aiFeatures", t("subscription.changePlan.featureLabels.aiFeatures")],
    ["sermonExport", t("subscription.changePlan.featureLabels.sermonExport")],
    ["cloudSync", t("subscription.changePlan.featureLabels.cloudSync")],
    ["advancedAnalytics", t("subscription.changePlan.featureLabels.advancedAnalytics")],
    ["customReports", t("subscription.changePlan.featureLabels.customReports")],
    ["mobileControl", t("subscription.changePlan.featureLabels.mobileControl")],
    ["apiAccess", t("subscription.changePlan.featureLabels.apiAccess")],
    ["teamManagement", t("subscription.changePlan.featureLabels.teamManagement")],
    ["campusManagement", t("subscription.changePlan.featureLabels.campusManagement")],
  ];
  for (const [key, label] of flags) {
    if (e[key] === true) features.push(label);
  }

  return features;
}

export default function ChangePlan() {
  const t = useTranslations();
  const router = useRouter();
  const { plan: currentPlanKey, subscription, planConfig, loading } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!loading && currentPlanKey) {
      setSelectedPlan(currentPlanKey);
    }
  }, [loading, currentPlanKey]);

  const paidPlans = planConfig
    ? Object.entries(planConfig.plans).filter(([key]) => key !== "free" && key !== "trial" && key !== "ambassador")
    : [];
  const isFreeUser = currentPlanKey === "free";
  const selectedIsCurrent = selectedPlan === currentPlanKey;

  const handleConfirm = () => {
    setIsUpdating(true);
    setTimeout(() => {
      router.push("/subscription/plans");
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const currentTier = planConfig?.plans[currentPlanKey];
  const nextBilling = subscription?.nextBillingDate;
  let formattedBilling = "N/A";
  if (nextBilling) {
    try {
      formattedBilling = new Date(nextBilling).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } catch {
      formattedBilling = nextBilling;
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-8 pb-16">

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <Link href="/settings" className="hover:text-slate-900 transition-colors">{t("common.account")}</Link>
        <ChevronRight className="w-4 h-4" />
        <Link href="/subscription" className="hover:text-slate-900 transition-colors">{t("subscription.title")}</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-blue-600 font-bold">{isFreeUser ? t("subscription.changePlan.upgradePlan") : t("subscription.changePlan.changePlan")}</span>
      </div>

      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">
          {isFreeUser ? t("subscription.changePlan.upgradeHeading") : t("subscription.changePlan.changeHeading")}
        </h1>
        <p className="text-slate-500 max-w-2xl text-base">
          {t("subscription.changePlan.description")}
        </p>
      </div>

      {/* Current Plan Banner */}
      <div className="bg-blue-600 text-white rounded-sm p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-white opacity-5 pointer-events-none" />
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full translate-x-1/2 -translate-y-1/2 blur-3xl pointer-events-none" />

        <div className="flex items-center gap-5 relative z-10 w-full md:w-auto">
          <div className="w-16 h-16 bg-white/20 rounded-sm flex items-center justify-center shrink-0 backdrop-blur-md border border-white/10">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-200 mb-1">{t("subscription.changePlan.yourCurrentPlan")}</p>
            <h3 className="text-3xl font-black leading-tight">{currentTier?.label || t("subscription.changePlan.free")} {t("subscription.changePlan.planLabel")}</h3>
            <p className="text-blue-100 font-medium">
              {formatCurrency(currentTier?.pricing?.NGN?.monthly ?? 0)} / {subscription?.billingCycle || "month"}
            </p>
          </div>
        </div>

        {nextBilling && (
          <div className="bg-blue-700/50 backdrop-blur-md border border-blue-500 w-full md:w-auto rounded-xl py-3 px-6 text-center shadow-inner relative z-10 shrink-0">
            <p className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-0.5">{t("subscription.changePlan.nextBillingDate")}</p>
            <p className="text-base font-bold text-white">{formattedBilling}</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-6">{t("subscription.changePlan.choosePlan")}</h2>

        <div className={cn(
          "grid gap-6 items-stretch",
          paidPlans.length === 1 && "grid-cols-1 max-w-md",
          paidPlans.length === 2 && "grid-cols-1 md:grid-cols-2",
          paidPlans.length >= 3 && "grid-cols-1 md:grid-cols-3",
        )}>
          {paidPlans.map(([key, tier]) => {
            const isCurrent = key === currentPlanKey;
            const isSelected = key === selectedPlan;
            const features = buildPlanFeatures(t, tier);

            return (
              <label
                key={key}
                className={cn(
                  "relative block bg-white rounded-sm p-6 md:p-8 cursor-pointer transition-all border-2 flex flex-col h-full",
                  isSelected ? "border-blue-500 bg-blue-50/30 ring-4 ring-blue-500/10 shadow-[0_4px_20px_-4px_rgba(37,99,235,0.15)]" : "border-slate-200 hover:border-slate-300 shadow-sm"
                )}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">
                    {t("subscription.changePlan.currentBadge")}
                  </div>
                )}
                <input
                  type="radio"
                  name="plan"
                  value={key}
                  checked={isSelected}
                  onChange={() => setSelectedPlan(key)}
                  className="sr-only"
                />
                <div className="flex justify-between items-start mb-4">
                  <div className={cn("p-2 rounded-lg", isSelected ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500")}>
                    {PLAN_ICONS[key] || <Zap className="w-6 h-6" />}
                  </div>
                  {isSelected ? <CheckCircle2 className="w-6 h-6 text-blue-600" /> : <Circle className="w-6 h-6 text-slate-300" />}
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-2">{tier.label}</h3>
                <p className="text-sm text-slate-500 font-medium h-10 mb-6">{getPlanDescription(t, key)}</p>

                <div className="space-y-4 mb-8 flex-1">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <span className="font-medium text-slate-700">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-auto">
                  <span className="text-4xl font-black text-slate-900 tracking-tight">{formatCurrency(tier.pricing?.NGN?.monthly ?? 0)}</span>
                  {(tier.pricing?.NGN?.monthly ?? 0) > 0 && <span className="text-slate-500 font-medium">{t("subscription.changePlan.monthly")}</span>}
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
        <div className="flex items-start md:items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-400">
            <Info className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-600 font-medium max-w-sm">
            {t("subscription.changePlan.infoText")}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Link
            href="/subscription"
            className="flex-1 md:flex-none py-3 px-6 border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition-colors text-center"
          >
            {t("common.cancel")}
          </Link>
          <button
            onClick={handleConfirm}
            disabled={selectedIsCurrent || isUpdating}
            className="flex-1 md:flex-none py-3 px-8 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
          >
            {isUpdating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("subscription.changePlan.updating")}
              </span>
            ) : selectedIsCurrent ? t("subscription.changePlan.currentPlan") : isFreeUser ? t("subscription.changePlan.confirmUpgrade") : t("subscription.changePlan.confirmChange")}
          </button>
        </div>
      </div>

    </div>
  );
}
