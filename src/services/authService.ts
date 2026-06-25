/**
 * Authentication service for MakeChurchEasy Desktop App.
 *
 * Uses device pairing flow (like Discord TV / Spotify device login).
 * The user authorizes the desktop app through the browser.
 */

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

/** App version sent with every API request for server-side version gating */
const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

export type PlanTier = "free" | "trial" | "basic" | "starter" | "growth" | "pro";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  appId: string;
  churchName: string;
  createdAt: string;
  role?: "admin" | "user";
  plan?: PlanTier;
  entitlements?: Record<string, number | boolean>;
  trial?: {
    active?: boolean;
    startedAt?: string;
    endsAt?: string;
    durationDays?: number;
    welcomeShown?: boolean;
  };
}

interface AuthSession {
  user: AuthUser;
  deviceId: string;
  expiresAt: number;
}

const SESSION_KEY = "mce-auth-session";

// ── Tauri secure store (IPC-backed, not accessible to page JS) ──────────────
// Session is loaded once from the store into a module-level cache on init().
// All public getters read from the cache synchronously.
// Falls back to localStorage when NOT running inside Tauri.

let _store: any = null;
let _session: AuthSession | null = null;
let _initialized = false;

/** Call once at app startup (before any component renders). */
export async function initAuthStore(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    _store = await Store.load("auth-session.json");
    const raw = await _store.get(SESSION_KEY);
    if (raw) {
      const parsed: AuthSession = JSON.parse(raw);
      if (Date.now() <= parsed.expiresAt) {
        _session = parsed;
      } else {
        await _store.delete(SESSION_KEY);
        await _store.save();
      }
    }
  } catch {
    // Not in Tauri or store unavailable — fall through to localStorage fallback
    _store = null;
  }

  if (!_session) {
    // Fallback for non-Tauri environments (tests, web)
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed: AuthSession = JSON.parse(raw);
        if (Date.now() <= parsed.expiresAt) {
          _session = parsed;
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  // Refresh plan from server first so the session has current plan/role,
  // then sync the enriched session to the overlay server.
  // refreshPlanFromServer calls saveSession → syncSessionToOverlay internally,
  // so we only need to sync here if no refresh happened (e.g. no deviceId).
  if (_session) {
    if (_session.deviceId) {
      await refreshPlanFromServer();
      // refreshPlanFromServer calls saveSession if plan changed,
      // which already syncs to the overlay. Sync again to ensure
      // the overlay always has the latest session (with entitlements).
      syncSessionToOverlay(_session);
    } else {
      syncSessionToOverlay(_session);
    }
  }
}

export function getSession(): AuthSession | null {
  return _session;
}

export function getDeviceId(): string | null {
  return _session?.deviceId ?? null;
}

async function saveSession(session: AuthSession) {
  _session = session;

  if (_store) {
    await _store.set(SESSION_KEY, JSON.stringify(session));
    await _store.save();
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  syncSessionToOverlay(session);
}

/**
 * Sync the auth session to the overlay server / Vite dev server so the OBS dock
 * can read it. The dock runs in a separate browser context (OBS CEF) and
 * can't access the Tauri webview's localStorage.
 *
 * - Dev mode: POST to the Vite dev server (same origin, handled by plugin)
 * - Production: POST to the overlay server via its known port
 */
export async function syncSessionToOverlay(session: AuthSession | null): Promise<void> {
  // Enrich the session with the user's plan entitlements so the dock
  // gets limits in one response without a separate plan-config endpoint.
  let enriched = session;
  if (session?.user) {
    try {
      const { DEFAULT_PLAN_CONFIG } = await import("./planConfigTypes");
      // Trial users get pro-tier entitlements regardless of their base plan.
      const trialActive = session.user.trial?.active
        && session.user.trial?.endsAt
        && Date.now() < new Date(session.user.trial.endsAt).getTime();
      const planKey = trialActive
        ? "pro"
        : (session.user.plan || "free").toLowerCase() as keyof typeof DEFAULT_PLAN_CONFIG.plans;
      const tier = DEFAULT_PLAN_CONFIG.plans[planKey];
      if (tier?.entitlements) {
        enriched = {
          ...session,
          user: { ...session.user, entitlements: tier.entitlements as unknown as Record<string, number | boolean> },
        };
      }
    } catch { /* import failed — send session without entitlements */ }
  }

  // Use explicit JSON for both set and clear so the server always gets
  // a readable body (empty-string POSTs are unreliable with tiny_http).
  const body = enriched ? JSON.stringify(enriched) : JSON.stringify({ clear: true });

  // On logout, clear BOTH the Tauri overlay server AND the Vite file-based
  // server so the dock is blocked regardless of which server it reads from.
  const clearSession = async (url: string) => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch { /* server may not be running — not critical */ }
  };

  // Try Tauri first (production)
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const port = await invoke<number>("get_overlay_port");
    if (port > 0) {
      // Always sync to BOTH servers — the Tauri overlay server (for dock
      // running on the Tauri port) AND the Vite file-based server (for dock
      // running on localhost:1420). Without both, the dock may hit the
      // server that doesn't have the session.
      await Promise.allSettled([
        clearSession(`http://127.0.0.1:${port}/api/auth/session`),
        clearSession(`${window.location.origin}/api/auth/session`),
      ]);
      return;
    }
  } catch {
    // Not running in Tauri
  }

  // Fallback: same origin (Vite dev server plugin or production overlay)
  await clearSession(`${window.location.origin}/api/auth/session`);
}

export function getStoredUser(): AuthUser | null {
  return _session?.user ?? null;
}

export function isAuthenticated(): boolean {
  return _session !== null;
}

