"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  ArrowLeft,
  Download,
  Filter,
  Search,
  Info,
  Wallet,
  TrendingUp,
  TrendingDown,
  Calendar,
  BookOpen,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getCreditTransactions, type CreditTransaction } from "@/lib/api";
import { getUserId } from "@/lib/userId";
import { useSubscription } from "@/lib/useSubscription";

// ─── Transaction Type Classification ────────────────────────────────────────

type TransactionCategory =
  | "allocation"
  | "usage"
  | "purchase"
  | "subscription"
  | "refund"
  | "upgrade"
  | "downgrade"
  | "other";

function getTransactionType(txn: CreditTransaction): TransactionCategory {
  const desc = txn.description.toLowerCase();
  const type = (txn.type || "").toLowerCase();
  const source = (txn.source || "").toLowerCase();

  // ── Credit (positive) types ──
  if (desc.includes("refund") || desc.includes("credit return") || type === "refund")
    return "refund";

  if (desc.includes("upgrade")) return "upgrade";
  if (desc.includes("downgrade")) return "downgrade";

  if (
    desc.includes("allocation") ||
    desc.includes("monthly") ||
    desc.includes("renewal") ||
    desc.includes("plan allocation") ||
    type === "allocation" ||
    source === "allocation" ||
    source === "monthly_renewal" ||
    source === "subscription_activation" ||
    source === "plan_upgrade" ||
    source === "plan_downgrade" ||
    source === "trial_expired" ||
    source === "subscription_expired"
  )
    return "allocation";

  if (desc.includes("purchase") || desc.includes("bought") || type === "purchase" || type === "credit_purchase" || source === "credit_pack_purchase")
    return "purchase";

  if (desc.includes("subscription") || desc.includes("activated") || type === "subscription")
    return "subscription";

  if (type === "admin_grant" || source === "admin_adjustment")
    return "allocation";

  // ── Debit (negative) types ──
  if (
    desc.includes("transcription") ||
    desc.includes("translation") ||
    desc.includes("summary") ||
    desc.includes("sermon notes") ||
    desc.includes("sermon points") ||
    type === "usage" ||
    type === "consumption" ||
    source === "ai"
  )
    return "usage";

  // ── Fallback by sign ──
  if (txn.amount > 0) return "allocation";
  if (txn.amount < 0) return "usage";

  return "other";
}

const CATEGORY_META: Record<
  TransactionCategory,
  { key: string; bg: string; text: string }
> = {
  allocation: { key: "creditsHistory.allocation", bg: "bg-emerald-50", text: "text-emerald-700" },
  usage: { key: "creditsHistory.usage", bg: "bg-amber-50", text: "text-amber-700" },
  purchase: { key: "creditsHistory.purchase", bg: "bg-blue-50", text: "text-blue-700" },
  subscription: { key: "creditsHistory.subscription", bg: "bg-purple-50", text: "text-purple-700" },
  refund: { key: "creditsHistory.refund", bg: "bg-rose-50", text: "text-rose-700" },
  upgrade: { key: "creditsHistory.upgrade", bg: "bg-indigo-50", text: "text-indigo-700" },
  downgrade: { key: "creditsHistory.downgrade", bg: "bg-orange-50", text: "text-orange-700" },
  other: { key: "creditsHistory.other", bg: "bg-slate-50", text: "text-slate-600" },
};

const FILTER_OPTIONS: { key: string; value: TransactionCategory | "all" | "credited" | "debited" }[] = [
  { key: "creditsHistory.allTransactions", value: "all" },
  { key: "creditsHistory.creditedFilter", value: "credited" },
  { key: "creditsHistory.debitedFilter", value: "debited" },
  { key: "creditsHistory.allocations", value: "allocation" },
  { key: "creditsHistory.purchases", value: "purchase" },
  { key: "creditsHistory.refunds", value: "refund" },
];

// ─── Credit Rates ───────────────────────────────────────────────────────────

