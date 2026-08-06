import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  getStoredUser,
  isAuthenticated,
  getSession,
  logout as authLogout,
  refreshAccountBootstrapFromServer,
  syncSessionToOverlay,
  type AuthUser,
} from "@/services/authService";
import { resetFavoriteThemeCaches } from "@/services/favoriteThemes";
import { clearAllUserScopedStorage } from "@/services/userScopedStorage";
import { resetLicenseGuard, subscribe as subscribeLicenseGuard } from "@/services/licenseGuard";

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
    console.log("[AuthContext] setUser called, authenticated:", isAuthenticated(), "user:", u.name);
    setUserState(u);
    // Login has already persisted the session before calling this setter. Set
    // the React auth state directly so a slow overlay handoff cannot leave the
    // user stranded on LoginPage after successful pairing.
    setAuthenticated(true);
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

  useEffect(() => {
    if (!authenticated) return;

    return subscribeLicenseGuard((state) => {
      if (state.lockReason !== "device_removed") return;
      console.warn("[AuthContext] license guard reported device_removed — clearing stale local session");
      logout();
    });
  }, [authenticated]);

  // Verify device still exists on server + keep lastSeen fresh
  useEffect(() => {
    if (!authenticated) return;

    // ── Grace period & retry constants ──────────────────────────────────────
    // Keep local auth non-destructive. App updates, cold deploys, and temporary
    // device lookup drift must not force users to log out and back in.
    const STARTUP_GRACE_MS = 15_000;
    const DEVICE_STATE_WARNING_THRESHOLD = 4;
    const VISIBILITY_DEBOUNCE_MS = 5_000;
    const HEARTBEAT_MS = 60 * 1000;
    const mountTimestamp = Date.now();

    async function refreshAccountState(): Promise<boolean> {
      const session = getSession();
      if (!session?.deviceId) {
        console.debug("[AuthContext] refreshAccountState: no session/deviceId — skipping");
        return false;
      }
      if (session.deviceId === "dev-browser") return false;

      const duringGracePeriod = Date.now() - mountTimestamp < STARTUP_GRACE_MS;
      const result = await refreshAccountBootstrapFromServer();

      if (result.status === "ok") {
        consecutiveFailuresRef.current = 0;
        refreshUser();
        return true;
      }

      if (result.status === "network_error" || result.status === "unauthenticated") {
        consecutiveFailuresRef.current = 0;
        return true;
      }

      if (duringGracePeriod) {
        console.warn(
          `[AuthContext] refreshAccountState: ${result.status} during startup grace — preserving local session`,
        );
        return true;
      }

      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current < DEVICE_STATE_WARNING_THRESHOLD) {
        console.warn(
          `[AuthContext] refreshAccountState: ${result.status} — preserving local session, failure ${consecutiveFailuresRef.current}/${DEVICE_STATE_WARNING_THRESHOLD}`,
        );
        return true;
      }

      if (result.status === "device_removed") {
        console.warn(
          "[AuthContext] refreshAccountState: device_removed confirmed — clearing stale local session",
        );
        logout();
        return false;
      }

      console.warn(
        `[AuthContext] refreshAccountState: ${result.status} — preserving local session after repeated failures`,
      );
      return true;
    }

    const heartbeatId = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshAccountState();
    }, HEARTBEAT_MS);

    // Also check when app regains focus, debounced to avoid rapid-fire checks
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current);
        visibilityDebounceRef.current = setTimeout(() => {
          void refreshAccountState();
        }, VISIBILITY_DEBOUNCE_MS);
      }
    }

    void refreshAccountState();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onVisibilityChange);
    return () => {
      clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onVisibilityChange);
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current);
    };
  }, [authenticated, refreshUser]);

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
