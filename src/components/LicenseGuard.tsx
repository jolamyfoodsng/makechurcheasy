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
  hasPendingDowngradeNotification,
  markDowngradeNotified,
  type LockReason,
} from "@/services/licenseGuard";
import { getDashboardBaseForAuth } from "@/services/authService";
import Icon from "./Icon";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.creatorstudioslabs.stream";

interface LicenseGuardProps {
  children: ReactNode;
}

export default function LicenseGuard({ children }: LicenseGuardProps) {
  const { unlocked, lockReason, payload, verifying } = useLicenseGuardState();
  const [showDowngradeBanner, setShowDowngradeBanner] = useState(false);

  const handleManageSubscription = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(`${API_BASE}/billing`);
    } catch {
      window.open(`${API_BASE}/billing`, "_blank");
    }
  };

  useEffect(() => {
    if (unlocked && hasPendingDowngradeNotification()) {
      setShowDowngradeBanner(true);
    }
  }, [unlocked]);

  const dismissDowngradeBanner = () => {
    markDowngradeNotified();
    setShowDowngradeBanner(false);
  };

  return (
    <>
      {children}
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
      {!unlocked && (
        <LicenseLockScreen
          reason={lockReason}
          payload={payload}
          verifying={verifying}
        />
      )}
    </>
  );
}

// ── Lock Screen ──────────────────────────────────────────────────────────────

function LicenseLockScreen({
  reason,
  payload,
  verifying,
}: {
  reason: LockReason;
  payload: any;
  verifying: boolean;
}) {
  const config = getLockScreenConfig(reason, payload);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleRetry = async () => {
    await retryVerification();
  };

  const handleManageSubscription = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(`${API_BASE}/billing`);
    } catch {
      window.open(`${API_BASE}/billing`, "_blank");
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
    try {
      const { exit } = await import("@tauri-apps/plugin-process");
      await exit(0);
    } catch {
      // Not in Tauri — close the window
      window.close();
    }
  };

  // BUG 6: Focus trap + keyboard handler
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
    <div ref={overlayRef} className="license-guard-overlay" role="dialog" aria-modal="true" aria-label="License required">
      <div className="license-guard-modal">
        <div className="license-guard-banner">
          <Icon name="lock" size={16} />
          <span>License Verification</span>
        </div>

        <div className="license-guard-header">
          <div className="license-guard-icon-wrapper">
            <Icon name={config.icon} size={32} />
          </div>
          <p className="license-guard-eyebrow">Access to MakeChurchEasy is currently blocked</p>
          <h2 className="license-guard-title">{config.title}</h2>
        </div>

        <div className="license-guard-body">
          <p className="license-guard-description">{config.description}</p>

          {verifying && (
            <div className="license-guard-verifying" aria-live="polite">
              <div className="license-guard-spinner" />
              <span>Verifying your license…</span>
            </div>
          )}

          <div className="license-guard-actions">
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

            <button
              type="button"
              className="license-guard-button license-guard-button--ghost"
              onClick={handleQuit}
            >
              Quit Application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
