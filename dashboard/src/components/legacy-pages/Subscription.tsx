"use client";
import {
  BrainCircuit,
  CheckCircle2,
  Languages,
  Mic,
  Wallet,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getCreditTransactions,
  type CreditTransaction,
} from "@/lib/api";
import { useSubscription } from "@/lib/useSubscription";
import { useTranslations } from "next-intl";
import { Card, CardHeader, Badge, Button, EmptyState } from "@/components/ui";

function formatCurrency(amount: number, currency: string): string {
  if (!amount) return "Free";
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

export default function Subscription() {
  const t = useTranslations();
  const {
    plan,
    planTier,
    subscription,
    user,
    mongoUser,
    maxCredits,
    isUnlimited,
    isFreePlan,
    loading: subLoading,
  } = useSubscription();

  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  const rawCredits = mongoUser?.credits ?? 0;
  const rawTotalAvailable = mongoUser?.totalAvailable ?? maxCredits;
  const credits = isFreePlan ? Math.min(rawCredits, maxCredits) : rawCredits;
  const totalAvailable = isFreePlan ? maxCredits : rawTotalAvailable;

  useEffect(() => {
    const userId = user?._id;
    if (!userId) { setLoading(false); return; }
    getCreditTransactions(userId, { limit: 3 })
      .then((txns) => setTransactions(txns.transactions))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?._id]);

  useEffect(() => {
    if (!subLoading && planTier) {
      const pct = isUnlimited ? 5 : totalAvailable > 0 ? Math.round(((totalAvailable - credits) / totalAvailable) * 100) : 0;
      const timer = setTimeout(() => setProgress(Math.max(0, Math.min(100, pct))), 100);
      return () => clearTimeout(timer);
    }
  }, [subLoading, credits, totalAvailable, isUnlimited, planTier]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return iso; }
  };

  const formatAmount = (txn: CreditTransaction) => {
    const sign = txn.amount >= 0 ? "+" : "";
    return `${sign}${txn.amount}`;
  };

  const currency = subscription?.currency || "USD";

  if (subLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{t("subscriptionExtended.title")}</h1>
        <p className="text-sm text-slate-500">{t("subscriptionExtended.description")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Credits card */}
        <Card padding="lg" className="lg:col-span-8 flex flex-col gap-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{t("subscriptionExtended.totalCreditsRemaining")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-blue-700">{credits.toLocaleString()}</span>
                <span className="text-lg font-medium text-slate-400">/ {isUnlimited ? t("common.unlimited") : totalAvailable.toLocaleString()}</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-700">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-700 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
              {t("subscriptionExtended.creditsSharedAcross")}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: BrainCircuit, label: t("subscriptionExtended.aiTools") },
              { icon: Languages, label: t("subscriptionExtended.translation") },
              { icon: Mic, label: t("subscriptionExtended.transcription") },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="p-2.5 bg-slate-50 rounded-xl flex items-center gap-2">
                <Icon className="w-4 h-4 text-blue-700 shrink-0" />
                <span className="text-xs font-semibold text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Current Plan card */}
        <Card padding="lg" className="lg:col-span-4 flex flex-col justify-between border-slate-900 bg-slate-900 text-white">
          <div>
            <div className="flex justify-between items-center mb-5">
              <Badge
                variant={subscription?.status === "active" ? "success" : "default"}
                size="md"
              >
                {subscription?.status === "active" ? t("subscriptionExtended.active") : t("subscriptionExtended.free")}
              </Badge>
              <CheckCircle2 className={`w-5 h-5 ${subscription?.status === "active" ? "text-green-400" : "text-slate-500"}`} />
            </div>
            <h3 className="text-xl font-bold mb-1">{planTier?.label || t("subscriptionExtended.free")} {t("subscriptionExtended.plan")}</h3>
            <p className="text-sm text-slate-400 font-medium">{formatCurrency(subscription?.price ?? 0, currency)} {t("subscriptionExtended.perMonth", { cycle: subscription?.billingCycle || "month" })}</p>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-700">
            {subscription?.nextBillingDate ? (
              <p className="text-sm text-slate-300 mb-3">{t("subscriptionExtended.nextRenewal")} <span className="font-bold text-white">{formatDate(subscription.nextBillingDate)}</span></p>
            ) : (
              <p className="text-sm text-slate-400 mb-3">{t("subscriptionExtended.noActiveBilling")}</p>
            )}
            <Link
              href="/subscription/plans"
              className="w-full h-11 bg-white text-slate-900 font-semibold py-2.5 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center text-sm"
            >
              {isFreePlan ? t("subscriptionExtended.upgradePlan") : t("subscriptionExtended.changePlan")}
            </Link>
          </div>
        </Card>
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold text-slate-900">{t("subscriptionExtended.recentTransactions")}</h2>
          <Link href="/credits/history" className="text-xs font-medium text-blue-700 hover:underline flex items-center gap-1">
            {t("subscriptionExtended.viewAll")} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <Card padding="none">
          {transactions.length === 0 ? (
            <EmptyState
              icon={<Wallet className="w-5 h-5" />}
              title={t("subscriptionExtended.noTransactionsYet")}
              description={t("subscriptionExtended.creditTransactionsAppear")}
            />
          ) : (
            transactions.map((txn, i) => {
              const isPositive = txn.amount >= 0;
              return (
                <div key={txn._id || i} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isPositive ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"}`}>
                      {isPositive ? <Wallet className="w-4 h-4" /> : <BrainCircuit className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">{txn.description}</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">{formatDate(txn.createdAt)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold whitespace-nowrap ${isPositive ? "text-green-600" : "text-slate-900"}`}>
                    {formatAmount(txn)}
                  </span>
                </div>
              );
            })
          )}
        </Card>
      </div>

      {/* Plan Details */}
      {planTier && (
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3">Plan Details</h2>
          <Card padding="md">
            <div className="flex items-center gap-3 mb-2">
              <BrainCircuit className="w-4 h-4 text-blue-700" />
              <span className="font-semibold text-sm text-slate-700">{planTier.label} Plan</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {isUnlimited ? "Unlimited" : totalAvailable.toLocaleString()} <span className="text-slate-400 text-sm font-normal">credits</span>
            </p>
            {planTier.entitlements && (
              <div className="flex gap-4 mt-3">
                {planTier.entitlements.songs !== undefined && (
                  <span className="text-xs text-slate-500">🎵 {planTier.entitlements.songs === -1 ? "∞" : planTier.entitlements.songs} songs</span>
                )}
                {planTier.entitlements.images !== undefined && (
                  <span className="text-xs text-slate-500">🖼️ {planTier.entitlements.images === -1 ? "∞" : planTier.entitlements.images} images</span>
                )}
                {planTier.entitlements.videos !== undefined && (
                  <span className="text-xs text-slate-500">🎬 {planTier.entitlements.videos === -1 ? "∞" : planTier.entitlements.videos} videos</span>
                )}
                {planTier.entitlements.themes !== undefined && (
                  <span className="text-xs text-slate-500">🎨 {planTier.entitlements.themes === -1 ? "∞" : planTier.entitlements.themes} themes</span>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
