import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST() {
  const authUser = await getAuthUser();

  if (!authUser?.mongoUser?._id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db();

  await db.collection("users").updateOne(
    { _id: new ObjectId(authUser.mongoUser._id.toString()) },
    { $inc: { tokenVersion: 1 } }
  );

  return NextResponse.json({ success: true });
}
