const PRODUCTION_DASHBOARD_BASE = "https://makechurcheazy.com";

/**
 * Where the plans / claim pages live. Always the live website unless a
 * developer explicitly points VITE_DASHBOARD_URL at a local dashboard.
 *
 * This deliberately does NOT follow the API base. A local API (localhost:3004)
 * does not mean a local dashboard is running, and sending people to a dead
 * localhost address is worse than sending them to the real site.
 */
function getDashboardBaseForPages(): string {
  const override = String(import.meta.env.VITE_DASHBOARD_URL ?? "").trim();
  if (/^https?:\/\//i.test(override)) return override.replace(/\/+$/, "");
  return PRODUCTION_DASHBOARD_BASE;
}

export function getDashboardSubscriptionPlansUrl(
  query?: Record<string, string | undefined>,
): string {
  return getDashboardUrl("/subscription/plans", query);
}

/** An address on the web dashboard (for example the win-back claim page), not an in-app route. */
export function getDashboardUrl(
  pathname: string,
  query?: Record<string, string | undefined>,
): string {
  const url = new URL(pathname, getDashboardBaseForPages());
  for (const [key, value] of Object.entries(query || {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Open a web address in the person's real browser.
 *
 * The OBS browser dock is a plain web page (no Tauri), so the native opener is
 * not available there. In that case open a new tab/window instead. Never
 * navigate the current page: in the dock that replaces the whole dock UI with
 * the website (or with a "couldn't load that page" error).
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  } catch {
    // Not running inside the desktop app (for example the OBS dock).
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function openDashboardSubscriptionPlans(
  query?: Record<string, string | undefined>,
): Promise<void> {
  await openExternalUrl(getDashboardSubscriptionPlansUrl(query));
}
