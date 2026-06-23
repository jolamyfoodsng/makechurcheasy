import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { BarChart3, Loader2 } from "lucide-react";
import {
  fetchAnalytics,
  formatNumber,
  formatCurrency,
  type FeatureUsage,
  type SignupDataPoint,
  type RevenueDataPoint,
} from "../../services/adminService";
import "./Admin.css";

const PERIODS = ["Today", "7 Days", "30 Days", "90 Days", "All Time"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_DAYS: Record<Period, number> = {
  Today: 1,
  "7 Days": 7,
  "30 Days": 30,
  "90 Days": 90,
  "All Time": 180,
};

const EMPTY_FEATURE: FeatureUsage = {
  bibleSearches: 0,
  worshipPresentations: 0,
  mediaPresentations: 0,
  voiceSessions: 0,
  transcriptViews: 0,
  themesCreated: 0,
};

export default function AdminAnalyticsPage() {
  const [activePeriod, setActivePeriod] = useState<Period>("30 Days");
  const [loading, setLoading] = useState(true);
  const [signupData, setSignupData] = useState<SignupDataPoint[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsage>(EMPTY_FEATURE);

  const days = PERIOD_DAYS[activePeriod];

  useEffect(() => {
    setLoading(true);
    fetchAnalytics(days).then((data) => {
      if (data) {
        setSignupData(data.signupChart);
        setRevenueData(data.revenueChart);
        setFeatureUsage(data.featureUsage);
      }
      setLoading(false);
    });
  }, [days]);

  const featureBarData = useMemo(
    () => [
      { name: "Bible", value: featureUsage.bibleSearches },
      { name: "Worship", value: featureUsage.worshipPresentations },
      { name: "Media", value: featureUsage.mediaPresentations },
      { name: "Voice", value: featureUsage.voiceSessions },
      { name: "Transcripts", value: featureUsage.transcriptViews },
      { name: "Themes", value: featureUsage.themesCreated },
    ],
    [featureUsage],
  );

  return (
    <div>
      <div className="admin-content-header">
        <div>
          <h1>Analytics</h1>
          <p>Platform-wide usage analytics and trends</p>
        </div>
      </div>

      <div className="admin-filters" style={{ marginBottom: 16 }}>
        {PERIODS.map((p) => (
          <button
            key={p}
            className={`admin-filter-btn${activePeriod === p ? " admin-filter-btn-active" : ""}`}
            onClick={() => setActivePeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px", gap: 8, color: "var(--text-muted)" }}>
          <Loader2 size={18} className="spin" />
          Loading analytics…
        </div>
      ) : (
        <>
          <div className="admin-grid-2">
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Signups Over Time</div>
              </div>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={signupData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }} />
                    <Line type="monotone" dataKey="signups" stroke="var(--primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Revenue Over Time</div>
              </div>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCurrency(v)} />
                    <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }} formatter={(value: any) => [formatCurrency(value), "Revenue"]} />
                    <Line type="monotone" dataKey="revenue" stroke="var(--success)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart3 size={16} />
                Feature Breakdown
              </div>
            </div>
            <div className="admin-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureBarData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatNumber(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }} formatter={(value: any) => [formatNumber(value), "Count"]} />
                  <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
