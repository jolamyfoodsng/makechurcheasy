/**
 * deviceInfo.ts — Extract app version and platform from API requests.
 *
 * The desktop app sends its version in the X-App-Version header.
 * Platform is inferred from the user-agent header.
 */

export interface DeviceVersionInfo {
  appVersion: string;
  appPlatform: string;
}

/**
 * Detect platform from the user-agent header.
 * Returns a clean string: "windows", "macos", "linux", or "unknown".
 */
function detectPlatformFromUA(ua: string | null): string {
  if (!ua) return "unknown";
  const lower = ua.toLowerCase();
  if (lower.includes("win")) return "windows";
  if (lower.includes("mac") || lower.includes("darwin")) return "macos";
  if (lower.includes("linux")) return "linux";
  return "unknown";
}

/**
 * Extract app version and platform from request headers.
 * Returns null values if no version header is present (e.g. web browser).
 */
export function extractDeviceInfo(req: Request): DeviceVersionInfo {
  const appVersion = req.headers.get("x-app-version") || "";
  const appPlatform = detectPlatformFromUA(req.headers.get("user-agent"));
  return { appVersion, appPlatform };
}
