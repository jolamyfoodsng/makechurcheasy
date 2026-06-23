import { useState, useEffect } from "react";
import { TrendingUp, ArrowUpRight, Loader2 } from "lucide-react";
import { fetchPaymentData, formatCurrency, type PaymentData } from "../../services/adminService";
import "./Admin.css";

const PLAN_COLORS: Record<string, string> = {
  Free: "#5F697D",
  Basic: "#60a5fa",
  Starter: "#60A5FA",
  Growth: "#34d399",
  Pro: "#facc15",
};

const EMPTY_PAYMENT: PaymentData = {
  totalRevenue: 0,
  monthlyRevenue: 0,
  activeSubscriptions: 0,
  cancelledSubscriptions: 0,
  conversionRate: 0,
  revenueByPlan: [],
};

export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PaymentData>(EMPTY_PAYMENT);

  useEffect(() => {
    fetchPaymentData().then((d) => {
      if (d) setData(d);
      setLoading(false);
    });
  }, []);

  const maxUsers = Math.max(...data.revenueByPlan.map((p) => p.count), 1);

  return (
    <div>
      <div className="admin-content-header">
        <div>
          <h1>Payments</h1>
          <p>Subscription performance and revenue analytics</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px", gap: 8, color: "var(--text-muted)" }}>
          <Loader2 size={18} className="spin" />
          Loading payment data…
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Total Revenue</span>
              <span className="admin-kpi-value">{formatCurrency(data.totalRevenue)}</span>
              <span className="admin-kpi-trend admin-kpi-trend-up">
                <ArrowUpRight size={12} /> Annualized
              </span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Monthly Revenue</span>
              <span className="admin-kpi-value">{formatCurrency(data.monthlyRevenue)}</span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Active Subscriptions</span>
              <span className="admin-kpi-value">{data.activeSubscriptions.toLocaleString()}</span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Cancelled</span>
              <span className="admin-kpi-value">{data.cancelledSubscriptions}</span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Conversion Rate</span>
              <span className="admin-kpi-value">{data.conversionRate}%</span>
              <span className="admin-kpi-trend admin-kpi-trend-up">
                <TrendingUp size={12} /> Free → Paid
              </span>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <div className="admin-card-title">Revenue Breakdown</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Subscription distribution by plan
                </div>
              </div>
            </div>

            <div className="admin-revenue-bar">
              {data.revenueByPlan.map((p) => {
                const flex = p.count / maxUsers;
                return (
                  <div
                    key={p.plan}
                    className="admin-revenue-segment"
                    style={{ flex, background: PLAN_COLORS[p.plan] }}
                    title={`${p.plan}: ${p.count.toLocaleString()} users`}
                  />
                );
              })}
            </div>

            <div className="admin-table-wrap" style={{ marginTop: 16 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Users</th>
                    <th>Revenue</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenueByPlan.map((p) => {
                    const totalUsers = data.revenueByPlan.reduce((s, r) => s + r.count, 0);
                    const share = totalUsers > 0 ? ((p.count / totalUsers) * 100).toFixed(1) : "0";
                    return (
                      <tr key={p.plan}>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: PLAN_COLORS[p.plan] }} />
                            {p.plan}
                          </span>
                        </td>
                        <td>{p.count.toLocaleString()}</td>
                        <td>{p.revenue > 0 ? formatCurrency(p.revenue) : "—"}</td>
                        <td>{share}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
