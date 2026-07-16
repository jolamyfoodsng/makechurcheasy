/**
 * Authentication service for MakeChurchEasy Desktop App.
 *
 * Uses device pairing flow (like Discord TV / Spotify device login).
 * The user authorizes the desktop app through the browser.
 */

import {
  getEffectivePlan as resolveEffectivePlan,
  normalizePlanId,
} from "../lib/subscriptionSourceOfTruth";
import { requestJsonWithRetry } from "./requestDedup";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.creatorstudioslabs.stream";

/** App version sent with every API request for server-side version gating */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

export type PlanTier = "free" | "trial" | "basic" | "growth" | "pro" | "ambassador" | "unlimited";

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
  effectivePlan?: PlanTier;
  entitlements?: Record<string, number | boolean>;
  trial?: {
    active?: boolean;
    status?: string;
    startedAt?: string;
    endsAt?: string;
    durationDays?: number;
    welcomeShown?: boolean;
  };
}

interface AuthSession {
  user: AuthUser;
  deviceId: string;
  deviceSecret?: string;
  expiresAt: number;
}

interface DeviceBootstrapResponse {
  account?: {
    deviceId: string;
    verifiedAt: string;
    user: {
      id: string;
      name: string;
      email: string;
      avatar?: string;
      appId?: string;
      churchName?: string;
      country?: string;
      createdAt?: string;
      role?: "admin" | "user";
      plan?: string;
      effectivePlan?: string;
      entitlements?: Record<string, number | boolean>;
      trial?: AuthUser["trial"];
    };
    credits: {
      remaining: number;
      totalConsumed?: number;
      planAllocation?: number;
      adminGranted?: number;
      isAdmin?: boolean;
      unlimited?: boolean;
    };
  };
  error?: string;
}

function resolveBootstrappedTrial(
  remote: NonNullable<DeviceBootstrapResponse["account"]>["user"],
  current: AuthUser,
): AuthUser["trial"] {
  if (Object.prototype.hasOwnProperty.call(remote, "trial")) {
    return remote.trial ?? undefined;
  }
  return current.trial;
}

