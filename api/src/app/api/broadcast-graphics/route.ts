import { NextRequest, NextResponse } from "next/server";
import {
  listBroadcastGraphics,
  resolveGraphicAudience,
  serializeForApp,
} from "@/lib/broadcastGraphics";

/**
 * GET /api/broadcast-graphics — the Broadcast Graphics catalog for the desktop app.
 *
 * Optional auth (X-Device-Id / X-Device-Secret or session) decides the audience
 * (free / paid / ambassador / admin), and each graphic says whether this user may use it.
 * The app caches the response and keeps using it offline.
 */
export async function GET(req: NextRequest) {
  try {
    const audience = await resolveGraphicAudience(req);
    const graphics = await listBroadcastGraphics();
    return NextResponse.json(
      { audience, graphics: graphics.map((g) => serializeForApp(g, audience)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("GET /api/broadcast-graphics error:", error);
    return NextResponse.json({ error: "Failed to load broadcast graphics" }, { status: 500 });
  }
}
