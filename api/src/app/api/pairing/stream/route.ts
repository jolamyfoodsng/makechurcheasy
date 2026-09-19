import { NextRequest } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { isBelowMinimum, getMinimumVersion } from "@/lib/versionGate";
import { checkDeviceLimit } from "@/lib/deviceLimits";
import { resolveEffectivePlan, isInTrialRaw } from "@/lib/trial";
import { getTrialForUser } from "@/lib/trialRecords";
import { extractDeviceInfo } from "@/lib/deviceInfo";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import { normalizePairingCode } from "@/lib/pairingUtils";
import { TRIAL_ALREADY_CLAIMED_MESSAGE } from "@/lib/trialAbuse";
import {
  findMatchingDesktopDevice,
  registerDesktopDeviceForPairing,
} from "@/lib/desktopDeviceRegistration";

/**
 * SSE endpoint for real-time pairing authorization.
 *
 * The desktop app opens a persistent connection here.
 * When the user authorizes the pairing code on the web,
 * this endpoint pushes the user data and closes the connection.
 *
 * GET /api/pairing/stream?code=XXXX-XXXX
 *
 * Events:
 *   - connected: { message }
 *   - authorized: { user, deviceId }
 *   - expired
 *   - error: { message }
 */

const POLL_INTERVAL = 1000; // 1 second
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown
): void {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function GET(req: NextRequest) {
  const rawCode = req.nextUrl.searchParams.get("code");
  if (!rawCode) {
    return new Response(JSON.stringify({ error: "Code required" }), {
      status: 400,
    });
  }

  const code = normalizePairingCode(rawCode);

  // Match both normalized (ABCD1234) and legacy hyphenated (ABCD-1234) forms
  const codeWithHyphen = `${code.slice(0, 4)}-${code.slice(4)}`;

  // OS name sent by the desktop app during pairing (e.g. "macOS", "Windows", "Linux")
  const clientOS = req.nextUrl.searchParams.get("os") || "";

  // Block old desktop app versions (version sent as query param — EventSource can't use headers)
  const clientVersion = req.nextUrl.searchParams.get("v");
  const minimum = await getMinimumVersion();
  const versionBlocked = clientVersion && minimum
    ? isBelowMinimum(clientVersion, minimum)
    : false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send keepalive comment every 15s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      sendEvent(controller, "connected", { message: "Waiting for authorization..." });

      // Immediately reject old versions — don't wait for pairing
      if (versionBlocked) {
        sendEvent(controller, "version-blocked", {
          message: `This version (v${clientVersion}) is no longer supported. Please update to v${minimum} or later.`,
        });
        clearInterval(keepalive);
        try { controller.close(); } catch { /* already closed */ }
        return;
      }

      const startTime = Date.now();

      try {
        while (Date.now() - startTime < TIMEOUT_MS) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));

          let client;
          try {
            client = await clientPromise;
          } catch {
            sendEvent(controller, "error", { message: "Database connection failed" });
            break;
          }

          const db = client.db();

          // Check if authorized or rejected (e.g. email not verified)
          const pairing = await db.collection("pairingCodes").findOne({
            $or: [{ code }, { code: codeWithHyphen }],
          });

          console.log("[pairing/stream] Poll:", { code, codeWithHyphen, found: !!pairing, used: pairing?.used, rejected: pairing?.rejected });

          // Check used FIRST — a code can have been rejected earlier then
          // later authorized after the user verified their email.
          if (pairing?.used) {
            let user: any = await db.collection("users").findOne(
              { _id: new ObjectId(pairing.userId) },
              { projection: { password: 0 } }
            );

            // Clean up pairing code
            await db.collection("pairingCodes").deleteOne({ _id: pairing._id });

            if (!user) {
              sendEvent(controller, "error", { message: "User not found" });
              break;
            }
            user = await checkAndExpireAdminTemporaryPlan(user._id.toString(), user);

            // Check device limit before creating the device (safety net).
            // Only a matching installation/fingerprint is an existing device.
            const effectivePlan = resolveEffectivePlan(user as any);
            const isOnTrial = isInTrialRaw(user as any);
            const existingDevice = await findMatchingDesktopDevice(
              db,
              user._id.toString(),
              pairing.installationId,
              pairing.fingerprintHash,
            );
            const limitResult = await checkDeviceLimit(
              user._id.toString(),
              existingDevice?.deviceId || null,
              effectivePlan,
              isOnTrial,
            );
            if (!limitResult.allowed) {
              sendEvent(controller, "device_limit_reached", {
                currentCount: limitResult.currentCount,
                limit: limitResult.limit,
                plan: effectivePlan,
              });
              clearInterval(keepalive);
              try { controller.close(); } catch { /* already closed */ }
              return;
            }

            const deviceName = clientOS || pairing.deviceName || "MakeChurchEasy";
            // Version from query param (EventSource can't send headers), platform from user-agent
            const { appPlatform } = extractDeviceInfo(req);
            const appVersion = clientVersion || "";
            let registeredDevice: { deviceId: string; deviceSecret: string };

            try {
              registeredDevice = await registerDesktopDeviceForPairing({
                db,
                userId: user._id.toString(),
                userObjectId: user._id,
                deviceName,
                appVersion,
                appPlatform,
                fingerprintHash: pairing.fingerprintHash || null,
                installationId: pairing.installationId || null,
              });
            } catch (deviceErr) {
              console.error("[pairing/stream] Device creation failed:", deviceErr);
              sendEvent(controller, "error", { message: "Failed to register device. Please try again." });
              clearInterval(keepalive);
              try { controller.close(); } catch { /* already closed */ }
              return;
            }

            // Read trial from trials collection (single source of truth)
            const trialRecord = await getTrialForUser(user._id.toString());
            const trialResponse = trialRecord
              ? {
                active: trialRecord.status === "active" && new Date(trialRecord.endsAt).getTime() > Date.now(),
                status: trialRecord.status,
                startedAt: trialRecord.startedAt,
                endsAt: trialRecord.endsAt,
                durationDays: trialRecord.durationDays,
                extendedDays: trialRecord.extendedDays,
                extensionCount: trialRecord.extensionCount,
                stoppedAt: trialRecord.stoppedAt,
                stoppedReason: trialRecord.stoppedReason,
                restartedAt: trialRecord.restartedAt,
                grantedBy: trialRecord.grantedBy,
                lastModifiedBy: trialRecord.lastModifiedBy,
                welcomeShown: trialRecord.welcomeShown,
              }
              : user.trial || null;

            sendEvent(controller, "authorized", {
              user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                avatar: user.avatar || "",
                appId: user.appId || "",
                churchName: user.churchName || "",
                createdAt: user.createdAt || "",
                role: user.role || "user",
                plan: user.plan || "free",
                ambassador: user.ambassador || null,
                adminTemporaryPlan: user.adminTemporaryPlan || null,
                adminManagedSubscription: user.adminManagedSubscription || null,
                subscriptionExpiresAt: user.subscriptionExpiresAt || null,
                trial: trialResponse,
              },
              deviceId: registeredDevice.deviceId,
              deviceSecret: registeredDevice.deviceSecret,
            });

            // Send device login notification email (fire and forget)
            try {
              const { getPlatformSettings } = await import("@/lib/platformSettings");
              const platformSettings = await getPlatformSettings();
              if (platformSettings.notifications.securityAlerts) {
                const { sendEmail, newDeviceLoginEmail } = await import("@/lib/emailTemplates");
                const pairingDoc = await db.collection("pairingCodes").findOne({ code });
                const deviceName = pairingDoc?.deviceName || "Desktop App";
                const deviceOs = pairingDoc?.os || "Unknown";
                sendEmail(
                  newDeviceLoginEmail({
                    userName: user.name || "there",
                    userEmail: user.email,
                    deviceName,
                    deviceOs,
                    loginTime: new Date().toLocaleString("en-US", {
                      dateStyle: "full",
                      timeStyle: "short",
                    }),
                  })
                ).catch(() => { });
              }
            } catch { /* email not critical */ }

            break;
          }

          if (pairing?.rejected) {
            // The pairing was rejected before device registration. Trial
            // conflicts need a subscription message rather than an email-
            // verification prompt.
            let authorizerEmail = "";
            let authorizerName = "";
            if (pairing.userId) {
              const authorizer = await db.collection("users").findOne(
                { _id: new ObjectId(pairing.userId) },
                { projection: { email: 1, name: 1 } }
              );
              authorizerEmail = authorizer?.email || "";
              authorizerName = authorizer?.name || "";
            }
            // Don't delete the pairing code — the user needs it to check
            // verification status via the dashboard "Check Again" button.
            if (pairing.rejectReason === "trial_already_claimed") {
              sendEvent(controller, "trial_unavailable", {
                message: TRIAL_ALREADY_CLAIMED_MESSAGE,
                reason: pairing.rejectReason,
              });
            } else {
              sendEvent(controller, "verification_required", {
                message: "Please verify your email address before authorizing a device.",
                reason: pairing.rejectReason || "email_not_verified",
                email: authorizerEmail,
                name: authorizerName,
              });
            }
            clearInterval(keepalive);
            try { controller.close(); } catch { /* already closed */ }
            return;
          }

          // Check if expired
          const expired = await db.collection("pairingCodes").findOne({
            $or: [{ code }, { code: codeWithHyphen }],
            used: false,
            expiresAt: { $lt: new Date() },
          });

          if (expired) {
            await db.collection("pairingCodes").deleteOne({ _id: expired._id });
            sendEvent(controller, "expired", {});
            break;
          }
        }

        if (Date.now() - startTime >= TIMEOUT_MS) {
          sendEvent(controller, "expired", { message: "Timed out" });
        }
      } finally {
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

const ALLOWED_STREAM_ORIGINS = [
  "http://localhost:4000",
  "http://localhost:3002",
  "http://localhost:1420",
  "http://localhost:5173",
  "http://localhost:5174",
  "tauri://localhost",
  "https://tauri.localhost",
  "http://tauri.localhost",
  "https://makechurcheazy.com",
  "https://www.makechurcheazy.com",
];

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Cache-Control, X-Device-Id",
  };
  if (origin && ALLOWED_STREAM_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return new Response(null, { headers });
}
