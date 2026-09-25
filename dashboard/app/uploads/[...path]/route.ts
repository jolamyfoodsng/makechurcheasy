import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backendProxy";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToBackend(request, `/uploads/${path.join("/")}`);
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
