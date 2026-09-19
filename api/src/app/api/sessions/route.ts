import { NextRequest, NextResponse } from "next/server";
import {
  getSecuritySessions,
  upsertSecuritySession,
  removeSecuritySession,
} from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const sessions = await getSecuritySessions(userId);
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Get sessions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const body = await req.json();
    const {
      sessionId,
      deviceName,
      devicePlatform,
      deviceOs,
      browser,
      ipAddress,
      location,
    } = body;

    if (!sessionId || !deviceName || !devicePlatform || !deviceOs) {
      return NextResponse.json(
        { error: "sessionId, deviceName, devicePlatform, and deviceOs are required" },
        { status: 400 }
      );
    }

    const session = await upsertSecuritySession({
      userId,
      sessionId,
      deviceName,
      devicePlatform,
      deviceOs,
      browser: browser || "",
      ipAddress: ipAddress || "",
      location: location || "",
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isCurrent: false,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Upsert session error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    await removeSecuritySession(userId, sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete session error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
