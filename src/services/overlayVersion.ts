export const OVERLAY_HTML_VERSION = "2026-08-10-2-readable-compare-autoscale";

export function buildVersionedOverlayUrl(
  baseUrl: string,
  fileName: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();
  params.set("v", OVERLAY_HTML_VERSION);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  return `${baseUrl.replace(/\/$/, "")}/${fileName}?${params.toString()}`;
}
