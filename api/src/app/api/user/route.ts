import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getAuthUserFromRequest, AuthError } from "@/lib/auth";
import { isKnownCountryCode, normalizeCountryCode } from "@/lib/countryNormalization";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const client = await clientPromise;
    const db = client.db();

    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) }, { projection: { password: 0 } });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Backfill missing plan for users created before this field existed
    const updates: Record<string, any> = {};
    if (!user.plan) updates.plan = "free";
    if (Object.keys(updates).length > 0) {
      await db
        .collection("users")
        .updateOne({ _id: new ObjectId(userId) }, { $set: updates });
      Object.assign(user, updates);
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const body = (await req.json()) as Record<string, any>;
    const { userId: _ignored, ...updates } = body;

    const client = await clientPromise;
    const db = client.db();

    // Only allow updating certain fields
    const allowedFields = [
      "name",
      "churchName",
      "avatar",
      "churchProfileId",
      "devices",
      "country",
      "phone",
      "jobTitle",
      "language",
      "timezone",
      "loginMethods",
      "passwordLastChanged",
      "onboardingCompleted",
    ];
    const sanitizedUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        sanitizedUpdates[key] = updates[key];
      }
    }
    if (sanitizedUpdates.country !== undefined) {
      if (!(await isKnownCountryCode(sanitizedUpdates.country))) {
        return NextResponse.json(
          { error: "Please select a valid country." },
          { status: 400 },
        );
      }
      sanitizedUpdates.country = await normalizeCountryCode(sanitizedUpdates.country);
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    await db
      .collection("users")
      .updateOne({ _id: new ObjectId(userId) }, { $set: sanitizedUpdates });

    return NextResponse.json({ message: "Profile updated" });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const client = await clientPromise;
    const db = client.db();

    // Keep trial_claim_signals and historical device identifiers intact. The
    // one-trial-per-machine rule must survive account deactivation and a
    // later reinstall/new email on the same computer.
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: { status: "deleted", deletedAt: new Date() } }
    );

    return NextResponse.json({ message: "Account deactivated" });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