const CREDIT_RATES = [
  { name: "Speech-to-Scripture", cost: "1 Credit", unit: "/ minute" },
  { name: "Live Translation", cost: "2 Credits", unit: "/ minute" },
  { name: "AI Summary", cost: "5 Credits", unit: "" },
  { name: "AI Sermon Notes", cost: "10 Credits", unit: "" },
  { name: "AI Sermon Points", cost: "10 Credits", unit: "" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function CreditsHistory() {
  const t = useTranslations();
  const { user, mongoUser, maxCredits, planLabel, subscription, loading: subLoading } =
    useSubscription();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<CreditTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<TransactionCategory | "all" | "credited" | "debited">(
    "all"
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const limit = 10;

  // ── Fetch paginated transactions for table ──
  const fetchTransactions = useCallback(async (skip: number) => {
    const userId = getUserId();
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getCreditTransactions(userId, { limit, skip });
      setTransactions(res.transactions);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch ALL transactions for summary computation ──
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    getCreditTransactions(userId, { limit: 10000, skip: 0 })
      .then((res) => setAllTransactions(res.transactions))
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetchTransactions(page * limit);
  }, [page, fetchTransactions]);

  // ── Close filter dropdown on outside click ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Summary computation ──
  const summary = useMemo(() => {
    const txns = allTransactions.length > 0 ? allTransactions : transactions;
    const creditedTxns = txns.filter((t) => t.amount > 0);
    const debitedTxns = txns.filter((t) => t.amount < 0);
    const creditsAdded = creditedTxns.reduce((sum, t) => sum + t.amount, 0);
    const creditsUsed = debitedTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const currentBalance = mongoUser?.credits ?? 0;
    return {
      creditsAdded,
      creditsUsed,
      currentBalance,
      planAllocation: maxCredits,
      creditedCount: creditedTxns.length,
      debitedCount: debitedTxns.length,
    };
  }, [allTransactions, transactions, mongoUser, maxCredits]);

  // ── Balance reconciliation check (dev only) ──
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (allTransactions.length === 0) return;
    const sorted = [...allTransactions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latestBalance = sorted[0]?.balanceAfter;
    const displayedBalance = mongoUser?.credits;
    if (
      latestBalance !== undefined &&
      displayedBalance !== undefined &&
      latestBalance !== displayedBalance
    ) {
      console.warn("Credit ledger mismatch detected", {
        calculatedBalance: latestBalance,
        displayedBalance,
      });
    }
  }, [allTransactions, user]);

  // ── Helpers ──
  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const formatAmountDisplay = (txn: CreditTransaction) => {
    const abs = Math.abs(txn.amount).toLocaleString();
    if (txn.amount >= 0) return `+${abs} ${t('creditsHistory.creditsLabel')}`;
    return `${abs} ${Math.abs(txn.amount) === 1 ? t('creditsHistory.creditSingular') : t('creditsHistory.creditsLabel')}`;
  };

  // ── Filtering ──
  const filtered = useMemo(() => {
    let result = transactions;

    if (activeFilter === "credited") {
      result = result.filter((t) => t.amount > 0);
    } else if (activeFilter === "debited") {
      result = result.filter((t) => t.amount < 0);
    } else if (activeFilter !== "all") {
      result = result.filter((t) => getTransactionType(t) === activeFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t._id?.toLowerCase().includes(q) ||
          getTransactionType(t).toLowerCase().includes(q)
      );
    }

    return result;
  }, [transactions, activeFilter, search]);

  // ── Pagination ──
  const totalPages = Math.ceil(total / limit);

  // ── CSV Export ──
  const exportCSV = () => {
    const header = "Transaction ID,Type,Date,Description,Amount,Balance\n";
    const rows = allTransactions
      .map(
        (t) =>
          `${t._id || ""},${getTransactionType(t)},${formatDate(t.createdAt)},"${t.description}",${t.amount},${t.balanceAfter ?? ""}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credit-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeFilterLabel =
    FILTER_OPTIONS.find((o) => o.value === activeFilter)?.key
      ? t(FILTER_OPTIONS.find((o) => o.value === activeFilter)!.key)
      : t('creditsHistory.allTransactions');

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6 pb-16">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/credits"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('creditsHistory.title')}
          </h1>
        </div>
        <p className="text-sm text-slate-500 md:pl-7">
          {t('creditsHistory.pageDescription')}
        </p>
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          label={t('creditsHistory.credited')}
          value={summary.creditedCount.toLocaleString()}
          accent="emerald"
        />
        <SummaryCard
          icon={<TrendingDown className="w-5 h-5 text-rose-600" />}
          label={t('creditsHistory.debited')}
          value={summary.debitedCount.toLocaleString()}
          accent="rose"
        />
        <SummaryCard
          icon={<Wallet className="w-5 h-5 text-blue-600" />}
          label={t('creditsHistory.currentBalance')}
          value={summary.currentBalance.toLocaleString()}
          accent="blue"
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-5 h-5 text-purple-600" />}
          label={t('creditsHistory.planAllocation')}
          value={
            summary.planAllocation === -1
              ? t('common.unlimited')
              : summary.planAllocation.toLocaleString()
          }
          accent="purple"
          subtitle={planLabel}
        />
      </div>

      {/* ── Credit Education Card ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-slate-600" />
          <h2 className="text-base font-bold text-slate-900">{t('creditsHistory.whatUsesCredits')}</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          {t.rich('creditsHistory.planIncludesCredits', {
            plan: planLabel,
            credits: maxCredits === -1 ? t('common.unlimited') : `${maxCredits.toLocaleString()} AI Credits`,
            strong: (chunks) => <span className="font-semibold text-slate-800">{chunks}</span>,
          })}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            t('creditsHistory.liveTranslation'),
            t('creditsHistory.sermonTranscription'),
            t('creditsHistory.aiSermonSummaries'),
            t('creditsHistory.aiSermonNotes'),
            t('creditsHistory.aiSermonPoints'),
          ].map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-2 text-sm text-slate-600"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              {feature}
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('creditsHistory.currentRates')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
            {CREDIT_RATES.map((rate) => (
              <div
                key={rate.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-slate-600">{rate.name}</span>
                <span className="font-semibold text-slate-800">
                  {rate.cost}
                  {rate.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
        {subscription?.nextBillingDate && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {t('creditsHistory.creditsResetOn', {
                date: new Date(subscription.nextBillingDate).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }),
              })}
            </span>
          </div>
        )}
      </div>

      {/* ── Actions Bar ── */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        {/* Filter Dropdown */}
        <div ref={filterRef} className="relative">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center gap-2 h-11 px-5 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Filter className="w-4 h-4" />
            {activeFilterLabel}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${filterOpen ? "rotate-180" : ""}`}
            />
          </button>
          {filterOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setActiveFilter(opt.value);
                    setFilterOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeFilter === opt.value
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  {t(opt.key)}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={exportCSV}
          className="flex items-center gap-2 h-11 px-5 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" /> {t('creditsHistory.exportCSV')}
        </button>
      </div>

      {/* ── Transaction Table ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('creditsHistory.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-600/25 text-sm"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/80 text-xs text-slate-500 border-b border-slate-200 uppercase tracking-wider">
                <th className="py-4 px-6 font-semibold">{t('creditsHistory.transaction')}</th>
                <th className="py-4 px-6 font-semibold">{t('creditsHistory.dateTime')}</th>
                <th className="py-4 px-6 font-semibold">{t('creditsHistory.type')}</th>
                <th className="py-4 px-6 font-semibold">{t('creditsHistory.description')}</th>
                <th className="py-4 px-6 font-semibold text-right">{t('creditsHistory.amount')}</th>
                <th className="py-4 px-6 font-semibold text-right">{t('creditsHistory.balance')}</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-800 divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-slate-400 text-sm"
                  >
                    {t('creditsHistory.loading')}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <Info className="w-6 h-6 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">
                          {t('creditsHistory.noCreditActivityYet')}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs">
                          {t('creditsHistory.noActivityDescription')}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((txn, i) => {
                  const isPositive = txn.amount >= 0;
                  const cat = getTransactionType(txn);
                  const meta = CATEGORY_META[cat];
                  return (
                    <tr
                      key={txn._id || i}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className="py-4 px-6 text-slate-400 font-mono text-xs">
                        {txn._id
                          ? `#${txn._id.slice(-8).toUpperCase()}`
                          : "—"}
                      </td>
                      <td className="py-4 px-6 text-slate-500 font-medium whitespace-nowrap">
                        {formatDate(txn.createdAt)}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${meta.bg} ${meta.text}`}
                        >
                          {t(meta.key)}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-medium text-slate-700 max-w-xs truncate">
                        {txn.description}
                      </td>
                      <td
                        className={`py-4 px-6 text-right font-bold whitespace-nowrap ${isPositive
                          ? "text-emerald-600"
                          : "text-slate-900"
                          }`}
                      >
                        <span
                          className={
                            isPositive
                              ? "px-2 py-0.5 rounded bg-emerald-50 inline-block"
                              : ""
                          }
                        >
                          {formatAmountDisplay(txn)}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right font-medium text-slate-500">
                        {(txn.balanceAfter ?? 0).toLocaleString()} {t('creditsHistory.creditsLabel')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination — hidden when only 1 page */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-white text-sm text-slate-500">
            <span>
              {loading
                ? t('creditsHistory.loading')
                : t('creditsHistory.showingEntries', {
                  start: (page * limit + 1).toString(),
                  end: Math.min((page + 1) * limit, total).toString(),
                  total: total.toString(),
                })}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="px-3 py-1 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('creditsHistory.prev')}
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`px-3 py-1 border rounded-xl transition-colors ${page === i
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="px-3 py-1 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                {t('creditsHistory.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Summary Card Sub-component ─────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  accent,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "emerald" | "rose" | "blue" | "purple";
  subtitle?: string;
}) {
  const borderMap = {
    emerald: "border-l-emerald-500",
    rose: "border-l-rose-500",
    blue: "border-l-blue-500",
    purple: "border-l-purple-500",
  };

  return (
    <div
      className={`bg-white border border-slate-200 border-l-4 ${borderMap[accent]} rounded-2xl p-6 shadow-sm`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {subtitle && (
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
