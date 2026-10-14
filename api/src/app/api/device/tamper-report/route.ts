import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { resolveDeviceContext } from "@/lib/deviceRequest";
import { clientIpFromHeaders, recordSecurityEvent } from "@/lib/securityEvents";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-MCE-Device-Id, X-Device-Secret, X-App-Version",
  "Cache-Control": "no-store",
};

/** Reasons the desktop reports. Anything else is stored as "other". */
const KNOWN_REASONS = new Set([
  "bad_signature",
  "wrong_device",
  "malformed",
  "unsupported_version",
  "no_public_key",
  "missing_timestamp",
  "native_error",
]);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/device/tamper-report
 *
 * The desktop calls this when a licence from the server fails signature
 * verification, which usually means the licence file was edited or copied from
 * another computer (or a proxy is rewriting responses). Stored in
 * `security_events` so an admin can spot repeat offenders.
 *
 * Body: { kind: "license", reason: string }
 */
export async function POST(req: NextRequest) {
  try {
    const resolved = await resolveDeviceContext(req, CORS_HEADERS);
    if ("error" in resolved) return resolved.error;

    const body = (await req.json().catch(() => ({}))) as { kind?: unknown; reason?: unknown };
    const kind = body.kind === "license" ? "license" : "other";
    const rawReason = typeof body.reason === "string" ? body.reason.slice(0, 40) : "";
    const reason = KNOWN_REASONS.has(rawReason) ? rawReason : "other";

    const client = await clientPromise;
    await recordSecurityEvent(client.db(), {
      type: "license_tamper",
      userId: resolved.userId,
      deviceId: resolved.deviceId,
      reason,
      appVersion: req.headers.get("x-app-version") || "",
      ip: clientIpFromHeaders(req.headers),
      details: { kind },
    });

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err) {
    console.warn("[device/tamper-report] failed:", err instanceof Error ? err.message : err);
    // Never make the client retry or surface an error for a diagnostic.
    return NextResponse.json({ ok: false }, { status: 202, headers: CORS_HEADERS });
  }
}
