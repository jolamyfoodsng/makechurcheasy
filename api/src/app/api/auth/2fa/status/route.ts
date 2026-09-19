import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection("users").findOne(
      { _id: authUser.mongoUser._id },
      { projection: { twoFactorEnabled: 1 } }
    );

    return NextResponse.json({
      enabled: !!user?.twoFactorEnabled,
    });
  } catch (error) {
    console.error("2FA status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
