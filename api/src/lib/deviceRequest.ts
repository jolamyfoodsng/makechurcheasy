import { NextRequest, NextResponse } from "next/server";
import clientPromise from "./mongodb";
import { getAuthUser } from "./auth";
import { verifyDeviceSecret } from "./deviceAuth";

export interface ResolvedDeviceContext {
  device: Record<string, any>;
  deviceId: string;
  userId: string;
  source: "device-id" | "device-secret" | "session";
}

export interface ResolveDeviceContextOptions {
  /**
   * Desktop releases before this API hotfix treat 401/404 from bootstrap/license
   * as a permanent logout. During app updates and re-pairing, stale checks can
   * arrive with an old deviceId after the new session is already being written.
   * Use this only on startup/license routes so those races become retryable.
   */
  transientOnDeviceAuthFailure?: boolean;
}

function getHeader(req: NextRequest, name: string): string {
  return req.headers.get(name)?.trim() || "";
}

export function getDeviceIdFromRequest(req: NextRequest): string {
  return (
    req.nextUrl.searchParams.get("deviceId")?.trim()
    || req.nextUrl.searchParams.get("device_id")?.trim()
    || getHeader(req, "x-device-id")
    || getHeader(req, "x-mce-device-id")
  );
}

export function getDeviceSecretFromRequest(req: NextRequest): string {
  return (
    getHeader(req, "x-device-secret")
    || req.nextUrl.searchParams.get("deviceSecret")?.trim()
    || req.nextUrl.searchParams.get("device_secret")?.trim()
    || ""
  );
}

function errorResponse(
  error: string,
  status: number,
  headers: Record<string, string>,
): { error: NextResponse } {
  return {
    error: NextResponse.json({ error }, { status, headers }),
  };
}

async function resolveDeviceSecretContext(
  req: NextRequest,
): Promise<ResolvedDeviceContext | null> {
  const deviceSecret = getDeviceSecretFromRequest(req);
  if (!deviceSecret) return null;

  const client = await clientPromise;
  const db = client.db();
  const device = await db.collection("devices").findOne({
    deviceSecret,
    status: { $ne: "deleted" },
  });

  if (!device?.userId || !device.deviceId) return null;

  return {
    device,
    deviceId: String(device.deviceId),
    userId: String(device.userId),
    source: "device-secret",
  };
}

export async function resolveDeviceContext(
  req: NextRequest,
  headers: Record<string, string>,
  options: ResolveDeviceContextOptions = {},
): Promise<ResolvedDeviceContext | { error: NextResponse }> {
  const explicitDeviceId = getDeviceIdFromRequest(req);
  if (explicitDeviceId) {
    const deviceAuth = await verifyDeviceSecret(req, explicitDeviceId);
    if ("error" in deviceAuth) {
      const secretContext = await resolveDeviceSecretContext(req);
      if (secretContext) return secretContext;

      if (
        options.transientOnDeviceAuthFailure &&
        (deviceAuth.error.status === 401 || deviceAuth.error.status === 404)
      ) {
        // A desktop may briefly present an old secret while its paired
        // A desktop can briefly send a stale device id or secret while its
        // paired session is being restored (common after a Windows update or
        // store migration). Keep startup/license checks retryable instead of
        // making the client treat a healthy account as permanently logged out.
        return errorResponse(
          "Device verification is temporarily unavailable. Please refresh the app and try again.",
          503,
          headers,
        );
      }

      return deviceAuth;
    }

    const userId = String(deviceAuth.device.userId || "");
    if (!userId) return errorResponse("Device not paired", 404, headers);

    return {
      device: deviceAuth.device,
      deviceId: explicitDeviceId,
      userId,
      source: "device-id",
    };
  }

  const secretContext = await resolveDeviceSecretContext(req);
  if (secretContext) return secretContext;

  const client = await clientPromise;
  const db = client.db();

  const cookieUser = await getAuthUser().catch(() => null);
  const cookieUserId = cookieUser?.mongoUser?._id?.toString();
  if (cookieUserId) {
    const device = await db.collection("devices").findOne(
      { userId: cookieUserId, status: { $ne: "deleted" } },
      { sort: { lastSeen: -1, updatedAt: -1, createdAt: -1 } },
    );

    if (!device?.deviceId) {
      return errorResponse("No paired device found for authenticated user", 404, headers);
    }

    return {
      device,
      deviceId: String(device.deviceId),
      userId: cookieUserId,
      source: "session",
    };
  }

  return errorResponse(
    "deviceId required",
    400,
    headers,
  );
}
