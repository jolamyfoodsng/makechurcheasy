/**
 * serverVersionGate.ts — Version gate middleware for the Bible API server
 * (obs-multiview-backend-api.fly.dev)
 *
 * Drop this into the Fly.io backend server and add the middleware to all
 * /api/* routes. The desktop app sends X-App-Version on every request.
 *
 * Usage (Express):
 *   import { versionGateMiddleware } from "./serverVersionGate";
 *   app.use("/api", versionGateMiddleware, apiRouter);
 *
 * Usage (Hono / itty-router / etc.):
 *   Same pattern — just call the exported function before your handlers.
 *
 * Versions below the floor get a 403 with VERSION_TOO_OLD.
 */

const MINIMUM_VERSION = "4.30.0";

function parseVersionParts(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isBelowMinimum(version: string): boolean {
  const [a, b, c] = parseVersionParts(version);
  const [fA, fB, fC] = parseVersionParts(MINIMUM_VERSION);
  if (a !== fA) return a < fA;
  if (b !== fB) return b < fB;
  return c < fC;
}

/**
 * Express-compatible middleware.
 * Checks X-App-Version header — returns 403 if below minimum.
 * Passes through if header is missing (graceful degradation for non-desktop clients).
 */
export function versionGateMiddleware(req: any, res: any, next: any) {
  const clientVersion = req.headers?.["x-app-version"];
  if (clientVersion && isBelowMinimum(clientVersion)) {
    return res.status(403).json({
      error: "VERSION_TOO_OLD",
      message: `This version (v${clientVersion}) is no longer supported. Please update to v${MINIMUM_VERSION} or later.`,
      minimumVersion: MINIMUM_VERSION,
    });
  }
  next();
}

/**
 * Check a request's X-App-Version header.
 * Returns a Response object if blocked, null if OK.
 *
 * For use with frameworks that don't use Express-style middleware
 * (e.g. Hono, Deno std, Cloudflare Workers).
 */
export function checkRequestVersion(req: Request): Response | null {
  const clientVersion = req.headers.get("x-app-version");
  if (clientVersion && isBelowMinimum(clientVersion)) {
    return Response.json(
      {
        error: "VERSION_TOO_OLD",
        message: `This version (v${clientVersion}) is no longer supported. Please update to v${MINIMUM_VERSION} or later.`,
        minimumVersion: MINIMUM_VERSION,
      },
      { status: 403 }
    );
  }
  return null;
}

export { MINIMUM_VERSION, isBelowMinimum, parseVersionParts };
