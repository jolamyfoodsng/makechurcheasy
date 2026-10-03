/** Shared Cloudflare Worker endpoint used by Bible and template asset APIs. */
const configuredBase = import.meta.env.VITE_BIBLE_API_BASE_URL?.trim();

export const BIBLE_API_BASE_URL = (
  configuredBase || "https://versecast-bible-api.solitary-credit-34b2.workers.dev"
).replace(/\/+$/, "");

export const BIBLE_API_BASE = `${BIBLE_API_BASE_URL}/api`;
