import { useState, useEffect, useCallback } from "react";
import { Shield, Save, RefreshCw, AlertTriangle, Lock, Clock, MessageSquare } from "lucide-react";
import "./Admin.css";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--primary)" : "var(--surface-hover)",
        transition: "background 0.2s",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

interface AppSettings {
  latestVersion: string;
  minimumSupportedVersion: string;
  forceUpdatesEnabled: boolean;
  emergencyLock: boolean;
  emergencyLockDelay: number;
  gracePeriodHours: number;
  updateMessage: string;
}

export default function AdminSettingsPage() {
  const [require2fa, setRequire2fa] = useState(true);
  const [realTimeFeed, setRealTimeFeed] = useState(true);
  const [selfDeletion, setSelfDeletion] = useState(false);

  // App Update settings
  const [appSettings, setAppSettings] = useState<AppSettings>({
    latestVersion: "",
    minimumSupportedVersion: "",
    forceUpdatesEnabled: false,
    emergencyLock: false,
    emergencyLockDelay: 0,
    gracePeriodHours: 72,
    updateMessage: "",
  });
  const [appSettingsLoading, setAppSettingsLoading] = useState(true);
  const [appSettingsSaving, setAppSettingsSaving] = useState(false);
  const [appSettingsMsg, setAppSettingsMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load app settings on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/admin/app-settings`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAppSettings({
            latestVersion: data.latestVersion ?? "2.1.0",
            minimumSupportedVersion: data.minimumSupportedVersion ?? "2.1.0",
            forceUpdatesEnabled: data.forceUpdatesEnabled ?? false,
            emergencyLock: data.emergencyLock ?? false,
            emergencyLockDelay: data.emergencyLockDelay ?? 0,
            gracePeriodHours: data.gracePeriodHours ?? 72,
            updateMessage: data.updateMessage ?? "",
          });
        }
      } catch (err) {
        console.error("Failed to load app settings:", err);
      } finally {
        setAppSettingsLoading(false);
      }
    }
    void load();
  }, []);

  const saveAppSettings = useCallback(async () => {
    setAppSettingsSaving(true);
    setAppSettingsMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/app-settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appSettings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setAppSettingsMsg({ type: "success", text: "App update settings saved." });
      setTimeout(() => setAppSettingsMsg(null), 3000);
    } catch (err: any) {
      setAppSettingsMsg({ type: "error", text: err?.message || "Failed to save." });
    } finally {
      setAppSettingsSaving(false);
    }
  }, [appSettings]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 13,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 4,
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
  };

  return (
    <div>
      <div className="admin-content-header">
        <div>
          <h1>Admin Settings</h1>
          <p>Configure admin preferences, access controls, and app update policy</p>
        </div>
      </div>

      {/* ── Security & Access ── */}
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-header">
          <div className="admin-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={16} />
            Security & Access
          </div>
        </div>

        <div style={rowStyle}>
          <span className="admin-stat-label">Require 2FA for Admin Login</span>
          <Toggle checked={require2fa} onChange={setRequire2fa} />
        </div>

        <div style={rowStyle}>
          <span className="admin-stat-label">Enable Real-Time Activity Feed</span>
          <Toggle checked={realTimeFeed} onChange={setRealTimeFeed} />
        </div>

        <div style={{ padding: "10px 0" }}>
          <span className="admin-stat-label">Allow User Self-Deletion</span>
          <Toggle checked={selfDeletion} onChange={setSelfDeletion} />
        </div>
      </div>

      {/* ── App Updates ── */}
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={16} />
            App Updates
          </div>
          <button
            onClick={saveAppSettings}
            disabled={appSettingsSaving || appSettingsLoading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              background: "var(--primary)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: appSettingsSaving ? "wait" : "pointer",
              opacity: appSettingsSaving ? 0.6 : 1,
            }}
          >
            <Save size={12} />
            {appSettingsSaving ? "Saving..." : "Save"}
          </button>
        </div>

        {appSettingsMsg && (
          <div
            style={{
              margin: "0 0 12px",
              padding: "8px 12px",
              borderRadius: 4,
              fontSize: 13,
              background: appSettingsMsg.type === "success"
                ? "rgba(34, 197, 94, 0.1)"
                : "rgba(239, 68, 68, 0.1)",
              color: appSettingsMsg.type === "success" ? "#22c55e" : "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {appSettingsMsg.type === "success" ? <Save size={12} /> : <AlertTriangle size={12} />}
            {appSettingsMsg.text}
          </div>
        )}

        {/* Force Updates toggle */}
        <div style={rowStyle}>
          <div>
            <div className="admin-stat-label" style={{ textTransform: "none", fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
              Force Updates
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              When enabled, users below the minimum version are blocked from using the app
            </div>
          </div>
          <Toggle
            checked={appSettings.forceUpdatesEnabled}
            onChange={(v) => setAppSettings((s) => ({ ...s, forceUpdatesEnabled: v }))}
          />
        </div>

        {/* Emergency Lock toggle */}
        <div style={rowStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Lock size={14} style={{ color: "var(--error, #ef4444)" }} />
            <div>
              <div className="admin-stat-label" style={{ textTransform: "none", fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                Emergency Lock
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Immediately locks ALL users. Use for critical security issues.
              </div>
            </div>
          </div>
          <Toggle
            checked={appSettings.emergencyLock}
            onChange={(v) => setAppSettings((s) => ({ ...s, emergencyLock: v }))}
          />
        </div>

        {/* Emergency Lock Delay */}
        {appSettings.emergencyLock && (
          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <div>
              <div className="admin-stat-label" style={{ textTransform: "none", fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                Lock Delay
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Hours before the lock fully blocks the app. Users see a countdown during this period.
              </div>
            </div>
            <select
              value={appSettings.emergencyLockDelay}
              onChange={(e) => setAppSettings((s) => ({ ...s, emergencyLockDelay: Number(e.target.value) }))}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
                fontSize: 13,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value={0}>Immediate (0 hours)</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={72}>72 hours</option>
            </select>
          </div>
        )}

        {/* Latest Version */}
        <div style={{ ...rowStyle, alignItems: "flex-start" }}>
          <div style={{ flex: 1, paddingRight: 16 }}>
            <div style={labelStyle}>Latest Version</div>
            <input
              type="text"
              value={appSettings.latestVersion}
              onChange={(e) => setAppSettings((s) => ({ ...s, latestVersion: e.target.value }))}
              placeholder="e.g. 2.1.0"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Minimum Supported Version</div>
            <input
              type="text"
              value={appSettings.minimumSupportedVersion}
              onChange={(e) => setAppSettings((s) => ({ ...s, minimumSupportedVersion: e.target.value }))}
              placeholder="e.g. 2.1.0"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Grace Period */}
        <div style={{ ...rowStyle, alignItems: "flex-start" }}>
          <div style={{ flex: 1, paddingRight: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Clock size={12} style={{ color: "var(--text-muted)" }} />
              <span style={labelStyle}>Grace Period (hours)</span>
            </div>
            <input
              type="number"
              min={0}
              max={720}
              value={appSettings.gracePeriodHours}
              onChange={(e) => setAppSettings((s) => ({ ...s, gracePeriodHours: Number(e.target.value) }))}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Users have this many hours to update before being locked out. Set to 0 for immediate lockout.
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <MessageSquare size={12} style={{ color: "var(--text-muted)" }} />
              <span style={labelStyle}>Update Message</span>
            </div>
            <textarea
              value={appSettings.updateMessage}
              onChange={(e) => setAppSettings((s) => ({ ...s, updateMessage: e.target.value }))}
              placeholder="A new version of MakeChurchEasy is available. Please update to continue."
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
                lineHeight: 1.5,
              }}
            />
          </div>
        </div>

        {/* Emergency warning */}
        {appSettings.emergencyLock && (
          <div
            style={{
              margin: "8px 0 0",
              padding: "10px 12px",
              borderRadius: 4,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              fontSize: 12,
              color: "var(--error, #ef4444)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AlertTriangle size={14} />
            {appSettings.emergencyLockDelay > 0
              ? `Emergency Lock is active. Users will be locked out in ${appSettings.emergencyLockDelay} hours.`
              : "Emergency Lock is active. All users will be immediately blocked until you disable this toggle."}
          </div>
        )}
      </div>
    </div>
  );
}
