/**
 * obsBrowserSourceRefresh.ts
 *
 * Wakes up every MakeChurchEazy browser source in OBS by pressing OBS's own
 * "Refresh cache of current page" button, so nobody has to do it by hand.
 *
 * Why it is needed: if OBS loads a browser source before the app's overlay
 * server is up (OBS opened first, or the app was restarted), the source stays
 * blank until it is refreshed.
 *
 * It is built not to disturb a live show:
 *  - it never runs while OBS is streaming, recording, or running the virtual camera;
 *  - it runs once per app session, shortly after OBS connects, not on every reconnect;
 *  - it only touches browser sources that point at the MakeChurchEazy overlay server,
 *    never the church's own browser sources (chat, widgets, and so on);
 *  - sources are refreshed one at a time with a short gap, not all in the same instant.
 */

import { getOverlayBaseUrlSync } from "./overlayUrl";

export type ObsRequest = (requestType: string, requestData?: Record<string, unknown>) => Promise<unknown>;

export type RefreshSkipReason = "live" | "obs-error";

export interface MceBrowserSourceRefreshResult {
  refreshed: string[];
  skipped: RefreshSkipReason | null;
}

interface RefreshOptions {
  /** Where the overlay server lives, for example http://127.0.0.1:45678. */
  overlayBaseUrl: string;
  /** Gap between two sources, so they do not all reload in the same instant. */
  staggerMs?: number;
}

const DEFAULT_STAGGER_MS = 250;
const START_DELAY_MS = 3000;
const OVERLAY_PROBE_ATTEMPTS = 4;
const OVERLAY_PROBE_GAP_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function portOf(url: URL): string {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

/**
 * True when a browser source belongs to MakeChurchEazy: it loads a page from the
 * overlay server, or it is named like an MCE source and loads a page from this machine
 * or the local network. Anything else (a church's chat box, a web widget) is left alone.
 */
export function isMceBrowserSourceUrl(rawUrl: unknown, inputName: string, overlayBaseUrl: string): boolean {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
  let url: URL;
  let base: URL;
  try {
    url = new URL(rawUrl.trim());
    base = new URL(overlayBaseUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!isLocalOrPrivateHost(url.hostname)) return false;
  if (portOf(url) === portOf(base)) return true;
  return /\bMCE\b/i.test(inputName);
}

/** true = something is live, false = nothing is live, null = OBS would not say. */
async function isObsOutputLive(request: ObsRequest): Promise<boolean | null> {
  const types = ["GetStreamStatus", "GetRecordStatus", "GetVirtualCamStatus"];
  const answers = await Promise.all(
    types.map(async (type) => {
      try {
        return (await request(type)) as { outputActive?: boolean } | null;
      } catch {
        return undefined;
      }
    }),
  );
  if (answers.every((answer) => answer === undefined)) return null;
  return answers.some((answer) => answer?.outputActive === true);
}

/** Wait (briefly) until the overlay server answers. Never blocks the refresh for long. */
async function waitForOverlayServer(baseUrl: string): Promise<void> {
  if (typeof fetch !== "function") return;
  for (let attempt = 0; attempt < OVERLAY_PROBE_ATTEMPTS; attempt += 1) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), 2000);
    try {
      await fetch(baseUrl, { mode: "no-cors", cache: "no-store", signal: controller?.signal });
      return;
    } catch {
      // Not up yet (or the probe is not allowed here). Try again, then carry on regardless.
    } finally {
      clearTimeout(timer);
    }
    await sleep(OVERLAY_PROBE_GAP_MS);
  }
}

/** Refresh every MakeChurchEazy browser source in OBS. Never throws. */
export async function refreshMceBrowserSources(
  request: ObsRequest,
  options: RefreshOptions,
): Promise<MceBrowserSourceRefreshResult> {
  try {
    const live = await isObsOutputLive(request);
    if (live === null) return { refreshed: [], skipped: "obs-error" };
    if (live) return { refreshed: [], skipped: "live" };

    const list = (await request("GetInputList")) as {
      inputs?: Array<{ inputName?: string; inputKind?: string }>;
    } | null;
    const browserInputs = (list?.inputs ?? [])
      .filter((input) => input.inputKind === "browser_source" && typeof input.inputName === "string")
      .map((input) => input.inputName as string);

    const targets: string[] = [];
    for (const inputName of browserInputs) {
      try {
        const settings = (await request("GetInputSettings", { inputName })) as {
          inputSettings?: { url?: unknown };
        } | null;
        if (isMceBrowserSourceUrl(settings?.inputSettings?.url, inputName, options.overlayBaseUrl)) {
          targets.push(inputName);
        }
      } catch {
        // Cannot read this one; leave it alone.
      }
    }

    const refreshed: string[] = [];
    const gap = options.staggerMs ?? DEFAULT_STAGGER_MS;
    for (const inputName of targets) {
      // A show may have started while we were working through the list.
      if (refreshed.length > 0 && (await isObsOutputLive(request)) === true) {
        return { refreshed, skipped: "live" };
      }
      try {
        await request("PressInputPropertiesButton", { inputName, propertyName: "refreshnocache" });
        refreshed.push(inputName);
      } catch (err) {
        console.warn(`[MCE] Could not refresh browser source "${inputName}":`, err);
      }
      await sleep(gap);
    }
    return { refreshed, skipped: null };
  } catch (err) {
    console.warn("[MCE] Browser source refresh failed:", err);
    return { refreshed: [], skipped: "obs-error" };
  }
}

const finishedSessions = new Set<string>();
const runningSessions = new Set<string>();

/**
 * Call this when OBS connects. It waits a moment for the overlay server, then
 * refreshes the MakeChurchEazy browser sources once for this app session.
 * A session that was skipped (a show was live) is tried again at the next connect.
 */
export async function scheduleMceBrowserSourceRefresh(
  request: ObsRequest,
  context: string,
): Promise<void> {
  const overlayBaseUrl = getOverlayBaseUrlSync();
  const key = `${context}|${overlayBaseUrl}`;
  if (finishedSessions.has(key) || runningSessions.has(key)) return;
  runningSessions.add(key);
  try {
    await sleep(START_DELAY_MS);
    await waitForOverlayServer(overlayBaseUrl);
    const result = await refreshMceBrowserSources(request, { overlayBaseUrl });
    if (result.skipped === null) {
      finishedSessions.add(key);
      if (result.refreshed.length > 0) {
        console.info(`[MCE] Refreshed ${result.refreshed.length} OBS browser source(s):`, result.refreshed);
      }
    }
  } finally {
    runningSessions.delete(key);
  }
}
