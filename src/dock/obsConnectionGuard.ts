/**
 * obsConnectionGuard.ts — Single gateway for all OBS interactions.
 *
 * Ensures OBS is connected before any action. Auto-connects using
 * resolved params (URL query → localStorage → default). Deduplicates
 * concurrent connection attempts by reusing the in-flight promise.
 */

import { dockObsClient } from "./dockObsClient";

let inFlightPromise: Promise<void> | null = null;

/**
 * Ensures the OBS WebSocket connection is active.
 *
 * - If already connected, returns immediately.
 * - If a connection attempt is in progress, waits for it.
 * - Otherwise, initiates a new connection and waits.
 * - Throws on failure so the caller can abort.
 *
 * @param url      Optional OBS WebSocket URL. If omitted, auto-resolves
 *                 from URL query → localStorage → default (ws://localhost:4455).
 * @param password Optional password for the OBS WebSocket server.
 */
export async function ensureObsConnected(url?: string, password?: string): Promise<void> {
  // Already connected — nothing to do
  if (dockObsClient.isConnected) return;

  // If a connection attempt is already in flight and we don't need a specific
  // URL, just wait for it. If a specific URL is requested, force a new attempt.
  if (inFlightPromise && !url) return inFlightPromise;

  inFlightPromise = (async () => {
    try {
      // Kick off connection (with the user-supplied URL/password if any)
      void dockObsClient.connect(url, password);

      // Poll until connected or failed — max 15s
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (dockObsClient.isConnected) return;
        // Bail early if connection explicitly failed
        const status = (dockObsClient as unknown as { _status?: string })._status;
        if (status === "error" || status === "disconnected") {
          // One more attempt before giving up
          await dockObsClient.connect(url, password);
          const retryDeadline = Date.now() + 5000;
          while (Date.now() < retryDeadline) {
            if (dockObsClient.isConnected) return;
            await new Promise((r) => setTimeout(r, 100));
          }
          throw new Error("OBS connection failed");
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      if (!dockObsClient.isConnected) {
        throw new Error("OBS connection timed out");
      }
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}
