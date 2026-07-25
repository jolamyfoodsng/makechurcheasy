/**
 * analyticsService.ts — Client-side analytics event tracking (Growth+ feature).
 * Sends events to /api/user/analytics for advanced ministry usage tracking.
 */

const API_BASE = "";

export interface AnalyticsDashboard {
  aggregation: { event: string; count: number }[];
  days: number;
}

/**
 * Log an analytics event.
 * Only works for Growth+ users (server returns 403 otherwise).
 */
export async function trackEvent(
  event: string,
  metadata?: Record<string, unknown>
): Promise<{ eventId: string }> {
  const res = await fetch(`${API_BASE}/api/user/analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, metadata }),
  });
  const json = await res.json();
  if (!res.ok) {
    // Silently ignore 403 (non-Growth users) — analytics is best-effort
    if (res.status === 403) return { eventId: "" };
    throw new Error(json.error || `Analytics event failed (${res.status})`);
  }
  return json;
}

/**
 * Get recent analytics events for the current user.
 */
export async function getEvents(options: {
  limit?: number;
  event?: string;
  since?: string;
} = {}): Promise<{ event: string; metadata?: Record<string, unknown>; createdAt: string }[]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.event) params.set("event", options.event);
  if (options.since) params.set("since", options.since);

  const res = await fetch(`${API_BASE}/api/user/analytics?${params.toString()}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Failed to fetch events (${res.status})`);
  }
  return json.events || [];
}

/**
 * Get aggregated analytics dashboard data.
 * @param days — Number of days to aggregate (default 30)
 */
export async function getDashboard(days: number = 30): Promise<AnalyticsDashboard> {
  const params = new URLSearchParams({ mode: "dashboard", days: String(days) });
  const res = await fetch(`${API_BASE}/api/user/analytics?${params.toString()}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Failed to fetch dashboard (${res.status})`);
  }
  return json;
}
