/** Lightweight, non-gated product events for the activation funnel. */
export function trackProductEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  void fetch("/api/tracking/event", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      properties: properties || {},
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => {
    // Product tracking must never block checkout or navigation.
  });
}

