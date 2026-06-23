import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
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

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://web-tayo-akosiles-projects.vercel.app";

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

    async function checkDevice(): Promise<boolean> {
      const session = getSession();
      if (!session?.deviceId) return false;
      if (session.deviceId === "dev-browser") return false;

      try {
        const res = await fetch(
          `${API_BASE}/api/device/check?deviceId=${encodeURIComponent(session.deviceId)}`,
          { headers: { "X-App-Version": APP_VERSION } }
        );

        // Server rejected this version — force logout
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          if (body.error === "VERSION_TOO_OLD") {
            logout();
            return false;
          }
        }

        if (res.ok) {
          const { exists } = await res.json();
          if (!exists) {
            logout();
            return false;
          }
        }
      } catch {
        // Network error — skip
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

    // Also check immediately when app regains focus
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void checkDevice().then((ok) => {
          if (ok) {
            void refreshPlanFromServer().then(() => refreshUser());
          }
        });
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authenticated]);

  // Initial credit sync on login
  useEffect(() => {
    if (!authenticated || !user?.id) return;
    syncCreditsWithBackend(user.id).catch(() => { });
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
