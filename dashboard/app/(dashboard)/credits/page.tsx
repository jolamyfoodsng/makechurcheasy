"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Zap, Wallet, CheckCircle, ArrowRight, Info, AlertTriangle,
  TrendingDown, Clock, RefreshCw, BookOpen, Languages, FileText,
  ListChecks, Lightbulb, HelpCircle, Loader2, CreditCard,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  getCreditTransactions,
  getCreditUsageByDay,
  type CreditTransaction,
} from "@/lib/api";
import { useSubscription } from "@/lib/useSubscription";
import { getUserId } from "@/lib/userId";
import { Card, CardHeader, Badge, Button, EmptyState } from "@/components/ui";

const TRANSACTION_LABELS: Record<string, { key: string; icon: typeof Zap }> = {
  "speech-to-scripture": { key: "credits.speechToScripture", icon: BookOpen },
  "live-translation": { key: "credits.translation", icon: Languages },
  "ai-summary": { key: "credits.aiSummary", icon: FileText },
  "ai-sermon-notes": { key: "credits.aiSermonNotes", icon: ListChecks },
  "ai-sermon-points": { key: "credits.aiSermonPoints", icon: Lightbulb },
  "deduction": { key: "credits.aiUsage", icon: Zap },
  "credit_purchase": { key: "credits.creditPurchase", icon: RefreshCw },
  "plan_upgrade": { key: "credits.planUpgrade", icon: RefreshCw },
  "monthly_refresh": { key: "credits.monthlyRefresh", icon: RefreshCw },
  "refund": { key: "credits.refund", icon: RefreshCw },
};

function getTransactionInfo(txn: CreditTransaction, t: (key: string) => string): { label: string; icon: typeof Zap } {
  const key = txn.type?.toLowerCase().replace(/[_\s]+/g, "-") || "";
  const src = txn.source?.toLowerCase().replace(/[_\s]+/g, "-") || "";
  const found = TRANSACTION_LABELS[key] || TRANSACTION_LABELS[src];
  if (found) return { label: t(found.key), icon: found.icon };
  return { label: txn.description || t('credits.transaction'), icon: Zap };
}

const COST_ICONS: Record<string, typeof Zap> = {
  "Speech-to-Scripture": BookOpen,
  "Live Translation": Languages,
  "AI Summary": FileText,
  "AI Sermon Notes": ListChecks,
  "AI Sermon Points": Lightbulb,
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: currency || "USD",
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    if (currency === "NGN") return `₦${amount.toLocaleString()}`;
    return `$${amount.toLocaleString()}`;
  }
}

interface CreditPack {
  id: string;
  name: string;
  description: string;
  credits: number;
  price: number;
  currency: "USD" | "NGN";
  currencySymbol: string;
  badge?: string;
}

