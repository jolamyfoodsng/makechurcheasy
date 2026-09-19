/**
 * In-memory rate limiter for Next.js API routes.
 *
 * Uses a sliding-window counter per IP. Sufficient for single-server
 * deployments. For multi-server, swap the Map for Redis.
 *
 * Usage:
 *   const limiter = rateLimit({ windowMs: 60_000, max: 10 });
 *   const result = limiter.check(req);
 *   if (!result.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  /** Window duration in milliseconds (default: 60s) */
  windowMs?: number;
  /** Max requests per window (default: 30) */
  max?: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // Take the first IP (leftmost = original client)
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export function rateLimit(config?: RateLimitConfig) {
  const windowMs = config?.windowMs ?? 60_000;
  const max = config?.max ?? 30;

  return {
    check(req: Request): RateLimitResult {
      const ip = getClientIp(req);
      const now = Date.now();
      const key = ip;
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        // New window
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, remaining: max - 1, resetAt: now + windowMs };
      }

      if (entry.count >= max) {
        return { ok: false, remaining: 0, resetAt: entry.resetAt };
      }

      entry.count++;
      return { ok: true, remaining: max - entry.count, resetAt: entry.resetAt };
    },
  };
}

/** Convenience: strict limiter for auth actions (5 req/min) */
export const authLimiter = rateLimit({ windowMs: 60_000, max: 5 });

/** Convenience: moderate limiter for general API (30 req/min) */
export const apiLimiter = rateLimit({ windowMs: 60_000, max: 30 });

/** Convenience: generous limiter for polling endpoints (60 req/min) */
export const pollLimiter = rateLimit({ windowMs: 60_000, max: 60 });
