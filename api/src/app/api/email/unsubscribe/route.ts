/**
 * GET  /api/email/unsubscribe?token=...  shows a confirmation page
 * POST /api/email/unsubscribe?token=...  turns marketing email off for that user
 *
 * GET never changes anything: mail scanners open links, and that must not
 * unsubscribe people by accident. The page's button (or a mail client's
 * one-click unsubscribe) sends the POST.
 */
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { verifyUnsubscribeToken } from "@/lib/emailUnsubscribe";

function page(title: string, body: string, form?: { token: string }): NextResponse {
  const safeToken = form ? form.token.replace(/[^A-Za-z0-9._%-]/g, "") : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;max-width:440px;width:100%;text-align:center}
h1{font-size:20px;margin:0 0 12px}p{color:#475569;line-height:1.6;margin:0 0 20px;font-size:15px}
button{background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:12px 24px;font-size:15px;font-weight:600;cursor:pointer}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p>${
    form ? `<form method="POST" action="/api/email/unsubscribe?token=${safeToken}"><button type="submit">Unsubscribe</button></form>` : ""
  }</div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!verifyUnsubscribeToken(token)) {
    return page("This link isn't valid", "The unsubscribe link looks incomplete. Please use the link from the latest email, or reply to it and we'll help.");
  }
  return page(
    "Unsubscribe from offers and tips?",
    "You'll stop receiving offers and promotional emails from MakeChurchEasy. Account, security and billing emails will still reach you.",
    { token },
  );
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const userId = verifyUnsubscribeToken(token);
  if (!userId || !ObjectId.isValid(userId)) {
    return page("This link isn't valid", "The unsubscribe link looks incomplete. Please use the link from the latest email.");
  }
  const client = await clientPromise;
  await client
    .db()
    .collection("users")
    .updateOne(
      { _id: new ObjectId(userId) },
      { $set: { "emailPreferences.marketing": false, "emailPreferences.marketingUnsubscribedAt": new Date().toISOString() } },
    );
  return page("You're unsubscribed", "You won't receive offers and promotional emails from MakeChurchEasy any more. Account, security and billing emails will still reach you.");
}