export type RefreshPlanResult =
  | { status: "ok" }
  | { status: "unauthenticated" }
  | { status: "device_removed" }
  | { status: "version_blocked" }
  | { status: "network_error" };

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
  console.debug("[authService] initAuthStore: starting");

  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    _store = await Store.load("auth-session.json");
    const raw = await _store.get(SESSION_KEY);
    if (raw) {
      const parsed: AuthSession = JSON.parse(raw);
      if (Date.now() <= parsed.expiresAt) {
        _session = parsed;
        console.debug("[authService] initAuthStore: loaded session from Tauri store, deviceId=%s", parsed.deviceId);
      } else {
        console.debug("[authService] initAuthStore: Tauri session expired — clearing");
        await _store.delete(SESSION_KEY);
        await _store.save();
      }
    } else {
      console.debug("[authService] initAuthStore: no session in Tauri store");
    }
  } catch (err) {
    // Not in Tauri or store unavailable — fall through to localStorage fallback
    console.debug("[authService] initAuthStore: Tauri store unavailable, falling back to localStorage", err);
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
          console.debug("[authService] initAuthStore: loaded session from localStorage, deviceId=%s", parsed.deviceId);
        } else {
          console.debug("[authService] initAuthStore: localStorage session expired — clearing");
          localStorage.removeItem(SESSION_KEY);
        }
      } else {
        console.debug("[authService] initAuthStore: no session in localStorage");
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

export function getDeviceSecret(): string | null {
  return _session?.deviceSecret ?? null;
}

export async function clearDeviceSecretForRecovery(): Promise<void> {
  if (!_session?.deviceSecret) return;
  await saveSession({
    ..._session,
    deviceSecret: undefined,
  });
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
      const {
        getLegacyCompatibleEntitlementsForPlan,
      } = await import("../lib/subscriptionSourceOfTruth");
      const planKey = normalizePlanId(
        session.user.effectivePlan
        || resolveEffectivePlan(session.user as any)
        || session.user.plan
        || "free"
      );
      enriched = {
        ...session,
        user: {
          ...session.user,
          effectivePlan: planKey,
          entitlements: getLegacyCompatibleEntitlementsForPlan(planKey) as unknown as Record<string, number | boolean>,
        },
      };
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
  console.debug("[authService] logout: clearing session (deviceId=%s)", _session?.deviceId);
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
 * Uses /api/device/bootstrap which returns the current account snapshot.
 */
export async function refreshPlanFromServer(): Promise<void> {
  if (!_session?.deviceId) {
    console.debug("[authService] refreshPlanFromServer: no deviceId — skipping");
    return;
  }
  await refreshAccountBootstrapFromServer();
}

export async function refreshAccountBootstrapFromServer(): Promise<RefreshPlanResult> {
  if (!_session?.deviceId) {
    return { status: "unauthenticated" };
  }

  try {
    const bootstrapUrl = `${API_BASE}/api/device/bootstrap?deviceId=${encodeURIComponent(_session.deviceId)}`;
    const requestBootstrap = (deviceSecret?: string, dedupeSuffix = "primary") =>
      requestJsonWithRetry<DeviceBootstrapResponse>(bootstrapUrl, {
        dedupeKey: `account-bootstrap:${_session?.deviceId}:${dedupeSuffix}`,
        headers: {
          "X-App-Version": APP_VERSION,
          ...(deviceSecret ? { "X-Device-Secret": deviceSecret } : {}),
        },
        retryDelaysMs: [1000, 3000],
      });

    let { response, data } = await requestBootstrap(_session.deviceSecret, "primary");

    if (response.status === 401 && _session.deviceSecret) {
      const message = typeof data?.error === "string" ? data.error : "";
      if (/invalid device secret/i.test(message)) {
        const retry = await requestBootstrap(undefined, "secret-recovery");
        if (retry.response.ok) {
          await clearDeviceSecretForRecovery();
          response = retry.response;
          data = retry.data;
        } else if (retry.response.status >= 500) {
          return { status: "network_error" };
        }
      }
    }

    if (response.status === 403) {
      const message = typeof data?.error === "string" ? data.error : "";
      return {
        status: message === "VERSION_TOO_OLD" ? "version_blocked" : "device_removed",
      };
    }

    if (response.status === 401 || response.status === 404) {
      return { status: "device_removed" };
    }

    if (!response.ok) {
      return { status: "network_error" };
    }

    const remoteAccount = data?.account;
    const remote = remoteAccount?.user;
    if (!remote?.id) {
      return { status: "network_error" };
    }

    const current = _session.user;
    const normalizedPlan = normalizePlanId(
      remote.effectivePlan || remote.plan || current.effectivePlan || current.plan || "free",
    ) as PlanTier;

    const updatedUser: AuthUser = {
      ...current,
      id: remote.id,
      name: remote.name || current.name,
      email: remote.email || current.email,
      avatar: remote.avatar || current.avatar,
      appId: remote.appId || current.appId,
      churchName: remote.churchName || current.churchName,
      createdAt: remote.createdAt || current.createdAt,
      role: remote.role || current.role,
      plan: normalizePlanId(remote.plan || current.plan || normalizedPlan) as PlanTier,
      effectivePlan: normalizedPlan,
      entitlements: remote.entitlements || current.entitlements,
      trial: resolveBootstrappedTrial(remote, current),
    };

    const sessionChanged = JSON.stringify(updatedUser) !== JSON.stringify(current);
    if (sessionChanged) {
      console.debug(
        "[authService] refreshAccountBootstrapFromServer: changes detected — plan=%s→%s effective=%s→%s role=%s",
        current.plan,
        updatedUser.plan,
        current.effectivePlan,
        updatedUser.effectivePlan,
        updatedUser.role ?? current.role,
      );
      await saveSession({
        ..._session,
        user: updatedUser,
      });
    }

    if (typeof remoteAccount?.credits?.remaining === "number") {
      const { applyCreditSnapshotFromServer } = await import("./credits");
      applyCreditSnapshotFromServer(remoteAccount.credits.remaining);
    }

    return { status: "ok" };
  } catch {
    return { status: "network_error" };
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
    return info.hostname || "MakeChurchEasy";
  } catch {
    return "MakeChurchEasy";
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

// Track the last generated pairing code so we can invalidate it
// when the user generates a new one (only ONE active code per device).
let _lastPairingCode: string | null = null;

/**
 * Create a new pairing code. Returns the code for display.
 * Invalidates any previous unused code on the server.
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
      body: JSON.stringify({ deviceName, previousCode: _lastPairingCode }),
    });
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      if (body.error === "VERSION_TOO_OLD") {
        return { error: body.message || "This version is no longer supported. Please update.", versionBlocked: true };
      }
    }
    if (!res.ok) return { error: "Failed to create pairing code" };
    const data = await res.json();
    _lastPairingCode = data.code;
    return data;
  } catch {
    return { error: "Connection failed. Is the server running?" };
  }
}

/**
 * Redeem a pairing code directly — no browser round-trip.
 *
 * The code was generated on the dashboard (which pre-binds it to a userId),
 * so the desktop can exchange it for a session in one call.
 */
export async function redeemPairingCode(
  code: string,
): Promise<
  | { success: true; user: AuthUser; deviceId: string }
  | { success: false; error: string; code?: string }
> {
  try {
    const os = detectOS();
    const res = await fetch(`${API_BASE}/api/pairing/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Version": APP_VERSION,
      },
      body: JSON.stringify({ code: code.toUpperCase(), deviceName: os }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: "Invalid code. Please check and try again.", code: "invalid" };
      if (res.status === 410) return { success: false, error: data.error === "Code already used" ? "This code has already been used. Generate a new one." : "This code has expired. Generate a new one.", code: data.error === "Code already used" ? "already_used" : "expired" };
      if (res.status === 403 && data.error === "email_not_verified") return { success: false, error: "Please verify your email address before pairing.", code: "email_not_verified" };
      if (res.status === 403 && data.error === "device_limit_reached") return { success: false, error: data.message || "Device limit reached.", code: "device_limit_reached" };
      return { success: false, error: data.error || "Failed to pair device. Please try again." };
    }

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
      effectivePlan: resolveEffectivePlan({
        plan: data.user.plan || "free",
        role: data.user.role || "user",
        trial: data.user.trial || undefined,
      }) as PlanTier,
      trial: data.user.trial || undefined,
    };

    await saveSession({
      user: authUser,
      deviceId: data.deviceId,
      deviceSecret: data.deviceSecret || undefined,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Code consumed — clear tracked reference
    _lastPairingCode = null;

    return { success: true, user: authUser, deviceId: data.deviceId };
  } catch {
    return { success: false, error: "Connection failed. Is the server running?" };
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
    onVerificationRequired?: (email: string, name: string, message: string) => void;
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
      effectivePlan: resolveEffectivePlan({
        plan: data.user.plan || "free",
        role: data.user.role || "user",
        trial: data.user.trial || undefined,
      }) as PlanTier,
      trial: data.user.trial || undefined,
    };

    saveSession({
      user: authUser,
      deviceId: data.deviceId,
      deviceSecret: data.deviceSecret || undefined,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Code consumed — clear tracked reference
    _lastPairingCode = null;

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

  es.addEventListener("verification_required", (e: MessageEvent) => {
    es.close();
    const data = JSON.parse(e.data);
    callbacks.onVerificationRequired?.(
      data.email || "",
      data.name || "",
      data.message || "Please verify your email address before authorizing a device."
    );
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

/**
 * Resend the email verification link to the authorizing user (dashboard side).
 * Called from the desktop app when the pairing is blocked by email verification.
 * Uses the pairing code as lightweight auth.
 */
export async function resendVerificationEmail(
  code: string
): Promise<{ success?: boolean; alreadyVerified?: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/pairing/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to resend" };
    return { success: true, alreadyVerified: data.alreadyVerified };
  } catch {
    return { error: "Connection failed" };
  }
}

/**
 * Check if the authorizing user's email is now verified.
 * Called when the user clicks "I've Verified My Email" in the verification modal.
 * Uses the pairing code as lightweight auth.
 */
export async function checkVerificationStatus(
  code: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/pairing/check-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) return { verified: false, error: data.error || "Failed to check" };
    return { verified: data.verified };
  } catch {
    return { verified: false, error: "Connection failed" };
  }
}
