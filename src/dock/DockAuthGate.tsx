import { useState, useEffect, useCallback, type ReactNode } from "react";
import { getUserScopedKey } from "../services/userScopedStorage";
import { DEFAULT_PLAN_CONFIG } from "../services/planConfigTypes";

/**
 * Auth gate for the OBS Dock.
 * Reads deviceId from the URL query params (embedded by the desktop app),
 * then verifies it against the local overlay server's auth session.
 * The Tauri app syncs its auth session to the overlay server via POST /api/auth/session,
 * so the dock can verify locally without needing internet access.
 */

const ONLINE_API = "https://api.makechurcheasy.creatorstudioslabs.stream";

/**
 * Check the local overlay server for an active auth session.
 * Returns true if the overlay server has a stored deviceId (set by the Tauri app).
 * Also extracts the plan from the full session and stores it for entitlement checks.
 */
async function checkLocalAuth(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/status", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const hasDevice = data.deviceId != null && String(data.deviceId).trim() !== "";
      if (hasDevice && data.user?.plan) {
        // Trial users get pro-tier entitlements regardless of their base plan.
        const trialActive = data.user.trial?.active
          && data.user.trial?.endsAt
          && Date.now() < new Date(data.user.trial.endsAt).getTime();
        const effectivePlan = trialActive ? "pro" : data.user.plan;

        try {
          localStorage.setItem(getUserScopedKey("ocs-dock-plan"), effectivePlan);
        } catch { /* ignore */ }

        if (data.user?.entitlements) {
          const entitlements = trialActive
            ? (DEFAULT_PLAN_CONFIG.plans.pro?.entitlements as unknown as Record<string, number | boolean>) || data.user.entitlements
            : data.user.entitlements;
          try {
            localStorage.setItem(getUserScopedKey("ocs-dock-entitlements"), JSON.stringify(entitlements));
          } catch { /* ignore */ }
        }
      }
      return hasDevice;
    }
  } catch {
    // Overlay server not reachable
  }
  return false;
}

/**
 * Verify device against the online backend API (fallback).
 * Also fetches and stores the plan from the device profile.
 */
async function checkDeviceOnline(deviceId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${ONLINE_API}/api/device/check?deviceId=${encodeURIComponent(deviceId)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.exists === true) {
        // Fetch the full profile to get the plan
        try {
          const profileRes = await fetch(
            `${ONLINE_API}/api/device/profile?deviceId=${encodeURIComponent(deviceId)}`
          );
          if (profileRes.ok) {
            const profile = await profileRes.json();
            if (profile.user?.plan) {
              try {
                localStorage.setItem(getUserScopedKey("ocs-dock-plan"), profile.user.plan);
              } catch { /* ignore */ }
            }
          }
        } catch { /* profile fetch failed — still authenticated */ }
        return true;
      }
    }
  } catch {
    // Network error — fail closed
  }
  return false;
}

function getDeviceIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("deviceId");
}

export default function DockAuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const checkAuth = useCallback(async (attempt = 0) => {
    const deviceId = getDeviceIdFromUrl();
    if (!deviceId) {
      // No deviceId in URL — can't verify
      setAuthed(false);
      setReady(true);
      return;
    }

    // 1) Try local overlay server first (works offline)
    const localOk = await checkLocalAuth();
    if (localOk) {
      setAuthed(true);
      setReady(true);
      setFailedAttempts(0);
      return;
    }

    // 2) Fallback: verify against the online API (requires internet)
    const onlineOk = await checkDeviceOnline(deviceId);
    if (onlineOk) {
      setAuthed(true);
      setReady(true);
      setFailedAttempts(0);
      return;
    }

    setFailedAttempts((prev) => prev + 1);

    // Retry up to 3 times with backoff
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return checkAuth(attempt + 1);
    }

    setAuthed(false);
    setReady(true);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Auto-poll every 3s while blocked (max 3 attempts)
  useEffect(() => {
    if (authed || !ready || failedAttempts >= 3) return;
    const id = setInterval(() => checkAuth(), 3000);
    return () => clearInterval(id);
  }, [authed, ready, checkAuth, failedAttempts]);

  // Re-check auth every 30s while authenticated (detects logout from main app)
  // Only checks locally — the online fallback is for initial auth when the
  // overlay server is unreachable, not for re-auth after logout.
  useEffect(() => {
    if (!authed || !ready) return;
    const id = setInterval(async () => {
      const stillAuthed = await checkLocalAuth();
      if (!stillAuthed) {
        setAuthed(false);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [authed, ready]);

  if (!ready) {
    return (
      <div className="dock-auth-loading">
        <div className="dock-auth-spinner" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="dock-auth-blocked">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h2>Authentication Required</h2>
        <p>Please open the MakeChurchEasy desktop app and log in first.</p>
        <button className="dock-auth-refresh" onClick={() => window.location.reload()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Refresh
        </button>
        <p className="dock-auth-hint">The dock will auto-detect when you log in.</p>
      </div>
    );
  }

  return <>{children}</>;
}
