import { NextRequest, NextResponse } from "next/server";
import * as OTPAuth from "otpauth";
import clientPromise from "@/lib/mongodb";
import { signSessionToken } from "@/lib/jwt";
import { setAuthCookieOnResponse } from "@/lib/auth";
import { verifyPasskeySecondFactorTicket } from "@/lib/passkeys";
import { rateLimit } from "@/lib/rateLimit";

const limiter = rateLimit({ windowMs: 60_000, max: 8 });

export async function POST(req: NextRequest) {
  try {
    if (!limiter.check(req).ok) return NextResponse.json({ error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
    const { ticket, code } = await req.json() as { ticket?: string; code?: string };
    const userId = typeof ticket === "string" ? await verifyPasskeySecondFactorTicket(ticket) : null;
    if (!userId || typeof code !== "string") return NextResponse.json({ error: "This sign-in has expired. Start again." }, { status: 401 });
    const { ObjectId } = await import("mongodb");
    const client = await clientPromise;
    const users = client.db().collection("users");
    const user = await users.findOne({ _id: new ObjectId(userId), isActive: { $ne: false }, twoFactorEnabled: true });
    if (!user?.twoFactorSecret) return NextResponse.json({ error: "Two-factor verification is unavailable." }, { status: 401 });
    const clean = code.trim();
    const totp = new OTPAuth.TOTP({ issuer: "MakeChurchEazy", label: user.email || "user", algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret) });
    let valid = totp.validate({ token: clean, window: 1 }) !== null;
    if (!valid && Array.isArray(user.twoFactorRecoveryCodes)) {
      const normalized = clean.replace(/[\s-]/g, "").toUpperCase();
      const index = user.twoFactorRecoveryCodes.findIndex((item: string) => item.replace(/[\s-]/g, "").toUpperCase() === normalized);
      if (index >= 0) {
        valid = true;
        const codes = [...user.twoFactorRecoveryCodes]; codes.splice(index, 1);
        await users.updateOne({ _id: user._id }, { $set: { twoFactorRecoveryCodes: codes } });
      }
    }
    if (!valid) return NextResponse.json({ error: "Invalid two-factor authentication code." }, { status: 401 });
    const jwt = await signSessionToken(user._id.toString(), user.tokenVersion ?? 0);
    return setAuthCookieOnResponse(NextResponse.json({ success: true }), jwt);
  } catch (error) {
    console.error("[passkeys/complete-2fa]", error);
    return NextResponse.json({ error: "Could not complete sign-in." }, { status: 400 });
  }
}
