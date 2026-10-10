import { APP_VERSION, getDeviceApiBaseCandidates, getDeviceId, getDeviceSecret } from "./authService";
import { setCachedDesktopAnnouncements } from "./desktopConfig";

export type AnnouncementTone = "info" | "success" | "warning" | "offer" | "upgrade";
export type DiscountBillingCycle = "monthly" | "yearly" | "lifetime";

export type AnnouncementLayout = "standard" | "promo" | "image_only" | "custom";

export interface AnnouncementButton {
  id: string;
  label: string;
  url: string;
  style: "primary" | "secondary" | "link";
}

export interface DesktopAnnouncement {
  id: string;
  deliveryId: string;
  title: string;
  message: string;
  /** Missing on announcements created before layouts existed. */
  layout?: AnnouncementLayout | null;
  buttons?: AnnouncementButton[] | null;
  bodyHtml?: string | null;
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
  offerApplicablePlans?: string[];
  expiresAt?: string | null;
  /** Win-back offers only: this person's own deadline, which the countdown counts to. */
  personalOffer?: { ladderId: string; rungId: string; kind: string; closesAt: string } | null;
}

export interface ActiveDiscountInfo {
  id: string;
  title: string;
  code?: string | null;
  discountPercent?: number | null;
  durationMonths?: number | null;
  applicableBillingCycles?: DiscountBillingCycle[];
  claimUrl?: string | null;
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

/** Most announcements the app asks for, and pages through, at once. */
export const ANNOUNCEMENT_BATCH_SIZE = 3;

/**
 * Dismiss one or more announcements in a single request.
 * Returns true when the server answered the request successfully.
 */
export async function dismissDesktopAnnouncements(
  deliveryIds: string[],
  clicked = false,
  buttonId?: string,
): Promise<boolean> {
  const deviceId = getDeviceId();
  const ids = Array.from(new Set(deliveryIds.filter(Boolean)));
  if (!deviceId || ids.length === 0) return false;

  const candidates = getDeviceApiBaseCandidates();
  for (const apiBase of candidates) {
    try {
      const res = await fetch(`${apiBase}/api/user/announcements`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        // `deliveryId` is also sent so a server that predates `deliveryIds`
        // still records the first dismissal.
        body: JSON.stringify({ deliveryId: ids[0], deliveryIds: ids, clicked, ...(buttonId ? { buttonId } : {}) }),
      });
      if (res.ok) return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

/** Returns true when the server recorded the dismissal. */
export async function dismissDesktopAnnouncement(deliveryId: string, clicked = false): Promise<boolean> {
  return dismissDesktopAnnouncements([deliveryId], clicked);
}

// ── Announcement watcher ─────────────────────────────────────────────────────
//
// Every 3 minutes (while the app is visible) the app asks the public
// /api/announcements/version endpoint for a tiny value that is the same for
// every user and cached at the edge. Only when it changes does the app make
// the authenticated, per-user /api/user/announcements request. A month with
// no announcements therefore costs one cheap request per app every 3 minutes
// and no database work per user.

const VERSION_POLL_MS = 3 * 60 * 1000;
const FOCUS_MIN_GAP_MS = 60 * 1000;

let lastVersion: string | null = null;
let lastCheckAt = 0;
let checking = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let watcherUsers = 0;

async function fetchAnnouncementsVersion(): Promise<string | null> {
  for (const apiBase of getDeviceApiBaseCandidates()) {
    try {
      const res = await fetch(`${apiBase}/api/announcements/version?surface=desktop`, {
        headers: { "X-App-Version": APP_VERSION },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { version?: unknown };
      if (typeof data?.version === "string") return data.version;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function fetchCurrentDesktopAnnouncements(): Promise<
  { ok: true; announcements: DesktopAnnouncement[] } | { ok: false }
> {
  const deviceId = getDeviceId();
  if (!deviceId) return { ok: false };
  for (const apiBase of getDeviceApiBaseCandidates()) {
    try {
      const res = await fetch(
        `${apiBase}/api/user/announcements?surface=desktop&limit=${ANNOUNCEMENT_BATCH_SIZE}`,
        {
          cache: "no-store",
          headers: { ...authHeaders(), "X-App-Version": APP_VERSION },
        },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        announcements?: DesktopAnnouncement[] | null;
        announcement?: DesktopAnnouncement | null;
      };
      const announcements = Array.isArray(data?.announcements)
        ? data.announcements
        : data?.announcement
          ? [data.announcement]
          : [];
      return { ok: true, announcements };
    } catch {
      // try next candidate
    }
  }
  return { ok: false };
}

/**
 * Check whether announcements changed and, if so, load the current ones.
 * `force` skips the version comparison (used after re-sending a dismissal).
 */
export async function checkForAnnouncementUpdate(force = false): Promise<void> {
  if (checking || !getDeviceId()) return;
  checking = true;
  lastCheckAt = Date.now();
  try {
    if (!force) {
      const version = await fetchAnnouncementsVersion();
      if (version === null || version === lastVersion) return;
      const isFirstCheck = lastVersion === null;
      lastVersion = version;
      // The startup license bootstrap already delivered the current
      // announcement; the first value is only a baseline.
      if (isFirstCheck) return;
    }
    const result = await fetchCurrentDesktopAnnouncements();
    if (result.ok) setCachedDesktopAnnouncements(result.announcements);
  } finally {
    checking = false;
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastCheckAt < FOCUS_MIN_GAP_MS) return;
  void checkForAnnouncementUpdate();
}

/** Start the watcher. Returns a stop function. Safe to call more than once. */
export function startAnnouncementWatcher(): () => void {
  watcherUsers += 1;
  if (!pollTimer) {
    void checkForAnnouncementUpdate();
    pollTimer = setInterval(() => {
      // Nobody can see a modal while the app is hidden; the visibility
      // handler checks as soon as it comes back.
      if (document.visibilityState === "hidden") return;
      void checkForAnnouncementUpdate();
    }, VERSION_POLL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    watcherUsers = Math.max(0, watcherUsers - 1);
    if (watcherUsers === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
