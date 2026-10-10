/**
 * TrialUnavailableBanner.tsx — explains why an account has no free trial.
 *
 * The server allows one free trial per computer. When a new account signs in
 * on a computer that already used its trial, the account stays on Free and
 * the server returns `trialEligibility.status === "used_on_device"`.
 * Without this notice the user would just see "Free" with no explanation.
 */

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const DISMISS_KEY_PREFIX = "mce.trialUnavailableBanner.dismissed:";

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* storage unavailable — dismiss for this session only */
  }
}

export function TrialUnavailableBanner() {
  const { user } = useAuth();
  const eligibility = user?.trialEligibility;
  const dismissKey = `${DISMISS_KEY_PREFIX}${user?.id || "anon"}:${eligibility?.status || ""}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(dismissKey));

  // Only the desktop-relevant case: "desktop_required" is for the web
  // dashboard, since anyone seeing this banner is already on the desktop.
  if (!user || eligibility?.status !== "used_on_device") return null;
  if (user.trial?.endsAt) return null;
  if (dismissed || readDismissed(dismissKey)) return null;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        margin: "8px 16px 0",
        background: "rgba(123, 104, 238, 0.08)",
        border: "1px solid rgba(123, 104, 238, 0.2)",
        borderRadius: 6,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#7b68ee", flexShrink: 0 }} aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Free trial already used
      </span>
      <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>
        {eligibility.message || "The free trial has already been used on this computer. You're on the Free plan."}
      </span>
      <button
        type="button"
        onClick={() => {
          writeDismissed(dismissKey);
          setDismissed(true);
        }}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-muted)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: 4,
        }}
        title="Dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}

export default TrialUnavailableBanner;
