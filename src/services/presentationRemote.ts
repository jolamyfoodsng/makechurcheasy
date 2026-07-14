import { invoke } from "@tauri-apps/api/core";

import {
  buildPresentationLink,
  getPresentationSettings,
  savePresentationSettings,
} from "./presentationSettings";

export interface PresentationRemoteAccessInfo {
  running: boolean;
  ip: string;
  httpPort: number;
  wsPort: number;
  link: string;
  localLink: string;
}

function buildFallbackInfo(sessionId: string): PresentationRemoteAccessInfo {
  const link = buildPresentationLink(sessionId);
  return {
    running: false,
    ip: "127.0.0.1",
    httpPort: 0,
    wsPort: 0,
    link,
    localLink: link,
  };
}

export async function getPresentationRemoteAccessInfo(
  sessionId: string,
): Promise<PresentationRemoteAccessInfo> {
  const trimmed = sessionId.trim();
  if (!trimmed) {
    return buildFallbackInfo(sessionId);
  }

  try {
    const info = await invoke<PresentationRemoteAccessInfo>("get_presentation_remote_info", {
      sessionId: trimmed,
    });
    return info;
  } catch (error) {
    console.warn("[PresentationRemote] Falling back to local presentation link:", error);
    return buildFallbackInfo(trimmed);
  }
}

export async function syncPresentationRemoteAccessInfo(
  sessionId: string,
): Promise<PresentationRemoteAccessInfo> {
  const info = await getPresentationRemoteAccessInfo(sessionId);
  const current = getPresentationSettings();
  if (current.sessionId !== sessionId || current.presentationLink === info.link) {
    return info;
  }

  savePresentationSettings({
    ...current,
    presentationLink: info.link,
  });

  return info;
}
