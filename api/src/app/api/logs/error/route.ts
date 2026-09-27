import { NextRequest, NextResponse } from "next/server";
import { logErrorEvent } from "@/lib/errorLog";
import { getAuthUserFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const body: Record<string, unknown> = typeof rawBody === "object" && rawBody !== null ? (rawBody as Record<string, unknown>) : {};
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Error message is required" }, { status: 400 });
    }

    // Attempt to resolve user from auth session if available
    let authUser = null;
    try {
      authUser = await getAuthUserFromRequest(req);
    } catch {
      // Unauthenticated or invalid token, proceed with client-supplied or null
    }

    const mongoUser = authUser?.mongoUser;

    const userId = mongoUser?._id?.toString() || (typeof body.userId === "string" ? body.userId : null);
    const userEmail = mongoUser?.email || (typeof body.userEmail === "string" ? body.userEmail : null);
    const userName = mongoUser?.name || (typeof body.userName === "string" ? body.userName : null);
    const churchName = mongoUser?.churchName || (typeof body.churchName === "string" ? body.churchName : null);

    const userAgent = req.headers.get("user-agent") || (typeof body.userAgent === "string" ? body.userAgent : "");

    const errorId = await logErrorEvent({
      userId,
      userEmail,
      userName,
      churchName,
      message,
      name: typeof body.name === "string" ? body.name : "Error",
      stack: typeof body.stack === "string" ? body.stack : undefined,
      componentStack: typeof body.componentStack === "string" ? body.componentStack : undefined,
      url: typeof body.url === "string" ? body.url : req.headers.get("referer") || "/",
      pathname: typeof body.pathname === "string" ? body.pathname : undefined,
      action: typeof body.action === "string" ? body.action : undefined,
      breadcrumbs: Array.isArray(body.breadcrumbs) ? (body.breadcrumbs as any) : [],
      userAgent,
      source: body.source === "server" ? "server" : "client",
      metadata: typeof body.metadata === "object" && body.metadata !== null ? (body.metadata as Record<string, unknown>) : {},
    });

    return NextResponse.json({ success: true, id: errorId });
  } catch (error) {
    console.error("[logs/error] Failed to ingest error log:", error);
    return NextResponse.json({ error: "Failed to record error log" }, { status: 500 });
  }
}
