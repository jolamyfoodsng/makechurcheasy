import { NextResponse } from "next/server";
import { listTutorialPlaylists, serializeTutorialPlaylist } from "@/lib/tutorialPlaylists";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const playlists = await listTutorialPlaylists({ includeDisabled: false });
    return NextResponse.json(
      { playlists: playlists.map(serializeTutorialPlaylist) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("GET /api/tutorials error:", error);
    return NextResponse.json({ error: "Failed to load tutorials" }, { status: 500 });
  }
}
