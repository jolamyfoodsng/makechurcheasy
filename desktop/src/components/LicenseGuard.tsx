/**
 * LicenseGuard.tsx — License Enforcement UI
 *
 * Wraps the application and renders a full-screen lock screen whenever
 * the license guard determines the app should be locked.
 *
 * No page should implement its own subscription/trial logic.
 * Every protected feature simply checks licenseGuard.isUnlocked().
 *
 * This component:
 *   1. Initializes the license guard on mount
 *   2. Subscribes to state changes
 *   3. Renders a blocking lock screen when validation fails
 *   4. Provides retry, manage subscription, and quit actions
 *   5. Traps focus and blocks Escape key to prevent bypass
 */

import { type ReactNode, useEffect, useRef, useCallback, useState } from "react";
import {
  useLicenseGuardState,
  getLockScreenConfig,
  retryVerification,
  disconnectOtherDevicesAndUnlock,
  hasPendingDowngradeNotification,
  markDowngradeNotified,
  type LockReason,
} from "@/services/licenseGuard";
import { getDashboardBaseForAuth } from "@/services/authService";
import ForcedUpdateOverlay from "./ForcedUpdateOverlay";
import {
  getForcedUpdateState,
  refreshAppSettings,
  type ForcedUpdateState,
} from "../services/forcedUpdateService";
import { useAuth } from "@/contexts/AuthContext";
import Icon from "./Icon";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheazy.com";

interface LicenseGuardProps {
  children: ReactNode;
}

const CURRENT_APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

/**
 * Version-gate responses happen before the license payload is returned, so
 * the license guard cannot use the normal license retry screen to update.
 * Reuse the real updater overlay instead and load the admin download settings
 * so Update Now can install the configured release.
 */
