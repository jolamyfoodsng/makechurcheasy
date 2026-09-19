"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Search,
  ArrowUp,
  Wallet,
  Calendar,
  Receipt,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  Mail,
  MessageCircle,
  Loader2,
  CreditCard,
  TrendingUp,
  RefreshCw,
  FileAudio,
  ArrowDownLeft,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import {
  getBillingTransactions,
  getCreditTransactions,
  type BillingTransaction,
  type CreditTransaction,
} from "@/lib/api";
import { useSubscription } from "@/lib/useSubscription";
import { getUserId } from "@/lib/userId";
import { Card, Badge, EmptyState, CardSkeleton, TableSkeleton } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

type TransactionCategory = "billing" | "ai_usage" | "credit";

interface CombinedTransaction {
  id: string;
  date: string;
  description: string;
  details: string;
  amount: number;
  currency: string;
  category: TransactionCategory;
  type: string;
  status: "success" | "pending" | "failed" | "refunded" | "info";
  receiptUrl?: string;
}

type FilterTab = "all" | "billing" | "ai_usage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function transactionIcon(type: string, category: TransactionCategory) {
  if (category === "billing") {
    switch (type) {
      case "subscription_purchase":
        return CreditCard;
      case "subscription_renewal":
        return RefreshCw;
      case "plan_upgrade":
        return TrendingUp;
      case "credit_purchase":
        return Wallet;
      case "refund":
        return ArrowDownLeft;
      default:
        return Receipt;
    }
  }
  if (category === "ai_usage") return FileAudio;
  if (category === "credit") return Wallet;
  return Receipt;
}

function transactionColor(category: TransactionCategory, type: string): string {
  if (category === "billing") {
    switch (type) {
      case "subscription_purchase":
      case "subscription_renewal":
        return "text-blue-600";
      case "plan_upgrade":
        return "text-green-600";
      case "credit_purchase":
        return "text-purple-600";
      case "refund":
        return "text-amber-600";
      default:
        return "text-slate-500";
    }
  }
  if (category === "ai_usage") return "text-slate-500";
  if (category === "credit") return "text-blue-500";
  return "text-slate-500";
}

function statusBadgeVariant(
  status: string
): "success" | "warning" | "error" | "info" | "default" {
  switch (status) {
    case "success":
      return "success";
    case "pending":
      return "warning";
    case "failed":
      return "error";
    case "refunded":
      return "info";
    default:
      return "default";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "success":
      return "Success";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "refunded":
      return "Refunded";
    default:
      return status;
  }
}

function billingTypeLabel(type: string): string {
  switch (type) {
    case "subscription_purchase":
      return "New Subscription";
    case "subscription_renewal":
      return "Renewal";
    case "plan_upgrade":
      return "Plan Upgrade";
    case "credit_purchase":
      return "Credit Purchase";
    case "refund":
      return "Refund";
    default:
      return type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
  }
}

