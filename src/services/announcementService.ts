import { getDeviceId, getDeviceSecret } from "./authService";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.creatorstudioslabs.stream";

export type AnnouncementTone = "info" | "success" | "warning" | "offer" | "upgrade";
export type DiscountBillingCycle = "monthly" | "yearly" | "lifetime";

export interface DesktopAnnouncement {
  id: string;
  deliveryId: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  tags: string[];
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  offerCode?: string | null;
  offerDiscountPercent?: number | null;
  offerDurationMonths?: number | null;
  offerApplicableBillingCycles?: DiscountBillingCycle[];
  expiresAt?: string | null;
}

function authHeaders(): Record<string, string> {
  const deviceId = getDeviceId();
  const deviceSecret = getDeviceSecret();
  return {
    ...(deviceId ? { "X-Device-Id": deviceId } : {}),
    ...(deviceSecret ? { "X-Device-Secret": deviceSecret } : {}),
  };
}

export async function fetchNextDesktopAnnouncement(): Promise<DesktopAnnouncement | null> {
  const deviceId = getDeviceId();
  if (!deviceId) return null;

  const res = await fetch(`${API_BASE}/api/user/announcements?surface=desktop`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.announcement || null;
}

export async function dismissDesktopAnnouncement(deliveryId: string, clicked = false): Promise<void> {
  const deviceId = getDeviceId();
  if (!deviceId || !deliveryId) return;

  await fetch(`${API_BASE}/api/user/announcements`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ deliveryId, clicked }),
  }).catch(() => {});
}

/**
 * Opens an SSE connection receiving real-time announcement events.
 * Returns an EventSource — caller closes it on cleanup.
 */
export function subscribeToAnnouncementStream(
  onEvent: () => void,
): EventSource {
  const deviceId = getDeviceId();
  const deviceSecret = getDeviceSecret();
  if (!deviceId) {
    throw new Error("Desktop device is not authenticated");
  }

  const url = new URL(`${API_BASE}/api/user/announcements/stream`);
  url.searchParams.set("deviceId", deviceId);
  if (deviceSecret) url.searchParams.set("deviceSecret", deviceSecret);

  const es = new EventSource(url.toString());
  es.addEventListener("message", () => onEvent());
  es.addEventListener("open", () => console.log("[Announcements] SSE connected"));

  return es;
}
