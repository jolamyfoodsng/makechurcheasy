import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  getStoredUser,
  isAuthenticated,
  getSession,
  logout as authLogout,
  refreshPlanFromServer,
  syncSessionToOverlay,
  type AuthUser,
} from "@/services/authService";
import { syncCreditsWithBackend } from "@/services/credits";
import { resetFavoriteThemeCaches } from "@/services/favoriteThemes";
import { clearAllUserScopedStorage } from "@/services/userScopedStorage";
import { resetLicenseGuard } from "@/services/licenseGuard";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  logout: () => void;
  refreshUser: () => void;
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(() => isAuthenticated());
  const [isAdmin, setIsAdmin] = useState(() => getStoredUser()?.role === "admin");
  const consecutiveFailuresRef = useRef(0);
  const visibilityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshUser = useCallback(() => {
    const stored = getStoredUser();
    setUserState(stored);
    setAuthenticated(isAuthenticated());
    setIsAdmin(stored?.role === "admin");
    setLoading(false);
    // Re-sync session to overlay server so the OBS dock can see it
    if (stored) syncSessionToOverlay(getSession());
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  function setUser(u: AuthUser) {
    setUserState(u);
    setAuthenticated(isAuthenticated());
    setIsAdmin(u.role === "admin");
  }

  function logout() {
    // Reset license guard first while session is still available
    // so getUserScopedKey can resolve the correct user-scoped key
    resetLicenseGuard();
    authLogout();
    resetFavoriteThemeCaches();
    clearAllUserScopedStorage();
    setUserState(null);
    setAuthenticated(false);
  }

  // Verify device still exists on server + keep lastSeen fresh
  useEffect(() => {
    if (!authenticated) return;

    const APP_VERSION: string =
      typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

    // ── Grace period & retry constants ──────────────────────────────────────
    // On first connect the device may not have fully replicated in MongoDB yet,
    // or the server may still be cold.  Give it time before we treat
    // `exists: false` as a hard logout.
    const STARTUP_GRACE_MS = 15_000;          // 15 s — no logout during this window
    const CHECK_RETRY_ATTEMPTS = 3;           // retries on exists:false before logout
    const CHECK_RETRY_DELAY_MS = 3_000;      // 3 s between retries
    const REQUIRED_FAILURES_TO_LOGOUT = 2;    // require 2+ consecutive failed cycles
    const VISIBILITY_DEBOUNCE_MS = 5_000;     // 5 s debounce on visibility change
    const mountTimestamp = Date.now();

    async function checkDevice(): Promise<boolean> {
      const session = getSession();
      if (!session?.deviceId) {
        console.debug("[AuthContext] checkDevice: no session/deviceId — skipping");
        return false;
      }
      if (session.deviceId === "dev-browser") return false;

      const duringGracePeriod = Date.now() - mountTimestamp < STARTUP_GRACE_MS;

      for (let attempt = 1; attempt <= CHECK_RETRY_ATTEMPTS; attempt++) {
        try {
          const res = await fetch(
            `${API_BASE}/api/device/check?deviceId=${encodeURIComponent(session.deviceId)}`,
            { headers: { "X-App-Version": APP_VERSION } }
          );

          // Server rejected this version — only force logout after grace period
          if (res.status === 403) {
            const body = await res.json().catch(() => ({}));
            if (body.error === "VERSION_TOO_OLD") {
              if (duringGracePeriod) {
                console.warn(
                  "[AuthContext] checkDevice: VERSION_TOO_OLD during startup grace — deferring logout",
                );
                return true; // treat as OK during grace
              }
              console.warn("[AuthContext] checkDevice: VERSION_TOO_OLD — forcing logout");
              logout();
              return false;
            }
          }

          if (res.ok) {
            const { exists } = await res.json();
            if (exists) {
              consecutiveFailuresRef.current = 0; // reset on success
              return true;
            }

            // exists === false — retry unless this is the last attempt
            console.warn(
              `[AuthContext] checkDevice: device exists=false (attempt ${attempt}/${CHECK_RETRY_ATTEMPTS}, grace=${duringGracePeriod})`,
            );
            if (attempt < CHECK_RETRY_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, CHECK_RETRY_DELAY_MS));
              continue;
            }

            // Final attempt failed — only logout after grace period AND consecutive failures
            if (duringGracePeriod) {
              console.warn(
                "[AuthContext] checkDevice: exists=false during startup grace — skipping logout this cycle",
              );
              return true; // don't kill the session during grace
            }

            consecutiveFailuresRef.current += 1;
            if (consecutiveFailuresRef.current < REQUIRED_FAILURES_TO_LOGOUT) {
              console.warn(
                `[AuthContext] checkDevice: exists=false — failure ${consecutiveFailuresRef.current}/${REQUIRED_FAILURES_TO_LOGOUT} (will retry next cycle)`,
              );
              return true; // don't logout yet
            }

            console.warn("[AuthContext] checkDevice: exists=false after retries — forcing logout");
            logout();
            return false;
          }
        } catch (err) {
          // Network error — skip (don't retry network failures, just skip this cycle)
          console.debug("[AuthContext] checkDevice: network error — skipping", err);
          return true;
        }
      }
      return true;
    }

    // Heartbeat: ping every 2 minutes to keep lastSeen fresh
    const HEARTBEAT_MS = 2 * 60 * 1000;
    const heartbeatId = setInterval(() => {
      void checkDevice().then((ok) => {
        if (ok) {
          // Refresh plan from server so web upgrades are reflected
          void refreshPlanFromServer().then(() => refreshUser());
        }
      });
    }, HEARTBEAT_MS);

    // Also check when app regains focus, debounced to avoid rapid-fire checks
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current);
        visibilityDebounceRef.current = setTimeout(() => {
          void checkDevice().then((ok) => {
            if (ok) {
              void refreshPlanFromServer().then(() => refreshUser());
            }
          });
        }, VISIBILITY_DEBOUNCE_MS);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current);
    };
  }, [authenticated]);

  // Initial credit sync on login
  useEffect(() => {
    if (!authenticated || !user?.id) return;
    syncCreditsWithBackend().catch(() => { });
  }, [authenticated, user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authenticated,
        isAdmin,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
