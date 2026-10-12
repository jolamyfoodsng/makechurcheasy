import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { resendLoggedEmail } from "@/lib/emailTemplates";

/**
 * POST /api/admin/users/:id/emails/:emailId/resend
 * Re-sends a logged email (same subject and content) to the user's current
 * email address, records the attempt as a new email log, and returns it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id, emailId } = await params;
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(emailId)) {
      return NextResponse.json({ error: "Invalid email id" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const logs = db.collection("email_logs");

    const original = await logs.findOne({ _id: new ObjectId(emailId) });
    if (!original) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    let user: { _id: unknown; email?: string } | null = null;
    if (ObjectId.isValid(id)) {
      user = await db.collection("users").findOne(
        { _id: new ObjectId(id) },
        { projection: { email: 1 } },
      ) as { _id: unknown; email?: string } | null;
    }
    const userEmail = String(user?.email || "").toLowerCase().trim();
    const originalTo = String(original.to || original.recipientEmail || "").toLowerCase().trim();

    // Only resend emails that belong to this user.
    const belongsToUser = String(original.userId || "") === id || (userEmail && originalTo === userEmail);
    if (!belongsToUser) {
      return NextResponse.json({ error: "This email does not belong to this user" }, { status: 403 });
    }

    const html = String(original.html || "");
    if (!html.trim()) {
      return NextResponse.json(
        { error: "This email has no saved content, so it can't be resent." },
        { status: 422 },
      );
    }

    const to = userEmail || originalTo;
    if (!to) {
      return NextResponse.json({ error: "No email address to send to" }, { status: 422 });
    }

    const subject = String(original.subject || "(No Subject)");
    // Keep the original context (template, type...) but give the resend its own key.
    const { emailKey: _ignoredKey, ...originalMetadata } =
      (typeof original.metadata === "object" && original.metadata ? original.metadata : {}) as Record<string, unknown>;
    const result = await resendLoggedEmail({
      to,
      subject,
      html,
      userId: id,
      metadata: {
        ...originalMetadata,
        resentFrom: emailId,
        resentBy: auth.adminUserId,
      },
    });

    await logs.updateOne(
      { _id: original._id },
      {
        $set: {
          lastResendAt: new Date(),
          lastResendStatus: result.sent ? "sent" : "failed",
          lastResendLogId: result.logId,
        },
        $inc: { resendCount: 1 },
      },
    ).catch(() => undefined);

    if (!result.sent) {
      return NextResponse.json(
        { ok: false, error: result.error || "Resend failed", provider: result.provider, logId: result.logId },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, provider: result.provider, logId: result.logId, to });
  } catch (error) {
    console.error("[admin/users/[id]/emails/resend] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
