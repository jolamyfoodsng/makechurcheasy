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

import { type ReactNode, useEffect, useRef, useCallback } from "react";
import {
  useLicenseGuardState,
  getLockScreenConfig,
  retryVerification,
  type LockReason,
} from "@/services/licenseGuard";
import Icon from "./Icon";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

interface LicenseGuardProps {
  children: ReactNode;
}

export default function LicenseGuard({ children }: LicenseGuardProps) {
  const { unlocked, lockReason, payload, verifying } = useLicenseGuardState();

  // Always render children — the lock screen overlays on top
  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <LicenseLockScreen
        reason={lockReason}
        payload={payload}
        verifying={verifying}
      />
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

  const handleManageSubscription = () => {
    // Open the web dashboard subscription page
    window.open(`${API_BASE}/dashboard/billing`, "_blank");
  };

  const handleContactSupport = () => {
    window.open(`${API_BASE}/support`, "_blank");
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
        {/* Banner */}
        <div className="license-guard-banner">
          <Icon name="lock" size={16} />
          <span>License Verification</span>
        </div>

        {/* Header */}
        <div className="license-guard-header">
          <div className="license-guard-icon-wrapper">
            <Icon name={config.icon} size={32} />
          </div>
          <h2 className="license-guard-title">{config.title}</h2>
        </div>

        {/* Body */}
        <div className="license-guard-body">
          <p className="license-guard-description">{config.description}</p>

          {/* Verifying state */}
          {verifying && (
            <div className="license-guard-verifying">
              <div className="license-guard-spinner" />
              <span>Verifying your license…</span>
            </div>
          )}

          {/* Actions */}
          <div className="license-guard-actions">
            {/* Primary action */}
            {config.primaryAction === "retry" && (
              <button
                className="license-guard-button license-guard-button--primary"
                onClick={handleRetry}
                disabled={verifying}
               title="Refresh">
                <Icon name="refresh" size={18} />
                {config.primaryLabel}
              </button>
            )}

            {config.primaryAction === "subscribe" && (
              <button
                className="license-guard-button license-guard-button--primary"
                onClick={handleManageSubscription}
               title="Open">
                <Icon name="open_in_new" size={18} />
                {config.primaryLabel}
              </button>
            )}

            {config.primaryAction === "contact_support" && (
              <button
                className="license-guard-button license-guard-button--primary"
                onClick={handleContactSupport}
               title="support_agent">
                <Icon name="support_agent" size={18} />
                {config.primaryLabel}
              </button>
            )}

            {/* Secondary: retry (always available for non-retry primary) */}
            {config.primaryAction !== "retry" && (
              <button
                className="license-guard-button license-guard-button--secondary"
                onClick={handleRetry}
                disabled={verifying}
               title="Retry">
                <Icon name="refresh" size={18} />
                Retry Verification
              </button>
            )}

            {/* Quit */}
            <button
              className="license-guard-button license-guard-button--ghost"
              onClick={handleQuit}
             title="Quit Application">
              Quit Application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
