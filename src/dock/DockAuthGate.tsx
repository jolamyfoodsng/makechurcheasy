import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getUserScopedKey } from "../services/userScopedStorage";
import { DEFAULT_PLAN_CONFIG } from "../services/planConfigTypes";
import {
  getEffectivePlan as resolveCanonicalPlan,
  normalizePlanId,
} from "../lib/subscriptionSourceOfTruth";
import { getEnvConfig } from "../services/envConfig";

/**
 * Auth gate for the OBS Dock.
 * Reads the active device session from the local overlay server, with legacy
 * URL query params retained only for old OBS dock URLs.
 * The Tauri app syncs its auth session to the overlay server via POST /api/auth/session,
 * so the dock can verify locally without needing internet access.
 */

const ENV_CONFIG = getEnvConfig();
const ONLINE_API = ENV_CONFIG.authApiUrl;
const PLAN_KEY = "ocs-dock-plan";
const ENTITLEMENTS_KEY = "ocs-dock-entitlements";

type LocalAuthStatus = "authenticated" | "unauthenticated" | "unreachable";

function clearDockAuthCache(): void {
  try {
    localStorage.removeItem(getUserScopedKey(PLAN_KEY));
    localStorage.removeItem(getUserScopedKey(ENTITLEMENTS_KEY));
  } catch {
    // ignore localStorage failures
  }
}

/**
 * Check the local overlay server for an active auth session.
 * Returns true if the overlay server has a stored deviceId (set by the Tauri app).
 * Also extracts the plan from the full session and stores it for entitlement checks.
 */
async function checkLocalAuth(expectedDeviceId: string): Promise<LocalAuthStatus> {
  try {
    const res = await fetch("/api/auth/status", { cache: "no-store" });
    if (!res.ok) return "unreachable";

    const data = await res.json();
    const sessionDeviceId =
      data.deviceId != null ? String(data.deviceId).trim() : "";
    const hasMatchingDevice =
      sessionDeviceId !== "" && sessionDeviceId === expectedDeviceId;

    if (data.authenticated === false || !hasMatchingDevice) {
      clearDockAuthCache();
      return "unauthenticated";
    }

    if (data.user?.plan) {
      const effectivePlan = normalizePlanId(
        data.user.effectivePlan || resolveCanonicalPlan(data.user as any)
      );

      try {
        localStorage.setItem(getUserScopedKey(PLAN_KEY), effectivePlan);
      } catch { /* ignore */ }

      const entitlements =
        data.user?.entitlements
        || (DEFAULT_PLAN_CONFIG.plans[effectivePlan]?.entitlements as unknown as Record<string, number | boolean> | undefined);

      if (entitlements) {
        try {
          localStorage.setItem(getUserScopedKey(ENTITLEMENTS_KEY), JSON.stringify(entitlements));
        } catch { /* ignore */ }
      }
    }

    return "authenticated";
  } catch {
    // Overlay server not reachable
    return "unreachable";
  }
}

/**
 * Verify device against the online backend API (fallback).
 * Also fetches and stores the plan from the device profile.
 */
async function checkDeviceOnline(deviceId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${ONLINE_API}/api/device/bootstrap?deviceId=${encodeURIComponent(deviceId)}`
    );
    if (res.ok) {
      const data = await res.json();
      const profile = data?.account?.user;
      if (profile?.plan) {
        const effectivePlan = normalizePlanId(
          profile.effectivePlan || resolveCanonicalPlan(profile as any)
        );
        try {
          localStorage.setItem(getUserScopedKey("ocs-dock-plan"), effectivePlan);
        } catch { /* ignore */ }
        if (profile?.entitlements) {
          try {
            localStorage.setItem(getUserScopedKey("ocs-dock-entitlements"), JSON.stringify(profile.entitlements));
          } catch { /* ignore */ }
        }
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

/**
 * Try to get the deviceId from the local overlay server's auth session.
 * This avoids requiring ?deviceId= in the URL — the Tauri app syncs the
 * session before the dock loads, so the deviceId is already available.
 */
async function getDeviceIdFromSession(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/status", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const did = data.deviceId != null ? String(data.deviceId).trim() : "";
    return did || null;
  } catch {
    return null;
  }
}

export default function DockAuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const isTestEnv = ENV_CONFIG.isTest;
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  const checkAuth = useCallback(async (attempt = 0) => {
    // Try session first (no URL parameter needed), fall back to URL for
    // backward compat with old OBS browser sources that embed ?deviceId=
    const deviceId = (await getDeviceIdFromSession()) || getDeviceIdFromUrl();
    if (!deviceId) {
      // No deviceId anywhere — can't verify
      setAuthed(false);
      setReady(true);
      return;
    }

    // 1) Try local overlay server first (works offline)
    const localStatus = await checkLocalAuth(deviceId);
    if (localStatus === "authenticated") {
      setAuthed(true);
      setReady(true);
      return;
    }

    if (localStatus === "unauthenticated") {
      setAuthed(false);
      setReady(true);
      return;
    }

    // 2) Fallback: verify against the online API (requires internet)
    if (!isTestEnv) {
      const onlineOk = await checkDeviceOnline(deviceId);
      if (onlineOk) {
        setAuthed(true);
        setReady(true);
        return;
      }
    }

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

  // Auto-poll every 15s while blocked. Local overlay checks remain frequent;
  // the online fallback is only a safety net when the overlay server is unavailable.
  useEffect(() => {
    if (authed || !ready) return;
    const id = setInterval(() => checkAuth(), 15_000);
    return () => clearInterval(id);
  }, [authed, ready, checkAuth]);

  // Re-check auth every 30s while authenticated (detects logout from main app)
  // Only checks locally — the online fallback is for initial auth when the
  // overlay server is unreachable, not for re-auth after logout.
  useEffect(() => {
    if (!authed || !ready) return;
    const id = setInterval(async () => {
      const stillAuthed = await checkLocalAuth(
        (await getDeviceIdFromSession()) || getDeviceIdFromUrl() || "",
      );
      if (stillAuthed !== "authenticated") {
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
        <h2>{t('auth.title')}</h2>
        <p>
          {isTestEnv
            ? "Please open MakeChurchEasy Test on this computer and sign in there first."
            : t('auth.description')}
        </p>
        <button className="dock-auth-refresh" onClick={() => window.location.reload()} title={t('auth.refresh')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {t('auth.refresh')}
        </button>
        <p className="dock-auth-hint">{t('auth.autoDetect')}</p>
      </div>
    );
  }

  return <>{children}</>;
}
