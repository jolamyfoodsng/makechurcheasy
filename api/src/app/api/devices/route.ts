import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    const userId = authUser.mongoUser._id.toString();

    const devices = await db
      .collection("devices")
      .find({ userId, $or: [{ status: "active" }, { status: { $exists: false } }] })
      .sort({ lastSeen: -1 })
      .toArray();

    return NextResponse.json(
      devices.map((d) => ({
        id: d._id.toString(),
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        lastSeen: d.lastSeen,
        createdAt: d.createdAt,
      }))
    );
  } catch (err) {
    console.error("Devices list error:", err);
    return NextResponse.json({ error: "Failed to list devices" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deviceId, deviceName } = await req.json();
    const userId = authUser.mongoUser._id.toString();

    const client = await clientPromise;
    const db = client.db();

    await db.collection("devices").updateOne(
      { _id: new (await import("mongodb")).ObjectId(deviceId), userId },
      { $set: { deviceName } }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Device rename error:", err);
    return NextResponse.json({ error: "Failed to update device" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deviceId } = await req.json();
    const userId = authUser.mongoUser._id.toString();

    const client = await clientPromise;
    const db = client.db();
    const { ObjectId } = await import("mongodb");

    const objectId = new ObjectId(deviceId);

    // Soft-delete: preserve record for analytics and audit history
    await db.collection("devices").updateOne(
      { _id: objectId, userId },
      { $set: { status: "deleted", deletedAt: new Date() } }
    );

    // Cleanup: remove device ID from user's active devices array
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { devices: objectId.toString() } }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Device delete error:", err);
    return NextResponse.json({ error: "Failed to delete device" }, { status: 500 });
  }
}
