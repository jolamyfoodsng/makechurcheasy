import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getAuthUserFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const { downloadedVersion } = await req.json();

    if (!downloadedVersion) {
      return NextResponse.json(
        { error: "downloadedVersion is required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    await db.collection("downloads").insertOne({
      userId,
      downloadedVersion,
      downloadedAt: new Date().toISOString(),
    });

    // Mark onboarding milestone — one-way flag, never reset
    await db.collection("users").updateOne(
      { _id: new (await import("mongodb")).ObjectId(userId) },
      { $set: { "onboarding.downloadedStudio": true } }
    );

    return NextResponse.json({ message: "Download recorded" }, { status: 201 });
  } catch (error) {
    console.error("Record download error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
