"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  ArrowUp,
  CreditCard,
  Calendar,
  Receipt,
  Download,
  Printer,
  Wallet,
  RefreshCw,
  TrendingUp,
  FileAudio,
  Mic,
  Languages,
  Code2,
  Star,
  ArrowDownLeft,
  LifeBuoy,
  Mail,
  MessageCircle,
  BarChart3,
  Cloud,
} from "lucide-react";
import { Card, Badge, Button, EmptyState, CardSkeleton } from "@/components/ui";
import {
  ApiError,
  getTransactionDetail,
  retryPayment,
  type TransactionDetail,
} from "@/lib/api";
import { requestCountrySelection } from "@/components/ProfileCompletionModal";

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

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
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
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    if (currency === "NGN") return `₦${amount.toLocaleString()}`;
    return `$${amount.toLocaleString()}`;
  }
}

function formatMoneyDetails(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    if (currency === "NGN") return `₦${amount.toLocaleString()}.00`;
    return `$${amount.toLocaleString()}.00`;
  }
}

function formatCycle(cycle: string): string {
  switch (cycle) {
    case "monthly":
      return "monthly";
    case "yearly":
      return "yearly";
    default:
      return cycle || "monthly";
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case "subscription_purchase":
      return "New Subscription";
    case "subscription_renewal":
      return "Subscription Renewal";
    case "plan_upgrade":
      return "Plan Upgrade";
    case "credit_purchase":
      return "Credit Purchase";
    case "refund":
      return "Refund";
    default:
      return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "success":
    case "completed":
      return CheckCircle2;
    case "failed":
      return XCircle;
    case "pending":
      return AlertCircle;
    default:
      return CheckCircle2;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "success":
    case "completed":
      return "text-green-600";
    case "failed":
      return "text-red-600";
    case "pending":
      return "text-amber-600";
    default:
      return "text-slate-600";
  }
}

function statusBadgeVariant(
  status: string
): "success" | "warning" | "error" | "info" | "default" {
  switch (status) {
    case "success":
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "pending":
      return "warning";
    default:
      return "default";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "success":
      return "Paid";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "refunded":
      return "Refunded";
    default:
      return status;
  }
}

