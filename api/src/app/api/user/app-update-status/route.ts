/**
 * GET /api/user/app-update-status
 *
 * Tells the web dashboard whether this user has a desktop app that must be
 * updated, and by when. The web has no installed version of its own, so we
 * look at the versions the user's registered devices last reported.
 *
 * Returns `needsUpdate: false` (and nothing else of interest) when force
 * updates are off, the user has no outdated device, or the policy is unset.
 *
 * Auth: fb-token cookie (web).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { getPlatformSettings } from "@/lib/platformSettings";
import { getEnforcementWindow, isBelowMinimum } from "@/lib/versionGate";

const NO_UPDATE = { needsUpdate: false } as const;

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { appUpdates } = await getPlatformSettings();
    const minimum = (appUpdates.minimumSupportedVersion || "").trim();
    if (!appUpdates.forceUpdatesEnabled || !minimum) {
      return NextResponse.json(NO_UPDATE, { headers: { "Cache-Control": "no-store" } });
    }

    const userId = authUser.mongoUser._id.toString();
    const client = await clientPromise;
    const devices = await client
      .db()
      .collection("devices")
      .find(
        { userId, $or: [{ status: "active" }, { status: { $exists: false } }] },
        { projection: { deviceName: 1, appVersion: 1, appPlatform: 1, lastSeen: 1 } },
      )
      .sort({ lastSeen: -1 })
      .limit(25)
      .toArray();

    const outdated = devices
      .filter((d) => typeof d.appVersion === "string" && d.appVersion.trim())
      .filter((d) => isBelowMinimum(String(d.appVersion), minimum));

    if (outdated.length === 0) {
      return NextResponse.json(NO_UPDATE, { headers: { "Cache-Control": "no-store" } });
    }

    const window = getEnforcementWindow(appUpdates);
    const now = Date.now();

    return NextResponse.json(
      {
        needsUpdate: true,
        minimumVersion: minimum,
        latestVersion: appUpdates.latestVersion || minimum,
        message: appUpdates.updateMessage || "",
        releaseNotesUrl: appUpdates.releaseNotesUrl || "",
        downloadUrls: {
          windows: appUpdates.windowsDownloadUrl || "",
          mac: appUpdates.macDownloadUrl || "",
          linux: appUpdates.linuxDownloadUrl || "",
        },
        deadlineAt: window.deadlineAtMs ? new Date(window.deadlineAtMs).toISOString() : null,
        expired: window.expired,
        serverTime: new Date(now).toISOString(),
        devices: outdated.slice(0, 5).map((d) => ({
          name: String(d.deviceName || "Computer"),
          version: String(d.appVersion),
          platform: String(d.appPlatform || ""),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("App update status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
