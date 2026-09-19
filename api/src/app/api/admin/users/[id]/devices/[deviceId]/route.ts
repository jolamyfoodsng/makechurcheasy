/**
 * DELETE /api/admin/users/[id]/devices/[deviceId]
 *
 * Admin-only endpoint to revoke a user's device.
 * Soft-deletes the device record and removes it from the user's devices array.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; deviceId: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return admin.response;
  }

  const { id: userId, deviceId } = await params;

  if (!userId || !deviceId) {
    return NextResponse.json(
      { error: "userId and deviceId are required" },
      { status: 400 }
    );
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    const { ObjectId } = await import("mongodb");

    // Find the device to verify it belongs to the user
    const device = await db.collection("devices").findOne({
      deviceId,
      userId,
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found for this user" },
        { status: 404 }
      );
    }

    // Soft-delete the device
    await db.collection("devices").updateOne(
      { _id: device._id },
      {
        $set: {
          status: "deleted",
          deletedAt: new Date(),
          deletedBy: "admin",
        },
      }
    );

    // Remove from user's active devices array
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { devices: device._id.toString() } as any }
    );

    return NextResponse.json({
      success: true,
      message: "Device revoked successfully",
      deviceId,
    });
  } catch (err) {
    console.error("[admin/device-revoke] Error:", err);
    return NextResponse.json(
      { error: "Failed to revoke device" },
      { status: 500 }
    );
  }
}