export default function Credits() {
  const t = useTranslations();
  const {
    planLabel,
    planTier,
    planConfig,
    subscription,
    user,
    mongoUser,
    maxCredits,
    isUnlimited,
    isOnTrial,
    trialEndsAt,
    loading: subLoading,
  } = useSubscription();

  const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([]);
  const [chartData, setChartData] = useState<{ date: string; usage: number }[]>([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [purchaseError, setPurchaseError] = useState("");
  const [purchasingPackId, setPurchasingPackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const credits = mongoUser?.credits ?? 0;
  const creditCosts = planConfig?.creditCosts || [];

  // Use the authoritative totalAvailable from the backend (planAllocation + adminGranted)
  const totalAvailable = mongoUser?.totalAvailable ?? maxCredits;

  // When backend returns -1 (admin bypass), fall back to plan-based values for display
  const displayCredits = credits >= 0 ? credits : maxCredits;
  const displayTotal = totalAvailable >= 0 ? totalAvailable : maxCredits;

  const usedCredits = isUnlimited ? 0 : Math.max(0, displayTotal - displayCredits);
  const usagePct = isUnlimited ? 0 : displayTotal > 0 ? Math.round((usedCredits / displayTotal) * 100) : 0;
  const remainingPct = isUnlimited ? 100 : Math.max(0, 100 - usagePct);
  const hasBonusCredits = !isUnlimited && (mongoUser?.adminGranted ?? 0) > 0;

  const showBuyCredits = !isUnlimited && !isOnTrial && (planTier?.pricing?.NGN?.monthly ?? 0) > 0 && maxCredits > 0 && displayCredits <= displayTotal * 0.1;
  const isLow = !isUnlimited && displayTotal > 0 && displayCredits <= displayTotal * 0.2 && displayCredits > displayTotal * 0.1;

  useEffect(() => {
    const userId = getUserId();
    if (!userId) { setLoading(false); return; }
    Promise.all([
      getCreditTransactions(userId, { limit: 5 }),
      getCreditUsageByDay(userId, 7),
      fetch("/api/credits/purchase").then((res) => res.ok ? res.json() : { packs: [] }),
    ])
      .then(([txns, usage, packsData]) => {
        setRecentTransactions(txns.transactions);
        setChartData(usage.usage.map((d) => ({ date: d.date, usage: d.amount })));
        setCreditPacks(Array.isArray(packsData.packs) ? packsData.packs : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const estimatedUsage = useMemo(() => {
    if (!creditCosts.length || isUnlimited) return [];
    return creditCosts.map((c) => ({
      name: c.name,
      unit: c.unit,
      cost: c.cost,
      estimate: c.cost > 0 ? Math.floor(displayCredits / c.cost) : "∞",
    }));
  }, [creditCosts, displayCredits, isUnlimited]);

  const renewalDate = subscription?.nextBillingDate || subscription?.currentPeriodEnd;
  const currency = subscription?.currency || "USD";

  const handleBuyCredits = async (pack: CreditPack) => {
    setPurchaseError("");
    setPurchasingPackId(pack.id);
    try {
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.authorization_url) {
        throw new Error(data.error || "Could not start checkout");
      }
      try {
        localStorage.setItem(
          "mce_pending_payment",
          JSON.stringify({
            type: "credits",
            reference: data.reference,
            creditPackId: pack.id,
          }),
        );
      } catch { /* best effort */ }
      window.location.href = data.authorization_url;
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "Could not start checkout");
      setPurchasingPackId(null);
    }
  };

  if (subLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{t('credits.title')}</h1>
        <p className="text-sm text-slate-500">
          {t('credits.pageDescription')}
        </p>
      </div>

      {/* What Are Credits? */}
      <Card padding="lg" className="border-blue-200 bg-blue-50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700">
            <Info className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">{t('credits.whatAreCredits')}</h2>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed mb-4">
          {isOnTrial ? (
            <>{t.rich('credits.trialCreditsInclude', {
              plan: planLabel,
              credits: isUnlimited ? t('credits.unlimitedCredits') : maxCredits.toLocaleString(),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}</>
          ) : (
            <>{t.rich('credits.planCreditsInclude', {
              plan: planLabel,
              credits: isUnlimited ? t('credits.unlimitedCredits') : maxCredits.toLocaleString(),
              period: subscription?.billingCycle === "yearly" ? t('credits.everyYear') : t('credits.everyMonth'),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}</>
          )} {hasBonusCredits && <>{t.rich('credits.bonusCredits', {
            count: (displayCredits - maxCredits).toLocaleString(),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}</>} {t('credits.creditsUsedWhen')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[t('credits.translateLiveSermons'), t('credits.generateAISummaries'), t('credits.generateSermonNotes'), t('credits.transcribeToScripture')].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> {item}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4">
          {isOnTrial ? t('credits.trialCreditsAvailable') : t('credits.unusedCreditsRefresh')}
        </p>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Credits Balance */}
        <Card padding="lg" className="flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-700">
              <Zap className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-slate-900">{t('credits.aiCredits')}</span>
          </div>
          <div className="mb-5">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-5xl font-black text-slate-900 tracking-tight">{isUnlimited ? "∞" : displayCredits.toLocaleString()}</span>
              {!isUnlimited && <span className="text-lg font-bold text-slate-400">/ {displayTotal.toLocaleString()}</span>}
            </div>
            <p className="text-sm text-slate-500">{isUnlimited ? t('credits.unlimitedCredits') : t('credits.creditsRemaining', { count: displayCredits.toLocaleString() })}</p>
          </div>
          {!isUnlimited && (
            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t('credits.used')}</span>
                <span className="font-bold text-slate-900">{usedCredits.toLocaleString()} ({usagePct}%)</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t('credits.remaining')}</span>
                <span className="font-bold text-green-600">{displayCredits.toLocaleString()} ({remainingPct}%)</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${usagePct > 90 ? "bg-red-500" : usagePct > 70 ? "bg-amber-500" : "bg-blue-700"}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </div>
          )}
          {isLow && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-sm text-amber-700 font-medium">{t('credits.creditsAreLow')}</span>
            </div>
          )}
          {showBuyCredits && (
            <Button className="w-full" onClick={() => document.getElementById("buy-credits")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {t('credits.buyMoreCredits')}
            </Button>
          )}
          {!showBuyCredits && !isUnlimited && displayCredits > maxCredits * 0.2 && (
            <p className="text-sm text-green-600 font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> {isOnTrial ? t('credits.enjoyTrialCredits') : t('credits.fullyStocked')}
            </p>
          )}
        </Card>

        {/* Subscription Status */}
        <Card padding="lg" className="flex flex-col justify-between border-slate-900 bg-slate-900 text-white">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-blue-400">
                <Wallet className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-slate-100">{t('credits.subscriptionLabel')}</span>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-2xl font-black text-white">{planLabel}</span>
                <span className="text-sm text-slate-400 ml-2">{t('credits.plan')}</span>
              </div>
              <Badge variant={isOnTrial ? "warning" : (subscription?.status === "active" ? "success" : "default")} size="md">
                {isOnTrial ? t('billing.trialActive') : subscription?.status === "active" ? t('common.active') : subscription?.status || t('credits.noPlan')}
              </Badge>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Zap className="w-4 h-4 text-blue-400" />
                {isUnlimited ? t('credits.unlimitedCreditsLabel') : isOnTrial ? t('credits.trialCreditsAmount', { count: displayTotal.toLocaleString() }) : t('credits.creditsAmount', { count: displayTotal.toLocaleString(), period: subscription?.billingCycle === "yearly" ? t('credits.yearly') : t('credits.monthly') })}
              </div>
              {renewalDate && !isOnTrial && (
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <RefreshCw className="w-4 h-4 text-blue-400" /> {t('credits.creditsResetDate', { date: formatDate(renewalDate) })}
                </div>
              )}
              {isOnTrial && trialEndsAt && (
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Clock className="w-4 h-4 text-amber-400" /> {t('credits.trialEndsDate', { date: formatDate(trialEndsAt.toISOString()) })}
                </div>
              )}
              {subscription?.price != null && subscription.price > 0 && (
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Wallet className="w-4 h-4 text-blue-400" />
                  {formatCurrency(subscription.price, currency)}/{subscription.billingCycle || t('credits.monthly')}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            {!isUnlimited && (
              <Button
                onClick={() => document.getElementById("buy-credits")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="flex-1"
                variant="secondary"
              >
                {showBuyCredits ? t('credits.buyMore') : "Buy credits"}
              </Button>
            )}
            {isUnlimited && (
              <Link href="/subscription/plans" className="flex-1">
                <Button className="w-full" variant="secondary">{isOnTrial ? t('trial.upgrade') : t('credits.changePlan')}</Button>
              </Link>
            )}
            <Link href="/billing" className="flex-1">
              <Button className="w-full" variant="ghost">{t('credits.manageBilling')}</Button>
            </Link>
          </div>
        </Card>
      </div>

      {!isUnlimited && creditPacks.length > 0 && (
        <div id="buy-credits" className="scroll-mt-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Buy credits</h2>
              <p className="text-sm text-slate-500">
                Recharge only when you need more. Packs are added to your balance after payment.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              Priced for realtime transcription, translation, and AI helpers
            </div>
          </div>
          {purchaseError && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {purchaseError}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {creditPacks.map((pack) => {
              const estimatedMinutes = pack.credits;
              const pricePer100 = pack.price / (pack.credits / 100);
              return (
                <Card
                  key={pack.id}
                  padding="lg"
                  className={pack.badge ? "border-blue-300 shadow-sm" : "hover:border-blue-200 transition-colors"}
                >
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    {pack.badge && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                        {pack.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{pack.name}</h3>
                  <p className="mt-1 min-h-[40px] text-sm leading-relaxed text-slate-500">{pack.description}</p>
                  <div className="my-6">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-slate-900 tabular-nums">{pack.credits.toLocaleString()}</span>
                      <span className="text-sm font-semibold text-slate-500">credits</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      About {estimatedMinutes.toLocaleString()} Speech-to-Scripture minutes
                    </p>
                  </div>
                  <div className="mb-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">Price</span>
                      <span className="text-xl font-black text-slate-900">
                        {formatCurrency(pack.price, pack.currency)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>Per 100 credits</span>
                      <span className="font-semibold">{formatCurrency(pricePer100, pack.currency)}</span>
                    </div>
                  </div>
                  <Button
                    className="w-full active:scale-[0.98] transition-transform"
                    loading={purchasingPackId === pack.id}
                    disabled={!!purchasingPackId}
                    onClick={() => handleBuyCredits(pack)}
                  >
                    Buy {pack.credits.toLocaleString()} credits
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* How Credits Are Used */}
      {creditCosts.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-1">{t('credits.howCreditsUsed')}</h2>
          <p className="text-sm text-slate-500 mb-4">{t('credits.eachFeatureConsumes')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {creditCosts.map((c) => {
              const Icon = COST_ICONS[c.name] || Zap;
              return (
                <Card key={c.name} padding="md" className="hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center text-blue-700">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-slate-900">{c.name}</span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-2xl font-black text-slate-900">{c.cost}</span>
                    <span className="text-sm text-slate-500">{c.unit}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{c.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Usage Calculator + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {!isUnlimited && estimatedUsage.length > 0 && (
          <Card padding="md">
            <CardHeader title={t('credits.whatCanCreditsDo')} icon={<TrendingDown className="w-4 h-4 text-blue-700" />} />
            <p className="text-xs text-slate-500 mb-3">{t('credits.creditsRemainingLabel', { count: displayCredits.toLocaleString() })}</p>
            <div className="space-y-2.5">
              {estimatedUsage.map((e) => (
                <div key={e.name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">≈ {e.estimate.toLocaleString()} {e.unit === "per minute" ? "min" : t('credits.uses')}</span>
                  <span className="text-slate-900 font-medium">{e.name}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card padding="lg" className={isUnlimited ? "lg:col-span-3" : "lg:col-span-2"}>
          <h3 className="text-base font-bold text-slate-900 mb-1">{t('credits.creditsPerDay')}</h3>
          <p className="text-sm text-slate-500 mb-5">{t('credits.dailyCreditConsumption')}</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "none" }}
                  cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 4" }}
                  formatter={(value) => [`${value} ${t('credits.chartCredits')}`, t('credits.chartUsed')]}
                />
                <Area type="monotone" dataKey="usage" stroke="#1D4ED8" strokeWidth={2.5} fillOpacity={1} fill="url(#colorUsage)" activeDot={{ r: 5, fill: "#1D4ED8", stroke: "#e0e7ff", strokeWidth: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('credits.recentActivity')}</h2>
          <Link href="/credits/history" className="text-xs font-medium text-blue-700 hover:underline flex items-center gap-1">
            {t('credits.viewAll')} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-3 px-5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('credits.date')}</th>
                  <th className="py-3 px-5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('credits.feature')}</th>
                  <th className="py-3 px-5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">{t('credits.creditsColumn')}</th>
                  <th className="py-3 px-5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">{t('credits.balance')}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState icon={<Zap className="w-5 h-5" />} title={t('credits.noTransactionsYet')} description={t('credits.startUsingAIFeatures')} />
                    </td>
                  </tr>
                ) : (
                  recentTransactions.map((txn, i) => {
                    const info = getTransactionInfo(txn, t);
                    const Icon = info.icon;
                    const isPositive = txn.amount >= 0;
                    return (
                      <tr key={txn._id || i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-5 text-slate-500 font-medium whitespace-nowrap">{formatDate(txn.createdAt)}</td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-slate-100 rounded-xl flex items-center justify-center">
                              <Icon className="w-3 h-3 text-slate-500" />
                            </div>
                            <span className="font-medium text-slate-700">{info.label}</span>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-right font-bold whitespace-nowrap">
                          <span className={isPositive ? "text-green-600" : "text-slate-900"}>
                            {isPositive ? "+" : ""}{txn.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-right text-slate-500 font-medium">{txn.balanceAfter?.toLocaleString() ?? "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* What Happens When Credits Run Out? */}
      <Card padding="lg">
        <CardHeader title={t('credits.whatHappensRunOut')} icon={<HelpCircle className="w-4 h-4 text-amber-600" />} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">{t('credits.whenCreditsReachZero')}</h3>
            <ul className="space-y-1.5">
              {[t('credits.aiFeaturesStop'), t('credits.liveTranslationPauses'), t('credits.aiSummariesUnavailable'), t('credits.sermonNotesCannotGenerate')].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">{t('credits.youCan')}</h3>
            <ul className="space-y-1.5">
              {[t('credits.waitMonthlyRefresh'), t('credits.upgradeForMoreCredits')].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
