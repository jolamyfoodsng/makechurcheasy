import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import clientPromise from "@/lib/mongodb";
import { getPasskeyRp, getPasskeyUser, saveChallenge } from "@/lib/passkeys";

export async function POST(req: Request) {
  try {
    const user = await getPasskeyUser();
    if (!user) return NextResponse.json({ error: "Sign in to add a passkey." }, { status: 401 });
    const { rpID } = getPasskeyRp(req);
    const options = await generateRegistrationOptions({
      rpName: "MakeChurchEazy", rpID, userName: user.email,
      userID: new TextEncoder().encode(user._id.toString()), userDisplayName: user.name || user.email,
      attestationType: "none", timeout: 60000,
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      excludeCredentials: (user.passkeys || []).map((credential: any) => ({ id: credential.id, transports: credential.transports })),
    });
    await saveChallenge(options.challenge, "register", user._id.toString());
    return NextResponse.json(options);
  } catch (error) {
    console.error("[passkeys/register-options]", error);
    return NextResponse.json({ error: "Could not start passkey setup." }, { status: 500 });
  }
}
