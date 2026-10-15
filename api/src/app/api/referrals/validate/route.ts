import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { validateReferralCode } from "@/lib/referrals";

// Public: the signup form checks a code here before the person has an account. It only says
// whether the code exists — never who owns it.
const validateLimiter = rateLimit({ windowMs: 60_000, max: 40 });

export async function GET(req: NextRequest) {
  const limit = validateLimiter.check(req);
  if (!limit.ok) {
    return NextResponse.json({ valid: false, error: "Too many checks. Please wait a moment." }, { status: 429 });
  }
  try {
    const result = await validateReferralCode(req.nextUrl.searchParams.get("code"));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[referrals/validate] error:", error);
    return NextResponse.json({ valid: false, error: "Could not check the code right now." }, { status: 500 });
  }
}
