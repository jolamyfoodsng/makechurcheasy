import { NextRequest, NextResponse } from "next/server";
import type { Db } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getMultistreamQuota, quotaExhaustedMessage } from "@/lib/multistreamQuota";

const STALE_SESSION_MS = 90_000;
const MAX_HEARTBEAT_SECONDS = 45;

type ChannelSummary = { name: string; platform: string };

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanChannels(value: unknown): ChannelSummary[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => ({
    name: cleanText(item?.name, 100),
    platform: cleanText(item?.platform, 40) || "other",
  }));
}

function errorCode(value: unknown): string {
  const code = cleanText(value, 80).replace(/[^a-zA-Z0-9_.:-]/g, "_");
  return code || "UNKNOWN";
}

function safeErrorMessage(value: unknown): string {
  return cleanText(value, 240)
    .replace(/\b(bearer|token|secret|password|stream[ _-]?key)\b\s*[:=]?\s*[^\s,;]+/gi, "$1=[hidden]")
    .replace(/\brtmps?:\/\/[^\s]+/gi, "[stream address]");
}

let indexesReady: Promise<void> | null = null;

function prepareIndexes(db: Db): Promise<void> {
  if (!indexesReady) indexesReady = Promise.all([
    db.collection("multistream_sessions").createIndex(
      { userId: 1, deviceId: 1 },
      { unique: true, partialFilterExpression: { status: "active" }, name: "one_active_session_per_user_device" },
    ),
    db.collection("multistream_sessions").createIndex(
      { lastHeartbeat: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 90, name: "multistream_sessions_90_day_ttl" },
    ),
    db.collection("multistream_errors").createIndex(
      { eventId: 1 },
      { unique: true, name: "multistream_errors_event_id" },
    ),
    db.collection("multistream_errors").createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 90, name: "multistream_errors_90_day_ttl" },
    ),
  ]).then(() => undefined).catch((error) => {
    indexesReady = null;
    throw error;
  });
  return indexesReady;
}

async function updateActiveSession(
  collection: any,
  session: Record<string, any>,
  now: Date,
  profileName: string,
  channels: ChannelSummary[],
  countryCode: string,
) {
  const lastHeartbeat = new Date(session.lastHeartbeat || session.startedAt);
  const deltaSeconds = Math.max(0, Math.min(MAX_HEARTBEAT_SECONDS, Math.floor((now.getTime() - lastHeartbeat.getTime()) / 1000)));
  await collection.updateOne(
    { _id: session._id, status: "active", lastHeartbeat: session.lastHeartbeat },
    {
      $set: { lastHeartbeat: now, profileName, channels, ...(countryCode ? { countryCode } : {}) },
      ...(deltaSeconds > 0 ? { $inc: { usedSeconds: deltaSeconds } } : {}),
    },
  );
}

/** GET — this church's multi-stream allowance and hours used this month (source of truth). */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUserFromRequest(req);
    const user = auth?.mongoUser;
    if (!user?._id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const client = await clientPromise;
    const quota = await getMultistreamQuota(client.db(), user);
    return NextResponse.json({ quota });
  } catch (error) {
    console.error("[broadcast/usage] Failed to read multi-stream quota:", error);
    return NextResponse.json({ error: "Could not read multi-stream usage" }, { status: 500 });
  }
}

/** Heartbeat reply: lets the app warn the operator when the month's hours run out mid-service. */
async function heartbeatReply(db: Db, user: Record<string, any>) {
  try {
    const quota = await getMultistreamQuota(db, user);
    return NextResponse.json({
      ok: true,
      exhausted: quota.exhausted,
      remainingSeconds: quota.remainingSeconds,
      ...(quota.exhausted ? { message: quotaExhaustedMessage(quota) } : {}),
    });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUserFromRequest(req);
    const user = auth?.mongoUser;
    if (!user?._id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const event = typeof body.event === "string" ? body.event : "";
    if (!["active", "inactive", "error"].includes(event)) {
      return NextResponse.json({ error: "Invalid multi-stream event" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    await prepareIndexes(db);
    const userId = String(user._id);
    const deviceId = cleanText(req.headers.get("x-device-id") || req.headers.get("x-mce-device-id"), 160) || "web";
    const countryHeader = cleanText(req.headers.get("cf-ipcountry"), 2).toUpperCase();
    const countryCode = /^[A-Z]{2}$/.test(countryHeader) && countryHeader !== "XX" ? countryHeader : "";
    const now = new Date();
    const sessions = db.collection("multistream_sessions");
    const errors = db.collection("multistream_errors");
    const profileName = cleanText(body.profileName, 100);
    const channels = cleanChannels(body.channels);

    if (event === "error") {
      const eventId = cleanText(body.eventId, 100);
      if (!eventId) return NextResponse.json({ error: "An event id is required" }, { status: 400 });
      try {
        await errors.insertOne({
          eventId,
          userId,
          deviceId,
          ...(countryCode ? { countryCode } : {}),
          profileName,
          channels,
          stage: cleanText(body.stage, 50) || "unknown",
          code: errorCode(body.code),
          message: safeErrorMessage(body.message) || "Multi-Stream action failed",
          createdAt: now,
        });
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
      }
      await sessions.updateOne(
        { userId, deviceId, status: "active" },
        { $inc: { errorCount: 1 }, $set: { lastErrorAt: now, lastErrorCode: errorCode(body.code) } },
      );
      return NextResponse.json({ ok: true });
    }

    let activeSession = await sessions.findOne({ userId, deviceId, status: "active" });
    if (activeSession) {
      const lastSeenAt = new Date(activeSession.lastHeartbeat || activeSession.startedAt);
      if (now.getTime() - lastSeenAt.getTime() > STALE_SESSION_MS) {
        await sessions.updateOne(
          { _id: activeSession._id, status: "active" },
          { $set: { status: "interrupted", endedAt: lastSeenAt } },
        );
        activeSession = null;
      }
    }

    if (event === "inactive") {
      if (activeSession) {
        const lastHeartbeat = new Date(activeSession.lastHeartbeat || activeSession.startedAt);
        const deltaSeconds = Math.max(0, Math.min(MAX_HEARTBEAT_SECONDS, Math.floor((now.getTime() - lastHeartbeat.getTime()) / 1000)));
        await sessions.updateOne(
          { _id: activeSession._id, status: "active", lastHeartbeat: activeSession.lastHeartbeat },
          {
            $set: { status: "ended", endedAt: now, lastHeartbeat: now, profileName, channels },
            ...(deltaSeconds > 0 ? { $inc: { usedSeconds: deltaSeconds } } : {}),
          },
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (activeSession) {
      await updateActiveSession(sessions, activeSession, now, profileName, channels, countryCode);
      return heartbeatReply(db, user);
    }

    try {
      await sessions.insertOne({
        userId,
        deviceId,
        ...(countryCode ? { countryCode } : {}),
        profileName,
        channels,
        status: "active",
        startedAt: now,
        lastHeartbeat: now,
        usedSeconds: 0,
        errorCount: 0,
      });
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
      activeSession = await sessions.findOne({ userId, deviceId, status: "active" });
      if (activeSession) await updateActiveSession(sessions, activeSession, now, profileName, channels, countryCode);
    }

    return heartbeatReply(db, user);
  } catch (error) {
    console.error("[broadcast/usage] Failed to record multi-stream usage:", error);
    return NextResponse.json({ error: "Could not record multi-stream usage" }, { status: 500 });
  }
}
