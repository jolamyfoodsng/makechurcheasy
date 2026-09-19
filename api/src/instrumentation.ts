import { NextResponse } from "next/server";
import { notifyTelegramApiError, observeApiResponseError } from "@/lib/apiErrorAlerts";

type InstrumentationRequest = {
  path: string;
  method: string;
  headers: NodeJS.Dict<string | string[]>;
};

type InstrumentationContext = {
  routePath: string;
  routerKind: "Pages Router" | "App Router";
  routeType: "render" | "route" | "action" | "proxy";
  revalidateReason?: "on-demand" | "stale";
};

let responseObserverInstalled = false;

function installApiResponseObserver(): void {
  if (responseObserverInstalled) return;
  responseObserverInstalled = true;

  const responseClass = NextResponse as typeof NextResponse & {
    json: <Body>(body: Body, init?: ResponseInit) => NextResponse<Body>;
  };
  const originalJson = responseClass.json;

  responseClass.json = function observedJson<Body>(
    this: typeof NextResponse,
    body: Body,
    init?: ResponseInit,
  ): NextResponse<Body> {
    const response = originalJson.call(this, body, init) as NextResponse<Body>;
    if (response.status >= 400) observeApiResponseError(response.status, body);
    return response;
  };
}

export function register(): void {
  installApiResponseObserver();
}

export async function onRequestError(
  error: unknown,
  request: InstrumentationRequest,
  context: InstrumentationContext,
): Promise<void> {
  const path = context.routePath || request.path;
  if (!path.startsWith("/api/")) return;

  await notifyTelegramApiError({
    error,
    statusCode: 500,
    routePath: path,
    method: request.method,
    request: {
      path: request.path,
      method: request.method,
      headers: request.headers,
    },
    category: "exception",
  });
}
