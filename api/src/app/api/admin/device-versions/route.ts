/**
 * GET /api/admin/device-versions — Version distribution analytics.
 *
 * Returns aggregated version data from the devices collection.
 * Uses platformSettings.appUpdates.latestVersion as source of truth for "latest".
 * Supports ?version=xxx query param to drill down into a specific version's devices.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { getPlatformSettings } from "@/lib/platformSettings";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id",
};

function parseVersion(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseVersion(a);
  const [bMaj, bMin, bPat] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const client = await clientPromise;
    const db = client.db();
    const devicesCol = db.collection("devices");

    // Get latest version from platform settings (source of truth)
    let latestVersion = "";
    try {
      const ps = await getPlatformSettings();
      latestVersion = ps.appUpdates?.latestVersion || "";
    } catch {
      // If settings unavailable, leave empty
    }

    // Get total active devices (not deleted)
    const totalDevices = await devicesCol.countDocuments({
      status: { $ne: "deleted" },
    });

    // Aggregate version distribution
    const versionAgg = await devicesCol
      .aggregate([
        { $match: { status: { $ne: "deleted" } } },
        {
          $group: {
            _id: { $ifNull: ["$appVersion", ""] },
            deviceCount: { $sum: 1 },
            platforms: { $addToSet: { $ifNull: ["$appPlatform", "unknown"] } },
          },
        },
      ])
      .toArray();

    // Process into version entries
    const versions = versionAgg
      .map((doc) => {
        const version = doc._id || "";
        return {
          version,
          deviceCount: doc.deviceCount,
          percentage: totalDevices > 0 ? Math.round((doc.deviceCount / totalDevices) * 1000) / 10 : 0,
          platforms: doc.platforms,
          isLatest: latestVersion ? version === latestVersion : false,
        };
      })
      .sort((a, b) => {
        // "Unknown" always at the end
        if (!a.version && !b.version) return 0;
        if (!a.version) return 1;
        if (!b.version) return -1;
        return compareVersions(b.version, a.version);
      });

    // Count latest and outdated
    const latestCount = latestVersion
      ? versionAgg
          .filter((doc) => doc._id === latestVersion)
          .reduce((sum, doc) => sum + doc.deviceCount, 0)
      : 0;

    const outdatedCount = totalDevices - latestCount;

    // Drill-down: if ?version=xxx, return devices with that version
    const drillDownVersion = req.nextUrl.searchParams.get("version");
    if (drillDownVersion !== null) {
      const matchFilter: Record<string, unknown> = { status: { $ne: "deleted" } };
      if (drillDownVersion === "") {
        // Empty string means "no version" (unknown)
        matchFilter.$or = [
          { appVersion: { $exists: false } },
          { appVersion: null },
          { appVersion: "" },
        ];
      } else {
        matchFilter.appVersion = drillDownVersion;
      }

      const devices = await devicesCol
        .aggregate([
          { $match: matchFilter },
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "_id",
              as: "user",
              pipeline: [{ $project: { name: 1, email: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$user",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              _id: 0,
              userName: { $ifNull: ["$user.name", "Unknown"] },
              userEmail: { $ifNull: ["$user.email", "Unknown"] },
              platform: { $ifNull: ["$appPlatform", "unknown"] },
              deviceName: { $ifNull: ["$deviceName", "Unknown"] },
              lastSeen: 1,
            },
          },
          { $sort: { lastSeen: -1 } },
        ])
        .toArray();

      return NextResponse.json({
        latestVersion,
        drillDownVersion: drillDownVersion || "Unknown",
        devices,
      }, { headers: CORS_HEADERS });
    }

    return NextResponse.json({
      latestVersion,
      totalDevices,
      latestCount,
      outdatedCount,
      versions,
    }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Admin device-versions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
