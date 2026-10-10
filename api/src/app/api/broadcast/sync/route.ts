import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/adminControls";
import clientPromise from "@/lib/mongodb";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
  syncCloudflareLiveOutputs,
  type BroadcastChannelPayload,
  type BroadcastPlatformId,
} from "@/lib/broadcastStreamService";
import { getMultistreamQuota, quotaExhaustedMessage } from "@/lib/multistreamQuota";

/**
 * POST /api/broadcast/sync
 *
 * Prepares the cloud broadcasting engine for one speaker profile and returns the private
 * ingest (server + key) OBS should stream to. Requires a signed-in device, a plan that
 * includes multi-streaming and hours left this month.
 *
 * Error codes (in `error`): NOT_SIGNED_IN, PLAN_REQUIRED, QUOTA_EXHAUSTED, INVALID_PAYLOAD,
 * NO_ACTIVE_CHANNELS, NO_OUTPUTS, TOO_MANY_PROFILES, MISSING_TOKEN, STREAM_NOT_ENABLED,
 * ENGINE_UNAVAILABLE, NO_STREAM_KEY.
 */

const MAX_DESTINATIONS = 10;
const MAX_PROFILES_PER_ACCOUNT = 25;
const PLATFORMS = new Set<BroadcastPlatformId>(["youtube", "facebook", "instagram", "tiktok", "kick", "twitch", "custom"]);

let indexReady: Promise<unknown> | null = null;

function clean(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function parseChannels(value: unknown): BroadcastChannelPayload[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DESTINATIONS) return null;
  const channels: BroadcastChannelPayload[] = [];
  for (const raw of value) {
    const id = clean(raw?.id, 100);
    const streamKey = clean(raw?.streamKey, 500);
    const platform = clean(raw?.platform, 20).toLowerCase() as BroadcastPlatformId;
    if (!id) return null;
    channels.push({
      id,
      name: clean(raw?.name, 100) || "Destination",
      platform: PLATFORMS.has(platform) ? platform : "custom",
      streamKey,
      serverUrl: clean(raw?.serverUrl, 500),
      enabled: raw?.enabled !== false,
    });
  }
  return channels;
}

function statusFor(error?: string): number {
  switch (error) {
    case "INVALID_PAYLOAD":
    case "NO_ACTIVE_CHANNELS":
    case "NO_OUTPUTS":
    case "TOO_MANY_PROFILES":
      return 400;
    case "MISSING_TOKEN":
    case "STREAM_NOT_ENABLED":
      return 503;
    default:
      return 502;
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUserFromRequest(req);
    const user = auth?.mongoUser;
    if (!user?._id) {
      return NextResponse.json({ success: false, error: "NOT_SIGNED_IN", message: "Sign in to Make Church Easy to multi-stream." }, { status: 401 });
    }
    if (user.isActive === false) {
      return NextResponse.json({ success: false, error: "NOT_SIGNED_IN", message: "This account is not active." }, { status: 403 });
    }

    if (!(await isFeatureEnabled("multistream"))) {
      return NextResponse.json(
        { success: false, error: "MULTISTREAM_DISABLED", message: "Multistream is paused for maintenance. Please try again later." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const channels = parseChannels(body?.channels);
    if (!body || !channels) {
      return NextResponse.json(
        { success: false, error: "INVALID_PAYLOAD", message: `Send between 1 and ${MAX_DESTINATIONS} destinations.` },
        { status: 400 },
      );
    }
    const profileName = clean(body.profileName ?? body.profileNickname, 100) || "Church Broadcast";
    // Older app versions do not send a profile id; key their input on the profile name.
    const profileId = clean(body.profileId, 100) || `name:${profileName.toLowerCase()}`;

    const client = await clientPromise;
    const db = client.db();
    const userId = String(user._id);

    const quota = await getMultistreamQuota(db, user);
    if (!quota.allowed) {
      return NextResponse.json(
        { success: false, error: "PLAN_REQUIRED", message: "Multi-streaming is included in Basic, Growth and Pro plans.", quota },
        { status: 403 },
      );
    }
    if (quota.exhausted) {
      return NextResponse.json(
        { success: false, error: "QUOTA_EXHAUSTED", message: quotaExhaustedMessage(quota), quota },
        { status: 403 },
      );
    }

    const inputs = db.collection("multistream_inputs");
    if (!indexReady) {
      indexReady = inputs.createIndex({ userId: 1, profileId: 1 }, { unique: true, name: "one_input_per_profile" }).catch(() => {
        indexReady = null;
      });
    }
    await indexReady;
    const existing = await inputs.findOne({ userId, profileId });
    if (!existing) {
      const count = await inputs.countDocuments({ userId });
      if (count >= MAX_PROFILES_PER_ACCOUNT) {
        return NextResponse.json(
          { success: false, error: "TOO_MANY_PROFILES", message: `Multi-streaming supports up to ${MAX_PROFILES_PER_ACCOUNT} speaker profiles per account. Delete a profile you no longer use.` },
          { status: 400 },
        );
      }
    }

    const result = await syncCloudflareLiveOutputs({
      inputName: `MCE · ${userId} · ${profileId}`,
      liveInputId: existing?.liveInputId ? String(existing.liveInputId) : null,
      channels,
    });

    if (result.liveInputId && result.liveInputId !== existing?.liveInputId) {
      await inputs.updateOne(
        { userId, profileId },
        {
          $set: { liveInputId: result.liveInputId, profileName, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    } else if (existing) {
      await inputs.updateOne({ _id: existing._id }, { $set: { profileName, lastSyncedAt: new Date() } });
    }

    if (!result.success) {
      return NextResponse.json({ ...result, quota }, { status: statusFor(result.error) });
    }
    return NextResponse.json({ ...result, quota });
  } catch (err: unknown) {
    console.error("[broadcast/sync] Failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: "ENGINE_UNAVAILABLE", message: "Could not prepare multi-streaming right now." },
      { status: 500 },
    );
  }
}
