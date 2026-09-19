import clientPromise from "./mongodb";
import { COLLECTIONS, ensureIndexes } from "./db";

export type ProductionThemeKind = "lower-third" | "ticker";

type JsonRecord = Record<string, unknown>;

export interface ProductionThemeDocument {
  _id?: unknown;
  themeId: string;
  kind: ProductionThemeKind;
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  html: string;
  css: string;
  variables: JsonRecord[];
  colors: Record<string, string>;
  preview: JsonRecord | null;
  fontImports: string[];
  accentColor: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface ProductionThemeInput {
  themeId?: unknown;
  kind?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  icon?: unknown;
  tags?: unknown;
  html?: unknown;
  css?: unknown;
  variables?: unknown;
  colors?: unknown;
  preview?: unknown;
  fontImports?: unknown;
  accentColor?: unknown;
  enabled?: unknown;
}

const DEFAULT_COLORS = {
  accent: "#1D4ED8",
  accentText: "#FFFFFF",
  barBg: "#0F172A",
  barText: "#F8FAFC",
  separator: "#F97316",
};

const DEFAULT_LT_HTML = `<div class="mce-admin-lower-third" data-state="{{state}}">
  <div class="mce-admin-lower-third__accent"></div>
  <div>
    <div class="mce-admin-lower-third__title">{{title}}</div>
    <div class="mce-admin-lower-third__subtitle">{{subtitle}}</div>
  </div>
</div>`;

const DEFAULT_LT_CSS = `
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; font-family: Inter, Arial, sans-serif; }
body { display: flex; align-items: flex-end; justify-content: flex-start; padding: 52px; }
.mce-admin-lower-third {
  min-width: 560px;
  max-width: 1180px;
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: 18px;
  padding: 22px 28px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #fff;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.34);
}
.mce-admin-lower-third__accent { border-radius: 999px; background: #1D4ED8; }
.mce-admin-lower-third__title { font-size: 42px; line-height: 1.05; font-weight: 800; }
.mce-admin-lower-third__subtitle { margin-top: 8px; font-size: 24px; line-height: 1.25; color: rgba(255,255,255,.82); }
`;

const DEFAULT_VARIABLES = [
  {
    key: "title",
    label: "Title",
    type: "text",
    defaultValue: "Pastor Tayo Akosile",
    placeholder: "Enter the main line",
    group: "Content",
    required: true,
  },
  {
    key: "subtitle",
    label: "Subtitle",
    type: "text",
    defaultValue: "Lead Pastor",
    placeholder: "Enter the supporting line",
    group: "Content",
  },
];

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, fallback = "", maxLength = 60_000): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, maxLength);
}

function readBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeKind(value: unknown): ProductionThemeKind {
  if (value === "ticker") return "ticker";
  if (value === "lower-third" || value === "lowerThird" || value === "lower_third") {
    return "lower-third";
  }
  throw new Error("Theme kind must be lower-third or ticker");
}

function normalizeThemeId(value: unknown, kind: ProductionThemeKind, name: string): string {
  const raw = readString(value, "", 120);
  const slug = slugify(raw || name);
  if (!slug) {
    return `${kind === "ticker" ? "ticker" : "lt"}-${Date.now().toString(36)}`;
  }
  const prefixed = slug.startsWith("admin-") ? slug : `admin-${slug}`;
  return prefixed.slice(0, 96);
}

