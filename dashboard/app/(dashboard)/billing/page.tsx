"use client";

import {
  getBillingTransactions,
  type BillingTransaction,
} from "@/lib/api";
import { useSubscription } from "@/lib/useSubscription";
import { formatTrialEndDate } from "@/lib/trialState";
import { getUserId } from "@/lib/userId";
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  Crown,
  Download,
  Gift,
  Leaf,
  Loader2,
  Receipt,
  Star,
  Timer,
  TrendingUp,
  Zap
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, Badge, Button, EmptyState } from "@/components/ui";

// ─── Icon Map ────────────────────────────────────────────────────────────────
const IconMap: Record<string, React.ElementType> = {
  gift: Gift,
  leaf: Leaf,
  star: Star,
  chart: TrendingUp,
  crown: Crown,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    if (currency === "NGN") return `₦${amount.toLocaleString()}`;
    return `$${amount.toLocaleString()}`;
  }
}

function billingStatusBadge(status: string): { variant: "success" | "warning" | "error" | "default" } {
  switch (status) {
    case "success": return { variant: "success" };
    case "pending": return { variant: "warning" };
    case "failed": return { variant: "error" };
    default: return { variant: "default" };
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function BillingPage() {
  const t = useTranslations();
  const {
    plan,
    planLabel,
    planTier,
    planConfig,
    subscription,
    user,
    mongoUser,
    usage,
    maxCredits,
    isUnlimited,
    isFreePlan,
    isOnTrial,
    trialDaysLeft,
    trialEndsAt,
    loading: subLoading,
  } = useSubscription();

  const [billingTxns, setBillingTxns] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      setLoading(false);
      return;
    }

    getBillingTransactions(userId, { limit: 10 })
      .then((txnData) => {
        setBillingTxns(txnData.transactions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Helper functions using t() (must be inside component) ──
  function billingTypeLabel(type: string): string {
    switch (type) {
      case "subscription_purchase": return t('billing.newSubscription');
      case "subscription_renewal": return t('billing.renewal');
      case "plan_upgrade": return t('billing.planUpgrade');
      case "refund": return t('billing.refund');
      default: return type;
    }
  }

  function formatRelativeDate(iso: string): string {
    const now = new Date();
    const date = new Date(iso);
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return t('billing.subscriptionRenewsIn', { count: diffDays });
    } else if (diffDays === 0) {
      return t('billing.subscriptionRenewsToday');
    } else {
      return t('billing.subscriptionExpired', { count: Math.abs(diffDays) });
    }
  }

  function statusLabel(status: string): string {
    switch (status) {
      case "success": return t('billing.success');
      case "pending": return t('billing.pending');
      case "failed": return t('billing.failed');
      default: return status;
    }
  }

  const pricingPlansState = planConfig?.pricingPlans || [];
  const currentPlan = pricingPlansState.find((p: any) => p.id === plan) || null;
  const currentCredits = mongoUser?.credits ?? 0;
  const totalAvailable = mongoUser?.totalAvailable ?? maxCredits;
  const usedCredits = isUnlimited ? 0 : Math.max(0, totalAvailable - currentCredits);
  const isActive = subscription?.status === "active";

  const resetDate = subscription?.nextBillingDate
    ? formatDate(subscription.nextBillingDate)
    : t('billing.nextReset');

  const currency = subscription?.currency || "USD";

  if (subLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full space-y-8 pb-16">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{t('billing.title')}</h1>
        <p className="text-sm text-slate-500">{t('billing.manageDescription')}</p>
      </div>

      {/* ── Current Plan ────────────────────────────────────────────── */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-5">
          <CreditCard className="w-5 h-5 text-blue-700" />
          <h2 className="text-lg font-bold text-slate-900">{t('billing.currentPlan')}</h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-2xl font-bold text-slate-900">
                {t('billing.planLabel', { plan: planLabel })}
              </h3>
              {isOnTrial ? (
                <Badge variant="warning" size="md">{t('billing.trialActive')}</Badge>
              ) : isActive ? (
                <Badge variant="success" size="md">{t('common.active')}</Badge>
              ) : !isFreePlan ? (
                <Badge variant="error" size="md">{t('common.inactive')}</Badge>
              ) : null}
            </div>
            {isOnTrial ? (
              <p className="text-slate-500 text-sm">
                {trialEndsAt ? t('billing.trialEndsDate', { date: formatTrialEndDate(trialEndsAt.toISOString()) }) : t('billing.daysRemaining', { count: trialDaysLeft })}
                {trialDaysLeft === 1 ? ` (${t('billing.oneDayRemaining')})` : ""}
              </p>
            ) : (
              <p className="text-slate-500 text-sm">
                {currentPlan
                  ? `${currentPlan.pricing?.NGN?.monthly || currentPlan.pricing?.USD?.monthly || t('billing.freePlan')}${t('billing.monthlyLabel')}`
                  : t('billing.freeForever')}
              </p>
            )}
            {isOnTrial && (
              <p className="text-slate-500 text-sm mt-1">
                {t('billing.noChargesYet')}
              </p>
            )}
            {!isOnTrial && subscription?.nextBillingDate && (
              <p className="text-slate-500 text-sm mt-1 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {t('billing.renewsDate', { date: formatDate(subscription.nextBillingDate) })}
              </p>
            )}
            {!isActive && isFreePlan && !isOnTrial && (
              <p className="text-slate-500 text-sm mt-1">
                {t('billing.freePlanNoBilling')}
              </p>
            )}
          </div>

          <a href="/subscription/plans">
            <Button icon={<ArrowUpRight className="w-4 h-4" />}>
              {isOnTrial ? t('billing.upgradeBeforeTrialEnds') : isFreePlan ? t('billing.upgradePlan') : t('billing.managePlan')}
            </Button>
          </a>
        </div>
      </Card>

      {/* ── Credits Usage ───────────────────────────────────────────── */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-5">
          <Zap className="w-5 h-5 text-blue-700" />
          <h2 className="text-lg font-bold text-slate-900">{t('billing.creditsUsage')}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{t('billing.remaining')}</p>
            <p className="text-3xl font-bold text-slate-900">
              {isUnlimited ? "∞" : currentCredits.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {isUnlimited ? t('billing.unlimitedCredits') : t('billing.ofTotal', { count: totalAvailable.toLocaleString() })}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{t('billing.usedThisPeriod')}</p>
            <p className="text-3xl font-bold text-slate-900">
              {isUnlimited ? "—" : usedCredits.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {isUnlimited ? t('billing.noLimit') : t('billing.creditsConsumed')}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{t('billing.nextReset')}</p>
            <p className="text-3xl font-bold text-slate-900">{resetDate}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {subscription?.billingCycle === "yearly" ? t('billing.yearlyCycle') : t('billing.monthlyCycle')}
            </p>
          </div>
        </div>

        {!isUnlimited && maxCredits > 0 && (
          <div className="mt-5">
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-700 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, Math.round((usedCredits / maxCredits) * 100))}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {t('billing.percentUsed', { percent: Math.round((usedCredits / maxCredits) * 100) })}
            </p>
          </div>
        )}
      </Card>

      {/* ── Resource Usage ──────────────────────────────────────────── */}
      {usage && (() => {
        const entitlements = planTier?.entitlements;
        if (!entitlements) return null;

        const resources = [
          { key: "songs", label: t('billing.resources.songs'), icon: "🎵" },
          { key: "images", label: t('billing.resources.images'), icon: "🖼️" },
          { key: "videos", label: t('billing.resources.videos'), icon: "🎬" },
          { key: "themes", label: t('billing.resources.themes'), icon: "🎨" },
        ] as const;

        const hasData = resources.some(r => (usage[r.key] ?? 0) > 0 || typeof entitlements[r.key] === "number");
        if (!hasData) return null;

        return (
          <Card padding="lg">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-5 h-5 text-blue-700" />
              <h2 className="text-lg font-bold text-slate-900">{t('billing.resourceUsage')}</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {resources.map(r => {
                const limit = entitlements[r.key];
                const used = usage[r.key] ?? 0;
                const unlimited = limit === -1;
                const pct = unlimited || !limit ? null : Math.min(100, Math.round((used / (limit as number)) * 100));

                return (
                  <div key={r.key} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{r.icon}</span>
                      <span className="text-xs font-semibold text-slate-700">{r.label}</span>
                    </div>
                    <p className="text-xl font-bold text-slate-900">
                      {used.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {unlimited ? t('common.unlimited') : limit ? t('billing.ofLimit', { count: limit }) : "N/A"}
                    </p>
                    {pct !== null && typeof limit === "number" && limit > 0 && (
                      <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-700"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* ── Available Plans ─────────────────────────────────────────── */}
      {pricingPlansState.length > 0 && (
        <Card padding="lg">
          <div className="flex items-center gap-2 mb-5">
            <Star className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900">{t('billing.availablePlans')}</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {pricingPlansState.map((p: any) => {
              const isCurrent = p.id === plan;
              const PlanIcon = IconMap[p.iconName] || Gift;
              const price = p.pricing?.NGN?.monthly || p.pricing?.USD?.monthly || t('billing.freePlan');

              return (
                <div
                  key={p.id}
                  className={`relative rounded-2xl p-6 border transition-all ${isCurrent
                    ? "border-blue-700 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                >
                  {isCurrent && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-700 text-white uppercase tracking-wider">
                      {t('billing.currentLabel')}
                    </span>
                  )}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${p.styles?.iconBg || ""} ${p.styles?.iconColor || ""}`}>
                    <PlanIcon className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{p.name}</h3>
                  <p className="text-lg font-bold text-slate-900 mt-1">{price}</p>
                  <p className="text-xs text-slate-500">{t('billing.monthlyLabel')}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Billing History ─────────────────────────────────────────── */}
      <Card padding="none">
        <div className="p-6 pb-0">
          <div className="flex items-center gap-2 mb-5">
            <Receipt className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-bold text-slate-900">{t('billing.billingHistory')}</h2>
          </div>
        </div>

        {billingTxns.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-5 h-5" />}
            title={t('billing.noBillingHistoryYet')}
            description={t('billing.billingTransactionsWillAppear')}
          />
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 border-t border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>{t('common.date')}</span>
              <span>{t('common.type')}</span>
              <span>{t('common.amount')}</span>
              <span>{t('common.status')}</span>
              <span></span>
            </div>

            <div className="divide-y divide-slate-100">
              {billingTxns.map((txn, i) => (
                <div
                  key={txn._id || i}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 sm:gap-4 px-6 py-4 hover:bg-slate-50 transition-colors items-center"
                >
                  <span className="text-sm text-slate-700">
                    {formatDate(txn.paidAt || txn.createdAt)}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-slate-900">
                      {billingTypeLabel(txn.type)}
                    </span>
                    <span className="text-xs text-slate-500 ml-1.5 capitalize">
                      — {t('billing.planLabel', { plan: txn.plan })}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">
                    {formatCurrency(txn.amount, txn.currency)}
                  </span>
                  <Badge variant={billingStatusBadge(txn.status).variant} size="sm">
                    {statusLabel(txn.status)}
                  </Badge>
                  {txn.receiptUrl ? (
                    <a
                      href={txn.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-700 transition-colors justify-self-end"
                    >
                      <Download className="w-4 h-4" />
                      {t('billing.receipt')}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 justify-self-end">—</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* ── Subscription Status ─────────────────────────────────────── */}
      {isOnTrial ? (
        <div className="rounded-xl p-5 flex items-start gap-3 bg-amber-50 border border-amber-200">
          <Timer className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {trialDaysLeft === 1
                ? t('billing.growthTrialEndsTomorrow')
                : t('billing.growthTrialEndsInDays', { count: trialDaysLeft })}
            </p>
            <p className="text-xs text-amber-600 mt-1">
              {t('billing.noChargesUpgrade')}
            </p>
          </div>
        </div>
      ) : isFreePlan ? (
        <div className="rounded-xl p-5 flex items-start gap-3 bg-slate-50 border border-slate-200">
          <Leaf className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {t('billing.freePlanNoActive')}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {t('billing.upgradeUnlockPremium')}
            </p>
          </div>
        </div>
      ) : subscription ? (
        <div className={`rounded-xl p-5 flex items-start gap-3 ${isActive
          ? "bg-green-50 border border-green-200"
          : "bg-amber-50 border border-amber-200"
          }`}>
          {isActive ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          )}
          <div>
            <p className={`text-sm font-semibold ${isActive ? "text-green-800" : "text-amber-800"}`}>
              {isActive && subscription.nextBillingDate
                ? formatRelativeDate(subscription.nextBillingDate)
                : isActive
                  ? t('billing.subscriptionActive')
                  : subscription.currentPeriodEnd
                    ? `${formatRelativeDate(subscription.currentPeriodEnd)} ${t('billing.upgradeRegainAccess')}`
                    : `${t('billing.subscriptionInactive')} ${t('billing.upgradeRegainAccess')}`}
            </p>
            {isActive && subscription.autoRenew && (
              <p className="text-xs text-green-600 mt-1">{t('billing.autoRenewalEnabled')}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
