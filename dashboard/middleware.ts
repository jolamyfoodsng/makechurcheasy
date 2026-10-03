import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Protect /admin routes before rendering any page: redirect unauthenticated users to login
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const sessionCookie = req.cookies.get("session-token")?.value;
    if (!sessionCookie) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(req.headers);
  const edgeCountry = (req.headers.get("cf-ipcountry") || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(edgeCountry) && edgeCountry !== "XX" && edgeCountry !== "T1") {
    // Rewrites to the API do not always preserve the hosting provider's geo
    // header, so pass the validated edge value through explicitly.
    requestHeaders.set("x-mce-geo-country", edgeCountry);
  }

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-App-Version, Authorization, X-Device-Id, X-MCE-Device-Id, X-Device-Secret, X-User-Id",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

export const config = {
  matcher: ["/api/:path*", "/admin", "/admin/:path*"],
};
