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

  try {
    const method = request.method.toUpperCase();
    const response = await fetch(backendUrl(pathname, request.nextUrl.search), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

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