export function logout() {
  _session = null;
  if (_store) {
    _store.delete(SESSION_KEY).then(() => _store.save()).catch(() => { });
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
  // Fire-and-forget but critical: clear the overlay server session so the
  // dock gets blocked. Using sendBeacon as a last resort for page unload.
  syncSessionToOverlay(null).catch(() => { });
  try {
    const blob = new Blob([JSON.stringify({ clear: true })], { type: "application/json" });
    navigator.sendBeacon("/api/auth/session", blob);
  } catch { /* not available */ }
}

export function getCurrentUser(): AuthUser | null {
  return getStoredUser();
}

/**
 * Refresh the user's plan (and other subscription fields) from the server.
 * Called at startup and periodically so plan upgrades on the web are
 * reflected in the desktop app without re-pairing.
 *
 * Uses /api/device/profile which returns the current MongoDB user state.
 */
export async function refreshPlanFromServer(): Promise<void> {
  if (!_session?.deviceId) return;
  try {
    const res = await fetch(
      `${API_BASE}/api/device/profile?deviceId=${encodeURIComponent(_session.deviceId)}`,
      { headers: { "X-App-Version": APP_VERSION } },
    );
    if (!res.ok) return;
    const data = await res.json();
    const remote = data?.user;
    if (!remote?.plan) return;

    const current = _session.user;
    const planChanged = remote.plan !== current.plan;
    const roleChanged = remote.role && remote.role !== current.role;
    const remoteTrial = remote.trial || {};
    const currentTrial = current.trial || {};
    const trialChanged =
      remoteTrial.endsAt !== currentTrial.endsAt ||
      remoteTrial.startedAt !== currentTrial.startedAt;

    if (planChanged || roleChanged || trialChanged) {
      const updated: AuthSession = {
        ..._session,
        user: {
          ...current,
          plan: remote.plan || current.plan,
          role: remote.role || current.role,
          trial: {
            active: remoteTrial.active ?? currentTrial.active,
            startedAt: remoteTrial.startedAt || currentTrial.startedAt,
            endsAt: remoteTrial.endsAt || currentTrial.endsAt,
            durationDays: remoteTrial.durationDays ?? currentTrial.durationDays,
            welcomeShown: remoteTrial.welcomeShown ?? currentTrial.welcomeShown,
          },
        },
      };
      await saveSession(updated);
    }
  } catch {
    // Network error — not critical, will retry next cycle
  }
}

/**
 * Get device info (hostname + OS) from Tauri backend.
 * Falls back to a generic name if not running in Tauri.
 */
export async function getDeviceInfo(): Promise<string> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const info = await invoke<{ hostname: string; os: string }>("get_device_info");
    return info.hostname || "MakeChurchEasy Studio";
  } catch {
    return "MakeChurchEasy Studio";
  }
}

/**
 * Detect the OS from the browser user agent.
 * Returns a clean, user-friendly name like "macOS", "Windows", "Linux".
 */
function detectOS(): string {
  const ua = navigator.userAgent;
  if (/mac os/i.test(ua)) return "macOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/linux/i.test(ua)) return "Linux";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  return "Unknown OS";
}

/**
 * Create a new pairing code. Returns the code for display.
 */
export async function createPairingCode(
  deviceName: string
): Promise<{ code: string; expiresAt: string } | { error: string; versionBlocked?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/pairing/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Version": APP_VERSION,
      },
      body: JSON.stringify({ deviceName }),
    });
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      if (body.error === "VERSION_TOO_OLD") {
        return { error: body.message || "This version is no longer supported. Please update.", versionBlocked: true };
      }
    }
    if (!res.ok) return { error: "Failed to create pairing code" };
    return await res.json();
  } catch {
    return { error: "Connection failed. Is the server running?" };
  }
}

/**
 * Watch pairing status via SSE. Resolves instantly when the user authorizes.
 *
 * The version and OS are passed as query parameters (EventSource doesn't support headers).
 * Returns a cleanup function to abort the connection.
 */
export function watchPairingStatus(
  code: string,
  callbacks: {
    onAuthorized: (user: AuthUser, deviceId: string) => void;
    onExpired: () => void;
    onError: (msg: string) => void;
    onVersionBlocked?: (message: string) => void;
  }
): () => void {
  const os = detectOS();
  const url = `${API_BASE}/api/pairing/stream?code=${encodeURIComponent(code)}&v=${encodeURIComponent(APP_VERSION)}&os=${encodeURIComponent(os)}`;
  const es = new EventSource(url);

  es.addEventListener("authorized", (e: MessageEvent) => {
    es.close();
    const data = JSON.parse(e.data);
    const authUser: AuthUser = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      avatar: data.user.avatar || "",
      appId: data.user.appId || "",
      churchName: data.user.churchName || "",
      createdAt: data.user.createdAt || "",
      role: data.user.role || "user",
      plan: data.user.plan || "free",
      trial: data.user.trial || undefined,
    };

    saveSession({
      user: authUser,
      deviceId: data.deviceId,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    callbacks.onAuthorized(authUser, data.deviceId);
  });

  es.addEventListener("expired", () => {
    es.close();
    callbacks.onExpired();
  });

  es.addEventListener("version-blocked", (e: MessageEvent) => {
    es.close();
    const data = JSON.parse(e.data);
    callbacks.onVersionBlocked?.(data.message || "This version is no longer supported. Please update.");
  });

  es.addEventListener("error", (e: MessageEvent | Event) => {
    es.close();
    const msg = "data" in e ? JSON.parse(e.data).message : "Connection lost";
    callbacks.onError(msg);
  });

  return () => es.close();
}

/**
 * Open the browser to the device pairing page.
 */
export async function openBrowserForPairing(code: string): Promise<void> {
  const url = `${API_BASE}/device?code=${encodeURIComponent(code)}`;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank");
  }
}
