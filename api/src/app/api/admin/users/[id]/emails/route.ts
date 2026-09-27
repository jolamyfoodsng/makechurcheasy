import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { getUserEmailLogs } from "@/lib/emailLog";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "25", 10);

    const client = await clientPromise;
    const db = client.db();
    const { ObjectId } = await import("mongodb");

    let userEmail: string | undefined = undefined;
    try {
      const user = await db.collection("users").findOne(
        { _id: new ObjectId(id) },
        { projection: { email: 1 } },
      );
      if (user?.email) {
        userEmail = user.email;
      }
    } catch {
      // Invalid ObjectId format, query using string id directly
    }

    const result = await getUserEmailLogs(id, userEmail, { page, limit });

    return NextResponse.json({
      emails: result.emails,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  } catch (error) {
    console.error("[admin/users/[id]/emails] Error fetching user emails:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
