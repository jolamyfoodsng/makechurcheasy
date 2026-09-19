import { NextResponse } from "next/server";
import { getDesktopConfig } from "@/lib/configService";

/**
 * GET /api/config/desktop
 *
 * Public endpoint (no auth). Returns desktop-specific configuration
 * derived from platform_settings. Used by the desktop app to stay
 * synchronized with admin settings.
 *
 * Cache: 5 minutes browser-side via Cache-Control header.
 */
export async function GET() {
  try {
    const config = await getDesktopConfig();
    return NextResponse.json(config, {
      headers: {
        // Version floors and installer URLs are admin-controlled policy. Do
        // not let a CDN or WebView cache delay a forced update.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Get desktop config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
