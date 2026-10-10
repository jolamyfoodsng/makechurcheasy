import { NextResponse } from "next/server";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import clientPromise from "@/lib/mongodb";
import { signSessionToken } from "@/lib/jwt";
import { setAuthCookieOnResponse } from "@/lib/auth";
import { consumeChallenge, getPasskeyRp, passkeyIdFromResponse, signPasskeySecondFactorTicket } from "@/lib/passkeys";
import { rateLimit } from "@/lib/rateLimit";

const limiter = rateLimit({ windowMs: 60_000, max: 10 });

export async function POST(req: Request) {
  if (!limiter.check(req).ok) return NextResponse.json({ error: "Too many sign-in attempts. Please wait a minute and try again." }, { status: 429 });
  try {
    const response = await req.json() as AuthenticationResponseJSON;
    const clientData = JSON.parse(Buffer.from(response?.response?.clientDataJSON || "", "base64url").toString("utf8"));
    const { origin, rpID, allowedOrigins } = getPasskeyRp(req);
    if (!allowedOrigins.includes(origin) || !(await consumeChallenge(clientData.challenge, "login"))) return NextResponse.json({ error: "Passkey sign-in expired. Please try again." }, { status: 400 });
    const client = await clientPromise;
    const users = client.db().collection("users");
    const id = passkeyIdFromResponse(response);
    const user = await users.findOne({ "passkeys.id": id, isActive: { $ne: false } });
    const stored = user?.passkeys?.find((item: any) => item.id === id);
    if (!user || !stored) return NextResponse.json({ error: "No matching passkey was found." }, { status: 401 });
    if (response.response?.userHandle) {
      const userHandle = Buffer.from(response.response.userHandle, "base64url").toString("utf8");
      if (userHandle !== user._id.toString()) return NextResponse.json({ error: "Passkey account did not match." }, { status: 401 });
    }
    const verification = await verifyAuthenticationResponse({ response, expectedChallenge: clientData.challenge, expectedOrigin: allowedOrigins, expectedRPID: rpID, requireUserVerification: true, credential: { id: stored.id, publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")), counter: stored.counter || 0, transports: stored.transports } });
    if (!verification.verified) return NextResponse.json({ error: "Passkey sign-in could not be verified." }, { status: 401 });
    await users.updateOne({ _id: user._id, "passkeys.id": id }, { $set: { "passkeys.$.counter": verification.authenticationInfo.newCounter, lastLogin: new Date().toISOString() } });
    if (user.twoFactorEnabled && user.twoFactorSecret) return NextResponse.json({ requiresTwoFactor: true, ticket: await signPasskeySecondFactorTicket(user._id.toString()) });
    const jwt = await signSessionToken(user._id.toString(), user.tokenVersion ?? 0);
    const result = NextResponse.json({ success: true });
    return setAuthCookieOnResponse(result, jwt);
  } catch (error) {
    console.error("[passkeys/login-verify]", error);
    return NextResponse.json({ error: "Passkey sign-in failed. Please try again." }, { status: 400 });
  }
}
