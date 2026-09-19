import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import * as OTPAuth from "otpauth";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection("users").findOne({ _id: authUser.mongoUser._id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
    }

    const totp = new OTPAuth.TOTP({
      issuer: "MakeChurchEasy",
      label: user.email || "user",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
    });

    const delta = totp.validate({ token, window: 1 });
    if (delta === null) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Disable 2FA
    await db.collection("users").updateOne(
      { _id: authUser.mongoUser._id },
      {
        $set: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorRecoveryCodes: [],
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("2FA disable error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
