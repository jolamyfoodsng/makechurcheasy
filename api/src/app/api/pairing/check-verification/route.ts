import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { normalizePairingCode } from "@/lib/pairingUtils";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/pairing/check-verification
 *
 * The desktop app calls this when the user clicks "I've Verified My Email"
 * in the verification modal.  We look up the pairing code → find the
 * authorizing user → return their current emailVerified status.
 *
 * Body: { code: string }  (the pairing code, used as lightweight auth)
 */
export async function POST(req: NextRequest) {
  try {
    const { code: rawCode } = (await req.json()) as { code?: string };
    if (!rawCode) {
      return NextResponse.json(
        { error: "Code required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const code = normalizePairingCode(rawCode);

    const client = await clientPromise;
    const db = client.db();

    // Match both normalized (ABCD1234) and legacy hyphenated (ABCD-1234) forms
    const codeWithHyphen = `${code.slice(0, 4)}-${code.slice(4)}`;
    const pairing = await db.collection("pairingCodes").findOne({
      $or: [{ code }, { code: codeWithHyphen }],
    });
    if (!pairing?.userId) {
      return NextResponse.json(
        { error: "Invalid or expired pairing code" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const user = await db
      .collection("users")
      .findOne(
        { _id: new ObjectId(pairing.userId) },
        { projection: { emailVerified: 1 } }
      );

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { verified: user.emailVerified === true },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[pairing/check-verification] Error:", err);
    return NextResponse.json(
      { error: "Failed to check verification status" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
