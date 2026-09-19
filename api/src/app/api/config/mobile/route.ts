import { NextResponse } from "next/server";
import { getMobileConfig } from "@/lib/configService";

/**
 * GET /api/config/mobile
 *
 * Public endpoint. Returns mobile-specific configuration.
 * Placeholder — will be expanded when the mobile client is built.
 */
export async function GET() {
  try {
    const config = await getMobileConfig();
    return NextResponse.json(config, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Get mobile config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
