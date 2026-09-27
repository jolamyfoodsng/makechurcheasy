import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { getUserErrorLogs } from "@/lib/errorLog";

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

    const result = await getUserErrorLogs(id, userEmail, { page, limit });

    return NextResponse.json({
      logs: result.logs,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  } catch (error) {
    console.error("[admin/users/[id]/error-logs] Error fetching user error logs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
