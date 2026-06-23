import { useState, useEffect, useMemo } from "react";
import { Server, Loader2 } from "lucide-react";
import { fetchAIData, fetchChurches, type AIData, type Church } from "../../services/adminService";
import "./Admin.css";

export default function AdminAIUsagePage() {
  const [loading, setLoading] = useState(true);
  const [aiData, setAiData] = useState<AIData | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);

  useEffect(() => {
    Promise.all([fetchAIData(), fetchChurches()]).then(([ai, ch]) => {
      setAiData(ai);
      setChurches(ch);
      setLoading(false);
    });
  }, []);

  const topChurches = useMemo(
    () => [...churches].sort((a, b) => b.userCount - a.userCount).slice(0, 5),
    [churches],
  );

  const creditPercent = aiData
    ? (aiData.assemblyAI.usedCredits / aiData.assemblyAI.monthlyCredits) * 100
    : 0;

  return (
    <div>
      <div className="admin-content-header">
        <div>
          <h1>AI Usage</h1>
          <p>Monitor AI consumption, AssemblyAI credits, and session metrics</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px", gap: 8, color: "var(--text-muted)" }}>
          <Loader2 size={18} className="spin" />
          Loading AI data…
        </div>
      ) : aiData ? (
        <>
          {/* KPI Cards */}
          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Total Sessions</span>
              <span className="admin-kpi-value">{aiData.totalSessions.toLocaleString()}</span>
              <span className="admin-kpi-sub">Speech-to-Scripture sessions</span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Minutes Consumed</span>
              <span className="admin-kpi-value">{aiData.minutesConsumed.toLocaleString()}</span>
              <span className="admin-kpi-sub">Total AI processing time</span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Hours Used</span>
              <span className="admin-kpi-value">{aiData.hoursConsumed}</span>
              <span className="admin-kpi-sub">Across all sessions</span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Avg Session Length</span>
              <span className="admin-kpi-value">{aiData.avgSessionLength} min</span>
              <span className="admin-kpi-sub">Per voice session</span>
            </div>
          </div>

          <div className="admin-grid-2">
            {/* AssemblyAI Monitoring */}
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <span className="admin-card-title">AssemblyAI Credits</span>
                  <div className="admin-card-subtitle">Monthly speech-to-text allocation</div>
                </div>
                <Server size={18} style={{ color: "var(--text-muted)" }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {aiData.assemblyAI.usedCredits}h used
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {aiData.assemblyAI.remainingCredits}h remaining
                  </span>
                </div>
                <div className="admin-gauge">
                  <div
                    className="admin-gauge-fill admin-gauge-used"
                    style={{ width: `${creditPercent}%` }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-disabled)", marginTop: 4 }}>
                  {creditPercent.toFixed(0)}% of {aiData.assemblyAI.monthlyCredits}h monthly credits
                </div>
              </div>

              <div className="admin-stat-row">
                <span className="admin-stat-label">Estimated Cost</span>
                <span className="admin-stat-value">${aiData.assemblyAI.estimatedCost}</span>
              </div>
              <div className="admin-stat-row">
                <span className="admin-stat-label">Projected Monthly Cost</span>
                <span className="admin-stat-value">${aiData.assemblyAI.projectedMonthlyCost}</span>
              </div>
            </div>

            {/* Most Active Churches */}
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Churches by Size</div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Church</th>
                      <th>Users</th>
                      <th>Plan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topChurches.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500, color: "var(--text)" }}>{c.name}</td>
                        <td>{c.userCount}</td>
                        <td style={{ textTransform: "capitalize" }}>{c.plan}</td>
                      </tr>
                    ))}
                    {topChurches.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
                          No church data yet. Churches appear when users set a church name.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
