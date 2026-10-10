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
  const edgeCountry = (
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-mce-geo-country") ||
    req.headers.get("x-vercel-ip-country") ||
    ""
  ).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(edgeCountry) && edgeCountry !== "XX" && edgeCountry !== "T1") {
    requestHeaders.set("x-mce-geo-country", edgeCountry);
  }

  const edgeCity = req.headers.get("x-mce-geo-city") || req.headers.get("x-vercel-ip-city") || "";
  if (edgeCity && !requestHeaders.has("x-mce-geo-city")) {
    requestHeaders.set("x-mce-geo-city", edgeCity.trim());
  }

  const edgeTimezone = req.headers.get("x-mce-geo-timezone") || req.headers.get("x-vercel-ip-timezone") || "";
  if (edgeTimezone && !requestHeaders.has("x-mce-geo-timezone")) {
    requestHeaders.set("x-mce-geo-timezone", edgeTimezone.trim());
  }

  const clientIp = (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-mce-client-ip") ||
    ""
  ).trim();
  if (clientIp && !requestHeaders.has("x-mce-client-ip")) {
    requestHeaders.set("x-mce-client-ip", clientIp);
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
