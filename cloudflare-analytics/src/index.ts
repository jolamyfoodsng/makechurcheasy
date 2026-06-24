/**
 * MakeChurchEasy Analytics Worker
 *
 * Lightweight analytics endpoint replacing PostHog.
 * Stores events in KV with daily rollups.
 *
 * Setup:
 *   1. npm install -g wrangler
 *   2. wrangler kv namespace create ANALYTICS
 *   3. Update wrangler.toml with the KV namespace ID
 *   4. wrangler deploy
 *
 * Env vars (set via wrangler secret put):
 *   ANALYTICS_TOKEN — shared secret the app sends to authenticate events
 */

export interface Env {
  ANALYTICS: KVNamespace;
  ANALYTICS_TOKEN: string;
}

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

// ── CORS ──────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://makechurcheasy.creatorstudioslabs.stream",
  "https://www.makechurcheasy.creatorstudioslabs.stream",
  "http://localhost:1420",
  "http://localhost:5173",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// ── Rate Limiting (simple KV-based) ───────────────────────────────────────

async function checkRateLimit(
  env: Env,
  ip: string,
  limit = 120,
  windowSec = 60,
): Promise<boolean> {
  const key = `ratelimit:${ip}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  const current = parseInt((await env.ANALYTICS.get(key)) ?? "0", 10);
  if (current >= limit) return false;
  await env.ANALYTICS.put(key, String(current + 1), { expirationTtl: windowSec * 2 });
  return true;
}

// ── Event Ingestion ───────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function hourKey(): string {
  return new Date().toISOString().slice(0, 13); // "2026-06-12T14"
}

async function recordEvent(env: Env, event: AnalyticsEvent, installId: string): Promise<void> {
  const date = today();
  const hour = hourKey();
  const platform = String(event.properties?.platform ?? "unknown");
  const version = String(event.properties?.app_version ?? "unknown");
  const architecture = String(event.properties?.architecture ?? "unknown");

  // Daily counters — non-critical, skip on failure
  const incr = async (key: string) => {
    try {
      const val = parseInt((await env.ANALYTICS.get(key)) ?? "0", 10);
      await env.ANALYTICS.put(key, String(val + 1), { expirationTtl: 90 * 86400 });
    } catch {
      // KV write failed; skip this counter
    }
  };

  await incr(`d:${date}:total`);
  await incr(`d:${date}:event:${event.event}`);
  await incr(`d:${date}:platform:${platform}`);
  await incr(`d:${date}:version:${version}`);
  await incr(`d:${date}:arch:${architecture}`);
  await incr(`h:${hour}:total`);

  // Unique installs per day (non-critical)
  try {
    const installKey = `installs:${date}`;
    const installsRaw = await env.ANALYTICS.get(installKey);
    const installs: string[] = (() => {
      if (!installsRaw) return [];
      try { return JSON.parse(installsRaw); } catch { return []; }
    })();
    if (!installs.includes(installId)) {
      installs.push(installId);
      await env.ANALYTICS.put(installKey, JSON.stringify(installs), { expirationTtl: 90 * 86400 });
    }
  } catch {
    // Install tracking is non-critical
  }

  // Feature usage tracking
  const featureMap: Record<string, string> = {
    bible_opened: "bible",
    bible_verse_staged: "bible",
    bible_verse_live: "bible",
    song_presented: "worship",
    song_created: "worship",
    song_imported: "worship",
    media_presented: "media",
    media_uploaded: "media",
    voice_bible_started: "voice",
    voice_match_live: "voice",
    sts_listening_started: "speech_to_scripture",
    multiview_opened: "multiview",
  };
  const feature = featureMap[event.event];
  if (feature) {
    await incr(`d:${date}:feature:${feature}`);
  }

  // Store last 500 raw events for debugging (rolling window)
  try {
    const rawKey = "raw:events";
    const rawRaw = await env.ANALYTICS.get(rawKey);
    const rawEvents: Array<AnalyticsEvent & { install_id: string; _date: string }> = (() => {
      if (!rawRaw) return [];
      try { return JSON.parse(rawRaw); } catch { return []; }
    })();
    rawEvents.unshift({ ...event, install_id: installId, _date: date });
    if (rawEvents.length > 500) rawEvents.length = 500;
    await env.ANALYTICS.put(rawKey, JSON.stringify(rawEvents), { expirationTtl: 7 * 86400 });
  } catch {
    // Raw event storage is non-critical
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────

async function getCounter(env: Env, key: string): Promise<number> {
  const val = await env.ANALYTICS.get(key);
  return val ? parseInt(val, 10) || 0 : 0;
}

async function dashboard(env: Env): Promise<string> {
  const date = today();
  const [total, uniqueInstalls] = await Promise.all([
    getCounter(env, `d:${date}:total`),
    env.ANALYTICS.get(`installs:${date}`).then((r) => (r ? (JSON.parse(r) as string[]).length : 0)),
  ]);

  const eventNames = [
    "app_installed", "app_started", "app_closed", "heartbeat",
    "bible_opened", "bible_verse_live",
    "song_presented", "song_created",
    "media_presented", "media_uploaded",
    "voice_bible_started", "voice_match_live",
    "onboarding_completed", "onboarding_skipped",
  ];
  const events: Record<string, number> = {};
  for (const name of eventNames) {
    events[name] = await getCounter(env, `d:${date}:event:${name}`);
  }

  const platforms = ["windows", "macos", "linux"];
  const platformCounts: Record<string, number> = {};
  for (const p of platforms) {
    platformCounts[p] = await getCounter(env, `d:${date}:platform:${p}`);
  }

  const features = ["bible", "worship", "media", "voice", "speech_to_scripture", "multiview"];
  const featureCounts: Record<string, number> = {};
  for (const f of features) {
    featureCounts[f] = await getCounter(env, `d:${date}:feature:${f}`);
  }

  // Recent versions
  const versions = ["4.20.0", "4.19.0", "4.18.0", "4.17.0", "4.16.1", "4.16.0"];
  const versionCounts: Record<string, number> = {};
  for (const v of versions) {
    versionCounts[v] = await getCounter(env, `d:${date}:version:${v}`);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MakeChurchEasy Analytics</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a14; color: #e0e0e0; padding: 24px; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; color: #fff; }
    .subtitle { color: #888; font-size: 13px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .card { background: #14141f; border: 1px solid #222; border-radius: 6px; padding: 16px; }
    .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 6px; }
    .card-value { font-size: 28px; font-weight: 700; color: #fff; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; color: #ccc; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #1a1a2e; font-size: 13px; }
    th { color: #888; font-weight: 500; }
    td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
    th:last-child { text-align: right; }
    .bar { display: inline-block; height: 6px; background: #3b82f6; border-radius: 3px; margin-left: 8px; vertical-align: middle; }
  </style>
</head>
<body>
  <h1>MakeChurchEasy Analytics</h1>
  <p class="subtitle">${date} &mdash; Live dashboard</p>

  <div class="grid">
    <div class="card">
      <div class="card-label">Events Today</div>
      <div class="card-value">${total.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Unique Installs Today</div>
      <div class="card-value">${uniqueInstalls.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Top Platform</div>
      <div class="card-value">${Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"}</div>
    </div>
    <div class="card">
      <div class="card-label">Active Features</div>
      <div class="card-value">${Object.values(featureCounts).filter((v) => v > 0).length}/${features.length}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Events</div>
    <table>
      <tr><th>Event</th><th>Count</th></tr>
      ${Object.entries(events).map(([name, count]) => {
    const maxCount = Math.max(...Object.values(events), 1);
    const barWidth = Math.round((count / maxCount) * 120);
    return `<tr><td>${name}</td><td>${count.toLocaleString()} <span class="bar" style="width:${barWidth}px"></span></td></tr>`;
  }).join("\n      ")}
    </table>
  </div>

  <div class="section">
    <div class="section-title">Platforms</div>
    <table>
      <tr><th>Platform</th><th>Count</th></tr>
      ${Object.entries(platformCounts).map(([name, count]) => {
    const maxCount = Math.max(...Object.values(platformCounts), 1);
    const barWidth = Math.round((count / maxCount) * 120);
    return `<tr><td>${name}</td><td>${count.toLocaleString()} <span class="bar" style="width:${barWidth}px"></span></td></tr>`;
  }).join("\n      ")}
    </table>
  </div>

  <div class="section">
    <div class="section-title">Feature Usage</div>
    <table>
      <tr><th>Feature</th><th>Count</th></tr>
      ${Object.entries(featureCounts).map(([name, count]) => {
    const maxCount = Math.max(...Object.values(featureCounts), 1);
    const barWidth = Math.round((count / maxCount) * 120);
    return `<tr><td>${name}</td><td>${count.toLocaleString()} <span class="bar" style="width:${barWidth}px"></span></td></tr>`;
  }).join("\n      ")}
    </table>
  </div>

  <div class="section">
    <div class="section-title">Versions</div>
    <table>
      <tr><th>Version</th><th>Count</th></tr>
      ${Object.entries(versionCounts).map(([name, count]) => {
    const maxCount = Math.max(...Object.values(versionCounts), 1);
    const barWidth = Math.round((count / maxCount) * 120);
    return `<tr><td>${name}</td><td>${count.toLocaleString()} <span class="bar" style="width:${barWidth}px"></span></td></tr>`;
  }).join("\n      ")}
    </table>
  </div>
</body>
</html>`;

  return html;
}

