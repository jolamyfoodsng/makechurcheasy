import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  listTutorialPlaylists,
  serializeTutorialPlaylist,
  upsertTutorialPlaylist,
  type TutorialPlaylistInput,
} from "@/lib/tutorialPlaylists";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const includeDisabled = new URL(req.url).searchParams.get("includeDisabled") !== "false";
    const playlists = await listTutorialPlaylists({ includeDisabled });
    return NextResponse.json({ playlists: playlists.map(serializeTutorialPlaylist) });
  } catch (error) {
    console.error("GET /api/admin/tutorial-playlists error:", error);
    return NextResponse.json({ error: "Failed to load tutorial playlists" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const input = body.playlist && typeof body.playlist === "object"
      ? body.playlist as TutorialPlaylistInput
      : body as TutorialPlaylistInput;
    const playlist = await upsertTutorialPlaylist(input, auth.adminUserId);
    return NextResponse.json({ success: true, playlist: serializeTutorialPlaylist(playlist) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save tutorial playlist";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
