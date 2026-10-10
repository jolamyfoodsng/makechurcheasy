import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cloud,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Laptop,
  ArrowDownToLine,
  Crown,
  UploadCloud,
} from "lucide-react";
import {
  fetchCloudSyncStatus,
  uploadSnapshotToCloud,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  isIncludeMediaEnabled,
  setIncludeMediaEnabled,
  getSyncDeviceName,
  setSyncDeviceName,
  CLOUD_SYNC_STATUS_CHANGED_EVENT,
  type CloudSyncStatusInfo,
} from "../services/cloudSyncService";
import { useAuth } from "../contexts/AuthContext";
import { canUseCloudSync } from "../services/licenseService";
import { CloudSyncRestoreModal } from "./CloudSyncRestoreModal";

interface CloudSyncSettingsCardProps {
  onOpenUpgrade?: () => void;
}

export function CloudSyncSettingsCard({ onOpenUpgrade }: CloudSyncSettingsCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const hasEntitlement = canUseCloudSync(user);

  const [status, setStatus] = useState<CloudSyncStatusInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  // Form states
  const [autoSync, setAutoSync] = useState(isAutoSyncEnabled());
  const [includeMedia, setIncludeMedia] = useState(isIncludeMediaEnabled());
  const [deviceName, setDeviceName] = useState(getSyncDeviceName());
  const [editingDevice, setEditingDevice] = useState(false);

  const refreshStatus = () => {
    fetchCloudSyncStatus()
      .then((s) => setStatus(s))
      .catch(() => {});
  };

  useEffect(() => {
    refreshStatus();

    const handleUpdate = () => {
      refreshStatus();
      setAutoSync(isAutoSyncEnabled());
      setIncludeMedia(isIncludeMediaEnabled());
      setDeviceName(getSyncDeviceName());
    };

    window.addEventListener(CLOUD_SYNC_STATUS_CHANGED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(CLOUD_SYNC_STATUS_CHANGED_EVENT, handleUpdate);
    };
  }, []);

  const handleManualBackup = async () => {
    setSyncing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await uploadSnapshotToCloud();
      setSuccessMsg(t("cloudSync.backupSuccess", "Backup uploaded to cloud successfully!"));
      setTimeout(() => setSuccessMsg(null), 4000);
      refreshStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleAutoSync = () => {
    const next = !autoSync;
    setAutoSync(next);
    setAutoSyncEnabled(next);
  };

  const handleToggleMedia = () => {
    const next = !includeMedia;
    setIncludeMedia(next);
    setIncludeMediaEnabled(next);
  };

  const handleSaveDeviceName = () => {
    setSyncDeviceName(deviceName);
    setEditingDevice(false);
  };

  // ── Render Free/Locked Tier Teaser ─────────────────────────────────────────
  if (!hasEntitlement) {
    return (
      <div
        className="settings-card fields-rows-stack"
        style={{
          marginBottom: "20px",
          background: "#18181c",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="flex-between-center">
          <div className="switch-left" style={{ maxWidth: "680px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "#4f46e5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                }}
              >
                <Cloud size={18} />
              </div>
              <span className="switch-title" style={{ color: "#ffffff", fontSize: "1.05rem", fontWeight: 700 }}>
                {t("cloudSync.lockedTitle", "Make Church Easy Cloud Backup & Sync")}
              </span>
              <span
                style={{
                  background: "rgba(99, 102, 241, 0.2)",
                  color: "#a5b4fc",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(99, 102, 241, 0.35)",
                }}
              >
                BASIC & GROWTH
              </span>
            </div>
            <span className="switch-subtitle" style={{ color: "#94a3b8", lineHeight: 1.5, fontSize: "0.875rem" }}>
              {t(
                "cloudSync.lockedDesc",
                "Log in on any computer and immediately restore your complete worship catalog, broadcast channels, stream keys, and preacher notes without copying files or credentials manually."
              )}
            </span>
          </div>

          <button
            type="button"
            className="action-btn btn-primary"
            onClick={onOpenUpgrade}
            style={{
              background: "#4f46e5",
              color: "#ffffff",
              padding: "0.6rem 1.25rem",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: "0.875rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 10px rgba(79, 70, 229, 0.35)",
              flexShrink: 0,
            }}
          >
            <Crown size={15} />
            <span>{t("cloudSync.upgradeCta", "Upgrade to Basic")}</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Render Entitled/Paid Tier Management Card ──────────────────────────────
  const usedMB = status ? (status.storageUsedBytes / (1024 * 1024)).toFixed(1) : "0.5";
  const limitGB = status?.storageLimitGB || 5;

  return (
    <>
      <div
        className="settings-card fields-rows-stack"
        style={{
          marginBottom: "20px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          background: "#18181c",
        }}
      >
        {/* Card Header & Status */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            paddingBottom: "1.25rem",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(99, 102, 241, 0.15)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#818cf8",
                flexShrink: 0,
              }}
            >
              <Cloud size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#ffffff" }}>
                  {t("cloudSync.headerTitle", "Cloud Backup & Multi-Laptop Sync")}
                </h4>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "rgba(34, 197, 94, 0.12)",
                    color: "#4ade80",
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    border: "1px solid rgba(34, 197, 94, 0.25)",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                  {t("cloudSync.activePill", "Cloud Connected")}
                </span>
              </div>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.825rem", color: "#94a3b8" }}>
                {status?.lastSyncedAt
                  ? t("cloudSync.lastSyncedText", "Last synced {{time}} from {{device}}", {
                      time: new Date(status.lastSyncedAt).toLocaleString(),
                      device: status.lastSyncedDevice || getSyncDeviceName(),
                    })
                  : t("cloudSync.neverSyncedText", "Ready to sync worship songs, broadcast profiles & notes")}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="action-btn"
              onClick={() => setShowRestoreModal(true)}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#f8fafc",
                fontSize: "0.85rem",
                fontWeight: 600,
                padding: "0.5rem 1rem",
                borderRadius: 7,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
              }}
            >
              <ArrowDownToLine size={15} />
              <span>{t("cloudSync.restoreBtn", "Restore from Cloud")}</span>
            </button>

            <button
              type="button"
              className="action-btn btn-primary"
              onClick={handleManualBackup}
              disabled={syncing}
              style={{
                background: "#4f46e5",
                border: "none",
                color: "#ffffff",
                fontSize: "0.85rem",
                fontWeight: 600,
                padding: "0.5rem 1.15rem",
                borderRadius: 7,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                cursor: syncing ? "not-allowed" : "pointer",
              }}
            >
              {syncing ? (
                <>
                  <RefreshCw size={15} className="spin-animation" />
                  <span>{t("cloudSync.syncingBtn", "Backing Up...")}</span>
                </>
              ) : (
                <>
                  <UploadCloud size={15} />
                  <span>{t("cloudSync.backupNowBtn", "Backup to Cloud Now")}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {successMsg && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              borderRadius: 8,
              color: "#4ade80",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 8,
              color: "#f87171",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Preferences Grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "0.5rem" }}>
          {/* Row 1: Automatic Cloud Backup Toggle */}
          <div className="flex-between-center">
            <div className="switch-left">
              <span className="switch-title" style={{ fontSize: "0.9rem" }}>
                {t("cloudSync.autoSyncTitle", "Automatic Background Backup")}
              </span>
              <span className="switch-subtitle" style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                {t(
                  "cloudSync.autoSyncDesc",
                  "Silently syncs new worship songs, preacher notes, and broadcast profile updates to your cloud storage."
                )}
              </span>
            </div>
            <label className="theme-toggle-switch" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={autoSync} onChange={handleToggleAutoSync} />
              <span className="theme-toggle-slider" />
            </label>
          </div>

          {/* Row 2: Include Media Library in Sync */}
          <div className="flex-between-center">
            <div className="switch-left">
              <span className="switch-title" style={{ fontSize: "0.9rem" }}>
                {t("cloudSync.includeMediaTitle", "Include Media Library in Cloud Sync")}
              </span>
              <span className="switch-subtitle" style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                {t(
                  "cloudSync.includeMediaDesc",
                  "Back up background video loops, image stills, and presentation graphics alongside song lyrics."
                )}
                {includeMedia && (
                  <span style={{ display: "block", marginTop: "3px", color: "#818cf8", fontSize: "0.75rem" }}>
                    Storage usage: {usedMB} MB used of {limitGB} GB quota
                  </span>
                )}
              </span>
            </div>
            <label className="theme-toggle-switch" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={includeMedia} onChange={handleToggleMedia} />
              <span className="theme-toggle-slider" />
            </label>
          </div>

          {/* Row 3: Device Name / Machine Identifier */}
          <div className="flex-between-center" style={{ paddingTop: "0.25rem" }}>
            <div className="switch-left">
              <span className="switch-title" style={{ fontSize: "0.9rem" }}>
                {t("cloudSync.deviceNameTitle", "Current Laptop / PC Name")}
              </span>
              <span className="switch-subtitle" style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                {t("cloudSync.deviceNameDesc", "Distinguish which computer created each cloud backup.")}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {editingDevice ? (
                <>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 6,
                      color: "#fff",
                      padding: "4px 10px",
                      fontSize: "0.85rem",
                    }}
                  />
                  <button
                    type="button"
                    className="action-btn"
                    onClick={handleSaveDeviceName}
                    style={{ padding: "4px 12px", fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    Save
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "0.85rem",
                      color: "#e2e8f0",
                      background: "rgba(255, 255, 255, 0.05)",
                      padding: "4px 10px",
                      borderRadius: 6,
                    }}
                  >
                    <Laptop size={14} style={{ color: "#818cf8" }} />
                    {deviceName}
                  </span>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => setEditingDevice(true)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "0.775rem",
                      background: "transparent",
                      border: "none",
                      color: "#818cf8",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Rename
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <CloudSyncRestoreModal
        isOpen={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        onRestored={() => refreshStatus()}
      />
    </>
  );
}
