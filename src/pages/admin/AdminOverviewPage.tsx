/**
 * AdminOverviewPage.tsx — Overview landing page for the Admin Dashboard.
 * Shows KPI cards, user growth chart, and recent activity feed.
 * Data: Real-time from MongoDB via /api/admin/overview.
 */

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Users,
  TrendingUp,
  Church,
  CreditCard,
  Brain,
  Activity,
  Loader2,
} from "lucide-react";
import {
  fetchOverview,
  formatCurrency,
  formatNumber,
  type KPIData,
  type SignupDataPoint,
  type ActivityEvent,
} from "../../services/adminService";
import "./Admin.css";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const EMPTY_KPIS: KPIData = { totalUsers: 0, activeUsers: 0, churches: 0, paidSubscribers: 0, monthlyRevenue: 0, aiHoursUsed: 0 };

// ── Component ──────────────────────────────────────────────────────────────

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIData>(EMPTY_KPIS);
  const [signupData, setSignupData] = useState<SignupDataPoint[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    fetchOverview().then((data) => {
      if (data) {
        setKpis(data.kpis);
        setSignupData(data.signupChart);
        setActivity(data.activity.slice(0, 10));
      }
      setLoading(false);
    });
  }, []);

  const kpiCards = [
    { label: "Total Users", value: formatNumber(kpis.totalUsers), icon: Users, color: "#60a5fa" },
    { label: "Active Users", value: formatNumber(kpis.activeUsers), icon: TrendingUp, color: "#34d399" },
    { label: "Churches", value: formatNumber(kpis.churches), icon: Church, color: "#a78bfa" },
    { label: "Paid Subscribers", value: formatNumber(kpis.paidSubscribers), icon: CreditCard, color: "#f59e0b" },
    { label: "Monthly Revenue", value: formatCurrency(kpis.monthlyRevenue), icon: CreditCard, color: "#34d399" },
    { label: "AI Hours Used", value: `${kpis.aiHoursUsed}`, icon: Brain, color: "#f472b6" },
  ];

  return (
    <div>
      <div className="admin-content-header">
        <div>
          <h1>Overview</h1>
          <p>Platform-wide metrics at a glance</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px", gap: 8, color: "var(--text-muted)" }}>
          <Loader2 size={18} className="spin" />
          Loading overview…
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="admin-kpi-grid">
            {kpiCards.map((k) => (
              <div key={k.label} className="admin-kpi-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="admin-kpi-label">{k.label}</span>
                  <k.icon size={14} style={{ color: k.color, opacity: 0.7 }} />
                </div>
                <div className="admin-kpi-value">{k.value}</div>
              </div>
            ))}
          </div>

          {/* Charts + Activity */}
          <div className="admin-grid-2">
            {/* User Growth Chart */}
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <div className="admin-card-title">User Growth</div>
                  <div className="admin-card-subtitle">Daily signups over the last 30 days</div>
                </div>
                <Activity size={16} style={{ color: "var(--text-muted)" }} />
              </div>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={signupData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
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
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        fontSize: 12,
                        color: "var(--text)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="signups"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "var(--primary)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <div className="admin-card-title">Recent Activity</div>
                  <div className="admin-card-subtitle">Latest events across the platform</div>
                </div>
              </div>
              <div className="admin-activity-list">
                {activity.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)", fontSize: 13 }}>
                    No activity yet. Events will appear as users interact with the app.
                  </div>
                ) : (
                  activity.map((evt) => (
                    <div key={evt.id} className="admin-activity-item">
                      <div className={`admin-activity-dot admin-activity-dot-${evt.type}`} />
                      <div>
                        <div className="admin-activity-msg">{evt.message}</div>
                        <div className="admin-activity-time">{formatRelativeTime(evt.timestamp)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
