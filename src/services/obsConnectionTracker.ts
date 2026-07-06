/**
 * obsConnectionTracker.ts — Track active OBS WebSocket connections
 *
 * Detects duplicate connections and warns when multiple clients are connected
 * to the same OBS WebSocket server. Each client registers with a unique origin
 * identifier on connect and unregisters on disconnect.
 *
 * Since the main app and dock CEF run in separate JS contexts, cross-process
 * detection relies on both registering via this module (each context gets its
 * own instance, but intra-context duplicates are caught).
 *
 * Usage:
 *   import * as tracker from "./obsConnectionTracker";
 *   tracker.register("main-app", url);
 *   // ... on disconnect:
 *   tracker.unregister("main-app");
 */

interface ConnectionEntry {
  origin: string;
  url: string;
  connectedAt: number;
}

const activeConnections = new Map<string, ConnectionEntry>();
const LOG_PREFIX = "[OBS-CONN]";

/**
 * Register a new OBS WebSocket connection.
 * Warns if another connection is already active from this JS context.
 */
export function register(origin: string, url: string): boolean {
  if (activeConnections.has(origin)) {
    console.warn(
      `${LOG_PREFIX} Origin "${origin}" already has an active connection — ` +
      `this may indicate a leaked connection. URL: ${activeConnections.get(origin)!.url}`
    );
  }

  activeConnections.set(origin, { origin, url, connectedAt: Date.now() });

  if (activeConnections.size > 1) {
    const origins = Array.from(activeConnections.values())
      .map(c => `${c.origin} (${c.url})`)
      .join(", ");
    console.warn(
      `${LOG_PREFIX} Multiple active OBS connections detected (${activeConnections.size}): ${origins}`
    );
    return true; // was duplicate
  }

  return false;
}

/**
 * Unregister an OBS WebSocket connection.
 */
export function unregister(origin: string): void {
  activeConnections.delete(origin);
}

/**
 * Get count of active connections in this JS context.
 */
export function getActiveCount(): number {
  return activeConnections.size;
}

/**
 * Get all active connection details.
 */
export function getActiveConnections(): ConnectionEntry[] {
  return Array.from(activeConnections.values());
}

/**
 * Clear all tracked connections (e.g., on app shutdown).
 */
export function clearAll(): void {
  activeConnections.clear();
}
