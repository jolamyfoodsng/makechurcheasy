import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  createAnnouncement,
  getAnnouncementAdminInsights,
  getAnnouncementStats,
  listAnnouncements,
  type AnnouncementInsightRange,
  type AnnouncementInput,
} from "@/lib/announcements";

function serializeAnnouncement(announcement: Record<string, any>) {
  return {
    ...announcement,
    _id: announcement._id?.toString?.() || announcement._id,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const rawRange = req.nextUrl.searchParams.get("range") || "weekly";
  const range: AnnouncementInsightRange = ["daily", "weekly", "monthly"].includes(rawRange)
    ? rawRange as AnnouncementInsightRange
    : "weekly";

  const [announcements, stats, insights] = await Promise.all([
    listAnnouncements(80),
    getAnnouncementStats(),
    getAnnouncementAdminInsights(range),
  ]);

  return NextResponse.json({
    announcements: announcements.map(serializeAnnouncement),
    stats,
    insights,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({})) as AnnouncementInput;
    const announcement = await createAnnouncement(body, auth.adminUserId);
    return NextResponse.json({ announcement: serializeAnnouncement(announcement) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create announcement";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
