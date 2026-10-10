/**
 * broadcastUsageService.ts — Tracks and manages multistream broadcast hours quota.
 *
 * The server (/api/broadcast/usage) is the source of truth for the allowance and hours used;
 * this module keeps a local meter for instant feedback and reconciles with the server.
 *
 * Growth Plan includes 20 hours/month of cloud multistreaming.
 * Basic Plan includes 10 hours/month.
 * Pro / Unlimited includes 40 hours/month.
 *
 * Tracks streaming duration across sessions, subtracts elapsed time,
 * scopes usage to the current billing month, and provides live reactive updates.
 */

import { readNativeDockSetting, writeNativeDockSetting } from "./localDockSettings";
import { getDeviceApiBaseCandidates, getDeviceId, getDeviceSecret } from "./authService";

export const MULTISTREAM_USAGE_STORAGE_KEY = "ocs-dock-multistream-usage-v2";

export interface MultistreamUsageState {
  monthKey: string; // e.g. "2026-10"
  usedSeconds: number;
  lastUpdated: number;
  lastHeartbeat?: number;
}

export interface MultistreamUsageInfo {
  totalHours: number;
  usedSeconds: number;
  usedHours: number;
  remainingSeconds: number;
  remainingHours: number;
  formattedRemaining: string;
  formattedUsed: string;
  isExhausted: boolean;
  percentageUsed: number;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const subscribers = new Set<(info: MultistreamUsageInfo) => void>();

export interface MultistreamTelemetryChannel {
  name: string;
  platform: string;
}

interface MultistreamTelemetrySnapshot {
  active: boolean;
  profileName?: string;
  channels?: MultistreamTelemetryChannel[];
}

const TELEMETRY_HEARTBEAT_MS = 30_000;
const telemetryStateByDevice = new Map<string, { active: boolean; fingerprint: string; sentAt: number }>();

function telemetryHeaders(deviceId: string, deviceSecret: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
    ...(deviceSecret ? { "X-Device-Secret": deviceSecret } : {}),
  };
}

async function postMultistreamTelemetry(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const deviceId = getDeviceId();
  if (!deviceId) return null;
  const headers = telemetryHeaders(deviceId, getDeviceSecret());

  for (const apiBase of getDeviceApiBaseCandidates()) {
    try {
      const response = await fetch(`${apiBase}/api/broadcast/usage`, {
        method: "POST",
        headers,
        credentials: "omit",
        body: JSON.stringify(body),
      });
      if (response.ok) return ((await response.json().catch(() => ({}))) as Record<string, unknown>) || {};
      if (response.status === 400 || response.status === 401 || response.status === 403) return null;
    } catch {
      // Try the next configured API endpoint.
    }
  }
  return null;
}

// ── Server allowance (source of truth for multi-stream hours) ───────────────

export const MULTISTREAM_SERVER_QUOTA_KEY = "ocs-dock-multistream-server-quota-v1";
export const MULTISTREAM_EXHAUSTED_EVENT = "mce-multistream-exhausted";
const SERVER_QUOTA_REFRESH_MS = 60_000;

export interface ServerMultistreamQuota {
  plan: string;
  allowed: boolean;
  unlimited: boolean;
  hours: number;
  usedSeconds: number;
  /** -1 when unlimited. */
  remainingSeconds: number;
  exhausted: boolean;
  periodEnd?: string;
  fetchedAt: number;
}

let lastServerQuota: ServerMultistreamQuota | null = null;
let quotaRequest: Promise<ServerMultistreamQuota | null> | null = null;

export function getLastServerMultistreamQuota(): ServerMultistreamQuota | null {
  if (!lastServerQuota) {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(MULTISTREAM_SERVER_QUOTA_KEY) : null;
      lastServerQuota = raw ? (JSON.parse(raw) as ServerMultistreamQuota) : null;
    } catch {
      lastServerQuota = null;
    }
  }
  // A quota from a past billing month no longer applies.
  if (lastServerQuota?.periodEnd && new Date(lastServerQuota.periodEnd).getTime() < Date.now()) return null;
  return lastServerQuota;
}

function rememberServerQuota(quota: ServerMultistreamQuota): void {
  lastServerQuota = quota;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MULTISTREAM_SERVER_QUOTA_KEY, JSON.stringify(quota));
  } catch {
    // ignore
  }
  // Keep the local meter in line with the account (usage from other computers counts too).
  if (!quota.unlimited) {
    const state = loadMultistreamUsage();
    if (quota.usedSeconds > state.usedSeconds) {
      state.usedSeconds = quota.usedSeconds;
      state.lastUpdated = Date.now();
      saveMultistreamUsage(state);
    }
  }
  notifySubscribers(getMultistreamUsageInfo(quota.unlimited ? 0 : quota.hours));
}

