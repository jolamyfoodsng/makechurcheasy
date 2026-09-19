import { NextResponse } from "next/server";
import { getOBSPluginConfig } from "@/lib/configService";

/**
 * GET /api/config/plugin
 *
 * Public endpoint. Returns OBS plugin-specific configuration.
 * Placeholder — will be expanded when the OBS plugin is built.
 */
export async function GET() {
  try {
    const config = await getOBSPluginConfig();
    return NextResponse.json(config, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Get OBS plugin config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
