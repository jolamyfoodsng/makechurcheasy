import { getSettings } from "../multiview/mvStore";
import { getDefaultOBSUrl } from "./desktopConfig";
import { loadData, updateData } from "./store";
import { normalizeOBSWebSocketUrl } from "./obsWebSocketUrl";

export interface OBSWebSocketConfig {
  url: string;
  password?: string;
}

export async function resolveOBSWebSocketConfig(
  explicitUrl?: string,
  explicitPassword?: string,
): Promise<OBSWebSocketConfig> {
  if (explicitUrl) {
    return {
      url: normalizeOBSWebSocketUrl(explicitUrl),
      password: explicitPassword || undefined,
    };
  }

  const defaultUrl = normalizeOBSWebSocketUrl(getDefaultOBSUrl());
  let appUrl = "";
  let appPassword: string | undefined;
  let mvUrl = "";

  try {
    const appData = await loadData();
    appUrl = normalizeOBSWebSocketUrl(appData.obsWebSocket?.url, "");
    appPassword = appData.obsWebSocket?.password || undefined;
  } catch {
    // Use MV settings/default below.
  }

  try {
    const settings = getSettings();
    mvUrl = normalizeOBSWebSocketUrl(settings.obsUrl, "");
  } catch {
    // Use app settings/default below.
  }

  const url =
    mvUrl && mvUrl !== defaultUrl
      ? mvUrl
      : appUrl || mvUrl || defaultUrl;

  return { url, password: appPassword };
}

export async function persistOBSWebSocketConfig(
  url: string,
  password?: string,
  autoConnect = true,
): Promise<void> {
  await updateData({
    obsWebSocket: {
      url: normalizeOBSWebSocketUrl(url),
      password: password || "",
      autoConnect,
    },
  });
}

