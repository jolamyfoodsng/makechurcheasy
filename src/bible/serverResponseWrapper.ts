/**
 * serverResponseWrapper.ts — API response envelope for the Fly.io Bible/template API
 *
 * Wraps all API responses in: { data: <payload>, apiVersion: 2 }
 *
 * Old desktop clients (v4.28 and earlier) expect raw JSON arrays/objects.
 * When they receive the envelope, they try to iterate or use the wrapper
 * object as if it were the raw data, which causes crashes.
 *
 * New clients (v4.30+) unwrap the `data` field before using it.
 *
 * Drop this into the Fly.io backend server and use wrapResponse() on all
 * API endpoints that the desktop app calls.
 */

const API_VERSION = 2;

/** Wrap any payload in the versioned envelope */
export function wrapResponse<T>(data: T): { data: T; apiVersion: number } {
  return { data, apiVersion: API_VERSION };
}

/**
 * Express-compatible middleware helper.
 * Wraps res.json() to automatically envelope the response.
 *
 * Usage:
 *   import { envelopeResponses } from "./serverResponseWrapper";
 *   app.use("/api", envelopeResponses);
 *
 * Then your existing res.json(payload) calls will return:
 *   { data: payload, apiVersion: 2 }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function envelopeResponses(_req: any, res: any, next: any) {
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    // Don't double-wrap errors or already-wrapped responses
    if (body && typeof body === "object" && "apiVersion" in body) {
      return originalJson(body);
    }
    if (res.statusCode >= 400) {
      return originalJson(body);
    }
    return originalJson(wrapResponse(body));
  };
  next();
}

export { API_VERSION };
