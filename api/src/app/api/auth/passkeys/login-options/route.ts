import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getPasskeyRp, saveChallenge } from "@/lib/passkeys";
import { rateLimit } from "@/lib/rateLimit";

const limiter = rateLimit({ windowMs: 60_000, max: 10 });

export async function POST(req: Request) {
  if (!limiter.check(req).ok) return NextResponse.json({ error: "Too many sign-in attempts. Please wait a minute and try again." }, { status: 429 });
  try {
    const { rpID } = getPasskeyRp(req);
    const options = await generateAuthenticationOptions({ rpID, timeout: 60000, userVerification: "required" });
    await saveChallenge(options.challenge, "login");
    return NextResponse.json(options);
  } catch (error) {
    console.error("[passkeys/login-options]", error);
    return NextResponse.json({ error: "Passkey sign-in is not available on this site." }, { status: 500 });
  }
}
