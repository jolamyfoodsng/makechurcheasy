import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAnnouncementDetailAnalytics } from "@/lib/announcements";

/** Who saw and clicked one announcement: names, countries, plans and the button used. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const analytics = await getAnnouncementDetailAnalytics(id);
    if (!analytics) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }
    return NextResponse.json(analytics);
  } catch (error) {
    console.error("[AdminAnnouncementAnalytics] GET error:", error);
    return NextResponse.json({ error: "Failed to load announcement analytics" }, { status: 500 });
  }
}
