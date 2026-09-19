import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const { openaiKey } = await req.json();

    const client = await clientPromise;
    const db = client.db();

    // Upsert API key for user
    await db.collection("apiKeys").updateOne(
      { userId },
      {
        $set: {
          openaiKey: openaiKey || "",
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: {
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ message: "API key saved" });
  } catch (error) {
    console.error("Save API key error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const client = await clientPromise;
    const db = client.db();

    const keys = await db.collection("apiKeys").findOne({ userId });

    return NextResponse.json({
      hasOpenaiKey: !!keys?.openaiKey,
    });
  } catch (error) {
    console.error("Get API key error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
