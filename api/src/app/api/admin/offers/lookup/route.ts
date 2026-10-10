/**
 * GET /api/admin/offers/lookup?q=...
 *
 * Finds a few people by the start of their email address (or by exact user id)
 * so an admin can open their offer history.
 */
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
    if (q.length < 3) return NextResponse.json({ users: [] });

    const client = await clientPromise;
    const filter = ObjectId.isValid(q) && q.length === 24
      ? { _id: new ObjectId(q) }
      : { email: { $regex: `^${escapeRegex(q.toLowerCase())}`, $options: "i" } };
    const rows = await client
      .db()
      .collection("users")
      .find(filter, { projection: { name: 1, firstName: 1, email: 1, plan: 1, emailVerified: 1 } })
      .limit(8)
      .toArray();

    return NextResponse.json({
      users: rows.map((user) => ({
        id: String(user._id),
        name: user.name || user.firstName || "",
        email: user.email || "",
        plan: user.plan || "free",
        emailVerified: user.emailVerified === true,
      })),
    });
  } catch (error) {
    console.error("[AdminOffers lookup] Error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
