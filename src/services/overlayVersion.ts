// The Vite build injects a content fingerprint so OBS receives a new browser
// document whenever the bundled overlay HTML changes. The fallback keeps the
// module usable in tooling that does not load the Vite config.
export const OVERLAY_HTML_VERSION =
  typeof __MCE_OVERLAY_HTML_VERSION__ !== "undefined"
    ? __MCE_OVERLAY_HTML_VERSION__
    : `dev-${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "overlay"}`;

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
