import { NextRequest, NextResponse } from "next/server";

function appOrigin(appUrl: string): string {
  try {
    return new URL(appUrl).origin;
  } catch {
    return "https://makechurcheazy.com";
  }
}

function isAllowedOrigin(origin: string, appUrl: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.origin === appOrigin(appUrl)) return true;
    return process.env.NODE_ENV !== "production" && parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function sanitizeReturnUrl(value: string | null, origin: string): string {
  if (!value) return origin;
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return origin;
    return parsed.toString();
  } catch {
    return origin;
  }
}

/**
 * GET /api/auth/google
 *
 * Redirects the user to Google's OAuth consent screen.
 * After authorization, Google redirects to /api/auth/google/callback.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheazy.com";

  if (!clientId) {
    return NextResponse.json(
      { error: "Google OAuth is not configured" },
      { status: 500 }
    );
  }

  // Client passes its own origin so we redirect back to the dashboard, not the API
  const requestedOrigin = req.nextUrl.searchParams.get("origin") || appOrigin(appUrl);
  const clientOrigin = isAllowedOrigin(requestedOrigin, appUrl)
    ? new URL(requestedOrigin).origin
    : appOrigin(appUrl);
  const redirectUri = `${clientOrigin}/api/auth/google/callback`;

  // Preserve the redirect destination after login
  const returnUrl = sanitizeReturnUrl(req.nextUrl.searchParams.get("returnUrl"), clientOrigin);

  // Encode both origin and returnUrl in state so callback can reconstruct redirectUri
  const statePayload = JSON.stringify({ o: clientOrigin, r: returnUrl });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: statePayload,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
