import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchYouTubePlaylistVideos } from "@/lib/tutorialPlaylists";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "YouTube playlist URL or ID is required" }, { status: 400 });
    }

    const playlist = await fetchYouTubePlaylistVideos(url);
    return NextResponse.json({ success: true, playlist });
  } catch (error) {
    console.error("POST /api/admin/tutorial-playlists/import-youtube error:", error);
    const message = error instanceof Error ? error.message : "Failed to import YouTube playlist";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
