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
  format?: "standard" | "image_only";
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
