/**
 * analytics.ts — MakeChurchEasy analytics service.
 *
 * Sends events to a self-hosted Cloudflare Worker endpoint.
 * Never call the endpoint directly from components.
 * Always use this service.
 *
 * Privacy: Does NOT track Bible verse content, transcripts, lyrics,
 * church data, OBS scenes, email addresses, file paths, or personal info.
 * Only collects usage metrics and product telemetry.
 */

// ── Constants ───────────────────────────────────────────────────────────────

const INSTALLATION_ID_KEY = "mce_installation_id";
const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FIRST_LAUNCH_KEY = "mce-first-launch-seen";

// ── Config ──────────────────────────────────────────────────────────────────

const ANALYTICS_ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined;
const ANALYTICS_TOKEN = import.meta.env.VITE_ANALYTICS_TOKEN as string | undefined;

// ── Platform Detection ──────────────────────────────────────────────────────

function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac") || ua.includes("darwin")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

function detectArchitecture(): string {
  try {
    const uaData = (navigator as any).userAgentData;
    if (uaData?.architecture) return uaData.architecture;
  } catch { /* ignore */ }
  const ua = navigator.userAgent;
  if (ua.includes("x86_64") || ua.includes("Win64") || ua.includes("x64")) return "x86_64";
  if (ua.includes("arm64") || ua.includes("aarch64")) return "arm64";
  if (ua.includes("arm")) return "arm";
  return "unknown";
}

// ── Installation ID ─────────────────────────────────────────────────────────

function getInstallationId(): string {
  try {
    let id = localStorage.getItem(INSTALLATION_ID_KEY);
    if (id) return id;
    id = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_ID_KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

// ── Common Properties (auto-injected on every event) ────────────────────────

function getCommonProperties(): Record<string, unknown> {
  return {
    app_version: typeof __APP_VERSION__ !== "undefined" ? (__APP_VERSION__ as string) : "unknown",
    platform: detectPlatform(),
    architecture: detectArchitecture(),
    install_id: getInstallationId(),
    screen_width: screen.width,
    screen_height: screen.height,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    locale: navigator.language ?? "unknown",
    device_memory: (navigator as any).deviceMemory ?? "unknown",
    hardware_concurrency: navigator.hardwareConcurrency ?? "unknown",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown",
  };
}

// ── Init ────────────────────────────────────────────────────────────────────

let initialized = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;

  // Start heartbeat
  startHeartbeat();
}

// ── Core API ────────────────────────────────────────────────────────────────

async function sendEvent(event: string, properties?: Record<string, unknown>): Promise<void> {
  if (!ANALYTICS_ENDPOINT || !ANALYTICS_TOKEN) return;

  try {
    await fetch(`${ANALYTICS_ENDPOINT}/e`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANALYTICS_TOKEN}`,
      },
      body: JSON.stringify({
        event,
        properties: {
          ...getCommonProperties(),
          ...properties,
        },
        timestamp: new Date().toISOString(),
      }),
      // Fire and forget — don't block the app
      keepalive: true,
    });
  } catch {
    // Analytics should never break the app
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  // Fire and forget — don't await
  void sendEvent(event, properties);
}

export function identify(userId: string, properties?: Record<string, unknown>): void {
  track("identify", { identified_user: userId, ...properties });
}

export function captureException(error: Error | unknown, extra?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  track("error_captured", {
    error_name: err.name,
    error_message: err.message,
    ...extra,
  });
}

// ── Convenience: get installation id for external use ────────────────────────

export function getAnalyticsInstallationId(): string {
  return getInstallationId();
}

// ── Heartbeat System ────────────────────────────────────────────────────────

function startHeartbeat(): void {
  sendHeartbeat();
  heartbeatTimer = setInterval(() => {
    sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

function sendHeartbeat(): void {
  track("heartbeat", {
    last_online_check: new Date().toISOString(),
  });
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ── First Launch Detection ──────────────────────────────────────────────────

export function isFirstLaunch(): boolean {
  try {
    return !localStorage.getItem(FIRST_LAUNCH_KEY);
  } catch {
    return false;
  }
}

export function markFirstLaunchSeen(): void {
  try {
    localStorage.setItem(FIRST_LAUNCH_KEY, "true");
  } catch {
    // Ignore
  }
}

// ── Named Event Trackers ────────────────────────────────────────────────────
// These provide typed, documented access points for common events.

export function trackAppStarted(): void {
  const firstLaunch = isFirstLaunch();
  if (firstLaunch) {
    track("app_installed", { first_launch: true });
    markFirstLaunchSeen();
  }
  track("app_started", { first_launch: firstLaunch });
}

export function trackAppClosed(sessionDuration: number): void {
  track("app_closed", { sessionDuration });
}

export function trackObsConnected(): void {
  track("obs_connected", { reason: "websocket" });
}

export function trackObsDisconnected(): void {
  track("obs_disconnected");
}

// ── Activation / License Events ─────────────────────────────────────────────

export function trackActivationVerified(): void {
  track("activation_verified");
}

export function trackActivationFailed(reason?: string): void {
  track("activation_failed", { reason: reason ?? "unknown" });
}

export function trackLicenseCheck(success: boolean, daysSinceLastVerification: number): void {
  track("license_check", {
    success,
    days_since_last_verification: daysSinceLastVerification,
  });
}

export function trackInternetVerificationWarning(daysRemaining: number): void {
  track("internet_verification_warning", { days_remaining: daysRemaining });
}

export function trackInternetVerificationRequired(): void {
  track("internet_verification_required");
}

// ── Beta Events ─────────────────────────────────────────────────────────────

export function trackBetaBuildStarted(): void {
  track("beta_build_started");
}

export function trackBetaBuildExpired(): void {
  track("beta_build_expired");
}

export function trackBetaBuildVerificationFailed(): void {
  track("beta_build_verification_failed");
}

// ── Product Analytics ───────────────────────────────────────────────────────

export function trackMultiviewOpened(): void {
  track("multiview_opened");
}

export function trackTranslationDownloaded(translation: string): void {
  track("translation_downloaded", { translation });
}

export function trackAppUpdated(fromVersion: string, toVersion: string): void {
  track("app_updated", { from_version: fromVersion, to_version: toVersion });
}
