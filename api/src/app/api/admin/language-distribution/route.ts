/**
 * GET /api/admin/language-distribution — Language distribution analytics.
 *
 * Returns aggregated language data from the users collection.
 * Supports ?language=xxx query param to drill down into a specific language's users.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id",
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  yo: "Yoruba",
  ig: "Igbo",
  ha: "Hausa",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const client = await clientPromise;
    const db = client.db();
    const users = db.collection("users");

    const url = new URL(req.url);
    const drillDownLanguage = url.searchParams.get("language");

    // Drill-down mode: return individual users for a specific language
    if (drillDownLanguage) {
      const pipeline = [
        {
          $match: {
            status: { $ne: "deleted" },
            $expr: {
              $eq: [
                { $toLower: { $ifNull: ["$language", "en"] } },
                drillDownLanguage.toLowerCase(),
              ],
            },
          },
        },
        {
          $project: {
            _id: 0,
            userName: "$name",
            userEmail: "$email",
            createdAt: 1,
            lastLogin: 1,
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 200 },
      ];

      const results = await users.aggregate(pipeline).toArray();

      return NextResponse.json(
        {
          drillDownLanguage,
          users: results.map((r: any) => ({
            userName: r.userName || "Unknown",
            userEmail: r.userEmail || "",
            createdAt: r.createdAt?.toISOString?.() || r.createdAt || null,
            lastLogin: r.lastLogin?.toISOString?.() || r.lastLogin || null,
          })),
        },
        { headers: CORS_HEADERS },
      );
    }

    // Summary mode: aggregate language distribution
    const pipeline = [
      { $match: { status: { $ne: "deleted" } } },
      {
        $group: {
          _id: {
            $toLower: { $ifNull: ["$language", "en"] },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ];

    const results = await users.aggregate(pipeline).toArray();
    const totalUsers = results.reduce((sum: number, r: any) => sum + r.count, 0);

    const languages = results.map((r: any) => ({
      code: r._id || "en",
      name: LANGUAGE_NAMES[r._id] || r._id || "English",
      count: r.count,
      percentage:
        totalUsers > 0
          ? Math.round((r.count / totalUsers) * 1000) / 10
          : 0,
    }));

    return NextResponse.json(
      {
        totalUsers,
        languages,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error("[AdminLanguageDistribution] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