function ForcedUpgradeScreen() {
  const [state, setState] = useState<ForcedUpdateState>(() => ({
    blocked: true,
    active: true,
    lockType: "forced-update",
    requiredVersion: "",
    hoursRemaining: null,
    gracePeriodHours: null,
    startedAt: null,
    lockAt: null,
    updateMessage: "A mandatory update is required to continue using MakeChurchEasy.",
    currentVersion: CURRENT_APP_VERSION,
    downloadUrl: "",
    releaseNotesUrl: "",
    loading: true,
  }));

  useEffect(() => {
    let mounted = true;
    void refreshAppSettings().then((settings) => {
      if (!mounted) return;
      const next = getForcedUpdateState(settings, CURRENT_APP_VERSION);
      setState({
        ...next,
        blocked: true,
        active: true,
        lockType: "forced-update",
        hoursRemaining: null,
        gracePeriodHours: null,
        loading: false,
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  return <ForcedUpdateOverlay state={state} />;
}

export default function LicenseGuard({ children }: LicenseGuardProps) {
  const { unlocked, lockReason, payload, verifying, daysOffline, offlineWarning } = useLicenseGuardState();
  const [showDowngradeBanner, setShowDowngradeBanner] = useState(false);
  const [showDeviceLimitPreview, setShowDeviceLimitPreview] = useState(false);

  useEffect(() => {
    (window as any).__triggerDeviceLimitModal = () => setShowDeviceLimitPreview(true);
    return () => {
      delete (window as any).__triggerDeviceLimitModal;
    };
  }, []);

  // Automatically retry verification when internet reconnects
  useEffect(() => {
    const handleOnline = () => {
      void retryVerification();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const handleRetry = async () => {
    await retryVerification();
  };

  const handleManageSubscription = async () => {
    const url = `${getDashboardBaseForAuth()}/subscription/plans`;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  useEffect(() => {
    if (unlocked && hasPendingDowngradeNotification()) {
      setShowDowngradeBanner(true);
    } else {
      setShowDowngradeBanner(false);
    }
  }, [unlocked, payload]);

  const dismissDowngradeBanner = () => {
    markDowngradeNotified();
    setShowDowngradeBanner(false);
  };

  return (
    <>
      {children}
      {offlineWarning && unlocked && (
        <div className="license-offline-warning-banner" role="alert">
          <div className="license-offline-warning-banner__icon" aria-hidden="true">
            <Icon name="wifi_off" size={18} />
          </div>
          <div className="license-offline-warning-banner__content">
            <p className="license-offline-warning-banner__title">Connect to the internet</p>
            <p className="license-offline-warning-banner__description">
              You have not connected to the internet for {daysOffline} days. Please connect to the internet soon to keep MakeChurchEasy verified and synchronized.
            </p>
          </div>
          <div className="license-offline-warning-banner__actions">
            <button
              type="button"
              onClick={handleRetry}
              disabled={verifying}
              className="license-offline-warning-banner__action"
            >
              {verifying ? "Checking…" : "Check Connection"}
            </button>
          </div>
        </div>
      )}
      {showDowngradeBanner && (
        <div className="license-downgrade-banner" role="alert">
          <div className="license-downgrade-banner__icon" aria-hidden="true">
            <Icon name="info" size={18} />
          </div>
          <div className="license-downgrade-banner__content">
            <p className="license-downgrade-banner__title">Your account is now on the Free plan</p>
            <p className="license-downgrade-banner__description">
              Your paid subscription has ended. Premium features and higher limits are now
              unavailable until you upgrade again.
            </p>
          </div>
          <div className="license-downgrade-banner__actions">
            <button
              type="button"
              onClick={handleManageSubscription}
              className="license-downgrade-banner__action"
            >
              Restore Premium Access
            </button>
            <button
              type="button"
              onClick={dismissDowngradeBanner}
              aria-label="Dismiss downgrade notice"
              className="license-downgrade-banner__dismiss"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      )}
      {showDeviceLimitPreview ? (
        <LicenseLockScreen
          reason="too_many_devices"
          payload={
            payload && payload.otherDevices?.length
              ? payload
              : {
                  plan: "free",
                  maxDevices: 1,
                  deviceCount: 2,
                  otherDevices: [
                    {
                      deviceId: "vc_media_pc",
                      deviceName: "Media PC",
                      lastSeen: new Date().toISOString(),
                    },
                  ],
                }
          }
          verifying={verifying}
          onDismiss={() => setShowDeviceLimitPreview(false)}
        />
      ) : !unlocked && lockReason === "forced_upgrade" ? (
        <ForcedUpgradeScreen />
      ) : !unlocked ? (
        <LicenseLockScreen
          reason={lockReason}
          payload={payload}
          verifying={verifying}
        />
      ) : null}
    </>
  );
}

// ── Lock Screen ──────────────────────────────────────────────────────────────

function LicenseLockScreen({
  reason,
  payload,
  verifying,
  onDismiss,
}: {
  reason: LockReason;
  payload: any;
  verifying: boolean;
  onDismiss?: () => void;
}) {
  const config = getLockScreenConfig(reason, payload);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { logout } = useAuth();
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // A maintenance lock is temporary and controlled by the admin. Recheck on our
  // own so the screen clears soon after the lock is switched off, instead of
  // waiting for the 6-hour background check or a manual Retry.
  useEffect(() => {
    if (reason !== "maintenance") return;
    const id = window.setInterval(() => {
      void retryVerification();
    }, 40_000);
    return () => window.clearInterval(id);
  }, [reason]);

  const handleRetry = async () => {
    setActionError(null);
    await retryVerification();
  };

  const handleDisconnectOthers = async () => {
    setDisconnecting(true);
    setActionError(null);
    try {
      const res = await disconnectOtherDevicesAndUnlock();
      if (!res.success) {
        if (onDismiss) {
          setTimeout(() => {
            setDisconnecting(false);
            onDismiss();
          }, 600);
          return;
        }
        setActionError(res.error || "Failed to log out other computer. Please try again.");
      } else if (onDismiss) {
        onDismiss();
      }
    } catch (err: any) {
      if (onDismiss) {
        setTimeout(() => {
          setDisconnecting(false);
          onDismiss();
        }, 600);
        return;
      }
      setActionError(err?.message || "Failed to log out other computer.");
    } finally {
      if (!onDismiss) {
        setDisconnecting(false);
      }
    }
  };

  const handleManageSubscription = async () => {
    const url = `${getDashboardBaseForAuth()}/subscription/plans`;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleContactSupport = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(`${API_BASE}/support`);
    } catch {
      window.open(`${API_BASE}/support`, "_blank");
    }
  };

  const handleManageDevices = async () => {
    const url = `${getDashboardBaseForAuth()}/devices`;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleQuit = async () => {
    if (onDismiss) {
      onDismiss();
      return;
    }
    try {
      const { exit } = await import("@tauri-apps/plugin-process");
      await exit(0);
    } catch {
      // Not in Tauri — close the window
      window.close();
    }
  };

  // Focus trap + keyboard handler
  const getFocusableElements = useCallback(() => {
    if (!overlayRef.current) return [];
    return Array.from(
      overlayRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }, []);

  // Auto-focus the first button when lock screen appears
  useEffect(() => {
    const timer = setTimeout(() => {
      const els = getFocusableElements();
      if (els.length > 0) els[0].focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [getFocusableElements, reason]);

  // Focus trap + Escape block
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Block Escape — user must use Quit button
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Trap Tab inside the modal
      if (e.key === "Tab") {
        const els = getFocusableElements();
        if (els.length === 0) {
          e.preventDefault();
          return;
        }
        const first = els[0];
        const last = els[els.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: wrap from first to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: wrap from last to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [getFocusableElements]);

  return (
    <div
      ref={overlayRef}
      className="license-guard-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={config.title}
    >
      <div className="license-guard-modal">
        <div className="license-guard-banner">
          <Icon
            name={
              reason === "internet_required"
                ? "wifi_off"
                : reason === "too_many_devices" || reason === "device_disconnected_by_other"
                ? "devices"
                : reason === "maintenance"
                ? "schedule"
                : "lock"
            }
            size={16}
          />
          <span>
            {reason === "internet_required"
              ? "Internet Connection Required"
              : reason === "too_many_devices"
              ? "Device Limit Check"
              : reason === "device_disconnected_by_other"
              ? "Session Switched"
              : reason === "maintenance"
              ? "Maintenance"
              : "License Verification"}
          </span>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="license-guard-banner__dismiss"
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: "#fca5a5",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 4px",
                borderRadius: "4px",
              }}
              title="Close Preview"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <div className="license-guard-header">
          <div className="license-guard-icon-wrapper">
            <Icon name={config.icon} size={32} />
          </div>
          <p className="license-guard-eyebrow">
            {reason === "too_many_devices"
              ? payload?.plan === "free" || payload?.maxDevices === 1
                ? "Free Plan • 1 Computer Limit"
                : "Device Limit Reached"
              : reason === "device_disconnected_by_other"
              ? "Session Transferred to Another Device"
              : reason === "internet_required"
              ? "Offline limit reached (3 weeks offline)"
              : reason === "maintenance"
              ? "Checking again automatically"
              : "Access to MakeChurchEasy is currently blocked"}
          </p>
          <h2 className="license-guard-title">{config.title}</h2>
        </div>

        <div className="license-guard-body">
          <p className="license-guard-description">{config.description}</p>

          {actionError && (
            <div className="license-guard-error-box" role="alert">
              <Icon name="error" size={16} />
              <span>{actionError}</span>
            </div>
          )}

          {verifying && (
            <div className="license-guard-verifying" aria-live="polite">
              <div className="license-guard-spinner" />
              <span>{reason === "internet_required" ? "Checking internet connection…" : "Verifying your license…"}</span>
            </div>
          )}

          <div className="license-guard-actions">
            {config.primaryAction === "disconnect_others" ? (
              <>
                <button
                  type="button"
                  className="license-guard-button license-guard-button--primary"
                  onClick={handleDisconnectOthers}
                  disabled={disconnecting || verifying}
                >
                  <Icon
                    name={disconnecting ? "refresh" : "logout"}
                    size={18}
                    className={disconnecting ? "license-guard-spinner-icon" : ""}
                  />
                  {disconnecting ? "Logging out other computer…" : config.primaryLabel}
                </button>

                <button
                  type="button"
                  className="license-guard-button license-guard-button--secondary"
                  onClick={handleManageSubscription}
                >
                  <Icon name="crown" size={18} />
                  Upgrade Plan (Use Multiple Computers)
                </button>

                <button
                  type="button"
                  className="license-guard-button license-guard-button--secondary"
                  onClick={() => logout()}
                >
                  <Icon name="user" size={18} />
                  Sign Out This Computer
                </button>

                <button
                  type="button"
                  className="license-guard-button license-guard-button--ghost"
                  onClick={handleQuit}
                >
                  Quit Application
                </button>
              </>
            ) : config.primaryAction === "reconnect" ? (
              <>
                <button
                  type="button"
                  className="license-guard-button license-guard-button--primary"
                  onClick={() => logout()}
                >
                  <Icon name="login" size={18} />
                  Sign In & Use Here
                </button>

                <button
                  type="button"
                  className="license-guard-button license-guard-button--secondary"
                  onClick={handleManageSubscription}
                >
                  <Icon name="crown" size={18} />
                  Upgrade Plan (Use Multiple Computers)
                </button>

                <button
                  type="button"
                  className="license-guard-button license-guard-button--ghost"
                  onClick={handleQuit}
                >
                  Quit Application
                </button>
              </>
            ) : (
              <>
                {config.primaryAction === "retry" && (
                  <button
                    type="button"
                    className="license-guard-button license-guard-button--primary"
                    onClick={handleRetry}
                    disabled={verifying}
                  >
                    <Icon name="refresh" size={18} />
                    {config.primaryLabel}
                  </button>
                )}

                {config.primaryAction === "subscribe" && (
                  <button
                    type="button"
                    className="license-guard-button license-guard-button--primary"
                    onClick={handleManageSubscription}
                  >
                    <Icon name="open_in_new" size={18} />
                    {config.primaryLabel}
                  </button>
                )}

                {config.primaryAction === "manage_devices" && (
                  <button
                    type="button"
                    className="license-guard-button license-guard-button--primary"
                    onClick={handleManageDevices}
                  >
                    <Icon name="devices" size={18} />
                    {config.primaryLabel}
                  </button>
                )}

                {config.primaryAction === "contact_support" && (
                  <button
                    type="button"
                    className="license-guard-button license-guard-button--primary"
                    onClick={handleContactSupport}
                  >
                    <Icon name="support_agent" size={18} />
                    {config.primaryLabel}
                  </button>
                )}

                {config.primaryAction !== "retry" && (
                  <button
                    type="button"
                    className="license-guard-button license-guard-button--secondary"
                    onClick={handleRetry}
                    disabled={verifying}
                  >
                    <Icon name="refresh" size={18} />
                    Retry Verification
                  </button>
                )}

                {reason !== "maintenance" && (
                  <button
                    type="button"
                    className="license-guard-button license-guard-button--secondary"
                    onClick={() => logout()}
                  >
                    <Icon name="logout" size={18} />
                    Sign Out & Reconnect
                  </button>
                )}

                <button
                  type="button"
                  className="license-guard-button license-guard-button--ghost"
                  onClick={handleQuit}
                >
                  Quit Application
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
