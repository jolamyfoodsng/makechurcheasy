import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { isKnownIncompleteBibleFile } from "./utils/incomplete-bibles";
import { getTranslationMetadata } from "./utils/translation-metadata";

// ─── Types ──────────────────────────────────────────────────
interface Env {
  NODE_ENV: string;
  BIBLE_ONLY_MODE: string;
  AUTO_SEED_FROM_R2: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_BASE_URL: string;
  R2_PREFIX: string;
  DOWNLOAD_URL_TTL_SECONDS: string;
  ADMIN_TOKEN: string;
}

interface BibleRow {
  id: string;
  name: string;
  language: string | null;
  country: string | null;
  version: string | null;
  source: string;
  r2Key: string;
  filename: string;
  contentType: string;
  filesize: number | null;
  sha256: string | null;
  isFree: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Catalog Cache (per-isolate) ────────────────────────────
const catalogCache = {
  byId: new Map<string, BibleRow>(),
  byKey: new Map<string, BibleRow>(),
  items: [] as BibleRow[],
  loadedAt: 0,
  refreshPromise: null as Promise<{ added: number; updated: number; totalScanned: number }> | null,
};
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const PARTIAL_SOURCE_TRANSLATIONS = new Set(["KJ21", "CJB", "NABRE", "TPT", "TLV"]);
const NEW_TESTAMENT_ONLY_SOURCE_TRANSLATIONS = new Set(["NMB", "RGT"]);

// ─── Language Map ───────────────────────────────────────────
const LANGUAGE_TO_COUNTRY: Record<string, string> = {
  Aceh: "Indonesia", AdilabadGondi: "India", Afrikaans: "South Africa",
  Ahirani: "India", Albanian: "Albania", Amharic: "Ethiopia",
  Arabic: "Saudi Arabia", ArabicAlgeria: "Algeria", ArabicLebanese: "Lebanon",
  ArabicMorocco: "Morocco", ArabicTunisian: "Tunisia", Aramaic: "Iraq",
  Armenian: "Armenia", ArmenianEastern: "Armenia", ArmenianArarat: "Armenia",
  Assamese: "India", Avar: "Russia", Awadhi: "India", Aymara: "Bolivia",
  Azerbaijan: "Azerbaijan", AzerbaijanSouth: "Iran", Bagri: "India",
  Balinese: "Indonesia", Balochi: "Pakistan", BalochiArabic: "Pakistan",
  BalochiSoutheren: "Pakistan", BalochiSoutherenLatin: "Pakistan",
  Baoule: "Ivory Coast", Bashkir: "Russia", Basque: "Spain",
  Bavarian: "Germany", Belarusian: "Belarus", BelarusianBokun: "Belarus",
  Bemba: "Zambia", Bengali: "Bangladesh", Berber: "Morocco",
  Bhilali: "India", Bodo: "India", Bosnian: "Bosnia and Herzegovina",
  Braj: "India", Bugis: "Indonesia", Bulgarian: "Bulgaria",
  Bundeli: "India", Burmese: "Myanmar", Catalan: "Spain",
  Cebuano: "Philippines", Chechen: "Russia", Chewa: "Malawi",
  Chhattisgarhi: "India", Chibemba: "Zambia", Chin: "Myanmar",
  Chinese: "China", Chuvash: "Russia", Coptic: "Egypt",
  Croatian: "Croatia", Czech: "Czech Republic", Dagbani: "Ghana",
  Danish: "Denmark", Dinka: "South Sudan", Dogri: "India",
  Dutch: "Netherlands", DutchFrisian: "Netherlands", Dyula: "Ivory Coast",
  Edo: "Nigeria", English: "United Kingdom", Esperanto: "International",
  Estonian: "Estonia", Ewe: "Ghana", Finnish: "Finland", Fon: "Benin",
  French: "France", Fulfulde: "Nigeria", Gaelic: "Ireland",
  Galacian: "Spain", Garhwali: "India", Georgian: "Georgia",
  German: "Germany", Ghomala: "Cameroon", Greek: "Greece",
  Guarani: "Paraguay", Gujarati: "India", Gussi: "Kenya",
  Hadiyya: "Ethiopia", Haitian: "Haiti", Haryanvi: "India",
  Hausa: "Nigeria", Hebrew: "Israel", Hindi: "India", Hmong: "Laos",
  Hungarian: "Hungary", Iban: "Malaysia", Ibibio: "Nigeria",
  Icelandic: "Iceland", Igbo: "Nigeria", Ika: "Nigeria",
  Ilokano: "Philippines", Ilonggo: "Philippines", Indonesian: "Indonesia",
  Irish: "Ireland", Italian: "Italy", Iu: "Thailand", Jamaican: "Jamaica",
  Japanese: "Japan", Javanese: "Indonesia", Kabardian: "Russia",
  Kabyle: "Algeria", Kachin: "Myanmar", Kalenjin: "Kenya",
  Kamba: "Kenya", Kangri: "India", Kannada: "India",
  Karakalpak: "Uzbekistan", Kazakhstan: "Kazakhstan", Kenya: "Kenya",
  Khmer: "Cambodia", Kiche: "Guatemala", Kikuyu: "Kenya",
  Kikwango: "DR Congo", Kimbundu: "Angola", Kimiiru: "Kenya",
  Kinyarwanda: "Rwanda", Kirundi: "Burundi", Kituba: "DR Congo",
  Konkani: "India", Korean: "South Korea", Koya: "India",
  Krio: "Sierra Leone", Kumaoni: "India", Kurdish: "Iraq",
  Kurukh: "India", Kyrgyz: "Kyrgyzstan", Lahu: "Myanmar",
  Lambadi: "India", Lango: "Uganda", Lao: "Laos", Latin: "Vatican City",
  Latvian: "Latvia", Liberian: "Liberia", Lingala: "DR Congo",
  Lithuanian: "Lithuania", Lomwe: "Mozambique", Luganda: "Uganda",
  Lugbara: "Uganda", Luguru: "Tanzania", Luo: "Kenya", Maasai: "Kenya",
  Macedonian: "North Macedonia", Madurese: "Indonesia", Maithili: "India",
  Makhuwa: "Mozambique", Makonde: "Tanzania", Malagasy: "Madagascar",
  Malayalam: "India", Malaysian: "Malaysia", Maori: "New Zealand",
  Marathi: "India", Marwari: "India", Mazanderani: "Iran",
  Meitei: "India", Mende: "Sierra Leone", Mewari: "India", Mizo: "India",
  Moba: "Togo", Moldovian: "Moldova", Mongolian: "Mongolia",
  Morisyen: "Mauritius", Mossi: "Burkina Faso", Munda: "India",
  Nahuatl: "Mexico", Ndau: "Mozambique", Ndebele: "Zimbabwe",
  Nepali: "Nepal", Nigerian: "Nigeria", NigerianPidgin: "Nigeria",
  Norwegian: "Norway", Nuer: "South Sudan", Nyankole: "Uganda",
  Odia: "India", Original: "Israel", Oromo: "Ethiopia",
  Pampanga: "Philippines", Papua: "Papua New Guinea",
  Pashto: "Afghanistan", Persian: "Iran", Polish: "Poland",
  Portuguese: "Portugal", Pular: "Guinea", Punjabi: "India",
  Qeqchi: "Guatemala", Quechuan: "Peru", Romani: "Romania",
  Romanian: "Romania", Russian: "Russia", Sadri: "India",
  Sanskrit: "India", Santali: "India", Sasak: "Indonesia",
  Sena: "Mozambique", Seraiki: "Pakistan", Serbian: "Serbia",
  Shan: "Myanmar", Shekhawati: "India", Shilluk: "South Sudan",
  Shona: "Zimbabwe", Sidamo: "Ethiopia", Sindhi: "Pakistan",
  Sinhala: "Sri Lanka", Siswati: "Eswatini", Slovakian: "Slovakia",
  Slovenian: "Slovenia", Soga: "Uganda", Somalian: "Somalia",
  Songe: "DR Congo", Sotho: "Lesotho", Spanish: "Spain",
  Sukuma: "Tanzania", Sundanese: "Indonesia", Swahili: "Tanzania",
  Swedish: "Sweden", Sylheti: "Bangladesh", Tagalog: "Philippines",
  Tajik: "Tajikistan", Tamasheq: "Mali", Tamil: "India",
  Tarifit: "Morocco", Tashelhayt: "Morocco", Tatar: "Russia",
  Telugu: "India", Teso: "Uganda", Thado: "India", Thai: "Thailand",
  Tibetian: "China", Tiv: "Nigeria", Tshiluba: "DR Congo",
  Tshivenda: "South Africa", Tsonga: "South Africa", Tswana: "Botswana",
  Tulu: "India", Turkana: "Kenya", Turkish: "Turkey",
  Turkmen: "Turkmenistan", Twi: "Ghana", Ukrainian: "Ukraine",
  Umbundu: "Angola", Urdu: "Pakistan", Uyghur: "China",
  Uzbek: "Uzbekistan", Vietnamese: "Vietnam", Waray: "Philippines",
  Welsh: "United Kingdom", Wolaytta: "Ethiopia", Wolof: "Senegal",
  Xhosa: "South Africa", Yoruba: "Nigeria", Zande: "DR Congo",
  Zarma: "Niger", Zulu: "South Africa",
};

function getCountryForLanguage(language: string): string | null {
  if (LANGUAGE_TO_COUNTRY[language]) return LANGUAGE_TO_COUNTRY[language];
  const baseMatch = language.match(/^([A-Z][a-z]+)/);
  if (baseMatch && LANGUAGE_TO_COUNTRY[baseMatch[1]]) return LANGUAGE_TO_COUNTRY[baseMatch[1]];
  return null;
}

// ─── Filename Parser ────────────────────────────────────────
function parseBibleFilename(filename: string) {
  const translationMetadata = getTranslationMetadata(filename);
  if (translationMetadata) {
    return {
      name: PARTIAL_SOURCE_TRANSLATIONS.has(translationMetadata.abbreviation)
        ? `${translationMetadata.name} (partial source text)`
        : NEW_TESTAMENT_ONLY_SOURCE_TRANSLATIONS.has(translationMetadata.abbreviation)
          ? `${translationMetadata.name} (New Testament only in source)`
          : translationMetadata.name,
      language: translationMetadata.language,
      country: getCountryForLanguage(translationMetadata.language),
      version: translationMetadata.abbreviation,
    };
  }

  let stem = filename.replace(/\.xml$/i, "");
  if (stem.endsWith("Bible")) stem = stem.slice(0, -5);

  const knownLangs = Object.keys(LANGUAGE_TO_COUNTRY).sort((a, b) => b.length - a.length);
  let language: string | null = null;
  let remainder = stem;

  for (const lang of knownLangs) {
    if (stem.startsWith(lang)) {
      language = lang;
      remainder = stem.slice(lang.length);
      break;
    }
  }

  if (!language) {
    const m = stem.match(/^([A-Z][a-z]+)/);
    if (m) { language = m[1]; remainder = stem.slice(m[1].length); }
  }

  const country = language ? getCountryForLanguage(language) : null;
  const yearMatch = remainder.match(/^(\d{4})$/);
  const acronymMatch = remainder.match(/([A-Z]{2,})/);
  const mixedMatch = remainder.match(/^([A-Z]{2,})(\d{4})/);
  const version = mixedMatch ? `${mixedMatch[1]} ${mixedMatch[2]}` : yearMatch ? yearMatch[1] : acronymMatch ? acronymMatch[1] : null;

  const insertSpaces = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2").replace(/(\d)([A-Za-z])/g, "$1 $2").trim();
  const cleanedRemainder = insertSpaces(remainder);
  const name = cleanedRemainder ? `${cleanedRemainder} Bible` : "Bible";
  const formatLanguage = (l: string | null) => l ? l.replace(/([a-z])([A-Z])/g, "$1 $2") : null;

  return { name, language: formatLanguage(language), country, version };
}

function makeBibleId(r2Key: string): string {
  const hex = createHash("sha1").update(r2Key).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function containsInsensitive(value: string | null | undefined, query: string): boolean {
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

// ─── R2 S3 Client ───────────────────────────────────────────
function getR2Client(env: Env) {
  return new AwsClient({
    region: "auto",
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
}

function getR2Endpoint(env: Env) {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

interface R2ListEntry {
  Key: string;
  Size?: number;
  LastModified?: string;
}

async function r2ListAll(env: Env, prefix?: string): Promise<{ key: string; size: number | undefined; lastModified: Date | undefined }[]> {
  const client = getR2Client(env);
  const bucket = env.R2_BUCKET_NAME;
  const endpoint = getR2Endpoint(env);
  const results: { key: string; size: number | undefined; lastModified: Date | undefined }[] = [];
  let continuationToken: string | undefined;

  do {
    const params = new URLSearchParams({
      "list-type": "2",
      "max-keys": "1000",
    });
    if (prefix) params.set("prefix", prefix);
    if (continuationToken) params.set("continuation-token", continuationToken);

    const url = `${endpoint}/${bucket}?${params}`;
    const signed = await client.sign(url, { method: "GET" });
    const res = await fetch(signed);
    const xml = await res.text();

    // Parse XML response
    const keyMatches = xml.match(/<Key>([^<]+)<\/Key>/g) || [];
    const sizeMatches = xml.match(/<Size>([^<]+)<\/Size>/g) || [];
    const modMatches = xml.match(/<LastModified>([^<]+)<\/LastModified>/g) || [];

    for (let i = 0; i < keyMatches.length; i++) {
      const key = keyMatches[i].replace(/<\/?Key>/g, "");
      const size = sizeMatches[i] ? parseInt(sizeMatches[i].replace(/<\/?Size>/g, ""), 10) : undefined;
      const mod = modMatches[i] ? new Date(modMatches[i].replace(/<\/?LastModified>/g, "")) : undefined;
      results.push({ key, size, lastModified: mod });
    }

    const nextTokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    continuationToken = nextTokenMatch ? nextTokenMatch[1] : undefined;
  } while (continuationToken);

  return results;
}

async function r2GetSignedUrl(env: Env, key: string, expiresInSec: number): Promise<string> {
  const client = getR2Client(env);
  const url = `${getR2Endpoint(env)}/${env.R2_BUCKET_NAME}/${key}`;
  const signed = await client.sign(url, {
    method: "GET",
  });
  // aws4fetch signs with a short-lived token; we need to return the URL directly
  // Since Workers can't do presigned URLs the same way, we'll use a different approach
  // We'll proxy the download through the Worker instead
  return signed.url;
}

// ─── Catalog Builder ────────────────────────────────────────
async function rebuildCatalog(env: Env, prefix?: string) {
  const objects = await r2ListAll(env, prefix);
  const previousByKey = catalogCache.byKey;
  const rows: BibleRow[] = [];
  let added = 0;
  let updated = 0;

  for (const obj of objects) {
    if (obj.key.endsWith("/")) continue;
    const filename = obj.key.split("/").pop() || obj.key;
    if (!filename.toLowerCase().endsWith(".xml")) continue;
    if (isKnownIncompleteBibleFile(filename)) continue;

    const parsed = parseBibleFilename(filename);
    const existing = previousByKey.get(obj.key);
    const now = new Date();

    const row: BibleRow = {
      id: existing?.id ?? makeBibleId(obj.key),
      name: parsed.name,
      language: parsed.language,
      country: parsed.country,
      version: parsed.version,
      source: "r2",
      r2Key: obj.key,
      filename,
      contentType: "application/xml",
      filesize: obj.size ?? null,
      sha256: null,
      isFree: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing && existing.name === parsed.name ? existing.updatedAt : now,
    };

    if (!existing) added++;
    else if (row.updatedAt.getTime() !== existing.updatedAt.getTime()) updated++;
    rows.push(row);
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  catalogCache.byId = new Map(rows.map((r) => [r.id, r]));
  catalogCache.byKey = new Map(rows.map((r) => [r.r2Key, r]));
  catalogCache.items = rows;
  catalogCache.loadedAt = Date.now();

  return { added, updated, totalScanned: objects.length };
}

async function ensureCatalogLoaded(env: Env, prefix?: string) {
  if (catalogCache.items.length > 0 && Date.now() - catalogCache.loadedAt < CATALOG_CACHE_TTL_MS) return;
  if (!catalogCache.refreshPromise) {
    catalogCache.refreshPromise = rebuildCatalog(env, prefix).finally(() => {
      catalogCache.refreshPromise = null;
    });
  }
  await catalogCache.refreshPromise;
}

// ─── Zod Schemas ────────────────────────────────────────────
const listBiblesQuery = z.object({
  query: z.string().optional(),
  language: z.string().optional(),
  country: z.string().optional(),
  version: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createBibleBody = z.object({
  name: z.string().min(1).max(512),
  language: z.string().max(128).optional(),
  country: z.string().max(128).optional(),
  version: z.string().max(128).optional(),
  r2Key: z.string().min(1).max(1024),
  filename: z.string().max(512).optional(),
  contentType: z.string().max(128).optional(),
  filesize: z.number().int().nonnegative().optional(),
  sha256: z.string().max(64).optional(),
  isFree: z.boolean().optional(),
});

// ─── Hono App ───────────────────────────────────────────────
const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*" }));

// ── Health ──────────────────────────────────────────────────
app.get("/health", (c) => c.json({ ok: true }));
app.get("/api/health", (c) => c.json({ ok: true, db: { connected: true } }));

// ── Bible List ──────────────────────────────────────────────
app.get("/api/bibles", async (c) => {
  const parsed = listBiblesQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid Bible search request" } }, 400);
  }

  const { query, language, country, version, page, limit } = parsed.data;
  const prefix = c.env.R2_PREFIX || undefined;
  await ensureCatalogLoaded(c.env, prefix);

  const skip = (page - 1) * limit;
  const filtered = catalogCache.items.filter((row) => {
    if (isKnownIncompleteBibleFile(row.filename)) return false;
    if (query && ![row.name, row.language, row.country, row.version].some((v) => containsInsensitive(v, query))) return false;
    if (language && !containsInsensitive(row.language, language)) return false;
    if (country && !containsInsensitive(row.country, country)) return false;
    if (version && !containsInsensitive(row.version, version)) return false;
    return true;
  });

  return c.json({
    page, limit, total: filtered.length,
    items: filtered.slice(skip, skip + limit).map((r) => ({
      id: r.id, name: r.name, language: r.language, country: r.country,
      version: r.version, filename: r.filename, filesize: r.filesize, sha256: r.sha256,
    })),
  });
});

// ── R2 Proxy (for downloads) — must be before /:id routes ──
app.get("/api/bibles/proxy", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: { code: "BAD_REQUEST", message: "Missing key parameter" } }, 400);

  const client = getR2Client(c.env);
  const url = `${getR2Endpoint(c.env)}/${c.env.R2_BUCKET_NAME}/${key}`;
  const signed = await client.sign(url, { method: "GET" });
  const res = await fetch(signed);

  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${key.split("/").pop()}"`,
    },
  });
});

// ── Bible Detail ────────────────────────────────────────────
app.get("/api/bibles/:id", async (c) => {
  const { id } = c.req.param();
  await ensureCatalogLoaded(c.env, c.env.R2_PREFIX || undefined);
  const row = catalogCache.byId.get(id);
  if (!row) return c.json({ error: { code: "NOT_FOUND", message: `Bible with id '${id}' not found` } }, 404);
  return c.json({
    id: row.id, name: row.name, language: row.language, country: row.country,
    version: row.version, source: row.source, r2Key: row.r2Key, contentType: row.contentType,
    filename: row.filename, filesize: row.filesize, sha256: row.sha256, isFree: row.isFree,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  });
});

// ── Bible Download (proxy through Worker) ───────────────────
app.get("/api/bibles/:id/download", async (c) => {
  const { id } = c.req.param();
  const wantsRedirect = c.req.query("redirect") === "1" || (c.req.header("accept") || "").includes("text/html");
  await ensureCatalogLoaded(c.env, c.env.R2_PREFIX || undefined);
  const row = catalogCache.byId.get(id);
  if (!row) return c.json({ error: { code: "NOT_FOUND", message: `Bible with id '${id}' not found` } }, 404);

  // Proxy the download from R2
  const client = getR2Client(c.env);
  const url = `${getR2Endpoint(c.env)}/${c.env.R2_BUCKET_NAME}/${row.r2Key}`;
  const signed = await client.sign(url, { method: "GET" });
  const res = await fetch(signed);

  if (wantsRedirect) {
    // For browser downloads, we can't redirect to a signed URL easily
    // so we proxy the content
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="${row.filename}"`,
      },
    });
  }

  // For API consumers, return a proxy URL
  const ttl = parseInt(c.env.DOWNLOAD_URL_TTL_SECONDS || "300", 10);
  const origin = new URL(c.req.url).origin;
  return c.json({
    url: `${origin}/api/bibles/proxy?key=${encodeURIComponent(row.r2Key)}`,
    expiresInSeconds: ttl,
    filename: row.filename,
  });
});

// ── Admin: Sync from R2 ────────────────────────────────────
app.post("/api/admin/r2/sync", async (c) => {
  const adminToken = c.req.header("x-admin-token");
  if (!adminToken || adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid admin token" } }, 401);
  }
  try {
    const result = await rebuildCatalog(c.env, c.env.R2_PREFIX || undefined);
    return c.json(result);
  } catch {
    return c.json({ error: { code: "SYNC_FAILED", message: "Failed to sync from R2" } }, 500);
  }
});

// ── Admin: Create/Update Bible ──────────────────────────────
app.post("/api/admin/bibles", async (c) => {
  const adminToken = c.req.header("x-admin-token");
  if (!adminToken || adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid admin token" } }, 401);
  }

  const rawInput = await c.req.json().catch(() => null);
  const parsed = createBibleBody.safeParse(rawInput);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid Bible payload" } }, 400);
  }

  const input = parsed.data;
  const filename = input.filename || input.r2Key.split("/").pop() || input.r2Key;
  if (isKnownIncompleteBibleFile(filename)) {
    return c.json({ error: { code: "INVALID_BIBLE", message: "This Bible file is incomplete and cannot be added." } }, 400);
  }
  const parsedFilename = parseBibleFilename(filename);
  const name = input.name || parsedFilename.name;
  const now = new Date();

  await ensureCatalogLoaded(c.env, c.env.R2_PREFIX || undefined);
  const existing = catalogCache.byKey.get(input.r2Key);

  const row: BibleRow = {
    id: existing?.id ?? makeBibleId(input.r2Key),
    name, language: input.language ?? parsedFilename.language, country: input.country ?? parsedFilename.country,
    version: input.version ?? parsedFilename.version, source: "r2", r2Key: input.r2Key, filename,
    contentType: input.contentType ?? "application/xml", filesize: input.filesize ?? null,
    sha256: input.sha256 ?? null, isFree: input.isFree ?? true,
    createdAt: existing?.createdAt ?? now, updatedAt: now,
  };

  const nextRows = catalogCache.items.filter((i) => i.r2Key !== input.r2Key);
  nextRows.push(row);
  nextRows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  catalogCache.byId = new Map(nextRows.map((r) => [r.id, r]));
  catalogCache.byKey = new Map(nextRows.map((r) => [r.r2Key, r]));
  catalogCache.items = nextRows;
  catalogCache.loadedAt = Date.now();

  return c.json({
    id: row.id, name: row.name, language: row.language, country: row.country,
    version: row.version, source: row.source, r2Key: row.r2Key, contentType: row.contentType,
    filename: row.filename, filesize: row.filesize, sha256: row.sha256, isFree: row.isFree,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }, 201);
});

// ── Template Videos ─────────────────────────────────────────
// Keep the R2 catalog on one prefix. This matches the existing template
// objects and prevents the UI/API from presenting multiple inventories.
const TEMPLATE_VIDEO_PREFIX = "template_vidoes:" as const;
const TEMPLATE_PICTURE_PREFIX = "template_pictures:" as const;

app.get("/api/template-videos", async (c) => {
  const publicBaseUrl = c.env.R2_PUBLIC_BASE_URL?.trim();
  const allObjects = new Map<string, { key: string; size: number | undefined; modified: Date | undefined }>();

  const objects = await r2ListAll(c.env, TEMPLATE_VIDEO_PREFIX);
  for (const obj of objects) {
    if (!obj.key.toLowerCase().endsWith(".mp4")) continue;
    const suffix = obj.key.startsWith(TEMPLATE_VIDEO_PREFIX)
      ? obj.key.slice(TEMPLATE_VIDEO_PREFIX.length)
      : obj.key;
    if (suffix && !suffix.includes("/")) {
      allObjects.set(obj.key, { key: obj.key, size: obj.size, modified: obj.lastModified });
    }
  }

  const items = Array.from(allObjects.values())
    .sort((a, b) => {
      const strip = (key: string) => key.startsWith(TEMPLATE_VIDEO_PREFIX)
        ? key.slice(TEMPLATE_VIDEO_PREFIX.length)
        : key;
      return (b.modified?.getTime() ?? 0) - (a.modified?.getTime() ?? 0)
        || strip(a.key).localeCompare(strip(b.key));
    })
    .map((obj) => {
      const strip = (key: string) => key.startsWith(TEMPLATE_VIDEO_PREFIX)
        ? key.slice(TEMPLATE_VIDEO_PREFIX.length)
        : key;
      const fileName = strip(obj.key);
      let videoUrl = "";
      if (publicBaseUrl) {
        const trimmed = publicBaseUrl.replace(/\/$/, "");
        const encoded = obj.key.split("/").filter(Boolean).map((s) => encodeURIComponent(s)).join("/");
        videoUrl = `${trimmed}/${encoded}`;
      }
      return {
        id: fileName, fileName, videoUrl, cloudflareKey: obj.key,
        size: obj.size ?? null, modified: obj.modified?.toISOString() ?? null,
      };
    });

  return c.json(items);
});

app.get("/api/template-pictures", async (c) => {
  const publicBaseUrl = c.env.R2_PUBLIC_BASE_URL?.trim();
  const allObjects = new Map<string, { key: string; size: number | undefined; modified: Date | undefined }>();
  const pictureExtensions = /\.(?:jpe?g|png|webp|gif)$/i;

  const objects = await r2ListAll(c.env, TEMPLATE_PICTURE_PREFIX);
  for (const obj of objects) {
    if (!pictureExtensions.test(obj.key)) continue;
    const suffix = obj.key.startsWith(TEMPLATE_PICTURE_PREFIX)
      ? obj.key.slice(TEMPLATE_PICTURE_PREFIX.length)
      : obj.key;
    if (suffix && !suffix.includes("/")) {
      allObjects.set(obj.key, { key: obj.key, size: obj.size, modified: obj.lastModified });
    }
  }

  const items = Array.from(allObjects.values())
    .sort((a, b) => {
      const strip = (key: string) => key.startsWith(TEMPLATE_PICTURE_PREFIX)
        ? key.slice(TEMPLATE_PICTURE_PREFIX.length)
        : key;
      return (b.modified?.getTime() ?? 0) - (a.modified?.getTime() ?? 0)
        || strip(a.key).localeCompare(strip(b.key));
    })
    .map((obj) => {
      const strip = (key: string) => key.startsWith(TEMPLATE_PICTURE_PREFIX)
        ? key.slice(TEMPLATE_PICTURE_PREFIX.length)
        : key;
      const fileName = strip(obj.key);
      let imageUrl = "";
      if (publicBaseUrl) {
        const trimmed = publicBaseUrl.replace(/\/$/, "");
        const encoded = obj.key.split("/").filter(Boolean).map((s) => encodeURIComponent(s)).join("/");
        imageUrl = `${trimmed}/${encoded}`;
      }
      return {
        id: fileName, fileName, imageUrl, cloudflareKey: obj.key,
        size: obj.size ?? null, modified: obj.modified?.toISOString() ?? null,
      };
    });

  return c.json(items);
});

export default app;
