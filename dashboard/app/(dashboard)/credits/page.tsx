"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  ArrowUp,
  History,
  Zap,
  Wallet,
  ArrowRight,
  RefreshCw,
  FileAudio,
  Loader2,
  TrendingUp,
  Languages,
  Mic,
  Brain,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  getCreditTransactions,
  getCreditUsageByDay,
  type CreditTransaction,
} from "@/lib/api";
import { useSubscription } from "@/lib/useSubscription";
import { getUserId } from "@/lib/userId";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, Badge, Button, EmptyState, CardSkeleton, TableSkeleton } from "@/components/ui";

function formatDate(iso: string) {
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
    mongoUser,
    maxCredits,
    isUnlimited,
    isOnTrial,
    trialEndsAt,
    loading: subLoading,
  } = useSubscription();

  const [recentTransactions, setRecentTransactions] = useState<
    CreditTransaction[]
  >([]);
  const [chartData, setChartData] = useState<
    { date: string; usage: number }[]
  >([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [purchaseError, setPurchaseError] = useState("");
  const [purchasingPackId, setPurchasingPackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const credits = mongoUser?.credits ?? 0;
  const creditCosts = planConfig?.creditCosts || [];
  const totalAvailable = mongoUser?.totalAvailable ?? maxCredits;
  const displayCredits = credits >= 0 ? credits : maxCredits;
  const displayTotal = totalAvailable >= 0 ? totalAvailable : maxCredits;
  const usedCredits = isUnlimited
    ? 0
    : Math.max(0, displayTotal - displayCredits);
  const usagePct = isUnlimited
    ? 0
    : displayTotal > 0
      ? Math.round((usedCredits / displayTotal) * 100)
      : 0;
  const remainingPct = isUnlimited ? 100 : Math.max(0, 100 - usagePct);
  const currency = subscription?.currency || "USD";

  const showBuyCredits =
    !isUnlimited &&
    !isOnTrial &&
    (planTier?.pricing?.NGN?.monthly ?? 0) > 0 &&
    maxCredits > 0 &&
    displayCredits <= displayTotal * 0.1;

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      setLoading(false);
      return;
    }
    Promise.all([
      getCreditTransactions(userId, { limit: 5 }),
      getCreditUsageByDay(userId, 7),
      fetch("/api/credits/purchase").then((res) =>
        res.ok ? res.json() : { packs: [] },
      ),
    ])
      .then(([txns, usage, packsData]) => {
        setRecentTransactions(txns.transactions);
        setChartData(usage.usage.map((d) => ({ date: d.date, usage: d.amount })));
        setCreditPacks(
          Array.isArray(packsData.packs) ? packsData.packs : [],
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
      } catch {
        /* best effort */
      }
      window.location.href = data.authorization_url;
    } catch (error) {
      setPurchaseError(
        error instanceof Error ? error.message : "Could not start checkout",
      );
      setPurchasingPackId(null);
    }
  };

  if (subLoading || loading) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6 pb-16">
        <CardSkeleton />
        <CardSkeleton />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <TableSkeleton rows={3} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Credits</h1>
          <p className="text-sm text-slate-500">
            Monitor your AI credit balance, usage and top up when needed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/credits/history">
            <Button variant="secondary" size="sm" icon={<History className="w-4 h-4" />}>
              View History
            </Button>
          </Link>
          <Link href="/subscription">
            <Button variant="secondary" size="sm" icon={<CreditCard className="w-4 h-4" />}>
              Plan
            </Button>
          </Link>
        </div>
      </div>

      {/* Credit Balance Card */}
      <Card padding="lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-slate-900">
                  AI Credits
                </h2>
                <Badge variant="default" size="sm">
                  {planLabel} Plan
                </Badge>
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-bold text-slate-900">
                  {isUnlimited ? "∞" : displayCredits.toLocaleString()}
                </span>
                {!isUnlimited && (
                  <span className="text-sm text-slate-500">
                    of {displayTotal.toLocaleString()}
                  </span>
                )}
              </div>
              {!isUnlimited && (
                <div className="mb-2">
                  <div className="w-full md:w-64 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${remainingPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {remainingPct}% remaining &middot; {usedCredits.toLocaleString()} used
                  </p>
                </div>
              )}
              {isUnlimited && (
                <p className="text-sm text-slate-500">
                  Unlimited AI credits on your current plan
                </p>
              )}
            </div>
          </div>
          {showBuyCredits && (
            <div className="shrink-0">
              <Link href="#buy-credits">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Wallet className="w-4 h-4" />}
                >
                  Buy More Credits
                </Button>
              </Link>
            </div>
          )}
        </div>
      </Card>

      {/* Credit Usage by Feature + Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Usage by AI Feature */}
        <Card padding="md">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">
              AI Features
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50">
              <Mic className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-900">
                    Speech-to-Scripture
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    1 credit/min
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time sermon transcription
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50">
              <Languages className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-900">
                    Live Translation
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    1 credit/min
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time multilingual captioning
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50">
              <Brain className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-900">
                    AI Summaries
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    5 credits
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sermon summary generator
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Credit Usage Chart */}
        {chartData.length > 0 ? (
          <Card padding="md">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                Credits Per Day
              </h3>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="creditUsageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d97706" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "none",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [`${value} credits`, "Used"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="usage"
                    stroke="#d97706"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#creditUsageGrad)"
                    activeDot={{ r: 4, fill: "#d97706", stroke: "#fef3c7", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ) : (
          <Card padding="md">
            <div className="flex flex-col items-center justify-center h-56 text-center">
              <TrendingUp className="w-8 h-8 text-slate-200 mb-3" />
              <p className="text-sm text-slate-500">No usage data yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Start using AI features to see your credit usage chart.
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Recent Credit Activity */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            Recent Credit Activity
          </h2>
          <Link
            href="/credits/history"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            View full history
          </Link>
        </div>
        <Card padding="none">
          {recentTransactions.length === 0 ? (
            <EmptyState
              icon={<Zap className="w-5 h-5" />}
              title="No credit activity yet"
              description="Your credit transactions will appear here as you use AI features."
            />
          ) : (
            recentTransactions.map((txn, i) => (
              <div
                key={txn._id || i}
                className={`flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors ${
                  i < recentTransactions.length - 1
                    ? "border-b border-slate-100"
                    : ""
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    txn.amount > 0
                      ? "bg-green-50 text-green-600"
                      : txn.source === "transcription" ||
                          txn.source === "translation"
                        ? "bg-purple-50 text-purple-500"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {txn.amount > 0 ? (
                    <RefreshCw className="w-4 h-4" />
                  ) : (
                    <FileAudio className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {txn.description?.slice(0, 50) || "Transaction"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {txn.amount > 0 ? "+" : ""}
                    {txn.amount.toLocaleString()} credits
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {formatDate(txn.createdAt)}
                </span>
              </div>
            ))
          )}
        </Card>
      </section>

      {/* Credit Packs */}
      {creditPacks.length > 0 && (
        <div id="buy-credits" className="scroll-mt-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              Buy Credits
            </h2>
            <p className="text-sm text-slate-500">
              Recharge only when you need more. Packs are added to your balance
              after payment.
            </p>
          </div>
          {purchaseError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" /> {purchaseError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {creditPacks.map((pack) => {
              const estimatedMinutes = pack.credits;
              const pricePer100 = pack.price / (pack.credits / 100);
              const isBuying = purchasingPackId === pack.id;
              return (
                <Card
                  key={pack.id}
                  padding="md"
                  className={
                    pack.badge ? "border-blue-300" : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-slate-600" />
                    </div>
                    {pack.badge && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">
                        {pack.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    {pack.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed min-h-[36px]">
                    {pack.description}
                  </p>
                  <div className="my-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-slate-900 tabular-nums">
                        {pack.credits.toLocaleString()}
                      </span>
                      <span className="text-sm font-medium text-slate-500">
                        credits
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      About {estimatedMinutes.toLocaleString()}{" "}
                      Speech-to-Scripture minutes
                    </p>
                  </div>
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">
                        Price
                      </span>
                      <span className="text-lg font-bold text-slate-900">
                        {formatCurrency(pack.price, pack.currency)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                      <span>Per 100 credits</span>
                      <span className="font-semibold">
                        {formatCurrency(pricePer100, pack.currency)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleBuyCredits(pack)}
                    disabled={!!purchasingPackId}
                    className="w-full h-10 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {isBuying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      `Buy ${pack.credits.toLocaleString()} credits`
                    )}
                  </button>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