/** Ask the server how many multi-stream hours this church has left this month. */
export async function fetchServerMultistreamQuota(force = false): Promise<ServerMultistreamQuota | null> {
  const cached = getLastServerMultistreamQuota();
  if (!force && cached && Date.now() - cached.fetchedAt < SERVER_QUOTA_REFRESH_MS) return cached;
  if (quotaRequest) return quotaRequest;
  const deviceId = getDeviceId();
  if (!deviceId) return null;
  const headers = telemetryHeaders(deviceId, getDeviceSecret());
  quotaRequest = (async () => {
    for (const apiBase of getDeviceApiBaseCandidates()) {
      try {
        const response = await fetch(`${apiBase}/api/broadcast/usage`, { method: "GET", headers, credentials: "omit" });
        if (response.status === 401 || response.status === 403) return null;
        if (!response.ok) continue;
        const data = (await response.json().catch(() => null)) as { quota?: Omit<ServerMultistreamQuota, "fetchedAt"> } | null;
        if (!data?.quota) continue;
        const quota: ServerMultistreamQuota = { ...data.quota, fetchedAt: Date.now() };
        rememberServerQuota(quota);
        return quota;
      } catch {
        // Try the next configured API endpoint.
      }
    }
    return null;
  })().finally(() => {
    quotaRequest = null;
  });
  return quotaRequest;
}

function handleHeartbeatResponse(data: Record<string, unknown> | null): void {
  if (!data || typeof data.exhausted !== "boolean") return;
  const previous = getLastServerMultistreamQuota();
  if (previous && !previous.unlimited) {
    const remainingSeconds = Number(data.remainingSeconds ?? previous.remainingSeconds);
    rememberServerQuota({
      ...previous,
      remainingSeconds,
      usedSeconds: Math.max(previous.usedSeconds, previous.hours * 3600 - remainingSeconds),
      exhausted: data.exhausted,
      fetchedAt: Date.now(),
    });
  }
  if (data.exhausted && typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(MULTISTREAM_EXHAUSTED_EVENT, { detail: { message: data.message } }));
    } catch {
      // ignore
    }
  }
}

/** Report only destination labels and platforms; stream keys and ingest URLs stay local. */
export async function reportMultistreamStatus(snapshot: MultistreamTelemetrySnapshot): Promise<void> {
  const deviceId = getDeviceId();
  if (!deviceId) return;

  const channels = (snapshot.channels || []).slice(0, 10).map((channel) => ({
    name: String(channel.name || "").trim().slice(0, 100),
    platform: String(channel.platform || "other").trim().slice(0, 40),
  }));
  const profileName = String(snapshot.profileName || "").trim().slice(0, 100);
  const fingerprint = JSON.stringify({ profileName, channels });
  const now = Date.now();
  const previous = telemetryStateByDevice.get(deviceId);

  if (!snapshot.active && !previous?.active) return;
  if (snapshot.active && previous?.active && previous.fingerprint === fingerprint && now - previous.sentAt < TELEMETRY_HEARTBEAT_MS) {
    return;
  }

  telemetryStateByDevice.set(deviceId, {
    active: snapshot.active,
    fingerprint,
    sentAt: now,
  });
  const response = await postMultistreamTelemetry({
    event: snapshot.active ? "active" : "inactive",
    profileName,
    channels,
  });
  if (snapshot.active) handleHeartbeatResponse(response);
}

/** Record a short, scrubbed operational error without sending stream credentials. */
export async function reportMultistreamError(params: {
  stage: string;
  code: string;
  message: string;
  profileName?: string;
  channels?: MultistreamTelemetryChannel[];
}): Promise<void> {
  const channels = (params.channels || []).slice(0, 10).map((channel) => ({
    name: String(channel.name || "").trim().slice(0, 100),
    platform: String(channel.platform || "other").trim().slice(0, 40),
  }));
  const message = String(params.message || "Multi-Stream action failed")
    .replace(/\b(bearer|token|secret|password|stream[ _-]?key)\b\s*[:=]?\s*[^\s,;]+/gi, "$1=[hidden]")
    .replace(/\brtmps?:\/\/[^\s]+/gi, "[stream address]")
    .slice(0, 240);
  const eventId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await postMultistreamTelemetry({
    event: "error",
    eventId,
    stage: String(params.stage || "unknown").slice(0, 50),
    code: String(params.code || "UNKNOWN").slice(0, 80),
    message,
    profileName: String(params.profileName || "").trim().slice(0, 100),
    channels,
  });
}

