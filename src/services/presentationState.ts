import { getOverlayBaseUrl } from "./overlayUrl";
import type { CountdownConfig } from "../countdowns/types";

export type PresentationRemoteSource =
  | "bible"
  | "worship"
  | "media"
  | "text"
  | "ministry"
  | "countdown";

export type PresentationRemoteLayer = "fullscreen" | "lower-third";

export interface PresentationRemoteCountdownPayload {
  config: CountdownConfig;
  startedAt: number;
}

export interface PresentationRemoteItem {
  id: string;
  source: PresentationRemoteSource;
  title: string;
  subtitle?: string;
  body?: string;
  reference?: string;
  imageUrl?: string;
  videoUrl?: string;
  countdown?: PresentationRemoteCountdownPayload;
}

export interface PresentationRemoteState {
  sessionId: string;
  fullscreen: PresentationRemoteItem | null;
  lowerThird: PresentationRemoteItem | null;
  updatedAt: number;
}

export const EMPTY_PRESENTATION_REMOTE_STATE = (sessionId: string): PresentationRemoteState => ({
  sessionId,
  fullscreen: null,
  lowerThird: null,
  updatedAt: Date.now(),
});

function getStorageKey(sessionId: string): string {
  return `mce-presentation-state:${sessionId}`;
}

function getChannelName(sessionId: string): string {
  return `mce-presentation:${sessionId}`;
}

async function buildApiUrl(path: string): Promise<string> {
  return `${await getOverlayBaseUrl()}${path}`;
}

function writeLocalState(state: PresentationRemoteState): void {
  try {
    localStorage.setItem(getStorageKey(state.sessionId), JSON.stringify(state));
  } catch {
    // Ignore storage failures.
  }
}

function broadcastLocalState(state: PresentationRemoteState): void {
  try {
    const channel = new BroadcastChannel(getChannelName(state.sessionId));
    channel.postMessage(state);
    channel.close();
  } catch {
    // BroadcastChannel is optional.
  }
}

export function readLocalPresentationState(sessionId: string): PresentationRemoteState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PresentationRemoteState;
    if (!parsed || parsed.sessionId !== sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function publishPresentationState(state: PresentationRemoteState): Promise<void> {
  writeLocalState(state);
  broadcastLocalState(state);

  const url = await buildApiUrl("/api/presentation-state");
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
}

export async function clearPresentationState(sessionId: string): Promise<void> {
  await publishPresentationState(EMPTY_PRESENTATION_REMOTE_STATE(sessionId));
}

export async function fetchPresentationState(sessionId: string): Promise<PresentationRemoteState | null> {
  const url = await buildApiUrl(`/api/presentation-state?sessionId=${encodeURIComponent(sessionId)}`);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json()) as
    | PresentationRemoteState
    | { state?: PresentationRemoteState | null };
  if (
    typeof payload === "object" &&
    payload !== null &&
    "state" in payload
  ) {
    return payload.state ?? null;
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "sessionId" in payload &&
    "updatedAt" in payload
  ) {
    return payload as PresentationRemoteState;
  }
  return null;
}

export async function heartbeatPresentationViewer(sessionId: string, viewerId: string): Promise<number> {
  const url = await buildApiUrl("/api/presentation-viewer");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, viewerId }),
  });
  if (!response.ok) return 0;
  const payload = (await response.json()) as { viewerCount?: number };
  return Number(payload.viewerCount || 0);
}

export async function fetchPresentationViewerCount(sessionId: string): Promise<number> {
  const url = await buildApiUrl(`/api/presentation-viewer?sessionId=${encodeURIComponent(sessionId)}`);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return 0;
  const payload = (await response.json()) as { viewerCount?: number };
  return Number(payload.viewerCount || 0);
}

export function subscribeLocalPresentationState(
  sessionId: string,
  listener: (state: PresentationRemoteState) => void,
): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(getChannelName(sessionId));
    channel.onmessage = (event: MessageEvent<PresentationRemoteState>) => {
      if (event.data?.sessionId === sessionId) {
        listener(event.data);
      }
    };
  } catch {
    channel = null;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== getStorageKey(sessionId) || !event.newValue) return;
    try {
      const state = JSON.parse(event.newValue) as PresentationRemoteState;
      if (state?.sessionId === sessionId) {
        listener(state);
      }
    } catch {
      // Ignore invalid payloads.
    }
  };

  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.close();
  };
}
