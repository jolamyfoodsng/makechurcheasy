import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cloud,
  CheckCircle,
  AlertCircle,
  Music,
  Radio,
  FileText,
  Paintbrush,
  RefreshCw,
  X,
  Layers,
} from "lucide-react";
import {
  fetchLatestCloudSnapshot,
  restoreSnapshot,
  type CloudSyncSnapshot,
  type RestoreResult,
} from "../services/cloudSyncService";

interface CloudSyncRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored?: (result: RestoreResult) => void;
}

export function CloudSyncRestoreModal({
  isOpen,
  onClose,
  onRestored,
}: CloudSyncRestoreModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [snapshot, setSnapshot] = useState<CloudSyncSnapshot | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSnapshot(null);
      setResult(null);
      setError(null);
      setRestoring(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetchLatestCloudSnapshot()
      .then((snap) => {
        setSnapshot(snap);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load cloud snapshot");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRestore = async () => {
    if (!snapshot) return;
    setRestoring(true);
    setError(null);

    try {
      const res = await restoreSnapshot(snapshot, { mode: restoreMode });
      setResult(res);
      onRestored?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restoration failed");
    } finally {
      setRestoring(false);
    }
  };

  const manifest = snapshot?.manifest;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "540px",
          background: "#18181c",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "14px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "rgba(99, 102, 241, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#818cf8",
              }}
            >
              <Cloud size={20} />
            </div>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#ffffff",
                }}
              >
                {t("cloudSync.restoreTitle", "Restore from Cloud Backup")}
              </h3>
              <p
                style={{
                  margin: "2px 0 0 0",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary, #94a3b8)",
                }}
              >
                {t(
                  "cloudSync.restoreSubtitle",
                  "Load worship catalog, broadcast channels, and settings onto this computer"
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={restoring}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {loading ? (
            <div style={{ padding: "2.5rem 0", textAlign: "center", color: "#94a3b8" }}>
              <RefreshCw size={28} className="spin-animation" style={{ margin: "0 auto 12px" }} />
              <p style={{ margin: 0, fontSize: "0.9rem" }}>
                {t("cloudSync.checkingCloud", "Checking for latest cloud backup...")}
              </p>
            </div>
          ) : error && !snapshot ? (
            <div
              style={{
                padding: "1.25rem",
                borderRadius: 8,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                color: "#fca5a5",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          ) : !snapshot ? (
            <div style={{ padding: "2rem 0", textAlign: "center", color: "#94a3b8" }}>
              <Cloud size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
              <h4 style={{ margin: "0 0 6px 0", color: "#f8fafc" }}>
                {t("cloudSync.noBackupsFound", "No Cloud Backups Found")}
              </h4>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
                {t(
                  "cloudSync.noBackupsFoundDesc",
                  "Back up this computer first, or ensure you are logged into the same church account."
                )}
              </p>
            </div>
          ) : result ? (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <CheckCircle size={44} style={{ color: "#22c55e", margin: "0 auto 12px" }} />
              <h4 style={{ margin: "0 0 8px 0", color: "#ffffff", fontSize: "1.15rem" }}>
                {t("cloudSync.restoreSuccess", "Restoration Complete!")}
              </h4>
              <p style={{ margin: "0 0 16px 0", fontSize: "0.875rem", color: "#94a3b8" }}>
                {t(
                  "cloudSync.restoreSummaryText",
                  "Successfully loaded {{songs}} songs, {{profiles}} broadcast profiles, and settings into this computer.",
                  {
                    songs: result.restoredCounts.worshipSongs,
                    profiles: result.restoredCounts.broadcastProfiles,
                  }
                )}
              </p>
              <button
                className="action-btn btn-primary"
                onClick={() => {
                  onClose();
                  window.location.reload();
                }}
                style={{
                  background: "#4f46e5",
                  color: "#fff",
                  padding: "0.6rem 1.5rem",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                }}
              >
                {t("cloudSync.doneReload", "Done (Refresh App)")}
              </button>
            </div>
          ) : (
            <>
              {/* Snapshot Info Card */}
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderRadius: 10,
                  background: "#202026",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                    {t("cloudSync.sourceDevice", "Source Machine:")}
                  </span>
                  <strong style={{ fontSize: "0.85rem", color: "#ffffff" }}>
                    {manifest?.deviceName || "Media Laptop"}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                    {t("cloudSync.backupDate", "Backup Timestamp:")}
                  </span>
                  <span style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
                    {manifest?.createdAt ? new Date(manifest.createdAt).toLocaleString() : "Recent"}
                  </span>
                </div>
              </div>

              {/* Items Breakdown Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: 8,
                    background: "rgba(34, 197, 94, 0.08)",
                    border: "1px solid rgba(34, 197, 94, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                  }}
                >
                  <Music size={18} style={{ color: "#4ade80" }} />
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Worship Songs</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" }}>
                      {manifest?.counts.worshipSongs || 0} Songs
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: 8,
                    background: "rgba(99, 102, 241, 0.08)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                  }}
                >
                  <Radio size={18} style={{ color: "#818cf8" }} />
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Broadcast Engine</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" }}>
                      {manifest?.counts.broadcastProfiles || 0} Profiles (
                      {manifest?.counts.broadcastChannels || 0} Ch)
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: 8,
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                  }}
                >
                  <FileText size={18} style={{ color: "#fbbf24" }} />
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Preacher Notes</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" }}>
                      {manifest?.counts.notesCount || 0} Notes
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: 8,
                    background: "rgba(168, 85, 247, 0.08)",
                    border: "1px solid rgba(168, 85, 247, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                  }}
                >
                  <Paintbrush size={18} style={{ color: "#c084fc" }} />
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Church Branding</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" }}>
                      Themes & OBS
                    </div>
                  </div>
                </div>
              </div>

              {/* Mode Selection */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    fontSize: "0.85rem",
                    color: "#f8fafc",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === "merge"}
                    onChange={() => setRestoreMode("merge")}
                  />
                  <span>
                    <strong>Merge with local catalog</strong> (Recommended — keeps any songs added on
                    this computer)
                  </span>
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    fontSize: "0.85rem",
                    color: "#cbd5e1",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === "replace"}
                    onChange={() => setRestoreMode("replace")}
                  />
                  <span>
                    <strong>Replace local catalog</strong> (Overwrites local data with exact cloud backup)
                  </span>
                </label>
              </div>

              {error && (
                <div style={{ color: "#ef4444", fontSize: "0.85rem" }}>
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  marginTop: "0.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={restoring}
                  style={{
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    padding: "0.6rem 1.25rem",
                    borderRadius: 8,
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("common.cancel", "Cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={restoring}
                  style={{
                    background: "#4f46e5",
                    border: "none",
                    color: "#ffffff",
                    padding: "0.6rem 1.4rem",
                    borderRadius: 8,
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: restoring ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {restoring ? (
                    <>
                      <RefreshCw size={15} className="spin-animation" />
                      <span>{t("cloudSync.restoring", "Restoring...")}</span>
                    </>
                  ) : (
                    <>
                      <Layers size={15} />
                      <span>{t("cloudSync.confirmRestore", "Restore from Cloud")}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