export function formatHoursAndMinutes(seconds: number): string {
  const safeSec = Math.max(0, Math.round(seconds));
  if (safeSec === 0) return "0h";
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.max(1, minutes)}m`;
}

export function loadMultistreamUsage(): MultistreamUsageState {
  const currentMonth = getCurrentMonthKey();
  try {
    let raw: MultistreamUsageState | null = null;
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(MULTISTREAM_USAGE_STORAGE_KEY);
      if (stored) {
        raw = JSON.parse(stored) as MultistreamUsageState;
      }
    }
    if (!raw) {
      raw = readNativeDockSetting<MultistreamUsageState>(MULTISTREAM_USAGE_STORAGE_KEY) || null;
    }

    if (raw && raw.monthKey === currentMonth && typeof raw.usedSeconds === "number") {
      return raw;
    }
  } catch {
    // fallback below
  }

  // New month or uninitialized
  return {
    monthKey: currentMonth,
    usedSeconds: 0,
    lastUpdated: Date.now(),
  };
}

export function resetMultistreamUsage(): void {
  const currentMonth = getCurrentMonthKey();
  const resetState: MultistreamUsageState = {
    monthKey: currentMonth,
    usedSeconds: 0,
    lastUpdated: Date.now(),
  };
  saveMultistreamUsage(resetState);
}

export function saveMultistreamUsage(state: MultistreamUsageState): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MULTISTREAM_USAGE_STORAGE_KEY, JSON.stringify(state));
    }
    writeNativeDockSetting(MULTISTREAM_USAGE_STORAGE_KEY, state);
  } catch (err) {
    console.warn("[BroadcastUsage] Failed to save usage:", err);
  }
}

export function getMultistreamUsageInfo(planHours: number = 20): MultistreamUsageInfo {
  const state = loadMultistreamUsage();
  // The account's allowance from the server wins over the hours guessed from the plan name.
  const server = getLastServerMultistreamQuota();
  const hours = server && !server.unlimited && server.allowed ? server.hours : planHours;
  const totalSeconds = hours * 3600;
  const remainingSeconds = Math.max(0, totalSeconds - state.usedSeconds);
  const remainingHours = Math.round((remainingSeconds / 3600) * 10) / 10;
  const usedHours = Math.round((state.usedSeconds / 3600) * 10) / 10;
  const percentageUsed = totalSeconds > 0 ? Math.min(100, Math.round((state.usedSeconds / totalSeconds) * 100)) : 100;

  return {
    totalHours: hours,
    usedSeconds: state.usedSeconds,
    usedHours,
    remainingSeconds,
    remainingHours,
    formattedRemaining: formatHoursAndMinutes(remainingSeconds),
    formattedUsed: formatHoursAndMinutes(state.usedSeconds),
    // A plan without multi-stream hours (free) counts as exhausted.
    isExhausted: hours <= 0 || remainingSeconds <= 0,
    percentageUsed,
  };
}

export function notifySubscribers(info: MultistreamUsageInfo): void {
  for (const cb of subscribers) {
    try {
      cb(info);
    } catch {
      // ignore callback error
    }
  }
}

export function recordMultistreamElapsed(deltaSeconds: number, planHours: number = 20): MultistreamUsageInfo {
  if (deltaSeconds <= 0) return getMultistreamUsageInfo(planHours);

  const state = loadMultistreamUsage();
  state.usedSeconds += deltaSeconds;
  state.lastUpdated = Date.now();
  saveMultistreamUsage(state);

  const info = getMultistreamUsageInfo(planHours);
  notifySubscribers(info);
  return info;
}

/**
 * Deduplicated stream heartbeat for polling loops (Dock + Main App).
 * Prevents double-counting when both the OBS Dock and Main Desktop App are open.
 */
export function recordMultistreamHeartbeat(planHours: number = 20): MultistreamUsageInfo {
  const now = Date.now();
  const state = loadMultistreamUsage();

  if (state.lastHeartbeat && (now - state.lastHeartbeat) < 1500) {
    // Already recorded within the last 1.5 seconds by another window/tab
    return getMultistreamUsageInfo(planHours);
  }

  // If last heartbeat was within 6 seconds, delta is real elapsed; otherwise treat as initial pulse (2s)
  const deltaSeconds = state.lastHeartbeat && (now - state.lastHeartbeat) <= 6000
    ? Math.max(1, Math.round((now - state.lastHeartbeat) / 1000))
    : 2;

  state.usedSeconds += deltaSeconds;
  state.lastHeartbeat = now;
  state.lastUpdated = now;
  saveMultistreamUsage(state);

  const info = getMultistreamUsageInfo(planHours);
  notifySubscribers(info);
  return info;
}

export function subscribeMultistreamUsage(
  callback: (info: MultistreamUsageInfo) => void,
  planHours: number = 20,
): () => void {
  subscribers.add(callback);
  callback(getMultistreamUsageInfo(planHours));
  void fetchServerMultistreamQuota().catch(() => null);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === MULTISTREAM_USAGE_STORAGE_KEY) {
      callback(getMultistreamUsageInfo(planHours));
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    subscribers.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}
