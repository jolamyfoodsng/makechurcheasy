import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import * as OTPAuth from "otpauth";
import crypto from "crypto";

function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const bytes = crypto.randomBytes(4);
    const code = bytes.readUInt32BE(0).toString(36).toUpperCase().padStart(7, "0");
    codes.push(code.slice(0, 4) + "-" + code.slice(4));
  }
  return codes;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token, secret } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection("users").findOne({ _id: authUser.mongoUser._id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If secret is provided, this is the initial setup verification
    if (secret) {
      const totp = new OTPAuth.TOTP({
        issuer: "MakeChurchEasy",
        label: user.email || "user",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      const delta = totp.validate({ token, window: 1 });
      if (delta === null) {
        return NextResponse.json({ error: "Invalid token. Please try again." }, { status: 400 });
      }

      // Generate recovery codes
      const recoveryCodes = generateRecoveryCodes();

      // Enable 2FA
      await db.collection("users").updateOne(
        { _id: authUser.mongoUser._id },
        {
          $set: {
            twoFactorEnabled: true,
            twoFactorSecret: secret,
            twoFactorRecoveryCodes: recoveryCodes,
          },
        }
      );

      return NextResponse.json({
        success: true,
        recoveryCodes,
      });
    }

    // If no secret, this is a login verification — check against stored secret
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
      // Check recovery codes
      const normalizedToken = token.replace(/\s/g, "").toUpperCase();
      const recoveryIndex = user.twoFactorRecoveryCodes?.indexOf(normalizedToken);
      if (recoveryIndex !== undefined && recoveryIndex >= 0) {
        // Remove used recovery code
        const updatedCodes = [...user.twoFactorRecoveryCodes];
        updatedCodes.splice(recoveryIndex, 1);
        await db.collection("users").updateOne(
          { _id: authUser.mongoUser._id },
          { $set: { twoFactorRecoveryCodes: updatedCodes } }
        );
        return NextResponse.json({ success: true, recoveryCodeUsed: true });
      }
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("2FA verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
