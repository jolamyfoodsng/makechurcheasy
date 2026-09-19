export const SITE_NAME = "MakeChurchEasy";
export const COMPANY_URL = "https://makechurcheazy.com";
export const SITE_DESCRIPTION =
  "Practical ideas and guides for Bible presentation, worship, church media, OBS, vMix, and easier services.";
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://blog.makechurcheazy.com"
).replace(/\/+$/, "");
export const EXAMPLE_PATH = "makechurcheazy-blog";
export const CMS_NAME = "MakeChurchEasy";
export const HOME_OG_IMAGE_URL = `${SITE_URL}/assets/blog/hello-world/cover.jpg`;
export const SITE_LOGO_URL = `${SITE_URL}/favicon/android-chrome-512x512.png`;

export function toAbsoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