// ── Worker Entry ──────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // Dashboard (GET /)
      if (request.method === "GET" && url.pathname === "/") {
        const html = await dashboard(env);
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders(origin) },
        });
      }

      // Event ingestion (POST /e)
      if (request.method === "POST" && url.pathname === "/e") {
        // Authenticate
        const token = request.headers.get("Authorization")?.replace("Bearer ", "");
        if (token !== env.ANALYTICS_TOKEN) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders(origin) });
        }

        // Rate limit (non-fatal — skip if KV write fails)
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        try {
          if (!(await checkRateLimit(env, ip))) {
            return new Response("Rate limited", { status: 429, headers: corsHeaders(origin) });
          }
        } catch {
          // Rate limiting is best-effort; if KV fails, proceed without it
        }

        try {
          const body = await request.json() as AnalyticsEvent;
          const installId = body.properties?.install_id as string ?? "unknown";

          // Batch support: accept array of events
          const events = Array.isArray(body) ? body : [body];
          for (const event of events.slice(0, 20)) {
            await recordEvent(env, event, installId);
          }

          return new Response("ok", { status: 200, headers: corsHeaders(origin) });
        } catch {
          return new Response("Bad request", { status: 400, headers: corsHeaders(origin) });
        }
      }

      // Health check
      if (request.method === "GET" && url.pathname === "/health") {
        return new Response("ok", { headers: corsHeaders(origin) });
      }

      return new Response("Not found", { status: 404, headers: corsHeaders(origin) });
    } catch (err) {
      // Always return CORS headers even on unexpected crashes
      return new Response("Internal error", { status: 500, headers: corsHeaders(origin) });
    }
  },
};
