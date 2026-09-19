import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { updateAnnouncement, type AnnouncementInput } from "@/lib/announcements";

function serializeAnnouncement(announcement: Record<string, any>) {
  return {
    ...announcement,
    _id: announcement._id?.toString?.() || announcement._id,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as AnnouncementInput;
    const announcement = await updateAnnouncement(id, body, auth.adminUserId);
    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }
    return NextResponse.json({ announcement: serializeAnnouncement(announcement) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update announcement";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
