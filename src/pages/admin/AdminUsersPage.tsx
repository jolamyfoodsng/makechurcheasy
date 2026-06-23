import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Search, Zap, Plus, Loader2 } from "lucide-react";
import { fetchUsers, addCreditsToUser, fetchAnalytics } from "../../services/adminService";
import type { AdminUser, SignupDataPoint, TimeSeriesPoint } from "../../services/adminService";
import "./Admin.css";

const FILTERS = ["Today", "7 Days", "30 Days", "90 Days", "All Time"] as const;
type Filter = typeof FILTERS[number];

function planBadgeClass(plan: string): string {
  const map: Record<string, string> = {
    free: "admin-badge-free",
    basic: "admin-badge-basic",
    starter: "admin-badge-starter",
    growth: "admin-badge-growth",
    pro: "admin-badge-pro",
  };
  return map[plan] ?? "admin-badge-free";
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All Time");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [addCreditUserId, setAddCreditUserId] = useState<string | null>(null);
  const [addCreditAmount, setAddCreditAmount] = useState<string>("50");
  const [addCreditLoading, setAddCreditLoading] = useState(false);

  const [signupData, setSignupData] = useState<SignupDataPoint[]>([]);
  const [retentionData, setRetentionData] = useState<TimeSeriesPoint[]>([]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const data = await fetchUsers();
    setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
    fetchAnalytics(30).then((data) => {
      if (data) {
        setSignupData(data.signupChart);
        setRetentionData(data.retentionData);
      }
    });
  }, [loadUsers]);

  const filtered = (() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  })();

  function handleRowClick(user: AdminUser) {
    navigate(`/admin/users/${user.id}`);
  }

  async function handleAddCredits(userId: string) {
    const amount = parseInt(addCreditAmount, 10);
    if (!amount || amount <= 0) return;

    setAddCreditLoading(true);
    const newBalance = await addCreditsToUser(userId, amount);
    setAddCreditLoading(false);

    if (newBalance >= 0) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, credits: newBalance } : u,
        ),
      );
    }
    setAddCreditUserId(null);
    setAddCreditAmount("50");
  }

  return (
    <div>
      <div className="admin-content-header">
        <div>
          <h1>User Analytics</h1>
          <p>Track account growth, retention, and user engagement</p>
        </div>
      </div>

      {/* Filters */}
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="admin-filters">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`admin-filter-btn ${filter === f ? "admin-filter-btn-active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="admin-search">
            <Search />
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="admin-card">
        <div className="admin-card-header">
          <span className="admin-card-title">All Users ({loading ? "…" : filtered.length})</span>
        </div>
        <div className="admin-table-wrap">
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px", gap: 8, color: "var(--text-muted)" }}>
              <Loader2 size={16} className="spin" />
              Loading users…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-muted)" }}>
              {search ? "No users match your search." : "No users found."}
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Church</th>
                  <th>Plan</th>
                  <th>Credits</th>
                  <th>Signup Date</th>
                  <th>Last Active</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr
                    key={user.id}
                    style={{ cursor: "pointer" }}
                  >
                    <td onClick={() => handleRowClick(user)}>
                      <div className="admin-user-cell">
                        <div className="admin-avatar">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="admin-user-info">
                          <span className="admin-user-name">{user.name}</span>
                          <span className="admin-user-email">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td onClick={() => handleRowClick(user)}>{user.churchName || "—"}</td>
                    <td onClick={() => handleRowClick(user)}>
                      <span className={`admin-plan-badge ${planBadgeClass(user.plan)}`}>
                        {user.plan}
                      </span>
                    </td>
                    <td>
                      {addCreditUserId === user.id ? (
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 4 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="number"
                            min={1}
                            value={addCreditAmount}
                            onChange={(e) => setAddCreditAmount(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddCredits(user.id);
                              if (e.key === "Escape") setAddCreditUserId(null);
                            }}
                            style={{
                              width: 56,
                              padding: "2px 6px",
                              fontSize: 12,
                              background: "var(--surface-alt)",
                              border: "1px solid var(--border)",
                              borderRadius: 3,
                              color: "var(--text)",
                              outline: "none",
                            }}
                            autoFocus
                          />
                          <button
                            className="admin-action-btn"
                            onClick={() => handleAddCredits(user.id)}
                            disabled={addCreditLoading}
                            style={{ fontSize: 11, padding: "2px 8px" }}
                          >
                            {addCreditLoading ? <Loader2 size={10} className="spin" /> : "Add"}
                          </button>
                          <button
                            className="admin-action-btn"
                            onClick={() => setAddCreditUserId(null)}
                            style={{ fontSize: 11, padding: "2px 6px", opacity: 0.6 }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              fontSize: 12,
                              color: user.credits <= 0 ? "var(--danger, #ef4444)" : "var(--text)",
                            }}
                          >
                            <Zap size={11} style={{ color: "var(--gold, #eab308)" }} />
                            {user.credits}
                          </span>
                          <button
                            className="admin-action-btn"
                            onClick={() => setAddCreditUserId(user.id)}
                            title="Add credits"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td onClick={() => handleRowClick(user)}>{new Date(user.signupDate).toLocaleDateString()}</td>
                    <td onClick={() => handleRowClick(user)}>{new Date(user.lastActive).toLocaleDateString()}</td>
                    <td onClick={() => handleRowClick(user)}>
                      <span style={{ color: user.isActive ? "var(--success)" : "var(--text-disabled)" }}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="admin-grid-2">
        <div className="admin-card">
          <div className="admin-card-header">
            <span className="admin-card-title">User Growth</span>
          </div>
          <div className="admin-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={signupData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }}
                  labelStyle={{ color: "var(--text-muted)" }}
                />
                <Line type="monotone" dataKey="signups" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-header">
            <span className="admin-card-title">Retention Rate</span>
          </div>
          <div className="admin-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={retentionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }}
                  labelStyle={{ color: "var(--text-muted)" }}
                  formatter={(value: any) => [`${value}%`, "Retention"]}
                />
                <Line type="monotone" dataKey="value" stroke="var(--success)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
