import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3004";

function backendUrl(pathname: string, search: string): string {
  const base = BACKEND_URL.replace(/\/+$/, "");
  const target = new URL(`${base}${pathname}`);
  target.search = search;
  return target.toString();
}

export async function proxyToBackend(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse> {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const edgeCountry =
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-mce-geo-country") ||
    request.headers.get("x-vercel-ip-country");
  if (edgeCountry && !headers.has("x-mce-geo-country")) {
    headers.set("x-mce-geo-country", edgeCountry.trim().toUpperCase());
  }

  const clientIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-mce-client-ip");
  if (clientIp && !headers.has("x-mce-client-ip")) {
    headers.set("x-mce-client-ip", clientIp.trim());
  }

  const edgeCity = request.headers.get("x-mce-geo-city") || request.headers.get("x-vercel-ip-city");
  if (edgeCity && !headers.has("x-mce-geo-city")) {
    headers.set("x-mce-geo-city", edgeCity.trim());
  }

  const edgeTimezone = request.headers.get("x-mce-geo-timezone") || request.headers.get("x-vercel-ip-timezone");
  if (edgeTimezone && !headers.has("x-mce-geo-timezone")) {
    headers.set("x-mce-geo-timezone", edgeTimezone.trim());
  }

  try {
    const method = request.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    const response = await fetch(backendUrl(pathname, request.nextUrl.search), {
      method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      ...(hasBody && request.body ? { duplex: "half" } : {}),
    } as RequestInit);

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    console.error("[backend-proxy] request failed", {
      method: request.method,
      pathname,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Backend unavailable" },
      { status: 502 },
    );
  }
}
