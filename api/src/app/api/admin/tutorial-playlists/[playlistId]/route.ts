import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  deleteTutorialPlaylist,
  serializeTutorialPlaylist,
  setTutorialPlaylistEnabled,
  upsertTutorialPlaylist,
  type TutorialPlaylistInput,
} from "@/lib/tutorialPlaylists";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { playlistId } = await params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const input = body.playlist && typeof body.playlist === "object"
      ? body.playlist as TutorialPlaylistInput
      : body as TutorialPlaylistInput;
    const playlist = await upsertTutorialPlaylist({ ...input, playlistId }, auth.adminUserId);
    return NextResponse.json({ success: true, playlist: serializeTutorialPlaylist(playlist) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update tutorial playlist";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ playlistId: string }> }) {
  return PATCH(req, context);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { playlistId } = await params;
    const isPermanent = req.nextUrl.searchParams.get("permanent") === "true";
    if (isPermanent) {
      await deleteTutorialPlaylist(playlistId);
      return NextResponse.json({ success: true, deleted: true, playlistId });
    }
    const playlist = await setTutorialPlaylistEnabled(playlistId, false, auth.adminUserId);
    if (!playlist) return NextResponse.json({ error: "Tutorial playlist not found" }, { status: 404 });
    return NextResponse.json({ success: true, playlist: serializeTutorialPlaylist(playlist) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete tutorial playlist";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
