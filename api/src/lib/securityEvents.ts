/**
 * securityEvents.ts — append-only log of suspicious activity (`security_events`).
 *
 * Used by the licence routes to record things an admin may want to look at:
 * licences that failed signature checks on the desktop, accounts bumping into the
 * device limit, and responses the server could not sign. Events are de-duplicated
 * per (type, device or user, reason) inside a time window so a retry loop can't
 * flood the collection.
 */
import type { Db } from "mongodb";

export type SecurityEventType =
  | "license_tamper"
  | "device_limit"
  | "license_unsigned";

export interface SecurityEventInput {
  type: SecurityEventType;
  userId?: string;
  deviceId?: string;
  reason?: string;
  appVersion?: string;
  ip?: string;
  details?: Record<string, unknown>;
}

export const SECURITY_EVENT_DEDUPE_MS = 60 * 60 * 1000;

export function clientIpFromHeaders(headers: Pick<Headers, "get">): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "";
}

/** Returns true when a new event was stored, false when it was a duplicate. Never throws. */
export async function recordSecurityEvent(
  db: Db,
  event: SecurityEventInput,
  now: Date = new Date(),
  dedupeMs: number = SECURITY_EVENT_DEDUPE_MS,
): Promise<boolean> {
  try {
    const events = db.collection("security_events");
    const recent = await events.findOne({
      type: event.type,
      userId: event.userId ?? null,
      deviceId: event.deviceId ?? null,
      reason: event.reason ?? null,
      createdAt: { $gte: new Date(now.getTime() - dedupeMs) },
    });
    if (recent) return false;
    await events.insertOne({
      type: event.type,
      userId: event.userId ?? null,
      deviceId: event.deviceId ?? null,
      reason: event.reason ?? null,
      appVersion: event.appVersion ?? "",
      ip: event.ip ?? "",
      ...(event.details ? { details: event.details } : {}),
      createdAt: now,
    });
    return true;
  } catch (err) {
    console.warn("[securityEvents] Could not record event:", err instanceof Error ? err.message : err);
    return false;
  }
}