function normalizeTags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return values
    .map((item) => readString(item, "", 40).trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeFontImports(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item, "", 300).trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeColors(value: unknown): Record<string, string> {
  const source = isRecord(value) ? value : {};
  const colors: Record<string, string> = { ...DEFAULT_COLORS };
  for (const [key, raw] of Object.entries(source)) {
    const color = readString(raw, "", 80).trim();
    if (color) colors[key] = color;
  }
  return colors;
}

function normalizeVariables(value: unknown, kind: ProductionThemeKind): JsonRecord[] {
  const list = Array.isArray(value) ? value : kind === "lower-third" ? DEFAULT_VARIABLES : [];
  return list
    .filter(isRecord)
    .map((variable) => ({
      ...variable,
      key: readString(variable.key, "", 80).trim(),
      label: readString(variable.label, "", 120).trim(),
      type: readString(variable.type, "text", 40).trim() || "text",
      defaultValue: readString(variable.defaultValue, "", 2_000),
      placeholder: readString(variable.placeholder, "", 200),
      group: readString(variable.group, "", 80),
      required: Boolean(variable.required),
    }))
    .filter((variable) => variable.key)
    .slice(0, 80);
}

function normalizePreview(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  return value;
}

export function serializeProductionTheme(theme: ProductionThemeDocument): Record<string, unknown> {
  return {
    ...theme,
    _id: theme._id && typeof theme._id === "object" && "toString" in theme._id
      ? String(theme._id.toString())
      : theme._id,
  };
}

export function normalizeProductionThemeInput(
  input: ProductionThemeInput,
  adminUserId: string,
  existing?: ProductionThemeDocument | null,
): ProductionThemeDocument {
  const now = new Date().toISOString();
  const kind = normalizeKind(input.kind ?? existing?.kind ?? "lower-third");
  const name = readString(input.name, existing?.name ?? "", 160).trim();
  if (!name) throw new Error("Theme name is required");

  const colors = normalizeColors(input.colors ?? existing?.colors);
  const accentColor = readString(input.accentColor, existing?.accentColor || colors.accent || "#1D4ED8", 80);
  const themeId = normalizeThemeId(input.themeId ?? existing?.themeId, kind, name);

  return {
    ...(existing ?? {}),
    themeId,
    kind,
    name,
    description: readString(input.description, existing?.description ?? "", 400).trim(),
    category: readString(input.category, existing?.category ?? (kind === "ticker" ? "ticker" : "general"), 80).trim() || (kind === "ticker" ? "ticker" : "general"),
    icon: readString(input.icon, existing?.icon ?? (kind === "ticker" ? "campaign" : "closed_caption"), 80).trim() || (kind === "ticker" ? "campaign" : "closed_caption"),
    tags: normalizeTags(input.tags ?? existing?.tags),
    html: readString(input.html, existing?.html ?? (kind === "lower-third" ? DEFAULT_LT_HTML : ""), 120_000),
    css: readString(input.css, existing?.css ?? (kind === "lower-third" ? DEFAULT_LT_CSS : ""), 120_000),
    variables: normalizeVariables(input.variables ?? existing?.variables, kind),
    colors,
    preview: normalizePreview(input.preview ?? existing?.preview),
    fontImports: normalizeFontImports(input.fontImports ?? existing?.fontImports),
    accentColor,
    enabled: readBoolean(input.enabled, existing?.enabled ?? true),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? adminUserId,
    updatedBy: adminUserId,
  };
}

export async function listProductionThemes(options: {
  kind?: ProductionThemeKind;
  includeDisabled?: boolean;
} = {}): Promise<ProductionThemeDocument[]> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const filter: Record<string, unknown> = {};
  if (options.kind) filter.kind = options.kind;
  if (!options.includeDisabled) filter.enabled = true;

  return db
    .collection<ProductionThemeDocument>(COLLECTIONS.PRODUCTION_THEMES)
    .find(filter)
    .sort({ kind: 1, name: 1 })
    .toArray();
}

export async function upsertProductionTheme(
  input: ProductionThemeInput,
  adminUserId: string,
): Promise<ProductionThemeDocument> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const collection = db.collection<ProductionThemeDocument>(COLLECTIONS.PRODUCTION_THEMES);

  const requestedId = readString(input.themeId, "", 120);
  const existing = requestedId
    ? await collection.findOne({ themeId: normalizeThemeId(requestedId, normalizeKind(input.kind ?? "lower-third"), readString(input.name, requestedId, 160)) })
    : null;
  const doc = normalizeProductionThemeInput(input, adminUserId, existing);

  await collection.updateOne(
    { themeId: doc.themeId },
    {
      $set: {
        kind: doc.kind,
        name: doc.name,
        description: doc.description,
        category: doc.category,
        icon: doc.icon,
        tags: doc.tags,
        html: doc.html,
        css: doc.css,
        variables: doc.variables,
        colors: doc.colors,
        preview: doc.preview,
        fontImports: doc.fontImports,
        accentColor: doc.accentColor,
        enabled: doc.enabled,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy,
      },
      $setOnInsert: {
        themeId: doc.themeId,
        createdAt: doc.createdAt,
        createdBy: doc.createdBy,
      },
    },
    { upsert: true },
  );

  const saved = await collection.findOne({ themeId: doc.themeId });
  if (!saved) throw new Error("Failed to save production theme");
  return saved;
}

export async function setProductionThemeEnabled(
  themeId: string,
  enabled: boolean,
  adminUserId: string,
): Promise<ProductionThemeDocument | null> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const now = new Date().toISOString();
  const result = await db
    .collection<ProductionThemeDocument>(COLLECTIONS.PRODUCTION_THEMES)
    .findOneAndUpdate(
      { themeId },
      { $set: { enabled, updatedAt: now, updatedBy: adminUserId } },
      { returnDocument: "after" },
    );
  return result;
}
