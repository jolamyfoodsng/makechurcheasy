/**
 * obsDiagnostics.ts — Structured diagnostic logger for OBS connection stability.
 *
 * Writes JSONL (one JSON object per line) to:
 *   ~/Documents/MakeChurchEasy/obs-diagnostics.jsonl
 *
 * Logs every connection event: connect, disconnect, heartbeat, reconnect.
 * Includes a rolling stability summary that prints every 5 minutes.
 *
 * To enable: import and call initObsDiagnostics() once at app startup.
 * To disable: call disposeObsDiagnostics().
 */

import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { join, homeDir } from "@tauri-apps/api/path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ObsDiagnosticEvent {
  ts: string;           // ISO timestamp
  event: string;        // e.g. "connect", "disconnect", "heartbeat_ok", "heartbeat_fail", "reconnect"
  source: string;       // "main" | "dock"
  platform: string;     // navigator.userAgent or "node"
  detail?: string;      // human-readable message
  code?: number;        // WebSocket close code
  reconnectAttempt?: number;
  uptimeMs?: number;    // time since last connect
  missedHeartbeats?: number;
}

interface StabilitySummary {
  sessionStart: string;
  totalUptimeMs: number;
  totalDowntimeMs: number;
  connectCount: number;
  disconnectCount: number;
  reconnectCount: number;
  heartbeatOkCount: number;
  heartbeatFailCount: number;
  disconnectReasons: Record<string, number>;
  lastDisconnect?: ObsDiagnosticEvent;
  lastConnect?: ObsDiagnosticEvent;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let logPath = "";
let logReady = false;
let disposed = false;
let pendingFlush: Promise<void> = Promise.resolve();
let summaryTimer: ReturnType<typeof setInterval> | null = null;

const summary: StabilitySummary = {
  sessionStart: new Date().toISOString(),
  totalUptimeMs: 0,
  totalDowntimeMs: 0,
  connectCount: 0,
  disconnectCount: 0,
  reconnectCount: 0,
  heartbeatOkCount: 0,
  heartbeatFailCount: 0,
  disconnectReasons: {},
};

let lastConnectTs = 0;
let lastDisconnectTs = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the diagnostic logger. Safe to call multiple times. */
export async function initObsDiagnostics(): Promise<void> {
  if (logReady) return;

  try {
    const home = await homeDir();
    const dir = await join(home, "Documents", "MakeChurchEasy");
    await mkdir(dir, { recursive: true });
    logPath = await join(dir, "obs-diagnostics.jsonl");
    logReady = true;
    disposed = false;
  } catch {
    // File init failed — fall back to console-only logging
    console.warn("[OBS Diagnostics] Could not initialize file logging — using console only");
    return;
  }

  summary.sessionStart = new Date().toISOString();
  summary.connectCount = 0;
  summary.disconnectCount = 0;
  summary.reconnectCount = 0;
  summary.heartbeatOkCount = 0;
  summary.heartbeatFailCount = 0;
  summary.disconnectReasons = {};
  summary.totalUptimeMs = 0;
  summary.totalDowntimeMs = 0;

  // Print summary every 5 minutes
  summaryTimer = setInterval(() => {
    printSummary();
  }, 5 * 60 * 1000);

  logEvent({
    ts: new Date().toISOString(),
    event: "session_start",
    source: "main",
    platform: typeof navigator !== "undefined" ? navigator.userAgent : "node",
    detail: `Diagnostics initialized. Log: ${logPath}`,
  });

  console.log(`[OBS Diagnostics] Logging to ${logPath}`);
}

/** Shut down the diagnostic logger. */
export function disposeObsDiagnostics(): void {
  disposed = true;
  if (summaryTimer) { clearInterval(summaryTimer); summaryTimer = null; }
  printSummary();
}

/** Log a connection event. */
export function logObsEvent(
  event: ObsDiagnosticEvent["event"],
  source: "main" | "dock",
  detail?: string,
  extra?: Partial<ObsDiagnosticEvent>,
): void {
  const now = Date.now();

  const entry: ObsDiagnosticEvent = {
    ts: new Date().toISOString(),
    event,
    source,
    platform: typeof navigator !== "undefined" ? navigator.userAgent : "node",
    ...extra,
  };
  if (detail) entry.detail = detail;

  // Update summary counters
  switch (event) {
    case "connect":
      summary.connectCount++;
      if (lastConnectTs > 0 && lastDisconnectTs > 0) {
        summary.totalDowntimeMs += lastConnectTs - lastDisconnectTs;
      }
      lastConnectTs = now;
      summary.lastConnect = entry;
      break;
    case "disconnect":
      summary.disconnectCount++;
      if (lastConnectTs > 0) {
        summary.totalUptimeMs += now - lastConnectTs;
      }
      lastDisconnectTs = now;
      summary.lastDisconnect = entry;
      break;
    case "reconnect":
      summary.reconnectCount++;
      break;
    case "heartbeat_ok":
      summary.heartbeatOkCount++;
      break;
    case "heartbeat_fail":
      summary.heartbeatFailCount++;
      break;
  }

  if (event === "disconnect" && detail) {
    summary.disconnectReasons[detail] = (summary.disconnectReasons[detail] ?? 0) + 1;
  }

  logEvent(entry);
}

/** Get the current stability summary. */
export function getStabilitySummary(): StabilitySummary {
  // Account for current uptime
  const s = { ...summary };
  if (lastConnectTs > 0 && lastDisconnectTs === 0) {
    s.totalUptimeMs += Date.now() - lastConnectTs;
  }
  return s;
}

/** Print the stability summary to console. */
export function printSummary(): void {
  const s = getStabilitySummary();
  const totalMs = s.totalUptimeMs + s.totalDowntimeMs;
  const uptimePct = totalMs > 0 ? ((s.totalUptimeMs / totalMs) * 100).toFixed(1) : "N/A";

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║       OBS Connection Stability Summary               ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Session started:  ${s.sessionStart}`);
  console.log(`║  Total uptime:     ${(s.totalUptimeMs / 1000 / 60).toFixed(1)} min (${uptimePct}%)`);
  console.log(`║  Total downtime:   ${(s.totalDowntimeMs / 1000 / 60).toFixed(1)} min`);
  console.log(`║  Connects:         ${s.connectCount}`);
  console.log(`║  Disconnects:      ${s.disconnectCount}`);
  console.log(`║  Reconnects:       ${s.reconnectCount}`);
  console.log(`║  Heartbeat OK:     ${s.heartbeatOkCount}`);
  console.log(`║  Heartbeat fails:  ${s.heartbeatFailCount}`);
  if (Object.keys(s.disconnectReasons).length > 0) {
    console.log("║  Disconnect reasons:");
    for (const [reason, count] of Object.entries(s.disconnectReasons)) {
      console.log(`║    ${reason}: ${count}`);
    }
  }
  console.log("╚══════════════════════════════════════════════════════╝\n");
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function logEvent(entry: ObsDiagnosticEvent): void {
  const line = JSON.stringify(entry) + "\n";
  if (logReady && !disposed) {
    // Chain writes so they don't interleave / corrupt the file
    pendingFlush = pendingFlush.then(() =>
      writeTextFile(logPath, line, { append: true }).catch(() => {
        // File write failed — fall back to console only
      })
    );
  }
  // Also echo to console for live monitoring
  const tag = entry.source === "dock" ? "[DockOBS]" : "[OBSService]";
  const level = entry.event.includes("fail") || entry.event === "disconnect"
    ? "warn"
    : "log";
  console[level](`${tag} ${entry.event}: ${entry.detail ?? ""}`);
}