const ITEMS_PER_PAGE = 10;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BillingPage() {
  const { subscription, mongoUser, maxCredits, isUnlimited, isFreePlan, loading: subLoading } =
    useSubscription();

  const [combinedTxns, setCombinedTxns] = useState<CombinedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const credits = mongoUser?.credits ?? 0;
  const currency = subscription?.currency || "USD";
  const isOneTimePurchase =
    subscription?.purchaseKind === "one_time" || subscription?.billingCycle === "lifetime";
  const nextBillingDate = isOneTimePurchase ? null : subscription?.nextBillingDate;
  const nextBillingAmount = subscription?.price ?? 0;

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      getBillingTransactions(userId, { limit: 100 }).catch(
        () => ({ transactions: [] as BillingTransaction[], total: 0, limit: 100, skip: 0 })
      ),
      getCreditTransactions(userId, { limit: 100 }).catch(
        () => ({ transactions: [] as CreditTransaction[], total: 0, limit: 100, skip: 0 })
      ),
    ])
      .then(([billingRes, creditRes]) => {
        const combined: CombinedTransaction[] = [];

        for (const txn of billingRes.transactions) {
          combined.push({
            id: String(txn._id || ""),
            date: txn.paidAt || txn.createdAt,
            description: billingTypeLabel(txn.type),
            details: `${txn.plan} plan`,
            amount: txn.amount,
            currency: txn.currency || "USD",
            category: "billing",
            type: txn.type,
            status: txn.status as CombinedTransaction["status"],
            receiptUrl: txn.receiptUrl,
          });
        }

        for (const txn of creditRes.transactions) {
          const isAiUsage = ["transcription", "translation", "ai_generation"].includes(txn.source);
          combined.push({
            id: String(txn._id || ""),
            date: txn.createdAt,
            description: txn.description?.slice(0, 40) || "Transaction",
            details: `${Math.abs(txn.amount).toLocaleString()} credits ${txn.amount >= 0 ? "added" : "used"}`,
            amount: txn.amount,
            currency,
            category: isAiUsage ? "ai_usage" : "credit",
            type: txn.source,
            status: "success",
          });
        }

        combined.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setCombinedTxns(combined);
      })
      .catch((err) => {
        console.error("Failed to load billing data", err);
        setError("Failed to load billing history. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [currency]);

  const filteredTxns = useMemo(() => {
    let result = combinedTxns;

    if (activeTab === "billing") {
      result = result.filter((t) => t.category === "billing");
    } else if (activeTab === "ai_usage") {
      result = result.filter((t) => t.category === "ai_usage");
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.details.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q)
      );
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((t) => new Date(t.date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((t) => new Date(t.date) <= to);
    }

    return result;
  }, [combinedTxns, activeTab, search, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredTxns.length / ITEMS_PER_PAGE));
  const paginatedTxns = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredTxns.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTxns, page]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, search, dateFrom, dateTo]);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: combinedTxns.length },
    { key: "billing", label: "Billing", count: combinedTxns.filter((t) => t.category === "billing").length },
    { key: "ai_usage", label: "AI Usage", count: combinedTxns.filter((t) => t.category === "ai_usage").length },
  ];

  if (subLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-slate-100 rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-slate-100 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <TableSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          Billing &amp; History
        </h1>
        <p className="text-sm text-slate-500">
          Track your subscription changes and AI credit usage.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card padding="md">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Current Balance
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {isUnlimited ? "∞" : credits.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isUnlimited
              ? "Unlimited credits"
              : `${maxCredits.toLocaleString()} plan credits`}
          </p>
        </Card>

        <Card padding="md">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Next Billing
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {isOneTimePurchase ? "No renewal" : nextBillingDate ? formatDate(nextBillingDate) : "\u2014"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isOneTimePurchase
              ? "One-time purchase"
              : nextBillingAmount > 0
              ? `${formatCurrency(nextBillingAmount, currency)} ${subscription?.billingCycle === "yearly" ? "yearly" : "monthly"}`
              : isFreePlan
                ? "Free plan"
                : "No upcoming payments"}
          </p>
        </Card>

        <Card padding="md" className="flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
              <ArrowUp className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Quick Actions
            </span>
          </div>
          <div className="flex gap-2">
            <Link
              href="/credits"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Wallet className="w-3.5 h-3.5" /> Top Up
            </Link>
            <Link
              href="/subscription/plans"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-white text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              <TrendingUp className="w-3.5 h-3.5" /> Upgrade
            </Link>
          </div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
            <span
              className={`ml-1.5 text-xs ${
                activeTab === tab.key ? "text-blue-400" : "text-slate-400"
              }`}
            >
              ({tab.count})
            </span>
          </button>
        ))}
      </div>

      {/* Search + Date Range */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          />
          <span className="text-xs text-slate-400">&ndash;</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          />
        </div>
      </div>

      {/* Transaction Table */}
      <Card padding="none" className="mb-6 overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-400 mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900 mb-1">
              Failed to load
            </p>
            <p className="text-xs text-slate-500 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="h-9 px-4 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredTxns.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-5 h-5" />}
            title="No transactions found"
            description={
              search || dateFrom || dateTo
                ? "Try adjusting your search or filters."
                : "Your billing and usage history will appear here."
            }
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Transaction
                    </th>
                    <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Date &amp; Status
                    </th>
                    <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedTxns.map((txn) => {
                    const Icon = transactionIcon(txn.type, txn.category);
                    const color = transactionColor(txn.category, txn.type);
                    return (
                      <tr
                        key={txn.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => {
                          if (txn.id) {
                            window.location.href = `/billing/transactions/${txn.id}`;
                          }
                        }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center ${color}`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {txn.description}
                              </p>
                              <p className="text-xs text-slate-500">
                                {txn.details}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-slate-600">
                            {txn.category === "billing"
                              ? billingTypeLabel(txn.type)
                              : txn.category === "ai_usage"
                                ? "AI Usage"
                                : "Credit"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">
                              {formatDate(txn.date)}
                            </span>
                            <Badge
                              variant={statusBadgeVariant(txn.status)}
                              size="sm"
                            >
                              {statusLabel(txn.status)}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span
                            className={`text-sm font-bold ${
                              txn.amount >= 0 ? "text-green-600" : "text-slate-900"
                            }`}
                          >
                            {txn.amount >= 0 ? "+" : ""}
                            {txn.category === "ai_usage" || txn.category === "credit"
                              ? `${txn.amount.toLocaleString()} cr`
                              : formatCurrency(Math.abs(txn.amount), txn.currency)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {paginatedTxns.map((txn) => {
                const Icon = transactionIcon(txn.type, txn.category);
                const color = transactionColor(txn.category, txn.type);
                return (
                  <div
                    key={txn.id}
                    className="p-4 hover:bg-slate-50 transition-colors"
                    onClick={() => {
                      if (txn.id) {
                        window.location.href = `/billing/transactions/${txn.id}`;
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 ${color}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {txn.description}
                          </p>
                          <span
                            className={`text-sm font-bold shrink-0 ${
                              txn.amount >= 0 ? "text-green-600" : "text-slate-900"
                            }`}
                          >
                            {txn.amount >= 0 ? "+" : ""}
                            {txn.category === "ai_usage" || txn.category === "credit"
                              ? `${txn.amount.toLocaleString()} cr`
                              : formatCurrency(Math.abs(txn.amount), txn.currency)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {txn.details}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] text-slate-400">
                            {formatDate(txn.date)}
                          </span>
                          <Badge
                            variant={statusBadgeVariant(txn.status)}
                            size="sm"
                          >
                            {statusLabel(txn.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * ITEMS_PER_PAGE + 1}
                &ndash;{Math.min(page * ITEMS_PER_PAGE, filteredTxns.length)} of{" "}
                {filteredTxns.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from(
                  { length: Math.min(totalPages, 5) },
                  (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                          pageNum === page
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Support Card */}
      <Card padding="md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <LifeBuoy className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Need help with billing?
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Our support team is here to help with payments, invoices, and
              subscription questions.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="mailto:support@makechurcheazy.com"
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-white text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
            <a
              href="https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Chat
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
