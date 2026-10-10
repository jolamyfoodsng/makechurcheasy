import { NextResponse } from "next/server";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import clientPromise from "@/lib/mongodb";
import { consumeChallenge, getPasskeyRp, getPasskeyUser } from "@/lib/passkeys";

export async function POST(req: Request) {
  try {
    const user = await getPasskeyUser();
    if (!user) return NextResponse.json({ error: "Sign in to add a passkey." }, { status: 401 });
    const response = await req.json() as RegistrationResponseJSON;
    if (!response?.id || !response?.response?.clientDataJSON) return NextResponse.json({ error: "Invalid passkey response." }, { status: 400 });
    const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8"));
    const { origin, rpID, allowedOrigins } = getPasskeyRp(req);
    if (!allowedOrigins.includes(origin) || !(await consumeChallenge(clientData.challenge, "register", user._id.toString()))) return NextResponse.json({ error: "Passkey setup expired. Please try again." }, { status: 400 });
    const verification = await verifyRegistrationResponse({ response, expectedChallenge: clientData.challenge, expectedOrigin: allowedOrigins, expectedRPID: rpID, requireUserVerification: true });
    if (!verification.verified) return NextResponse.json({ error: "Passkey verification failed." }, { status: 400 });
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const entry = { id: credential.id, publicKey: Buffer.from(credential.publicKey).toString("base64url"), counter: credential.counter, transports: response.response.transports || [], deviceType: credentialDeviceType, backedUp: credentialBackedUp, name: typeof req.headers.get("x-passkey-name") === "string" ? req.headers.get("x-passkey-name") : "Passkey", createdAt: new Date().toISOString() };
    const client = await clientPromise;
    await client.db().collection("users").updateOne({ _id: user._id }, { $addToSet: { passkeys: entry } });
    return NextResponse.json({ success: true, passkey: { id: entry.id, name: entry.name, createdAt: entry.createdAt, deviceType: entry.deviceType } });
  } catch (error) {
    console.error("[passkeys/register-verify]", error);
    return NextResponse.json({ error: "Could not verify this passkey." }, { status: 400 });
  }
}
