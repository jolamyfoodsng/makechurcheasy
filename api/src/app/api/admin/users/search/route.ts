import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ users: [] });
    }

    const client = await clientPromise;
    const db = client.db();

    // Regex escape
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

    const users = await db
      .collection("users")
      .find(
        {
          $or: [
            { name: { $regex: regex } },
            { email: { $regex: regex } },
            { churchName: { $regex: regex } },
            { referralCode: { $regex: regex } },
          ],
        },
        {
          projection: {
            name: 1,
            email: 1,
            churchName: 1,
            plan: 1,
            referralCode: 1,
            avatar: 1,
          },
        }
      )
      .limit(20)
      .toArray();

    return NextResponse.json({
      users: users.map((u) => ({
        id: u._id.toString(),
        name: u.name || "",
        email: u.email || "",
        churchName: u.churchName || "",
        plan: u.plan || "free",
        referralCode: u.referralCode || "",
        avatar: u.avatar || "",
      })),
    });
  } catch (error) {
    console.error("[admin/users/search] GET error:", error);
    return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
  }
}
