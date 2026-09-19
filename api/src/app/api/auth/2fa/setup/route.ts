import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import * as OTPAuth from "otpauth";

export async function POST() {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();
    const email = authUser.mongoUser.email || "user";

    // Check if 2FA is already enabled
    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection("users").findOne({ _id: authUser.mongoUser._id });

    if (user?.twoFactorEnabled) {
      return NextResponse.json({ error: "2FA is already enabled" }, { status: 400 });
    }

    // Generate TOTP secret
    const totp = new OTPAuth.TOTP({
      issuer: "MakeChurchEasy",
      label: email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: new OTPAuth.Secret({ size: 20 }),
    });

    const secret = totp.secret.base32;
    const otpauthUrl = totp.toString();

    // Store the secret temporarily (not enabled yet — waits for verification)
    await db.collection("users").updateOne(
      { _id: authUser.mongoUser._id },
      {
        $set: {
          twoFactorSecret: secret,
          twoFactorEnabled: false,
          twoFactorRecoveryCodes: [],
        },
      }
    );

    return NextResponse.json({
      secret,
      otpauthUrl,
    });
  } catch (error) {
    console.error("2FA setup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
