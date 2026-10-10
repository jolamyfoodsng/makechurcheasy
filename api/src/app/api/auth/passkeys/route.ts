import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getPasskeyUser } from "@/lib/passkeys";

export async function GET() {
  const user = await getPasskeyUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ passkeys: (user.passkeys || []).map((item: any) => ({ id: item.id, name: item.name || "Passkey", createdAt: item.createdAt, deviceType: item.deviceType, backedUp: item.backedUp })) });
}

export async function DELETE(req: NextRequest) {
  const user = await getPasskeyUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await req.json() as { id?: string };
  if (typeof id !== "string") return NextResponse.json({ error: "Passkey id is required." }, { status: 400 });
  const client = await clientPromise;
  await client.db().collection("users").updateOne({ _id: user._id }, { $pull: { passkeys: { id } } } as any);
  return NextResponse.json({ success: true });
}
