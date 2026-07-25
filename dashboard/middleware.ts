import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-App-Version, Authorization, X-Device-Id, X-User-Id",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
