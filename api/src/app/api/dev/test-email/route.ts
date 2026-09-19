/**
 * GET /api/dev/test-email — Send a test email via the current transport.
 *
 * Development only (returns 404 if NODE_ENV !== "development").
 * In dev mode, routes through MailDev SMTP (http://localhost:1080).
 */

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/emailTemplates";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await sendEmail({
    to: "dev@test.com",
    subject: "MakeChurchEasy Dev Test",
    html: `
      <div style="font-family: sans-serif; padding: 32px;">
        <h2 style="color: #2563eb;">MakeChurchEasy Dev Test Email</h2>
        <p>This is a test email sent at <strong>${new Date().toISOString()}</strong>.</p>
        <p>If you're seeing this in <a href="http://localhost:1080">MailDev</a>, the SMTP transport is working correctly.</p>
      </div>
    `,
  });

  return NextResponse.json({ success: result });
}
