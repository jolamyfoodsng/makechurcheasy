import { NextRequest, NextResponse } from "next/server";
import { ANNOUNCEMENT_SURFACES, getAnnouncementsVersion } from "@/lib/announcements";
import type { AnnouncementSurface } from "@/types/schemas";

/**
 * GET /api/announcements/version?surface=desktop
 *
 * Public, tiny and identical for every user. Desktop apps poll it every few
 * minutes and only call the authenticated /api/user/announcements endpoint
 * when the value changes, so a month without announcements costs almost
 * nothing. Cached for 60 s in memory and at the edge.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Version",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("surface") || "desktop";
  const surface = ANNOUNCEMENT_SURFACES.includes(raw as AnnouncementSurface)
    ? (raw as AnnouncementSurface)
    : "desktop";

  try {
    const version = await getAnnouncementsVersion(surface);
    return NextResponse.json(
      { version },
      {
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "public, max-age=60, s-maxage=60",
        },
      },
    );
  } catch (error) {
    console.error("[announcements/version] Error:", error);
    return NextResponse.json(
      { error: "Unavailable" },
      { status: 503, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
    );
  }
}
