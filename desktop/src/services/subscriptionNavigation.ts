import { getDashboardBaseForAuth } from "./authService";

export function getDashboardSubscriptionPlansUrl(
  query?: Record<string, string | undefined>,
): string {
  const url = new URL("/subscription/plans", getDashboardBaseForAuth());
  for (const [key, value] of Object.entries(query || {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

/** An address on the web dashboard (for example the win-back claim page), not an in-app route. */
export function getDashboardUrl(
  pathname: string,
  query?: Record<string, string | undefined>,
): string {
  const url = new URL(pathname, getDashboardBaseForAuth());
  for (const [key, value] of Object.entries(query || {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function openDashboardSubscriptionPlans(
  query?: Record<string, string | undefined>,
): Promise<void> {
  const url = getDashboardSubscriptionPlansUrl(query);
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.location.assign(url);
  }
}
