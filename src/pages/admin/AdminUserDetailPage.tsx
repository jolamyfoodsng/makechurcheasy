/**
 * AdminUserDetailPage.tsx — Individual user detail view for the Admin Dashboard.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Church,
  Calendar,
  BookOpen,
  Music,
  Images,
  Brain,
  FileText,
  Zap,
  Plus,
  Loader2,
} from "lucide-react";
import { fetchUserById, addCreditsToUser } from "../../services/adminService";
import type { AdminUser } from "../../services/adminService";
import "./Admin.css";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function planBadgeClass(plan: string): string {
  switch (plan) {
    case "basic": return "admin-plan-badge admin-badge-basic";
    case "starter": return "admin-plan-badge admin-badge-starter";
    case "growth": return "admin-plan-badge admin-badge-growth";
    case "pro": return "admin-plan-badge admin-badge-pro";
    default: return "admin-plan-badge admin-badge-free";
  }
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditAmount, setCreditAmount] = useState("50");
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMessage, setCreditMessage] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const data = await fetchUserById(id);
    setUser(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  async function handleAddCredits() {
    if (!user) return;
    const amount = parseInt(creditAmount, 10);
    if (!amount || amount <= 0) return;

    setCreditLoading(true);
    setCreditMessage(null);
    const newBalance = await addCreditsToUser(user.id, amount);
    setCreditLoading(false);

    if (newBalance >= 0) {
      setUser((prev) => prev ? { ...prev, credits: newBalance } : prev);
      setCreditMessage(`Added ${amount} credits. New balance: ${newBalance}`);
      setCreditAmount("50");
    } else {
      setCreditMessage("Failed to add credits. Please try again.");
    }

    setTimeout(() => setCreditMessage(null), 4000);
  }

  if (loading) {
    return (
      <div className="admin-empty">
        <Loader2 size={24} className="spin" />
        <h3>Loading user…</h3>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="admin-empty">
        <h3>User not found</h3>
        <p>The requested user could not be located.</p>
      </div>
    );
  }

  const initial = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const usageCards = [
    { label: "Bible Searches", value: user.usage.bibleSearches.toLocaleString(), icon: BookOpen, color: "#60a5fa" },
    { label: "Songs Created", value: user.usage.songsCreated.toLocaleString(), icon: Music, color: "#34d399" },
    { label: "Media Uploaded", value: user.usage.mediaUploaded.toLocaleString(), icon: Images, color: "#f59e0b" },
    { label: "AI Hours Used", value: user.usage.aiHoursUsed.toFixed(1), icon: Brain, color: "#60A5FA" },
    { label: "Transcript Count", value: user.usage.transcriptCount.toLocaleString(), icon: FileText, color: "#f472b6" },
  ];

  return (
    <div>
      <button className="admin-detail-back" onClick={() => navigate("/admin/users")}>
        <ArrowLeft />
        Back to Users
      </button>

      <div className="admin-detail-header">
        <div className="admin-detail-avatar">{initial}</div>
        <div className="admin-detail-meta">
          <div className="admin-detail-name">{user.name}</div>
          <div className="admin-detail-email">{user.email}</div>
          <div className="admin-detail-tags">
            <span className={planBadgeClass(user.plan)}>{user.plan}</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <Church size={12} />
              {user.churchName || "—"}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <Calendar size={12} />
              Joined {formatDate(user.signupDate)}
            </span>
          </div>
        </div>
      </div>

      {/* Credits Management */}
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={16} style={{ color: "var(--gold, #eab308)" }} />
            <span className="admin-card-title">Credits Management</span>
          </div>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Current Balance</div>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <Zap size={20} style={{ color: "var(--gold, #eab308)" }} />
              {user.credits}
            </div>
          </div>

          <div style={{ width: 1, height: 32, background: "var(--border)" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Add Credits</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  min={1}
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddCredits();
                  }}
                  style={{
                    width: 72,
                    padding: "6px 10px",
                    fontSize: 14,
                    background: "var(--surface-alt)",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    color: "var(--text)",
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleAddCredits}
                  disabled={creditLoading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "var(--primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 3,
                    cursor: creditLoading ? "not-allowed" : "pointer",
                    opacity: creditLoading ? 0.6 : 1,
                  }}
                >
                  {creditLoading ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}
                  Add Credits
                </button>
              </div>
            </div>

            {/* Quick add buttons */}
            <div style={{ display: "flex", gap: 4 }}>
              {[25, 50, 100, 500].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setCreditAmount(String(amt))}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    background: creditAmount === String(amt) ? "var(--primary)" : "var(--surface-alt)",
                    color: creditAmount === String(amt) ? "#fff" : "var(--text-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>

          {creditMessage && (
            <div style={{
              fontSize: 12,
              color: creditMessage.includes("Failed") ? "var(--danger, #ef4444)" : "var(--success, #22c55e)",
              width: "100%",
            }}>
              {creditMessage}
            </div>
          )}
        </div>
      </div>

      <div className="admin-kpi-grid">
        {usageCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="admin-kpi-card">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Icon size={14} style={{ color, opacity: 0.8 }} />
              <span className="admin-kpi-label">{label}</span>
            </div>
            <div className="admin-kpi-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="admin-card" style={{ marginTop: 8 }}>
        <div className="admin-card-header">
          <div>
            <div className="admin-card-title">Recent Activity</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Activity history for this user
            </div>
          </div>
        </div>
        <div className="admin-empty" style={{ padding: "32px 16px" }}>
          <FileText />
          <h3>No activity recorded yet</h3>
          <p>User activity will appear here once events are tracked.</p>
        </div>
      </div>
    </div>
  );
}
