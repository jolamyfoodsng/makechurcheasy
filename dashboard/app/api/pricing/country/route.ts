import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3004";

function getRequestCountry(req: NextRequest): string | null {
  const country =
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-vercel-ip-country") ||
    "";
  const normalized = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) && normalized !== "XX" ? normalized : null;
}

export async function GET(req: NextRequest) {
  const upstreamUrl = new URL("/api/pricing/country", API_BASE);
  upstreamUrl.search = req.nextUrl.search;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const cookie = req.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;

  const country = getRequestCountry(req);
  if (country) headers["X-MCE-Geo-Country"] = country;

  const upstream = await fetch(upstreamUrl, {
    headers,
    cache: "no-store",
  });

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      Vary: "Cookie, CF-IPCountry, X-Vercel-IP-Country",
    },
  });
}
