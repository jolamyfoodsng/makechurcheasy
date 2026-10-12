/**
 * mediaUrl.ts — the address a theme stores for a Media Library picture or video.
 *
 * OBS overlays load uploads from their own server at /uploads/<file>, so a
 * library item is stored as "/uploads/<diskFileName>" (same rule as the Dock's
 * background picker). Cloud copies (https) are kept as they are. In-app
 * previews map /uploads/ back to the local overlay server.
 */
export interface MediaRef {
  url?: string;
  filePath?: string;
  diskFileName?: string;
}

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i;

export function themeMediaUrl(item: MediaRef): string {
  if (item.diskFileName) return `/uploads/${encodeURIComponent(item.diskFileName)}`;
  const url = String(item.url || "").trim();
  if (url.startsWith("/uploads/")) return url;
  if (url.startsWith("uploads/")) return `/${url}`;
  if (/^data:image\//i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (LOCAL_HOST.test(parsed.hostname) && parsed.pathname.startsWith("/uploads/")) return parsed.pathname;
      if (!LOCAL_HOST.test(parsed.hostname)) return url;
    } catch {
      /* fall through to the file name */
    }
  }
  const name = String(item.filePath || url).replace(/^file:\/\//i, "").split(/[\\/]/).pop()?.split("?")[0]?.trim();
  return name ? `/uploads/${encodeURIComponent(decodeURIComponent(name))}` : url;
}
