"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  History,
  Zap,
  Wallet,
  RefreshCw,
  FileAudio,
  Loader2,
  TrendingUp,
  Languages,
  Mic,
  Brain,
  AlertCircle,
  Sparkles,
  Clock,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  getCreditTransactions,
  getCreditUsageByDay,
  getTranscriptionBalance,
  getTranscriptionPackages,
  createTranscriptionTopup,
  verifyTranscriptionTopup,
  type CreditTransaction,
  type TranscriptionBalanceSummary,
  type TopupPackage,
  type TopupPricingResult,
} from "@/lib/api";
import { useSubscription } from "@/lib/useSubscription";
import { getUserId } from "@/lib/userId";
import { getAmbassadorInfo } from "@/lib/ambassadorUtils";
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
      currency: currency || "NGN",
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    if (currency === "NGN") return `₦${amount.toLocaleString()}`;
    return `$${amount.toLocaleString()}`;
  }
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 min";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
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
    isUnlimited: subIsUnlimited,
    isOnTrial,
    loading: subLoading,
  } = useSubscription();

  const ambassadorInfo = getAmbassadorInfo(mongoUser?.ambassador, mongoUser?.role);

  const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([]);
  const [chartData, setChartData] = useState<{ date: string; usage: number }[]>([]);
  const [transcriptionBalance, setTranscriptionBalance] = useState<TranscriptionBalanceSummary | null>(null);
  const [topupPricing, setTopupPricing] = useState<TopupPricingResult | null>(null);
  const [purchaseError, setPurchaseError] = useState("");
  const [purchasingPackId, setPurchasingPackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupSuccessMessage, setTopupSuccessMessage] = useState("");
  const [isVerifyingTopup, setIsVerifyingTopup] = useState(false);

  const currency = subscription?.currency || "NGN";
  const isUnlimited = subIsUnlimited || Boolean(transcriptionBalance?.unlimited);

  // Fallback calculations if transcription balance summary is not yet loaded
  const fallbackCredits = mongoUser?.credits ?? 0;
  const totalAvailableCredits = transcriptionBalance
    ? transcriptionBalance.totalAvailableCredits
    : (mongoUser?.totalAvailable ?? maxCredits);

  const totalAvailableHours = transcriptionBalance
    ? transcriptionBalance.totalAvailableHours
    : Math.round((fallbackCredits / 60) * 10) / 10;

  const includedHours = transcriptionBalance
    ? transcriptionBalance.includedHours
    : Math.round((Math.min(fallbackCredits, maxCredits) / 60) * 10) / 10;

  const includedCredits = transcriptionBalance
    ? transcriptionBalance.includedCredits
    : Math.min(fallbackCredits, maxCredits);

  const purchasedHours = transcriptionBalance ? transcriptionBalance.purchasedHours : 0;
  const purchasedCredits = transcriptionBalance ? transcriptionBalance.purchasedCredits : 0;

  // Initial data loading + handle return from Flutterwave verification
  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      setLoading(false);
      return;
    }

    // Check if returning from a payment gateway redirect
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const isTopupSuccess = params.get("topup") === "success";
      const reference = params.get("reference") || params.get("tx_ref");
      const transactionId = params.get("transaction_id") || undefined;
      if (isTopupSuccess && reference) {
        setIsVerifyingTopup(true);
        verifyTranscriptionTopup(reference, transactionId)
          .then((res) => {
            if (res.success) {
              setTopupSuccessMessage(
                res.alreadyProcessed
                  ? "Your top-up was previously confirmed and added to your balance."
                  : "Top-up verified successfully! Your hours have been credited."
              );
              if (res.balance) {
                setTranscriptionBalance(res.balance);
              }
            } else {
              setPurchaseError("Payment verification could not be completed. Please contact support if you were debited.");
            }
          })
          .catch((err) => {
            setPurchaseError(err instanceof Error ? err.message : "Failed to verify top-up");
          })
          .finally(() => {
            setIsVerifyingTopup(false);
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          });
      }
    }

    Promise.all([
      getCreditTransactions(userId, { limit: 5 }),
      getCreditUsageByDay(userId, 7),
      getTranscriptionBalance().catch(() => null),
      getTranscriptionPackages(currency).catch(() => null),
    ])
      .then(([txns, usage, balanceData, packagesData]) => {
        setRecentTransactions(txns.transactions || []);
        setChartData(usage.usage.map((d) => ({ date: d.date, usage: d.amount })));
        if (balanceData) {
          setTranscriptionBalance(balanceData);
        }
        if (packagesData) {
          setTopupPricing(packagesData);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currency]);

  const handleBuyCredits = async (pack: TopupPackage) => {
    setPurchaseError("");
    setPurchasingPackId(pack.id);
    try {
      const returnUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/credits?topup=success`
          : undefined;

      const data = await createTranscriptionTopup(pack.id, returnUrl);
      if (!data.authorization_url) {
        throw new Error("Could not initialize payment gateway");
      }
      try {
        localStorage.setItem(
          "mce_pending_payment",
          JSON.stringify({
            type: "transcription_topup",
            reference: data.reference,
            packId: pack.id,
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

  // Fallback packages if pricing endpoint hasn't finished loading yet
  const displayPackages: TopupPackage[] = topupPricing?.packages || [
    {
      id: "topup-1h",
      hours: 1,
      credits: 60,
      seconds: 3600,
      price: currency === "NGN" ? 100 : 0.07,
      currency,
      pricePerHour: currency === "NGN" ? 100 : 0.07,
      pricePerCredit: currency === "NGN" ? 1.67 : 0.001,
      badge: undefined,
      description: "Quick top-up for a single service or practice run.",
    },
    {
      id: "topup-5h",
      hours: 5,
      credits: 300,
      seconds: 18000,
      price: currency === "NGN" ? 500 : 0.35,
      currency,
      pricePerHour: currency === "NGN" ? 100 : 0.07,
      pricePerCredit: currency === "NGN" ? 1.67 : 0.001,
      badge: undefined,
      description: "Ideal for a full weekend of Sunday services.",
    },
    {
      id: "topup-10h",
      hours: 10,
      credits: 600,
      seconds: 36000,
      price: currency === "NGN" ? 950 : 0.70,
      currency,
      pricePerHour: currency === "NGN" ? 95 : 0.07,
      pricePerCredit: currency === "NGN" ? 1.58 : 0.001,
      badge: "Popular",
      description: "Best for active ministries running multiple weekly meetings.",
    },
    {
      id: "topup-20h",
      hours: 20,
      credits: 1200,
      seconds: 72000,
      price: currency === "NGN" ? 1900 : 1.40,
      currency,
      pricePerHour: currency === "NGN" ? 95 : 0.07,
      pricePerCredit: currency === "NGN" ? 1.58 : 0.001,
      badge: undefined,
      description: "Extended coverage for monthly conferences and youth camps.",
    },
    {
      id: "topup-50h",
      hours: 50,
      credits: 3000,
      seconds: 180000,
      price: currency === "NGN" ? 4750 : 3.50,
      currency,
      pricePerHour: currency === "NGN" ? 95 : 0.07,
      pricePerCredit: currency === "NGN" ? 1.58 : 0.001,
      badge: "Best Value",
      description: "Maximum savings for large productions and multi-campus events.",
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Credits & Transcription</h1>
          <p className="text-sm text-slate-500">
            Monitor your transcription balance, plan allowances, and top up hours with zero expiration.
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

      {/* Verification status notifications */}
      {topupSuccessMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{topupSuccessMessage}</span>
          </div>
          <button
            onClick={() => setTopupSuccessMessage("")}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-bold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {isVerifyingTopup && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 animate-pulse">
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
          <span>Verifying your top-up payment...</span>
        </div>
      )}

      {/* Credit Balance Card with Two Separate Balances */}
      <Card padding="lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-slate-900">
                  AI & Transcription Balance
                </h2>
                {ambassadorInfo.isAmbassador && (
                  <Badge variant="purple" size="sm">
                    <Sparkles className="w-3 h-3 mr-0.5 text-purple-600 inline" />
                    Ambassador Grant
                  </Badge>
                )}
                <Badge variant="default" size="sm">
                  {ambassadorInfo.isAmbassador ? "Growth Tier" : `${planLabel} Plan`}
                </Badge>
              </div>

              {/* Total Balance Headline */}
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {isUnlimited ? "∞" : `${totalAvailableHours.toLocaleString()} hrs`}
                </span>
                {!isUnlimited && (
                  <span className="text-sm font-semibold text-slate-500">
                    ({totalAvailableCredits.toLocaleString()} credits)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-4">
                {isUnlimited
                  ? "Unlimited live transcription and AI credits on your current plan"
                  : "1 credit = 1 minute of live transcription • Billed down to exact seconds"}
              </p>

              {/* Separate Balances Cards */}
              {!isUnlimited && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                  {/* Included Plan Balance */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-semibold text-slate-700">Included Plan Allowance</span>
                      <span className="text-[11px] font-medium text-slate-400">Resets monthly</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-slate-900">{includedHours} hrs</span>
                      <span className="text-xs text-slate-500 font-medium">({includedCredits} credits)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Consumed first during live transcription.
                    </p>
                  </div>

                  {/* Purchased Top-Up Balance */}
                  <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80">
                    <div className="flex items-center justify-between text-xs text-amber-900 mb-1">
                      <span className="font-bold text-amber-800">Purchased Top-Up</span>
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        Never expires
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-amber-950">{purchasedHours} hrs</span>
                      <span className="text-xs text-amber-800 font-medium">({purchasedCredits} credits)</span>
                    </div>
                    <p className="text-[11px] text-amber-800 mt-1">
                      Rolls over indefinitely; used when plan hours deplete.
                    </p>
                  </div>
                </div>
              )}

              {/* Ambassador Note */}
              {ambassadorInfo.isAmbassador && (
                <div className="mt-4 p-3 rounded-xl bg-purple-50/70 border border-purple-100 flex items-start gap-2.5 max-w-xl">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-purple-900 leading-relaxed">
                    <span className="font-bold">Ambassador Partnership Allocation:</span>{" "}
                    You have a {ambassadorInfo.tenureLabel} grant with full Growth Tier privileges ({ambassadorInfo.remainingLabel} · expires {ambassadorInfo.formattedExpiry}).
                    {ambassadorInfo.creditsGranted > 0 && (
                      <span> Granted with {ambassadorInfo.creditsGranted.toLocaleString()} AI credits.</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0">
            <Link href="#buy-credits">
              <Button
                variant="primary"
                size="md"
                icon={<Wallet className="w-4 h-4" />}
                className="w-full sm:w-auto"
              >
                Top Up Credits
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Credit Usage by Feature + Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Usage by AI Feature */}
        <Card padding="md">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">
              AI Features & Billing Rates
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
                  <span className="text-xs font-semibold text-slate-600">
                    1 credit/min (per second)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time sermon speech recognition & scripture detection
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
                  <span className="text-xs font-semibold text-slate-600">
                    1 credit/min (per second)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time multilingual captioning & translation
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50">
              <Brain className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-900">
                    AI Sermon Summaries
                  </span>
                  <span className="text-xs font-semibold text-slate-600">
                    5 credits / run
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comprehensive sermon summary & study points generation
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
                Credits Used (Last 7 Days)
              </h3>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
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
                Start transcribing live services to see your credit usage chart.
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Top-up Packages Grid */}
      <div id="buy-credits" className="scroll-mt-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              Top Up Transcription Credits
            </h2>
            <p className="text-sm text-slate-500">
              1 credit = 1 minute of transcription. Top-up credits never expire and roll over automatically every month.
            </p>
          </div>
          {topupPricing && (
            <span className="text-xs font-medium text-slate-400">
              Live Exchange Rate • Secure Flutterwave Checkout
            </span>
          )}
        </div>

        {purchaseError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" /> {purchaseError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {displayPackages.map((pack) => {
            const isBuying = purchasingPackId === pack.id;
            const isBestValue = pack.badge === "Best Value";
            const isPopular = pack.badge === "Popular";

            return (
              <Card
                key={pack.id}
                padding="md"
                className={`flex flex-col justify-between relative transition-all ${
                  isBestValue
                    ? "border-amber-400 shadow-sm ring-1 ring-amber-300 bg-gradient-to-b from-amber-50/20 to-white"
                    : isPopular
                      ? "border-blue-400 shadow-sm ring-1 ring-blue-300 bg-gradient-to-b from-blue-50/20 to-white"
                      : "hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-slate-700" />
                    </div>
                    {pack.badge && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          isBestValue
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-blue-100 text-blue-800 border border-blue-200"
                        }`}
                      >
                        {pack.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-slate-900">
                    {pack.hours} {pack.hours === 1 ? "Hour" : "Hours"}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    {pack.credits.toLocaleString()} credits ({formatDuration(pack.seconds)})
                  </p>
                  <p className="mt-2 text-xs text-slate-500 leading-relaxed min-h-[32px]">
                    {pack.description}
                  </p>

                  <div className="my-4 pt-3 border-t border-slate-100">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-900">
                        {formatCurrency(pack.price, pack.currency)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formatCurrency(pack.pricePerHour, pack.currency)} / hr
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleBuyCredits(pack)}
                  disabled={!!purchasingPackId || isVerifyingTopup}
                  className={`w-full h-10 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                    isBestValue
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : isPopular
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-slate-900 hover:bg-slate-800 text-white"
                  } disabled:opacity-50`}
                >
                  {isBuying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Redirecting...
                    </>
                  ) : (
                    `Top Up ${pack.hours}h`
                  )}
                </button>
              </Card>
            );
          })}
        </div>
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
    </div>
  );
}
