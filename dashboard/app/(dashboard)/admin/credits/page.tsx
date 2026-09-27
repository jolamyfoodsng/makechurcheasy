"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coins,
  Crown,
  DollarSign,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import {
  getAdminTranscriptionPricing,
  updateAdminTranscriptionPricing,
  adminAdjustUserCredits,
  getAdminUserCredits,
  type AdminTranscriptionPricingResponse,
  type TranscriptionBalanceSummary,
} from "@/lib/api";

function formatCurrency(amount: number, currency: string) {
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

interface AdminUserItem {
  id: string;
  name?: string;
  email?: string;
  plan?: string;
  credits?: number;
  ambassador?: {
    active?: boolean;
    expiresAt?: string;
  };
  transcriptionBalance?: {
    includedHours: number;
    purchasedHours: number;
    totalAvailableHours: number;
    totalAvailableCredits: number;
  } | null;
}

export default function AdminCreditsAndPricingPage() {
  const [activeTab, setActiveTab] = useState<"pricing" | "usage">("pricing");

  // Pricing tab state
  const [pricingData, setPricingData] = useState<AdminTranscriptionPricingResponse | null>(null);
  const [providerCostUSD, setProviderCostUSD] = useState<number>(0.027);
  const [profitNGN, setProfitNGN] = useState<number>(40);
  const [freeDailyMinutes, setFreeDailyMinutes] = useState<number>(0);
  const [freeWeeklyMinutes, setFreeWeeklyMinutes] = useState<number>(0);
  const [planHours, setPlanHours] = useState({
    free: 0,
    trial: 5,
    basic: 12,
    growth: 30,
    pro: 30,
    ambassador: 30,
  });
  const [tierPackages, setTierPackages] = useState<
    Array<{
      id: string;
      hours: number;
      badge?: string;
      description: string;
      customPriceNGN?: number;
      customPriceUSD?: number;
    }>
  >([]);

  const [loading, setLoading] = useState(true);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingSuccess, setPricingSuccess] = useState("");
  const [pricingError, setPricingError] = useState("");

  // User Usage / Balance Adjustment tab state
  const [usersList, setUsersList] = useState<AdminUserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [userBalance, setUserBalance] = useState<TranscriptionBalanceSummary | null>(null);
  const [userTxns, setUserTxns] = useState<any[]>([]);
  const [loadingUserBalance, setLoadingUserBalance] = useState(false);

  // Adjustment form state
  const [adjustAction, setAdjustAction] = useState<"increase" | "decrease" | "set">("increase");
  const [adjustUnit, setAdjustUnit] = useState<"hours" | "credits">("hours");
  const [adjustAmount, setAdjustAmount] = useState<string>("5");
  const [adjustTarget, setAdjustTarget] = useState<"purchased" | "included" | "auto">("purchased");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustSuccess, setAdjustSuccess] = useState("");
  const [adjustError, setAdjustError] = useState("");

  // Load initial data
  useEffect(() => {
    Promise.all([
      getAdminTranscriptionPricing()
        .then((res) => {
          setPricingData(res);
          const p = res.transcriptionPricing;
          setProviderCostUSD(p.providerCostPerHourUSD ?? 0.027);
          setProfitNGN(p.profitPerHourNGN ?? 40);
          setFreeDailyMinutes(p.freeDailyMinutes ?? 0);
          setFreeWeeklyMinutes(p.freeWeeklyMinutes ?? 0);
          if (p.planIncludedHours) {
            setPlanHours({
              free: p.planIncludedHours.free ?? 0,
              trial: p.planIncludedHours.trial ?? 5,
              basic: p.planIncludedHours.basic ?? 12,
              growth: p.planIncludedHours.growth ?? 30,
              pro: p.planIncludedHours.pro ?? 30,
              ambassador: p.planIncludedHours.ambassador ?? 30,
            });
          }
          if (Array.isArray(p.tierPackages) && p.tierPackages.length > 0) {
            setTierPackages(p.tierPackages);
          } else {
            setTierPackages([
              { id: "topup-1h", hours: 1, badge: "", description: "Quick top-up for a single service or practice run." },
              { id: "topup-5h", hours: 5, badge: "", description: "Ideal for a full weekend of Sunday services." },
              { id: "topup-10h", hours: 10, badge: "Popular", description: "Best for active ministries running multiple weekly meetings." },
              { id: "topup-20h", hours: 20, badge: "", description: "Extended coverage for monthly conferences and youth camps." },
              { id: "topup-50h", hours: 50, badge: "Best Value", description: "Maximum savings for large productions and multi-campus events." },
            ]);
          }
        })
        .catch((err) => {
          setPricingError(err instanceof Error ? err.message : "Failed to load pricing config");
        }),
      fetch("/api/admin/users")
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((data) => {
          if (Array.isArray(data.users)) {
            setUsersList(data.users);
          }
        })
        .catch(console.error),
    ]).finally(() => setLoading(false));
  }, []);

  // Filtered users for quick search
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return usersList.slice(0, 8);
    const q = searchQuery.toLowerCase();
    return usersList
      .filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.id?.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [usersList, searchQuery]);

  // Handle selecting a user
  const handleSelectUser = async (u: AdminUserItem) => {
    setSelectedUser(u);
    setLoadingUserBalance(true);
    setAdjustSuccess("");
    setAdjustError("");
    try {
      const data = await getAdminUserCredits(u.id);
      setUserBalance(data.transcriptionBalance);
      setUserTxns(data.recentTransactions || []);
    } catch {
      setUserBalance(null);
    } finally {
      setLoadingUserBalance(false);
    }
  };

  // Live computed selling price per hour based on inputs
  const liveUsdRate = pricingData?.usdRate || 1450;
  const liveProviderCostNGN = providerCostUSD * liveUsdRate;
  const liveSellingPricePerHourNGN = Math.ceil((liveProviderCostNGN + profitNGN) / 10) * 10;
  const liveSellingPricePerHourUSD =
    Math.round((providerCostUSD + profitNGN / liveUsdRate) * 100) / 100;

  // Save Pricing Settings
  const handleSavePricing = async () => {
    setSavingPricing(true);
    setPricingSuccess("");
    setPricingError("");
    try {
      const res = await updateAdminTranscriptionPricing({
        providerCostPerHourUSD: providerCostUSD,
        profitPerHourNGN: profitNGN,
        freeDailyMinutes,
        freeWeeklyMinutes,
        planIncludedHours: planHours,
        tierPackages,
      });
      setPricingData(res as any);
      const resetCount = res.balanceSync?.reset ?? 0;
      setPricingSuccess(
        resetCount > 0
          ? `Settings saved. ${resetCount} existing transcription balances were reset from the current plan allowances.`
          : "Pricing & plan allowance settings saved successfully!",
      );
    } catch (err) {
      setPricingError(err instanceof Error ? err.message : "Failed to save pricing");
    } finally {
      setSavingPricing(false);
    }
  };

  // Apply Balance Adjustment for User
  const handleApplyAdjustment = async () => {
    if (!selectedUser) return;
    const num = parseFloat(adjustAmount);
    if (isNaN(num) || num <= 0) {
      setAdjustError("Please enter a valid positive number.");
      return;
    }

    setAdjusting(true);
    setAdjustSuccess("");
    setAdjustError("");
    try {
      const finalAmount = adjustAction === "decrease" ? -num : num;
      const res = await adminAdjustUserCredits(selectedUser.id, {
        amount: finalAmount,
        unit: adjustUnit,
        action: adjustAction,
        target: adjustTarget,
        reason: adjustReason.trim() || undefined,
      });

      setUserBalance(res.transcriptionBalance);
      setAdjustSuccess(res.message);

      // Refresh recent user transactions
      const refreshed = await getAdminUserCredits(selectedUser.id);
      setUserTxns(refreshed.recentTransactions || []);

      // Update user in usersList
      setUsersList((prev) =>
        prev.map((item) =>
          item.id === selectedUser.id
            ? {
                ...item,
                credits: res.credits,
                transcriptionBalance: {
                  includedHours: res.transcriptionBalance.includedHours,
                  purchasedHours: res.transcriptionBalance.purchasedHours,
                  totalAvailableHours: res.transcriptionBalance.totalAvailableHours,
                  totalAvailableCredits: res.transcriptionBalance.totalAvailableCredits,
                },
              }
            : item
        )
      );
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
              <Zap className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-bold text-slate-50">
              Transcription & AI Usage Admin
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
            Increase or decrease provider costs, hourly profit margins, dynamic packages, plan allowances, and adjust user balances with full audit trails.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900 p-1">
          <button
            onClick={() => setActiveTab("pricing")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "pricing"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            Pricing & Plan Settings
          </button>
          <button
            onClick={() => setActiveTab("usage")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "usage"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            User Usage & Balance Adjuster
          </button>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: PRICING & PLAN CONFIGURATION */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "pricing" && (
        <div className="space-y-6">
          {pricingSuccess && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>{pricingSuccess}</span>
              </div>
              <button
                onClick={() => setPricingSuccess("")}
                className="text-xs text-emerald-400 hover:text-emerald-200 font-bold"
              >
                Dismiss
              </button>
            </div>
          )}

          {pricingError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200">
              <AlertCircle className="h-4 w-4" />
              {pricingError}
            </div>
          )}

          {/* Real-time Pricing Controls */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* 1. DeepInfra Provider Cost per Hour ($) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase text-slate-400">
                    Provider Cost / Hour
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                    DeepInfra USD
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-black text-slate-50 tabular-nums">
                    ${providerCostUSD.toFixed(4)}
                  </span>
                  <span className="text-xs text-slate-400">/ hour</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Raw AI speech recognition cost from vendor per audio hour.
                </p>
              </div>

              {/* Increase / Decrease Stepper */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() =>
                    setProviderCostUSD((prev) =>
                      Math.max(0.005, Math.round((prev - 0.005) * 1000) / 1000)
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                  title="Decrease provider cost"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={providerCostUSD}
                  onChange={(e) => setProviderCostUSD(parseFloat(e.target.value) || 0.001)}
                  className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-center text-sm font-semibold text-slate-100 outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() =>
                    setProviderCostUSD((prev) =>
                      Math.round((prev + 0.005) * 1000) / 1000
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                  title="Increase provider cost"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 2. Platform Profit Margin per Hour (₦) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase text-slate-400">
                    Platform Profit Margin
                  </span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    Target NGN
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-black text-emerald-400 tabular-nums">
                    ₦{profitNGN}
                  </span>
                  <span className="text-xs text-slate-400">/ hour margin</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Markup added on top of vendor cost before dynamic ceiling rounding.
                </p>
              </div>

              {/* Increase / Decrease Stepper */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setProfitNGN((prev) => Math.max(0, prev - 10))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                  title="Decrease profit margin"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  step="5"
                  min="0"
                  value={profitNGN}
                  onChange={(e) => setProfitNGN(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-center text-sm font-semibold text-slate-100 outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => setProfitNGN((prev) => prev + 10)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                  title="Increase profit margin"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 3. Live Effective Rate Preview Card */}
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-900 p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase text-amber-400/90">
                  Effective Price Preview
                </span>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Live USD FX Rate:</span>
                    <span className="font-semibold text-slate-200">$1 = ₦{liveUsdRate.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Vendor Cost (NGN):</span>
                    <span className="font-semibold text-slate-200">₦{liveProviderCostNGN.toFixed(1)} / hr</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Added Profit Margin:</span>
                    <span className="font-semibold text-emerald-400">+₦{profitNGN} / hr</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-200">Selling Price / Hr:</span>
                    <div className="text-right">
                      <span className="text-lg font-black text-amber-400">
                        ₦{liveSellingPricePerHourNGN}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">
                        (${liveSellingPricePerHourUSD})
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleSavePricing}
                  disabled={savingPricing}
                  className="w-full inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50"
                >
                  {savingPricing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Pricing Parameters
                </button>
              </div>
            </div>
          </div>

          {/* Monthly Plan Included Hours Allowance (Increase / Decrease) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-50">
                Monthly Subscription Included Hours Allowance
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Increase or decrease the monthly included transcription hours for each tier. These allowances reset each billing cycle.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {/* Basic Plan */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-slate-200">Basic Plan</span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      {planHours.basic * 60} credits
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Standard monthly subscription tier.
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        basic: Math.max(0, prev.basic - 1),
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                    title="Decrease basic hours"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex-1 flex items-center justify-center">
                    <input
                      type="number"
                      min="0"
                      value={planHours.basic}
                      onChange={(e) =>
                        setPlanHours((prev) => ({
                          ...prev,
                          basic: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="h-8 w-16 rounded-lg border border-slate-700 bg-slate-900 text-center text-sm font-bold text-slate-100 outline-none focus:border-amber-400 tabular-nums"
                    />
                    <span className="ml-1 text-xs text-slate-400 font-medium">hrs</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        basic: prev.basic + 1,
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                    title="Increase basic hours"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Growth Plan */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-purple-300">Growth Plan</span>
                    <span className="text-[11px] text-purple-400/80 font-semibold">
                      {planHours.growth * 60} credits
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Higher allowance for growing ministries.
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        growth: Math.max(0, prev.growth - 1),
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                    title="Decrease growth hours"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex-1 flex items-center justify-center">
                    <input
                      type="number"
                      min="0"
                      value={planHours.growth}
                      onChange={(e) =>
                        setPlanHours((prev) => ({
                          ...prev,
                          growth: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="h-8 w-16 rounded-lg border border-slate-700 bg-slate-900 text-center text-sm font-bold text-purple-200 outline-none focus:border-purple-400 tabular-nums"
                    />
                    <span className="ml-1 text-xs text-purple-400 font-medium">hrs</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        growth: prev.growth + 1,
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                    title="Increase growth hours"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Ambassador Grant */}
              <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/20 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Crown className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-sm font-bold text-purple-300">Ambassadors</span>
                    </div>
                    <span className="text-[11px] text-purple-400 font-semibold">
                      {planHours.ambassador * 60} credits
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-300/70 leading-tight">
                    Monthly grant for approved platform ambassadors.
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-purple-900/40">
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        ambassador: Math.max(0, prev.ambassador - 1),
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-800/60 bg-purple-900/40 text-purple-200 hover:bg-purple-800 active:scale-95"
                    title="Decrease ambassador hours"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex-1 flex items-center justify-center">
                    <input
                      type="number"
                      min="0"
                      value={planHours.ambassador}
                      onChange={(e) =>
                        setPlanHours((prev) => ({
                          ...prev,
                          ambassador: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="h-8 w-16 rounded-lg border border-purple-800/60 bg-slate-950 text-center text-sm font-bold text-purple-200 outline-none focus:border-purple-400 tabular-nums"
                    />
                    <span className="ml-1 text-xs text-purple-400 font-medium">hrs</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        ambassador: prev.ambassador + 1,
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-800/60 bg-purple-900/40 text-purple-200 hover:bg-purple-800 active:scale-95"
                    title="Increase ambassador hours"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Trial */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-blue-300">Trial Period</span>
                    <span className="text-[11px] text-blue-400/80 font-semibold">
                      {planHours.trial * 60} credits
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Onboarding test allowance during free trial.
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        trial: Math.max(0, prev.trial - 1),
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                    title="Decrease trial hours"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex-1 flex items-center justify-center">
                    <input
                      type="number"
                      min="0"
                      value={planHours.trial}
                      onChange={(e) =>
                        setPlanHours((prev) => ({
                          ...prev,
                          trial: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="h-8 w-16 rounded-lg border border-slate-700 bg-slate-900 text-center text-sm font-bold text-blue-200 outline-none focus:border-blue-400 tabular-nums"
                    />
                    <span className="ml-1 text-xs text-blue-400 font-medium">hrs</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        trial: prev.trial + 1,
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                    title="Increase trial hours"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Free Tier */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-slate-400">Free Tier</span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      {planHours.free * 60} credits
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Free Verse AI uses the daily and weekly limits below.
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        free: Math.max(0, prev.free - 1),
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                    title="Decrease free hours"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex-1 flex items-center justify-center">
                    <input
                      type="number"
                      min="0"
                      value={planHours.free}
                      onChange={(e) =>
                        setPlanHours((prev) => ({
                          ...prev,
                          free: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="h-8 w-16 rounded-lg border border-slate-700 bg-slate-900 text-center text-sm font-bold text-slate-100 outline-none focus:border-amber-400 tabular-nums"
                    />
                    <span className="ml-1 text-xs text-slate-400 font-medium">hrs</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPlanHours((prev) => ({
                        ...prev,
                        free: prev.free + 1,
                      }))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                    title="Increase free hours"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Free Speech to Scripture quota */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-50">Free Verse AI Allowance</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Free users are limited by both windows. The daily cap stops listening for the day; the weekly cap refreshes every Monday.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <span className="block text-sm font-bold text-slate-200">Daily limit</span>
                <span className="mt-1 block text-[11px] text-slate-400">Minutes available each day</span>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={freeDailyMinutes}
                    onChange={(e) => setFreeDailyMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="h-9 w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 text-center text-sm font-bold text-slate-100 outline-none focus:border-amber-400 tabular-nums"
                  />
                  <span className="text-xs text-slate-400">minutes</span>
                </div>
              </label>
              <label className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <span className="block text-sm font-bold text-slate-200">Weekly limit</span>
                <span className="mt-1 block text-[11px] text-slate-400">Minutes available per seven-day window</span>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={freeWeeklyMinutes}
                    onChange={(e) => setFreeWeeklyMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="h-9 w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 text-center text-sm font-bold text-slate-100 outline-none focus:border-amber-400 tabular-nums"
                  />
                  <span className="text-xs text-slate-400">minutes</span>
                </div>
              </label>
            </div>
          </div>

          {/* Dynamic Tier Packages Customization */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-50">
                  Dynamic Top-Up Packages
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Customize the packages shown on the user dashboard. Prices auto-calculate based on hours and provider margin, or you can set custom price overrides.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {tierPackages.map((pkg, idx) => {
                const autoPriceNGN = Math.ceil((pkg.hours * liveSellingPricePerHourNGN) / 50) * 50;
                const effectivePriceNGN = pkg.customPriceNGN && pkg.customPriceNGN > 0 ? pkg.customPriceNGN : autoPriceNGN;

                return (
                  <div
                    key={pkg.id || idx}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-950 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-400">
                          Package {idx + 1}
                        </span>
                        {pkg.badge && (
                          <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-bold text-amber-300 uppercase tracking-wide">
                            {pkg.badge}
                          </span>
                        )}
                      </div>

                      {/* Hours Stepper */}
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Hours:
                      </label>
                      <div className="flex items-center gap-1.5 mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            const newTiers = [...tierPackages];
                            newTiers[idx].hours = Math.max(1, newTiers[idx].hours - 1);
                            setTierPackages(newTiers);
                          }}
                          className="h-7 w-7 rounded border border-slate-700 bg-slate-800 flex items-center justify-center text-slate-200 hover:bg-slate-700"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="flex-1 text-center font-bold text-sm text-slate-100">
                          {pkg.hours}h ({pkg.hours * 60}m)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const newTiers = [...tierPackages];
                            newTiers[idx].hours = newTiers[idx].hours + 1;
                            setTierPackages(newTiers);
                          }}
                          className="h-7 w-7 rounded border border-slate-700 bg-slate-800 flex items-center justify-center text-slate-200 hover:bg-slate-700"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Custom Price Override NGN */}
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Price (₦ override or 0 for auto):
                      </label>
                      <input
                        type="number"
                        step="50"
                        placeholder={`Auto: ₦${autoPriceNGN}`}
                        value={pkg.customPriceNGN || ""}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          const newTiers = [...tierPackages];
                          newTiers[idx].customPriceNGN = val;
                          setTierPackages(newTiers);
                        }}
                        className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs font-semibold text-slate-100 outline-none focus:border-amber-400"
                      />
                      <p className="text-[10px] text-amber-400 font-semibold mt-1">
                        Effective: ₦{effectivePriceNGN.toLocaleString()}
                      </p>

                      {/* Badge */}
                      <label className="block text-[11px] font-semibold text-slate-400 mt-2 mb-1">
                        Badge (optional):
                      </label>
                      <input
                        type="text"
                        placeholder="Popular / Best Value"
                        value={pkg.badge || ""}
                        onChange={(e) => {
                          const newTiers = [...tierPackages];
                          newTiers[idx].badge = e.target.value;
                          setTierPackages(newTiers);
                        }}
                        className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleSavePricing}
                disabled={savingPricing}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50"
              >
                {savingPricing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save All Pricing Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: USER USAGE & BALANCE ADJUSTER */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "usage" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: User Selection (Search & List) */}
          <div className="lg:col-span-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-50">Select User</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Search by name, email, or user ID to manage their transcription credits and hours.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-400"
              />
            </div>

            {/* Filtered User List */}
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredUsers.length === 0 ? (
                <p className="text-center py-6 text-xs text-slate-500">No users found</p>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedUser?.id === u.id;
                  const totalHrs = u.transcriptionBalance?.totalAvailableHours ?? Math.round(((u.credits ?? 0) / 60) * 10) / 10;

                  return (
                    <button
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                        isSelected
                          ? "border-amber-500/60 bg-amber-500/10 text-slate-100"
                          : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-bold truncate text-slate-100">
                          {u.name || "Unnamed User"}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] uppercase font-semibold text-slate-500">
                            {u.plan || "free"} plan
                          </span>
                          {u.ambassador?.active && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-purple-500/15 border border-purple-500/25 px-1.5 py-0.2 text-[9px] font-bold text-purple-300">
                              <Crown className="h-2.5 w-2.5 text-amber-400" />
                              Ambassador
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-amber-400">
                          {totalHrs}h
                        </span>
                        <p className="text-[10px] text-slate-500">
                          {(u.credits ?? 0).toLocaleString()} cr
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: User Balance & Increase/Decrease Controls */}
          <div className="lg:col-span-8 space-y-6">
            {!selectedUser ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center flex flex-col items-center justify-center">
                <User className="h-10 w-10 text-slate-600 mb-3" />
                <h3 className="text-base font-bold text-slate-300">No user selected</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Select a user from the list on the left to inspect their transcription balance and increase or decrease their hours.
                </p>
              </div>
            ) : loadingUserBalance ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-amber-400 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Loading user balance & transactions...</p>
              </div>
            ) : (
              <>
                {/* User Summary Card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                    <div>
                      <h2 className="text-lg font-bold text-slate-50">
                        {selectedUser.name || "User Details"}
                      </h2>
                      <p className="text-xs text-slate-400">{selectedUser.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(selectedUser.ambassador?.active || userBalance?.effectivePlan === "ambassador") && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 border border-purple-500/30 px-3 py-1 text-xs font-bold text-purple-300">
                          <Crown className="h-3 w-3 text-amber-400" />
                          Ambassador
                        </span>
                      )}
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-200 capitalize">
                        {selectedUser.plan || "free"} Plan
                      </span>
                    </div>
                  </div>

                  {/* Dual Balances Display */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Included Plan</span>
                        <span className="text-[10px] text-slate-500">Resets monthly</span>
                      </div>
                      <p className="text-xl font-bold text-slate-100">
                        {userBalance?.includedHours ?? 0} hrs
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {(userBalance?.includedCredits ?? 0).toLocaleString()} credits
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
                      <div className="flex items-center justify-between text-xs text-amber-300 mb-1">
                        <span>Purchased Top-Up</span>
                        <span className="text-[10px] text-amber-400 font-bold">Never expires</span>
                      </div>
                      <p className="text-xl font-bold text-amber-400">
                        {userBalance?.purchasedHours ?? 0} hrs
                      </p>
                      <p className="text-[11px] text-amber-300/80">
                        {(userBalance?.purchasedCredits ?? 0).toLocaleString()} credits
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950">
                      <span className="text-xs text-slate-400 block mb-1">
                        Total Available
                      </span>
                      <p className="text-xl font-extrabold text-slate-50">
                        {userBalance?.totalAvailableHours ?? 0} hrs
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {(userBalance?.totalAvailableCredits ?? 0).toLocaleString()} credits
                      </p>
                    </div>
                  </div>
                </div>

                {/* Increase / Decrease Controls */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-50">
                        Adjust User Balance
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Directly increase or decrease hours/credits. Increases default to the top-up balance so they never expire.
                      </p>
                    </div>
                  </div>

                  {adjustSuccess && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-200">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>{adjustSuccess}</span>
                    </div>
                  )}

                  {adjustError && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{adjustError}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Action Selector: Increase vs Decrease */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        Action:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAdjustAction("increase")}
                          className={`h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                            adjustAction === "increase"
                              ? "bg-emerald-600 text-white shadow-sm"
                              : "border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Plus className="h-4 w-4" />
                          Increase Balance (+)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustAction("decrease")}
                          className={`h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                            adjustAction === "decrease"
                              ? "bg-red-600 text-white shadow-sm"
                              : "border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Minus className="h-4 w-4" />
                          Decrease Balance (-)
                        </button>
                      </div>
                    </div>

                    {/* Unit and Presets */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                          Unit:
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setAdjustUnit("hours")}
                            className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                              adjustUnit === "hours"
                                ? "bg-amber-500 text-slate-950 font-bold"
                                : "border border-slate-800 bg-slate-950 text-slate-400"
                            }`}
                          >
                            Hours
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdjustUnit("credits")}
                            className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                              adjustUnit === "credits"
                                ? "bg-amber-500 text-slate-950 font-bold"
                                : "border border-slate-800 bg-slate-950 text-slate-400"
                            }`}
                          >
                            Credits
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                          Quick Presets ({adjustUnit}):
                        </label>
                        <div className="flex items-center gap-1.5">
                          {adjustUnit === "hours" ? (
                            <>
                              {[1, 5, 10, 20].map((h) => (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => setAdjustAmount(String(h))}
                                  className={`h-9 flex-1 rounded-lg border text-xs font-bold ${
                                    adjustAmount === String(h)
                                      ? "border-amber-400 bg-amber-400/10 text-amber-300"
                                      : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
                                  }`}
                                >
                                  {adjustAction === "decrease" ? `-${h}h` : `+${h}h`}
                                </button>
                              ))}
                            </>
                          ) : (
                            <>
                              {[60, 300, 600, 1200].map((cr) => (
                                <button
                                  key={cr}
                                  type="button"
                                  onClick={() => setAdjustAmount(String(cr))}
                                  className={`h-9 flex-1 rounded-lg border text-xs font-bold ${
                                    adjustAmount === String(cr)
                                      ? "border-amber-400 bg-amber-400/10 text-amber-300"
                                      : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
                                  }`}
                                >
                                  {adjustAction === "decrease" ? `-${cr}` : `+${cr}`}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        Amount ({adjustUnit}):
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step={adjustUnit === "hours" ? "0.5" : "1"}
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-slate-100 outline-none focus:border-amber-400"
                      />
                    </div>

                    {/* Target Balance Choice */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        Target Balance:
                      </label>
                      <select
                        value={adjustTarget}
                        onChange={(e) => setAdjustTarget(e.target.value as any)}
                        className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-medium text-slate-100 outline-none focus:border-amber-400"
                      >
                        <option value="purchased">
                          Purchased Top-Up Balance (Never expires • Recommended for grants)
                        </option>
                        <option value="included">
                          Included Plan Allowance (Resets with monthly billing)
                        </option>
                        <option value="auto">
                          Auto (Deducts available balance or adds to top-up)
                        </option>
                      </select>
                    </div>

                    {/* Reason for Audit Log */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        Audit Note / Reason:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Support courtesy grant, transcription session adjustment"
                        value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-400"
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      type="button"
                      onClick={handleApplyAdjustment}
                      disabled={adjusting || !adjustAmount}
                      className={`w-full h-11 rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-2 ${
                        adjustAction === "decrease"
                          ? "bg-red-600 hover:bg-red-500"
                          : "bg-emerald-600 hover:bg-emerald-500"
                      } disabled:opacity-50`}
                    >
                      {adjusting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Applying adjustment...
                        </>
                      ) : (
                        `Confirm & ${adjustAction === "decrease" ? "Deduct" : "Grant"} ${adjustAmount} ${adjustUnit}`
                      )}
                    </button>
                  </div>
                </div>

                {/* Recent Transactions Table */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
                  <h3 className="text-sm font-bold text-slate-50">
                    Recent Transcription Ledger for {selectedUser.name || "User"}
                  </h3>
                  {userTxns.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3">No transactions recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {userTxns.map((t, idx) => (
                        <div
                          key={t._id || idx}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-slate-800/80 bg-slate-950/40 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-200">
                              {t.description || "Balance Adjustment"}
                            </p>
                            <span className="text-[10px] text-slate-500">
                              {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}
                            </span>
                          </div>
                          <span
                            className={`font-mono font-bold text-xs ${
                              t.seconds > 0 || t.credits > 0
                                ? "text-emerald-400"
                                : "text-amber-400"
                            }`}
                          >
                            {t.credits > 0 ? `+${t.credits}` : t.credits} credits
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
