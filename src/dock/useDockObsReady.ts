import { useState, useEffect } from "react";
import { dockObsClient } from "./dockObsClient";

/**
 * Returns true once the OBS WebSocket connection is active.
 * Tabs should gate their OBS operations behind this — no calls
 * until useDockObsReady() returns true.
 */
export function useDockObsReady(): boolean {
  const [ready, setReady] = useState(dockObsClient.isConnected);

  useEffect(() => {
    if (dockObsClient.isConnected) { setReady(true); return; }
    const unsub = dockObsClient.onStatusChange((status) => {
      if (status === "connected") setReady(true);
    });
    return unsub;
  }, []);

  return ready;
}
