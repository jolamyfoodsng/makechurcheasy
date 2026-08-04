import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
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
const DOCK_AUTH_USER_ID_KEY = "mce-dock-auth-user-id";

type LocalAuthStatus = "authenticated" | "unauthenticated" | "unreachable";

function clearDockAuthCache(): void {
  try {
    localStorage.removeItem(getUserScopedKey(PLAN_KEY));
    localStorage.removeItem(getUserScopedKey(ENTITLEMENTS_KEY));
    localStorage.removeItem(DOCK_AUTH_USER_ID_KEY);
  } catch {
    // ignore localStorage failures
  }
}

function storeDockAuthUserId(userId: unknown): void {
  if (typeof userId !== "string" || !userId.trim()) return;
  try {
    localStorage.setItem(DOCK_AUTH_USER_ID_KEY, userId.trim());
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
      !expectedDeviceId || !sessionDeviceId || sessionDeviceId === expectedDeviceId;
    const hasLocalSession = data.authenticated === true && Boolean(data.user);

    // Older overlay/session writers did not include deviceId in the status
    // payload. The local server is already bound to this desktop, so a valid
    // authenticated session is sufficient when that field is absent. A URL
    // deviceId is still enforced whenever both sides provide one.
    if (data.authenticated === false || !hasLocalSession || !hasMatchingDevice) {
      clearDockAuthCache();
      return "unauthenticated";
    }

    storeDockAuthUserId(data.user?.id);

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
      `${ONLINE_API}/api/device/bootstrap?deviceId=${encodeURIComponent(deviceId)}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const data = await res.json();
      const profile = data?.account?.user;
      if (profile?.plan) {
        storeDockAuthUserId(profile.id);
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
  const authCheckInFlightRef = useRef<Promise<void> | null>(null);

  const checkAuth = useCallback(async () => {
    if (authCheckInFlightRef.current) return authCheckInFlightRef.current;

    const run = (async () => {
      // Retry the local handoff before showing the blocked state. This is
      // important on Windows, where OBS can load the dock before the Tauri
      // webview has finished posting its restored session.
      for (let attempt = 0; attempt <= 3; attempt += 1) {
        // Try the local session first (no URL parameter needed), then support
        // legacy OBS dock URLs that still embed ?deviceId=.
        const deviceId = (await getDeviceIdFromSession()) || getDeviceIdFromUrl() || "";

        // 1) Try the local overlay server first (works offline).
        const localStatus = await checkLocalAuth(deviceId);
        if (localStatus === "authenticated") {
          setAuthed(true);
          setReady(true);
          return;
        }

        // 2) If a device id is available, verify it against the backend too.
        // This recovers from a stale/missed local session without requiring a
        // new pairing or asking the user to reinstall the dock.
        if (!isTestEnv && deviceId) {
          const onlineOk = await checkDeviceOnline(deviceId);
          if (onlineOk) {
            setAuthed(true);
            setReady(true);
            return;
          }
        }

        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
        }
      }

      setAuthed(false);
      setReady(true);
    })();

    authCheckInFlightRef.current = run;
    try {
      await run;
    } finally {
      if (authCheckInFlightRef.current === run) authCheckInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Auto-poll while blocked so a session restored by the desktop app unlocks
  // an already-open OBS dock without a manual reload.
  useEffect(() => {
    if (authed || !ready) return;
    const id = setInterval(() => void checkAuth(), 5_000);
    const retryOnFocus = () => void checkAuth();
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") retryOnFocus();
    };
    window.addEventListener("focus", retryOnFocus);
    window.addEventListener("online", retryOnFocus);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", retryOnFocus);
      window.removeEventListener("online", retryOnFocus);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
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
        void checkAuth();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [authed, ready, checkAuth]);

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