function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "";
  if (method.toLowerCase().includes("visa")) return "Visa " + method;
  if (method.toLowerCase().includes("mastercard")) return "Mastercard " + method;
  return method;
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const transactionId = params?.transactionId as string;

  const [txn, setTxn] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");

  useEffect(() => {
    if (!transactionId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);

    getTransactionDetail(transactionId)
      .then(setTxn)
      .catch((err) => {
        if (err?.status === 404 || err?.message?.includes("not found")) {
          setNotFound(true);
        } else {
          setError(err?.message || "Failed to load transaction details");
        }
      })
      .finally(() => setLoading(false));
  }, [transactionId]);

  const handleRetryPayment = async () => {
    setRetrying(true);
    setRetryError("");
    try {
      let result: Awaited<ReturnType<typeof retryPayment>>;
      try {
        result = await retryPayment(transactionId);
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== "COUNTRY_REQUIRED") {
          throw err;
        }
        await requestCountrySelection();
        result = await retryPayment(transactionId);
      }
      window.location.href = result.authorization_url;
    } catch (err) {
      setRetryError(
        err instanceof Error ? err.message : "Failed to initiate payment retry"
      );
      setRetrying(false);
    }
  };

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div className="h-4 w-40 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-8 w-64 bg-slate-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CardSkeleton />
          </div>
          <div>
            <CardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // ─── Not Found ──────────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24">
        <EmptyState
          icon={<Receipt className="w-5 h-5" />}
          title="Transaction not found"
          description="The transaction may have been removed or you may not have access to it."
          action={
            <a
              href="/billing"
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Billing
            </a>
          }
        />
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────────

  if (error || !txn) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-400 mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-slate-900 mb-1">
          Failed to load
        </p>
        <p className="text-xs text-slate-500 mb-4">
          {error || "Could not load transaction details."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="h-9 px-4 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ─── Derived Values ─────────────────────────────────────────────────────────

  const isBilling = txn.category === "billing";
  const isAiUsage = txn.category === "ai_usage";
  const isCredit = txn.category === "credit";
  const isSuccessful = txn.status === "success" || txn.status === "completed";
  const isFailed = txn.status === "failed";
  const StatusIcon = statusIcon(txn.status);
  const sColor = statusColor(txn.status);

  const showPaymentBreakdown =
    isBilling && txn.amount > 0;
  const showUsageBreakdown = isAiUsage;
  const showRetry = isBilling && isFailed;
  const showReceipt = isBilling && isSuccessful;
  const showCreditBalance = (isCredit || isAiUsage) && (txn.balanceBefore != null || txn.balanceAfter != null);

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 pb-24">
      {/* Back + Header */}
      <div className="mb-8">
        <a
          href="/billing"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Billing History
        </a>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          Transaction Details
        </h1>
        <p className="text-sm text-slate-500">
          View complete information about this transaction.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Transaction Summary Card */}
          <Card padding="lg">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="flex gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  isFailed
                    ? "bg-red-50"
                    : isAiUsage
                      ? "bg-blue-50"
                      : isCredit
                        ? "bg-purple-50"
                        : "bg-green-50"
                }`}>
                  {isBilling ? (
                    isFailed ? <XCircle className="w-6 h-6 text-red-600" /> :
                    txn.type === "plan_upgrade" ? <TrendingUp className="w-6 h-6 text-green-600" /> :
                    txn.type === "refund" ? <ArrowDownLeft className="w-6 h-6 text-amber-600" /> :
                    <CreditCard className="w-6 h-6 text-blue-600" />
                  ) : isAiUsage ? (
                    <FileAudio className="w-6 h-6 text-blue-600" />
                  ) : (
                    <Wallet className="w-6 h-6 text-purple-600" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-1">
                    {txn.title}
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant={statusBadgeVariant(txn.status)} size="sm">
                      {statusLabel(txn.status)}
                    </Badge>
                    <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                      {txn._id}
                      <CopyButton value={txn._id} />
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-2xl font-bold ${
                  isAiUsage || (txn.amount && isCredit && !txn.isCredit)
                    ? "text-red-600"
                    : txn.isCredit
                      ? "text-green-600"
                      : "text-slate-900"
                }`}>
                  {(isAiUsage || isCredit) && !txn.isCredit ? (
                    <>−{txn.creditChange != null ? Math.abs(txn.creditChange).toLocaleString() : txn.amount?.toLocaleString()} credits</>
                  ) : isCredit && txn.isCredit ? (
                    <>+{txn.creditChange?.toLocaleString() || txn.amount?.toLocaleString()} credits</>
                  ) : (
                    formatCurrency(txn.amount, txn.currency || "USD")
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {txn.createdAt ? formatDateTime(txn.createdAt) : ""}
                </p>
              </div>
            </div>

            {/* Detail Grid */}
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Description */}
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-slate-700">{txn.description || "—"}</p>
                </div>

                {/* Plan (billing only) */}
                {isBilling && txn.planName && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Plan</p>
                    <p className="text-sm text-slate-700">{txn.planName}</p>
                  </div>
                )}

                {/* Feature (AI only) */}
                {isAiUsage && txn.feature && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Feature</p>
                    <p className="text-sm text-slate-700">{txn.feature}</p>
                  </div>
                )}

                {/* Billing Period */}
                {isBilling && txn.billingPeriodStart && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Billing Period</p>
                    <p className="text-sm text-slate-700">
                      {formatDate(txn.billingPeriodStart)} &ndash; {txn.billingPeriodEnd ? formatDate(txn.billingPeriodEnd) : "—"}
                    </p>
                  </div>
                )}

                {/* Failure Reason */}
                {isFailed && txn.failureReason && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Failure Reason</p>
                    <p className="text-sm text-red-600 font-medium">{txn.failureReason}</p>
                  </div>
                )}

                {/* Payment Method */}
                {isBilling && txn.paymentMethod && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Payment Method</p>
                    <p className="text-sm text-slate-700 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                      {paymentMethodLabel(txn.paymentMethod)}
                    </p>
                  </div>
                )}

                {/* Payment Provider */}
                {isBilling && txn.paymentProvider && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Payment Provider</p>
                    <p className="text-sm text-slate-700">{txn.paymentProvider}</p>
                  </div>
                )}

                {/* Provider Reference */}
                {isBilling && txn.providerReference && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Provider Reference</p>
                    <p className="text-sm text-slate-700 font-mono text-xs flex items-center gap-1">
                      {txn.providerReference}
                      <CopyButton value={txn.providerReference} />
                    </p>
                  </div>
                )}

                {/* Currency */}
                {isBilling && txn.currency && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Currency</p>
                    <p className="text-sm text-slate-700">{txn.currency}</p>
                  </div>
                )}

                {/* Auto-Renewal */}
                {isBilling && isSuccessful && txn.autoRenew != null && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Auto-Renewal</p>
                    <p className={`text-sm font-medium ${txn.autoRenew ? "text-green-600" : "text-slate-500"}`}>
                      {txn.autoRenew ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                )}

                {/* Next Billing */}
                {isBilling && isSuccessful && txn.nextBillingDate && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Next Billing Date</p>
                    <p className="text-sm font-semibold text-slate-900">{formatDate(txn.nextBillingDate)}</p>
                  </div>
                )}

                {/* Credits Used (AI) */}
                {isAiUsage && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Credits Used</p>
                    <p className="text-sm text-red-600 font-medium">{txn.creditChange != null ? Math.abs(txn.creditChange).toLocaleString() : txn.amount?.toLocaleString()} credits</p>
                  </div>
                )}

                {/* Balance Before (credit/AI) */}
                {showCreditBalance && txn.balanceBefore != null && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Balance Before</p>
                    <p className="text-sm text-slate-700">{txn.balanceBefore.toLocaleString()} credits</p>
                  </div>
                )}

                {/* Balance After (credit/AI) */}
                {showCreditBalance && txn.balanceAfter != null && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Balance After</p>
                    <p className="text-sm text-slate-700 font-medium">{txn.balanceAfter.toLocaleString()} credits</p>
                  </div>
                )}

                {/* Credits Added (allocation) */}
                {isCredit && txn.isCredit && txn.creditChange != null && txn.creditChange > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Credits Added</p>
                    <p className="text-sm text-green-600 font-medium">+{txn.creditChange.toLocaleString()} credits</p>
                  </div>
                )}

                {/* Duration (AI) */}
                {isAiUsage && txn.duration && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Duration</p>
                    <p className="text-sm text-slate-700">{txn.duration}</p>
                  </div>
                )}

                {/* Usage Quantity (AI) */}
                {isAiUsage && txn.usageQuantity && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Usage {txn.usageUnit ? `(${txn.usageUnit})` : ""}
                    </p>
                    <p className="text-sm text-slate-700">{txn.usageQuantity.toLocaleString()}</p>
                  </div>
                )}

                {/* Type (credit only) */}
                {isCredit && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Type</p>
                    <p className="text-sm text-slate-700 capitalize">
                      {txn.type?.replace(/_/g, " ") || "Credit"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Payment Breakdown (billing, successful) */}
          {showPaymentBreakdown && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">
                Payment Breakdown
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Subtotal</span>
                  <span className="text-sm text-slate-700">
                    {formatMoneyDetails(txn.subtotal || txn.amount, txn.currency || "USD")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Discount</span>
                  <span className="text-sm text-slate-700">
                    {formatMoneyDetails(txn.discount || 0, txn.currency || "USD")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Tax (0%)</span>
                  <span className="text-sm text-slate-700">
                    {formatMoneyDetails(txn.tax || 0, txn.currency || "USD")}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-900">Total {isSuccessful ? "Paid" : "Amount"}</span>
                  <span className="text-base font-bold text-slate-900">
                    {formatCurrency(txn.total || txn.amount, txn.currency || "USD")}
                  </span>
                </div>
              </div>

              {showRetry && (
                <div className="mt-4">
                  {retryError && (
                    <p className="text-xs text-red-500 mb-2">{retryError}</p>
                  )}
                  <button
                    onClick={handleRetryPayment}
                    disabled={retrying}
                    className="w-full h-10 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {retrying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Retry Payment
                  </button>
                </div>
              )}
            </Card>
          )}

          {/* Credit Amount (for credit transactions that add credits) */}
          {isCredit && txn.isCredit && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">
                Credit Allocation
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Credits Added</span>
                  <span className="text-sm font-medium text-green-600">
                    +{(txn.creditChange || txn.amount || 0).toLocaleString()} credits
                  </span>
                </div>
                {txn.balanceBefore != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Balance Before</span>
                    <span className="text-sm text-slate-700">{txn.balanceBefore.toLocaleString()} credits</span>
                  </div>
                )}
                {txn.balanceAfter != null && (
                  <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                    <span className="text-xs font-semibold text-slate-900">Current Balance</span>
                    <span className="text-base font-bold text-slate-900">
                      {txn.balanceAfter.toLocaleString()} credits
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Receipt Info (successful billing) */}
          {showReceipt && (
            <Card padding="md">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Receipt className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-slate-900">Receipt</span>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Invoice</span>
                  <span className="text-slate-700 font-mono text-[11px]">
                    {txn._id.slice(0, 12).toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Plan</span>
                  <span className="text-slate-700">{txn.planName || txn.plan}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Payment Date</span>
                  <span className="text-slate-700">{txn.paidAt ? formatDate(txn.paidAt) : formatDate(txn.createdAt)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {txn.receiptUrl ? (
                  <a
                    href={txn.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                ) : (
                  <button
                    onClick={() => window.print()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 bg-white text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </div>
            </Card>
          )}

          {/* Credit Cost Info (AI usage) */}
          {isAiUsage && txn.creditCosts && txn.creditCosts.length > 0 && (
            <Card padding="md">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 italic leading-relaxed">
                <BarChart3 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span>Credit usage is calculated based on the duration of audio processed and the complexity of the AI model used.</span>
              </div>
            </Card>
          )}

          {/* Support Card */}
          <Card padding="md">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <LifeBuoy className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                  Need help with this transaction?
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  Our support team is here to help with any questions about this transaction.
                </p>
                <div className="flex gap-2">
                  <a
                    href="mailto:support@makechurcheazy.com"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 bg-white text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" /> Email
                  </a>
                  <a
                    href="/support"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Support
                  </a>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
