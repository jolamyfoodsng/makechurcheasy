import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { checkVersionGate } from "@/lib/versionGate";
import { rateLimit } from "@/lib/rateLimit";
import { getAuthUser } from "@/lib/auth";

// Desktop app creates pairing codes — allow 10 per minute per IP
const pairingCreateLimiter = rateLimit({ windowMs: 60_000, max: 10 });

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  // Store canonical form (no hyphen) — display formatting is handled client-side
  return `${seg(4)}${seg(4)}`;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Version, X-Device-Id",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  // Block old desktop app versions from pairing
  const blocked = await checkVersionGate(req);
  if (blocked) return blocked;

  const rl = pairingCreateLimiter.check(req);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const { deviceName, ttlSeconds, previousCode, installationId, fingerprintHash } = (await req.json()) as {
      deviceName?: string;
      ttlSeconds?: number;
      previousCode?: string;
      installationId?: string;
      fingerprintHash?: string;
    };

    // When the dashboard creates a code (authenticated), attach the userId
    // so the desktop can redeem it directly without a browser round-trip.
    const authUser = await getAuthUser().catch(() => null);
    const userId = authUser?.mongoUser?._id?.toString() || null;

    const client = await clientPromise;
    const db = client.db();

    // Invalidate any existing unused codes for this device/user before creating a new one.
    // Only ONE active pairing code should exist per device at any time.
    // Exclude redeemed codes — the dashboard poll needs to detect those.
    const deleteFilter: Record<string, unknown> = {
      used: false,
      redeemed: { $ne: true },
      $or: [
        ...(userId ? [{ userId }] : []),
        { deviceName: deviceName || "MakeChurchEasy" },
        ...(previousCode ? [{ code: previousCode }] : []),
      ],
    };
    await db.collection("pairingCodes").deleteMany(deleteFilter);

    const code = generateCode();
    // Progressive TTL: client sends desired seconds, capped at 5 minutes
    const ttl = Math.min(Math.max(Number(ttlSeconds) || 300, 5), 300);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await db.collection("pairingCodes").insertOne({
      code,
      deviceName: deviceName || "MakeChurchEasy",
      userId,
      installationId: typeof installationId === "string" ? installationId : null,
      fingerprintHash: typeof fingerprintHash === "string" ? fingerprintHash : null,
      used: false,
      expiresAt,
      createdAt: new Date(),
    });

    return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error("Pairing create error:", err);
    return NextResponse.json({ error: "Failed to create pairing code" }, { status: 500 });
  }
}
