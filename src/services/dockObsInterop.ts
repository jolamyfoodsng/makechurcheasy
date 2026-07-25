import { dockObsClient } from "../dock/dockObsClient";
import { initOverlayUrl } from "./overlayUrl";
import { resolveOBSWebSocketConfig } from "./obsConnectionSettings";

let connectPromise: Promise<void> | null = null;

export async function ensureDockObsClientConnected(): Promise<void> {
  await initOverlayUrl();
  if (dockObsClient.isConnected) return;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const { url, password } = await resolveOBSWebSocketConfig();
    await dockObsClient.connect(url, password);
    if (!dockObsClient.isConnected) {
      throw new Error(dockObsClient.error || "Failed to connect dock OBS client.");
    }
  })().finally(() => {
    connectPromise = null;
  });

  return connectPromise;
}
