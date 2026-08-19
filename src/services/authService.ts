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

const PRODUCTION_API_BASE = "https://api.creatorstudioslabs.stream";
const PRODUCTION_DASHBOARD_BASE = "https://makechurcheazy.com";
const LOCAL_DASHBOARD_BASE = "http://localhost:4000";
const DEFAULT_OVERLAY_PORT = 45678;
const SESSION_SYNC_TIMEOUT_MS = 1200;

function normalizeApiBase(value: string | undefined): string {
  return (value || PRODUCTION_API_BASE).replace(/\/+$/, "");
}

/** Pairing codes may be copied with spaces, hyphens, or other visual separators. */
export function normalizePairingCode(raw: string): string {
  return raw.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatPairingCodeForDisplay(raw: string): string {
  const normalized = normalizePairingCode(raw);
  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`
    : normalized;
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_AUTH_API_URL);
let _activePairingApiBase = API_BASE;

/**
 * Reset the active pairing API base back to the env-configured API.
 * Call this when starting a new pairing attempt to ensure the SSE
 * stream and API calls all target the same server.
 */
export function resetPairingApiBase(): void {
  _activePairingApiBase = API_BASE;
}

function isLocalApiBase(apiBase: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiBase);
}

function shouldTryNextApiBase(response?: Response): boolean {
  if (!response) return true;
  return response.status === 404 || response.status >= 500;
}

function authApiCandidates(): string[] {
  // An explicit local API is an isolated development environment. Do not
  // silently authenticate against production when that local server is down.
  if (isLocalApiBase(API_BASE)) return [API_BASE];
  return Array.from(new Set([API_BASE, PRODUCTION_API_BASE].map(normalizeApiBase)));
}

export function resolvePairingApiBaseCandidates(configuredApiBase: string): string[] {
  // A dashboard-generated code can be created through the dashboard's API
  // proxy. If the direct API deployment is briefly out of sync, retry the
  // same request through that proxy before reporting the code as invalid.
  if (isLocalApiBase(configuredApiBase)) {
    return Array.from(new Set([configuredApiBase, LOCAL_DASHBOARD_BASE].map(normalizeApiBase)));
  }

  return Array.from(new Set([
    configuredApiBase,
    PRODUCTION_API_BASE,
    PRODUCTION_DASHBOARD_BASE,
  ].map(normalizeApiBase)));
}

function pairingRedeemApiCandidates(): string[] {
  return resolvePairingApiBaseCandidates(API_BASE);
}

async function fetchAuthApi(
  path: string,
  init?: RequestInit,
  candidates: string[] = authApiCandidates(),
): Promise<{ response: Response; apiBase: string }> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const apiBase = candidates[index];
    try {
      const response = await fetch(`${apiBase}${path}`, init);
      lastResponse = response;
      if (!shouldTryNextApiBase(response) || index === candidates.length - 1) {
        _activePairingApiBase = apiBase;
        return { response, apiBase };
      }
      console.warn("[authService] Auth API %s returned %s; trying fallback.", apiBase, response.status);
    } catch (error) {
      lastError = error;
      if (index === candidates.length - 1) break;
      console.warn("[authService] Auth API %s unavailable; trying fallback.", apiBase);
    }
  }

  if (lastResponse) {
    _activePairingApiBase = candidates[candidates.length - 1];
    return { response: lastResponse, apiBase: _activePairingApiBase };
  }
  throw lastError instanceof Error ? lastError : new Error("auth_api_unavailable");
}

export function getDashboardBaseForAuth(): string {
  return isLocalApiBase(_activePairingApiBase) ? LOCAL_DASHBOARD_BASE : PRODUCTION_DASHBOARD_BASE;
}

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
  ambassador?: {
    active?: boolean;
    grantedBy?: string | null;
    grantedAt?: string | null;
    expiresAt?: string | null;
    creditsGranted?: number;
    previousPlan?: string;
    notes?: string;
  } | null;
  adminTemporaryPlan?: {
    active?: boolean;
    plan?: string;
    previousPlan?: string;
    returnPlan?: "free";
    expiresAt?: string | null;
    durationDays?: number;
    reason?: string;
  } | null;
  adminManagedSubscription?: {
    active?: boolean;
    plan?: string;
    billingCycle?: string;
    expiresAt?: string | null;
    amountCollected?: number;
    currency?: string;
    paymentReference?: string;
  } | null;
  subscriptionExpiresAt?: string | null;
  purchaseKind?: "subscription" | "one_time";
  oneTimeOfferId?: string | null;
  oneTimeOfferName?: string | null;
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
  apiBase?: string;
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
      ambassador?: AuthUser["ambassador"];
      adminTemporaryPlan?: AuthUser["adminTemporaryPlan"];
      adminManagedSubscription?: AuthUser["adminManagedSubscription"];
      subscriptionExpiresAt?: string | null;
      purchaseKind?: AuthUser["purchaseKind"];
      oneTimeOfferId?: string | null;
      oneTimeOfferName?: string | null;
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
// The native Dock settings database is shared by the desktop app and the OBS
// browser dock. Keep the authenticated user id available to both contexts so
// they resolve the same settings scope even when the desktop session itself
// lives in Tauri's secure store instead of page localStorage.
const DOCK_AUTH_USER_ID_KEY = "mce-dock-auth-user-id";

function syncDockAuthUserId(userId: string | null | undefined): void {
  try {
    const normalized = typeof userId === "string" ? userId.trim() : "";
    if (normalized) {
      localStorage.setItem(DOCK_AUTH_USER_ID_KEY, normalized);
    } else {
      localStorage.removeItem(DOCK_AUTH_USER_ID_KEY);
    }
  } catch {
    // The Dock can still use its device scope if browser storage is restricted.
  }
}

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

  // Keep the page-visible scope hint in sync even when the real session was
  // loaded from Tauri's secure store. Without this, the main window used the
  // device scope while the OBS Dock used the user scope.
  syncDockAuthUserId(_session?.user?.id);

  // Refresh plan from server in the background — never block startup on network.
  // The cached session (with potentially stale plan) is available synchronously
  // from getSession() so the UI renders immediately regardless of connectivity.
  if (_session) {
    if (_session.deviceId) {
      void refreshPlanFromServer().then(() => {
        if (_session) void syncSessionToOverlay(_session);
      });
    }
    // Do not let plan refresh timing decide whether the dock can authenticate.
    // The cached session itself must reach the local overlay immediately.
    await syncSessionToOverlay(_session);
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

export function resolveDeviceApiBaseCandidates(sessionApiBase?: string | null): string[] {
  const primary = normalizeApiBase(sessionApiBase || API_BASE);
  if (isLocalApiBase(API_BASE) && isLocalApiBase(primary)) return [primary];
  return Array.from(new Set([
    primary,
    PRODUCTION_API_BASE,
  ].map(normalizeApiBase)));
}

export function getSessionApiBase(): string {
  return normalizeApiBase(_session?.apiBase || API_BASE);
}

export function getDeviceApiBaseCandidates(): string[] {
  return resolveDeviceApiBaseCandidates(_session?.apiBase);
}

export async function rememberSessionApiBase(apiBase: string): Promise<void> {
  if (!_session) return;
  const normalized = normalizeApiBase(apiBase);
  if (_session.apiBase === normalized) return;
  await saveSession({
    ..._session,
    apiBase: normalized,
  });
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
  syncDockAuthUserId(session.user?.id);

  if (_store) {
    await _store.set(SESSION_KEY, JSON.stringify(session));
    await _store.save();
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  // The desktop session is ready as soon as it is persisted. The OBS dock
  // runs in a separate context, so hand off its session in the background; a
  // missing local overlay endpoint must never hold the desktop on LoginPage.
  void syncSessionToOverlay(session).catch((error) => {
    console.warn("[authService] Background overlay session sync failed:", error);
  });
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
  const syncTarget = async (url: string): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SESSION_SYNC_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const targets = new Set<string>();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const isHttpLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (isHttpLocalOrigin) {
    // Dev dock pages are served by Vite. Never POST to a tauri:// origin: it
    // is not an HTTP server and silently loses the handoff.
    targets.add(`${origin}/api/auth/session`);
  }

  // Try Tauri first (production). The overlay server can still be starting
  // while the webview restores the secure store, so retry the command briefly
  // before falling back to its fixed port.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const port = await invoke<number>("get_overlay_port");
      if (port > 0) {
        targets.add(`http://127.0.0.1:${port}/api/auth/session`);
        break;
      }
    } catch {
      // The OBS browser dock is not a Tauri webview; use the local HTTP
      // targets above instead.
      break;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
  }

  // Production currently uses a fixed port. This also covers the short
  // startup window where get_overlay_port has not been populated yet.
  targets.add(`http://127.0.0.1:${DEFAULT_OVERLAY_PORT}/api/auth/session`);

  const targetList = [...targets];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const results = await Promise.all(targetList.map((target) => syncTarget(target)));
    if (results.some(Boolean)) return;
    if (attempt < 2) {
      await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)));
    }
  }

  console.warn("[authService] Could not sync the desktop session to the local overlay server");
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
  syncDockAuthUserId(null);
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
    const candidates = getDeviceApiBaseCandidates();
    let response: Response | null = null;
    let data: DeviceBootstrapResponse | null = null;
    let successfulApiBase = "";

    for (const apiBase of candidates) {
      const bootstrapUrl = `${apiBase}/api/device/bootstrap?deviceId=${encodeURIComponent(_session.deviceId)}`;
      const requestBootstrap = (deviceSecret?: string, dedupeSuffix = "primary") =>
        requestJsonWithRetry<DeviceBootstrapResponse>(bootstrapUrl, {
          dedupeKey: `account-bootstrap:${apiBase}:${_session?.deviceId}:${dedupeSuffix}`,
          headers: {
            "X-App-Version": APP_VERSION,
            ...(deviceSecret ? { "X-Device-Secret": deviceSecret } : {}),
          },
          retryDelaysMs: [1000, 3000],
        });

      const primary = await requestBootstrap(_session.deviceSecret, "primary");
      response = primary.response;
      data = primary.data;

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

      if (response.ok) {
        successfulApiBase = apiBase;
        break;
      }

      if (
        (response.status === 401 || response.status === 404) &&
        apiBase !== candidates[candidates.length - 1]
      ) {
        console.warn(
          "[authService] Device not found on %s; retrying account bootstrap on production API.",
          apiBase,
        );
        continue;
      }

      break;
    }

    if (!response) {
      return { status: "network_error" };
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

    if (!response.ok || !data) {
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
    const remoteHas = (key: keyof typeof remote) => Object.prototype.hasOwnProperty.call(remote, key);

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
      plan: normalizedPlan,
      effectivePlan: normalizedPlan,
      entitlements: remote.entitlements || current.entitlements,
      ambassador: remoteHas("ambassador") ? remote.ambassador ?? null : current.ambassador ?? null,
      adminTemporaryPlan: remoteHas("adminTemporaryPlan") ? remote.adminTemporaryPlan ?? null : current.adminTemporaryPlan ?? null,
      adminManagedSubscription: remoteHas("adminManagedSubscription") ? remote.adminManagedSubscription ?? null : current.adminManagedSubscription ?? null,
      subscriptionExpiresAt: remoteHas("subscriptionExpiresAt") ? remote.subscriptionExpiresAt ?? null : current.subscriptionExpiresAt ?? null,
      purchaseKind: remoteHas("purchaseKind") ? remote.purchaseKind ?? "subscription" : current.purchaseKind ?? "subscription",
      oneTimeOfferId: remoteHas("oneTimeOfferId") ? remote.oneTimeOfferId ?? null : current.oneTimeOfferId ?? null,
      oneTimeOfferName: remoteHas("oneTimeOfferName") ? remote.oneTimeOfferName ?? null : current.oneTimeOfferName ?? null,
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
        apiBase: successfulApiBase || getSessionApiBase(),
        user: updatedUser,
      });
    } else if (successfulApiBase) {
      await rememberSessionApiBase(successfulApiBase);
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
  let installationId: string | undefined;
  let fingerprintHash: string | undefined;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const fp = await invoke<{ installationId: string; fingerprintHash: string }>("get_device_fingerprint");
    installationId = fp.installationId;
    fingerprintHash = fp.fingerprintHash;
  } catch {
    // Not running in Tauri — send without fingerprint
  }

  try {
    const { response: res } = await fetchAuthApi("/api/pairing/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Version": APP_VERSION,
      },
      body: JSON.stringify({
        deviceName,
        previousCode: _lastPairingCode,
        installationId,
        fingerprintHash,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 && body.error === "VERSION_TOO_OLD") {
        return { error: body.message || "This version is no longer supported. Please update.", versionBlocked: true };
      }
      return {
        error:
          body.message ||
          body.error ||
          `Failed to create pairing code. Please try again. (${res.status})`,
      };
    }
    const data = await res.json();
    const normalizedCode = normalizePairingCode(data.code || "");
    _lastPairingCode = normalizedCode;
    return { ...data, code: normalizedCode };
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
    let installationId: string | undefined;
    let fingerprintHash: string | undefined;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const fp = await invoke<{ installationId: string; fingerprintHash: string }>("get_device_fingerprint");
      installationId = fp.installationId;
      fingerprintHash = fp.fingerprintHash;
    } catch {
      // Browser/dev fallback: the server will refuse to start a new trial
      // without the durable desktop identity, but pairing can still proceed.
    }
    const { response: res } = await fetchAuthApi("/api/pairing/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Version": APP_VERSION,
      },
      body: JSON.stringify({
        code: normalizePairingCode(code),
        deviceName: os,
        installationId,
        fingerprintHash,
      }),
    }, pairingRedeemApiCandidates());

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: "Pairing code not found on the connected server. Generate a new code and try again.", code: "invalid" };
      if (res.status === 410) return { success: false, error: data.error === "Code already used" ? "This code has already been used. Generate a new one." : "This code has expired. Generate a new one.", code: data.error === "Code already used" ? "already_used" : "expired" };
      if (res.status === 403 && data.error === "email_not_verified") return { success: false, error: "Please verify your email address before pairing.", code: "email_not_verified" };
      if (res.status === 403 && data.error === "device_limit_reached") return { success: false, error: data.message || "Device limit reached.", code: "device_limit_reached" };
      if (res.status === 403 && data.error === "trial_already_claimed") return { success: false, error: data.message || "This device has already used its free trial. Please subscribe to continue.", code: "trial_already_claimed" };
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
        ambassador: data.user.ambassador || undefined,
        adminTemporaryPlan: data.user.adminTemporaryPlan || undefined,
        adminManagedSubscription: data.user.adminManagedSubscription || undefined,
        subscriptionExpiresAt: data.user.subscriptionExpiresAt || undefined,
      }) as PlanTier,
      ambassador: data.user.ambassador || null,
      adminTemporaryPlan: data.user.adminTemporaryPlan || null,
      adminManagedSubscription: data.user.adminManagedSubscription || null,
      subscriptionExpiresAt: data.user.subscriptionExpiresAt || null,
      trial: data.user.trial || undefined,
    };

    await saveSession({
      user: authUser,
      deviceId: data.deviceId,
      deviceSecret: data.deviceSecret || undefined,
      apiBase: _activePairingApiBase,
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
  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const url = `${_activePairingApiBase}/api/pairing/stream?code=${encodeURIComponent(normalizedCode)}&v=${encodeURIComponent(APP_VERSION)}&os=${encodeURIComponent(os)}`;
  console.log("[authService] watchPairingStatus connecting to:", url);
  const es = new EventSource(url);
  let settled = false;

  es.onopen = () => console.log("[authService] EventSource onopen — readyState:", es.readyState);
  es.onerror = (e) => console.log("[authService] EventSource onerror — readyState:", es.readyState, "event:", e.type);

  function finish(callback: () => void): void {
    if (settled) return;
    settled = true;
    console.log("[authService] finish() — closing EventSource");
    es.close();
    callback();
  }

  es.addEventListener("connected", (e: MessageEvent) => {
    console.log("[authService] SSE received 'connected' event:", e.data);
  });

  es.addEventListener("authorized", async (e: MessageEvent) => {
    console.log("[authService] SSE received authorized event");
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
        ambassador: data.user.ambassador || undefined,
        adminTemporaryPlan: data.user.adminTemporaryPlan || undefined,
        adminManagedSubscription: data.user.adminManagedSubscription || undefined,
        subscriptionExpiresAt: data.user.subscriptionExpiresAt || undefined,
      }) as PlanTier,
      ambassador: data.user.ambassador || null,
      adminTemporaryPlan: data.user.adminTemporaryPlan || null,
      adminManagedSubscription: data.user.adminManagedSubscription || null,
      subscriptionExpiresAt: data.user.subscriptionExpiresAt || null,
      trial: data.user.trial || undefined,
    };

    try {
      // Persist the desktop session before notifying the UI. The overlay handoff
      // continues in the background and is independent of desktop navigation.
      await saveSession({
        user: authUser,
        deviceId: data.deviceId,
        deviceSecret: data.deviceSecret || undefined,
        apiBase: _activePairingApiBase,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    } catch (error) {
      console.error("[authService] Failed to sync authorized session to the dock:", error);
    }

    // Code consumed — clear tracked reference
    _lastPairingCode = null;

    finish(() => callbacks.onAuthorized(authUser, data.deviceId));
  });

  es.addEventListener("expired", (e) => {
    console.log("[authService] SSE received 'expired' event:", e);
    finish(callbacks.onExpired);
  });

  es.addEventListener("version-blocked", (e: MessageEvent) => {
    console.log("[authService] SSE received 'version-blocked' event:", e.data);
    const data = JSON.parse(e.data);
    finish(() => {
      callbacks.onVersionBlocked?.(data.message || "This version is no longer supported. Please update.");
    });
  });

  es.addEventListener("verification_required", (e: MessageEvent) => {
    console.log("[authService] SSE received 'verification_required' event:", e.data);
    const data = JSON.parse(e.data);
    finish(() => {
      callbacks.onVerificationRequired?.(
        data.email || "",
        data.name || "",
        data.message || "Please verify your email address before authorizing a device."
      );
    });
  });

  es.addEventListener("device_limit_reached", (e: MessageEvent) => {
    console.log("[authService] SSE received 'device_limit_reached' event:", e.data);
    const data = JSON.parse(e.data);
    finish(() => {
      callbacks.onError(data.message || "Device limit reached. Remove an old device or upgrade your plan.");
    });
  });

  es.addEventListener("trial_unavailable", (e: MessageEvent) => {
    console.log("[authService] SSE received 'trial_unavailable' event:", e.data);
    const data = JSON.parse(e.data);
    finish(() => callbacks.onError(data.message || "This device has already used its free trial. Please subscribe to continue."));
  });

  es.addEventListener("error", (e: MessageEvent | Event) => {
    if (settled) return;
    const msg = "data" in e
      ? JSON.parse(e.data).message || "Connection lost"
      : "Connection lost";
    console.log("[authService] SSE error:", msg);
    finish(() => callbacks.onError(msg));
  });

  return () => {
    settled = true;
    es.close();
  };
}

/**
 * Open the browser to the device pairing page.
 */
export async function openBrowserForPairing(code: string): Promise<void> {
  const url = `${getDashboardBaseForAuth()}/device?code=${encodeURIComponent(code)}`;
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
    const { response: res } = await fetchAuthApi("/api/pairing/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.toUpperCase().replace(/[^A-Z0-9]/g, "") }),
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
    const { response: res } = await fetchAuthApi("/api/pairing/check-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.toUpperCase().replace(/[^A-Z0-9]/g, "") }),
    });
    const data = await res.json();
    if (!res.ok) return { verified: false, error: data.error || "Failed to check" };
    return { verified: data.verified };
  } catch {
    return { verified: false, error: "Connection failed" };
  }
}
