import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { rateLimit } from "@/lib/rateLimit";
import { normalizePairingCode } from "@/lib/pairingUtils";

const rejectLimiter = rateLimit({ windowMs: 60_000, max: 20 });

export async function POST(req: NextRequest) {
  try {
    const rl = rejectLimiter.check(req);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { code: rawCode } = (await req.json()) as { code?: string };
    if (!rawCode) {
      return NextResponse.json({ error: "Code required" }, { status: 400 });
    }

    const code = normalizePairingCode(rawCode);

    const client = await clientPromise;
    const db = client.db();

    // Delete the pairing code regardless of state
    // Match both normalized (ABCD1234) and legacy hyphenated (ABCD-1234) forms
    const codeWithHyphen = `${code.slice(0, 4)}-${code.slice(4)}`;
    await db.collection("pairingCodes").deleteOne({
      $or: [{ code }, { code: codeWithHyphen }],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Pairing reject error:", err);
    return NextResponse.json({ error: "Failed to reject pairing" }, { status: 500 });
  }
}
