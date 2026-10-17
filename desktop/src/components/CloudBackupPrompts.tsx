/**
 * CloudBackupPrompts.tsx — the quiet parts of cloud backup that live outside Settings.
 *
 *  - Starts the Daily / Weekly / Monthly backup scheduler once a paid user is signed in.
 *  - "New device" offer: first sign-in on a computer that has no backup history yet,
 *    when the cloud holds a backup from another device, asks if the last saved content
 *    should be downloaded.
 *  - A small, easy-to-dismiss notice when the cloud storage is nearly full (80%) or full.
 */

import { useCallback, useEffect, useState } from "react";
import { CloudDownload, CheckCircle, AlertTriangle } from "./icons/NativeIcons";
import ModalDialog from "./ModalDialog";
import { useAuth } from "../contexts/AuthContext";
import { canUseCloudSync } from "../services/licenseService";
import { openDashboardSubscriptionPlans } from "../services/subscriptionNavigation";
import {
  CLOUD_SYNC_STATUS_CHANGED_EVENT,
  checkNewDeviceOffer,
  fetchCloudSyncStatus,
  fetchLatestCloudSnapshot,
  markDeviceHandled,
  restoreSnapshot,
  startCloudBackupScheduler,
  type NewDeviceOffer,
} from "../services/cloudSyncService";

const NOTICE_DISMISS_KEY = "mce_cloud_storage_notice_dismissed";

function formatSize(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

// ── New device offer ────────────────────────────────────────────────────────

function NewDeviceRestorePrompt() {
  const { user } = useAuth();
  const [offer, setOffer] = useState<NewDeviceOffer | null>(null);
  const [phase, setPhase] = useState<"ask" | "working" | "done" | "error">("ask");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState("");

  const userId = user?.id;
  useEffect(() => {
    if (!userId || !canUseCloudSync(user)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void checkNewDeviceOffer()
        .then((found) => {
          if (!cancelled && found) setOffer(found);
        })
        .catch(() => {});
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const skip = useCallback(() => {
    markDeviceHandled(); // asked once; Settings > Cloud backup still has "Restore from Cloud"
    setOffer(null);
  }, []);

  const download = useCallback(async () => {
    setPhase("working");
    setMessage("");
    try {
      const snapshot = await fetchLatestCloudSnapshot();
      if (!snapshot) throw new Error("The cloud backup could not be found.");
      await restoreSnapshot(snapshot, {
        mode: "merge",
        includeMedia: true,
        includeFiles: true,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setPhase("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Download failed.");
      setPhase("error");
    }
  }, []);

  if (!offer) return null;

  const from = offer.fromDeviceName ? ` from ${offer.fromDeviceName}` : "";
  const when = offer.updatedAt ? new Date(offer.updatedAt).toLocaleString() : null;

  if (phase === "done") {
    return (
      <ModalDialog
        tone="success"
        icon={<CheckCircle size={26} />}
        title="All set"
        onClose={() => setOffer(null)}
        actions={[{ label: "Reload now", variant: "primary", autoFocus: true, onClick: () => window.location.reload() }]}
      >
        Your last saved content is on this computer. Reload to see everything.
      </ModalDialog>
    );
  }

  if (phase === "error") {
    return (
      <ModalDialog
        tone="warning"
        icon={<AlertTriangle size={26} />}
        title="Could not download"
        onClose={() => setPhase("ask")}
        actions={[
          { label: "Not now", variant: "ghost", onClick: skip },
          { label: "Try again", variant: "primary", autoFocus: true, onClick: () => void download() },
        ]}
      >
        {message}
      </ModalDialog>
    );
  }

  return (
    <ModalDialog
      tone="brand"
      icon={<CloudDownload size={26} />}
      title="Welcome to this computer"
      onClose={phase === "working" ? undefined : skip}
      closeOnBackdrop={false}
      extra={
        phase === "working" && progress && progress.total > 0 ? (
          <div style={{ fontSize: 13, opacity: 0.8 }}>Downloading files {progress.done} of {progress.total}</div>
        ) : undefined
      }
      hint="You can do this later from Settings, under Cloud backup."
      actions={[
        { label: "Not now", variant: "ghost", onClick: skip, disabled: phase === "working" },
        {
          label: phase === "working" ? "Downloading…" : "Download my content",
          variant: "primary",
          autoFocus: true,
          disabled: phase === "working",
          onClick: () => void download(),
        },
      ]}
    >
      We noticed you signed in on a new device. Would you like to download your last saved content from the cloud{from}
      {when ? ` (saved ${when})` : ""}? Your songs, notes, graphics, settings and pictures will be added to this computer.
    </ModalDialog>
  );
}

// ── Storage notice ──────────────────────────────────────────────────────────

function CloudStorageNotice() {
  const { user } = useAuth();
  const [info, setInfo] = useState<{ percent: number; used: number; limit: number } | null>(null);
  const [dismissedLevel, setDismissedLevel] = useState<string | null>(() => {
    try {
      return localStorage.getItem(NOTICE_DISMISS_KEY);
    } catch {
      return null;
    }
  });

  const eligible = Boolean(user && canUseCloudSync(user));
  useEffect(() => {
    if (!eligible) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetchCloudSyncStatus()
        .then((s) => {
          if (cancelled || !s.usage || s.usage.limitBytes <= 0) return;
          setInfo({
            percent: Math.round((s.usage.usedBytes / s.usage.limitBytes) * 100),
            used: s.usage.usedBytes,
            limit: s.usage.limitBytes,
          });
        })
        .catch(() => {});
    };
    const first = setTimeout(load, 8000);
    const interval = setInterval(load, 30 * 60_000);
    window.addEventListener(CLOUD_SYNC_STATUS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
      window.removeEventListener(CLOUD_SYNC_STATUS_CHANGED_EVENT, load);
    };
  }, [eligible]);

  if (!eligible || !info || info.percent < 80) return null;
  const full = info.percent >= 100;
  const level = `${full ? "full" : "near"}:${new Date().toISOString().slice(0, 10)}`;
  if (dismissedLevel === level) return null;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 14px",
        margin: "6px 16px 0",
        fontSize: 12.5,
        color: full ? "#fca5a5" : "#fcd34d",
        background: full ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.07)",
        border: `1px solid ${full ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.22)"}`,
        borderRadius: 6,
      }}
    >
      <span style={{ flex: 1 }}>
        {full
          ? `Your cloud storage is full (${formatSize(info.used)} of ${formatSize(info.limit)}). Pictures and videos are not backed up until you free space or upgrade.`
          : `Your cloud storage is ${info.percent}% full (${formatSize(info.used)} of ${formatSize(info.limit)}).`}
      </span>
      <button
        type="button"
        onClick={() => void openDashboardSubscriptionPlans({ reason: "cloud_storage" })}
        style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", fontSize: 12.5 }}
      >
        See plans
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(NOTICE_DISMISS_KEY, level);
          } catch {
            // ignore
          }
          setDismissedLevel(level);
        }}
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}

// ── Mount point ─────────────────────────────────────────────────────────────

export function CloudBackupPrompts() {
  const { user } = useAuth();
  const paid = Boolean(user && canUseCloudSync(user));
  useEffect(() => {
    if (paid) startCloudBackupScheduler();
  }, [paid]);

  return (
    <>
      <CloudStorageNotice />
      <NewDeviceRestorePrompt />
    </>
  );
}

export default CloudBackupPrompts;
