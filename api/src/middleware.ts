import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin");
  const suppliedRequestId = req.headers.get("x-request-id")?.trim() || "";
  const requestId = /^[A-Za-z0-9._:-]{1,80}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-mce-api-path", req.nextUrl.pathname);
  requestHeaders.set("x-mce-api-method", req.method);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "X-Request-Id": requestId,
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-App-Version, X-Request-Id, Authorization, X-Device-Id, X-MCE-Device-Id, X-Device-Secret, X-User-Id",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Expose-Headers": "X-Request-Id",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("X-Request-Id", requestId);
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Expose-Headers", "X-Request-Id");
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
