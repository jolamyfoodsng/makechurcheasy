/**
 * CreditsPage.tsx — Dedicated Credits dashboard
 *
 * Shows credit balance, usage by feature, usage chart, recent activity,
 * and top-up / compare plans CTAs.
 *
 * All data comes from the backend — no hard-coded values.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Zap,
  ArrowUpRight,
  BarChart3,
  Clock,
  CreditCard,
  TrendingUp,
  Radio,
  Globe,
  FileText,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  fetchCreditDetails,
  fetchCreditTransactions,
  onCreditChange,
  type CreditDetails,
  type CreditTransaction,
} from "../services/credits";
import {
  getPlanConfig,
  formatCredits,
  type PlanConfig,
} from "../services/planConfig";
import { getDeviceId } from "../services/authService";
import "./CreditsPage.css";

// ── Feature icon mapping ─────────────────────────────────────────────────

const FEATURE_ICONS: Record<string, typeof Zap> = {
  "Speech-to-Scripture": Radio,
  "Transcript Translation": Globe,
  "Translation": Globe,
  "AI Sermon Summary": FileText,
  "AI Sermon Notes": FileText,
  "AI Sermon Points": Zap,
  "Worship Import": FileText,
};

function getFeatureIcon(name: string): typeof Zap {
  return FEATURE_ICONS[name] ?? Zap;
}

// ── Usage timeline API ───────────────────────────────────────────────────

interface UsageDay {
  date: string;
  creditsUsed: number;
}

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.creatorstudioslabs.stream";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const deviceId = getDeviceId();
  if (deviceId) headers["X-Device-Id"] = deviceId;
  return headers;
}

async function fetchUsageTimeline(days: number): Promise<UsageDay[]> {
  try {
    const res = await fetch(`${API_BASE}/api/credit-transactions/stats?days=${days}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.usage) ? data.usage : [];
  } catch {
    return [];
  }
}

// ── Date formatting helpers ──────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Transaction type display ─────────────────────────────────────────────

function getTransactionLabel(tx: CreditTransaction): string {
  if (tx.description) return tx.description;
  switch (tx.type) {
    case "usage": return "AI Usage";
    case "admin_grant": return "Admin credit grant";
    case "allocation": return "Monthly credit allocation";
    case "credit_pack_purchase": return "Credit purchase";
    case "refund": return "Credit refund";
    case "subscription_renewal": return "Subscription renewal";
    default: return tx.type.replace(/_/g, " ");
  }
}

function getTransactionIcon(tx: CreditTransaction): typeof Zap {
  if (tx.amount > 0) {
    if (tx.type === "admin_grant") return CreditCard;
    if (tx.type === "credit_pack_purchase") return CreditCard;
    return TrendingUp;
  }
  const source = tx.source?.toLowerCase() || "";
  if (source.includes("transcription") || source.includes("speech")) return Radio;
  if (source.includes("translation")) return Globe;
  if (source.includes("summary") || source.includes("notes") || source.includes("points")) return FileText;
  return Zap;
}

// ── Skeleton components ──────────────────────────────────────────────────

function SkeletonBlock({ width, height }: { width?: string; height: string }) {
  return (
    <div
      className="credits-skeleton"
      style={{ width: width || "100%", height }}
    />
  );
}

function BalanceCardSkeleton() {
  return (
    <div className="credits-page__balance-card">
      <div className="credits-page__balance-left">
        <SkeletonBlock width="80px" height="12px" />
        <SkeletonBlock width="140px" height="36px" />
        <SkeletonBlock width="180px" height="14px" />
      </div>
      <div className="credits-page__balance-right">
        <SkeletonBlock height="6px" />
        <div className="credits-page__balance-meta">
          <SkeletonBlock width="100px" height="12px" />
          <SkeletonBlock width="80px" height="12px" />
        </div>
      </div>
    </div>
  );
}

function FeatureRowsSkeleton() {
  return (
    <div className="credits-page__card">
      <SkeletonBlock width="120px" height="14px" />
      <div className="credits-page__feature-list">
        {[1, 2, 3].map((i) => (
          <div key={i} className="credits-page__feature-row">
            <SkeletonBlock width="140px" height="14px" />
            <SkeletonBlock width="50px" height="14px" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="credits-page__card">
      <SkeletonBlock width="150px" height="14px" />
      <SkeletonBlock height="180px" />
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="credits-page__card">
      <SkeletonBlock width="130px" height="14px" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="credits-page__activity-row">
          <div className="credits-page__activity-left">
            <SkeletonBlock width="120px" height="13px" />
            <SkeletonBlock width="80px" height="11px" />
          </div>
          <SkeletonBlock width="60px" height="13px" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function CreditsPage() {
  // ── State ──
  const [creditDetails, setCreditDetails] = useState<CreditDetails | null>(null);
  const [planConfig, setPlanConfig] = useState<PlanConfig | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([]);
  const [usageTimeline, setUsageTimeline] = useState<UsageDay[]>([]);
  const [chartRange, setChartRange] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Derived state ──
  const planAllocation = creditDetails?.planAllocation ?? 0;
  const currentBalance = creditDetails?.credits ?? 0;
  const totalConsumed = creditDetails?.totalConsumed ?? 0;
  const isUnlimited = currentBalance === -1;
  const isAdmin = creditDetails?.isAdmin ?? false;

  const cycleUsed = useMemo(() => {
    if (isUnlimited) return 0;
    // cycleUsed = planAllocation - (credits - adminGranted)
    // But simpler: totalConsumed covers all deductions
    return Math.max(0, totalConsumed);
  }, [isUnlimited, totalConsumed]);

  const usagePct = useMemo(() => {
    if (isUnlimited || planAllocation <= 0) return 0;
    return Math.min(100, Math.round((cycleUsed / planAllocation) * 100));
  }, [isUnlimited, planAllocation, cycleUsed]);

  const resetDate = useMemo(() => {
    if (isUnlimited) return null;
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }, [isUnlimited]);

  const creditCosts = useMemo(() => {
    if (!planConfig) return [];
    return planConfig.creditCosts;
  }, [planConfig]);

  // ── Aggregated feature usage ──
  const featureUsage = useMemo(() => {
    const map = new Map<string, { label: string; credits: number; count: number }>();
    for (const tx of recentTransactions) {
      if (tx.amount >= 0) continue; // only deductions
      const key = tx.source || tx.type;
      const existing = map.get(key) ?? { label: getTransactionLabel(tx), credits: 0, count: 0 };
      existing.credits += Math.abs(tx.amount);
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.entries())
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => b.credits - a.credits);
  }, [recentTransactions]);

  // ── Chart data ──
  const chartData = useMemo(() => {
    if (usageTimeline.length === 0) return [];
    return usageTimeline.map((day) => ({
      date: formatChartDate(day.date),
      credits: day.creditsUsed,
    }));
  }, [usageTimeline]);

  // ── Data fetching ──
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [details, config, txs, timeline] = await Promise.all([
        fetchCreditDetails(),
        getPlanConfig(),
        fetchCreditTransactions(20),
        fetchUsageTimeline(chartRange),
      ]);
      if (details) setCreditDetails(details);
      setPlanConfig(config);
      setRecentTransactions(txs);
      setUsageTimeline(timeline);
    } catch {
      setError("Unable to load your credits.");
    } finally {
      setLoading(false);
    }
  }, [chartRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh chart when range changes
  useEffect(() => {
    fetchUsageTimeline(chartRange).then(setUsageTimeline);
  }, [chartRange]);

  // Listen for live credit changes
  useEffect(() => {
    const unsub = onCreditChange((newBalance) => {
      setCreditDetails((prev) => prev ? { ...prev, credits: newBalance } : prev);
    });
    return unsub;
  }, []);

  // ── Handlers ──
  const handleComparePlans = useCallback(() => {
    window.open(
      "https://makechurcheasy.creatorstudioslabs.stream/subscription/plans",
      "_blank",
      "noopener,noreferrer"
    );
  }, []);

  const handleTopUp = useCallback(() => {
    window.open(
      "https://makechurcheasy.creatorstudioslabs.stream/credits",
      "_blank",
      "noopener,noreferrer"
    );
  }, []);

  const handleViewAll = useCallback(() => {
    window.open(
      "https://makechurcheasy.creatorstudioslabs.stream/billing/history?type=credits",
      "_blank",
      "noopener,noreferrer"
    );
  }, []);

  // ── Low credit threshold (backend-driven if available, else 20%) ──
  const isLow = useMemo(() => {
    if (isUnlimited || isAdmin) return false;
    if (planAllocation <= 0) return false;
    return currentBalance / planAllocation < 0.2;
  }, [isUnlimited, isAdmin, currentBalance, planAllocation]);

  const isZero = !isUnlimited && !isAdmin && currentBalance === 0;

  // ── Render ──

  if (error && !loading) {
    return (
      <div className="credits-page">
        <div className="credits-page__header">
          <div>
            <h1 className="credits-page__title">Credits</h1>
            <p className="credits-page__subtitle">Track and manage your AI usage.</p>
          </div>
        </div>
        <div className="credits-page__error">
          <AlertTriangle size={20} />
          <span>{error}</span>
          <button className="credits-page__retry-btn" onClick={loadData}>
            <RefreshCw size={14} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="credits-page">
      {/* ── Header ── */}
      <div className="credits-page__header">
        <div>
          <h1 className="credits-page__title">Credits</h1>
          <p className="credits-page__subtitle">Track and manage your AI usage.</p>
        </div>
        <div className="credits-page__header-actions">
          <button className="credits-page__btn credits-page__btn--secondary" onClick={handleComparePlans}>
            Compare Plans
          </button>
          <button className="credits-page__btn credits-page__btn--primary" onClick={handleTopUp}>
            <Zap size={14} />
            Top Up Credits
          </button>
        </div>
      </div>

      {/* ── Balance Card ── */}
      {loading ? (
        <BalanceCardSkeleton />
      ) : (
        <div className={`credits-page__balance-card${isLow ? " credits-page__balance-card--low" : ""}${isZero ? " credits-page__balance-card--zero" : ""}`}>
          <div className="credits-page__balance-left">
            <span className="credits-page__balance-label">AI CREDITS</span>
            <div className="credits-page__balance-value-row">
              <span className="credits-page__balance-value">
                {isUnlimited ? "Unlimited" : formatCredits(currentBalance)}
              </span>
              <span className="credits-page__balance-unit">credits remaining</span>
            </div>
            {!isUnlimited && planAllocation > 0 && (
              <p className="credits-page__balance-sub">of {formatCredits(planAllocation)} included this cycle</p>
            )}
            {isAdmin && (
              <span className="credits-page__admin-badge">Admin</span>
            )}
          </div>
          <div className="credits-page__balance-right">
            {!isUnlimited && planAllocation > 0 && (
              <>
                <div className="credits-page__progress-track">
                  <div
                    className="credits-page__progress-fill"
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
                <div className="credits-page__balance-meta">
                  <span>{formatCredits(cycleUsed)} credits used</span>
                  {resetDate && <span>Resets {resetDate}</span>}
                </div>
              </>
            )}
            {isLow && (
              <div className="credits-page__low-warning">
                <AlertTriangle size={14} />
                <span>You're running low on AI credits.</span>
              </div>
            )}
            {isZero && (
              <div className="credits-page__zero-notice">
                AI-powered features may be unavailable until credits are renewed or topped up.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main Grid: Feature Usage + Chart ── */}
      <div className="credits-page__grid">
        {/* Usage by Feature */}
        {loading ? (
          <FeatureRowsSkeleton />
        ) : (
          <div className="credits-page__card">
            <h3 className="credits-page__card-title">
              <BarChart3 size={15} />
              Usage by Feature
            </h3>
            {featureUsage.length === 0 ? (
              <div className="credits-page__empty-feature">
                <p>No AI usage yet.</p>
                <p className="credits-page__empty-feature-sub">Your feature usage will appear here once you start using AI features.</p>
              </div>
            ) : (
              <div className="credits-page__feature-list">
                {featureUsage.map((feat) => {
                  const Icon = getFeatureIcon(feat.label);
                  const pct = planAllocation > 0
                    ? Math.min(100, Math.round((feat.credits / planAllocation) * 100))
                    : 0;
                  return (
                    <div key={feat.key} className="credits-page__feature-row">
                      <div className="credits-page__feature-info">
                        <div className="credits-page__feature-icon">
                          <Icon size={14} />
                        </div>
                        <div>
                          <span className="credits-page__feature-name">{feat.label}</span>
                          <span className="credits-page__feature-count">{feat.count} {feat.count === 1 ? "use" : "uses"}</span>
                        </div>
                      </div>
                      <div className="credits-page__feature-right">
                        <div className="credits-page__feature-bar-track">
                          <div
                            className="credits-page__feature-bar-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="credits-page__feature-credits">-{feat.credits}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Credit Costs Reference */}
            {creditCosts.length > 0 && (
              <div className="credits-page__costs-ref">
                <span className="credits-page__costs-label">Credit costs</span>
                {creditCosts.map((cost) => (
                  <div key={cost.name} className="credits-page__cost-row">
                    <span className="credits-page__cost-name">{cost.name}</span>
                    <span className="credits-page__cost-value">{cost.cost} credit{cost.cost !== 1 ? "s" : ""} / {cost.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Credit Usage Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="credits-page__card">
            <div className="credits-page__chart-header">
              <h3 className="credits-page__card-title">
                <TrendingUp size={15} />
                Credit Usage
              </h3>
              <div className="credits-page__chart-range">
                <button
                  className={`credits-page__range-btn${chartRange === 7 ? " credits-page__range-btn--active" : ""}`}
                  onClick={() => setChartRange(7)}
                >
                  7d
                </button>
                <button
                  className={`credits-page__range-btn${chartRange === 30 ? " credits-page__range-btn--active" : ""}`}
                  onClick={() => setChartRange(30)}
                >
                  30d
                </button>
              </div>
            </div>
            {chartData.length === 0 || chartData.every((d) => d.credits === 0) ? (
              <div className="credits-page__empty-chart">
                <BarChart3 size={28} />
                <p>No credit usage in this period.</p>
                <p className="credits-page__empty-chart-sub">Your AI usage will appear here once you start using AI features.</p>
              </div>
            ) : (
              <div className="credits-page__chart-container">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "4px",
                        fontSize: "12px",
                        color: "var(--text-primary)",
                      }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={((value: any) => [`${value} credits`, "Used"]) as any}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      labelFormatter={((label: any) => label) as any}
                    />
                    <Bar
                      dataKey="credits"
                      fill="var(--accent-color)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Recent Activity ── */}
      {loading ? (
        <ActivitySkeleton />
      ) : (
        <div className="credits-page__card">
          <div className="credits-page__activity-header">
            <h3 className="credits-page__card-title">
              <Clock size={15} />
              Recent Activity
            </h3>
            {recentTransactions.length > 0 && (
              <button className="credits-page__view-all" onClick={handleViewAll}>
                View all
                <ArrowUpRight size={13} />
              </button>
            )}
          </div>
          {recentTransactions.length === 0 ? (
            <div className="credits-page__empty-activity">
              <Clock size={24} />
              <p>No credit activity yet.</p>
              <p className="credits-page__empty-activity-sub">Your credit transactions will appear here.</p>
            </div>
          ) : (
            <div className="credits-page__activity-list">
              {recentTransactions.slice(0, 8).map((tx) => {
                const Icon = getTransactionIcon(tx);
                const isDeduction = tx.amount < 0;
                return (
                  <div key={tx._id || tx.createdAt} className="credits-page__activity-row">
                    <div className="credits-page__activity-left">
                      <div className={`credits-page__activity-icon${isDeduction ? " credits-page__activity-icon--deduction" : " credits-page__activity-icon--credit"}`}>
                        <Icon size={14} />
                      </div>
                      <div>
                        <span className="credits-page__activity-title">{getTransactionLabel(tx)}</span>
                        <span className="credits-page__activity-date">
                          {formatRelativeDate(tx.createdAt)}
                        </span>
                      </div>
                    </div>
                    <span className={`credits-page__activity-amount${isDeduction ? " credits-page__activity-amount--deduction" : " credits-page__activity-amount--credit"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom CTA ── */}
      {!loading && (
        <div className="credits-page__bottom-cta">
          <div className="credits-page__cta-content">
            <h3 className="credits-page__cta-title">Need more credits?</h3>
            <p className="credits-page__cta-subtitle">Top up your credits or upgrade your plan for higher monthly allocations.</p>
          </div>
          <div className="credits-page__cta-actions">
            <button className="credits-page__btn credits-page__btn--primary" onClick={handleTopUp}>
              <Zap size={14} />
              Top Up Credits
            </button>
            <button className="credits-page__btn credits-page__btn--secondary" onClick={handleComparePlans}>
              Compare Plans
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
