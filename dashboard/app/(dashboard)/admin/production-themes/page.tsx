"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Eye,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ProductionThemeKind = "lower-third" | "ticker";

type ProductionTheme = {
  _id?: string;
  themeId: string;
  kind: ProductionThemeKind;
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  html: string;
  css: string;
  variables: Array<Record<string, unknown>>;
  colors: Record<string, string>;
  preview: Record<string, unknown> | null;
  fontImports: string[];
  accentColor: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  themeId: string;
  kind: ProductionThemeKind;
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string;
  html: string;
  css: string;
  variablesJson: string;
  colorsJson: string;
  previewJson: string;
  fontImports: string;
  accentColor: string;
  enabled: boolean;
};

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

const DEFAULT_LT_CSS = `* { box-sizing: border-box; }
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
  border: 1px solid rgba(255,255,255,.16);
  color: #fff;
  box-shadow: 0 20px 50px rgba(0,0,0,.34);
}
.mce-admin-lower-third__accent { border-radius: 999px; background: #1D4ED8; }
.mce-admin-lower-third__title { font-size: 42px; line-height: 1.05; font-weight: 800; }
.mce-admin-lower-third__subtitle { margin-top: 8px; font-size: 24px; line-height: 1.25; color: rgba(255,255,255,.82); }`;

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

function blankForm(kind: ProductionThemeKind = "lower-third"): FormState {
  return {
    themeId: "",
    kind,
    name: "",
    description: "",
    category: kind === "ticker" ? "ticker" : "general",
    icon: kind === "ticker" ? "campaign" : "closed_caption",
    tags: kind === "ticker" ? "ticker, announcement" : "lower-third, ministry",
    html: kind === "ticker" ? "" : DEFAULT_LT_HTML,
    css: kind === "ticker" ? "" : DEFAULT_LT_CSS,
    variablesJson: JSON.stringify(kind === "ticker" ? [] : DEFAULT_VARIABLES, null, 2),
    colorsJson: JSON.stringify(DEFAULT_COLORS, null, 2),
    previewJson: "",
    fontImports: "",
    accentColor: "#1D4ED8",
    enabled: true,
  };
}

function themeToForm(theme: ProductionTheme): FormState {
  return {
    themeId: theme.themeId,
    kind: theme.kind,
    name: theme.name,
    description: theme.description || "",
    category: theme.category || (theme.kind === "ticker" ? "ticker" : "general"),
    icon: theme.icon || (theme.kind === "ticker" ? "campaign" : "closed_caption"),
    tags: theme.tags?.join(", ") || "",
    html: theme.html || "",
    css: theme.css || "",
    variablesJson: JSON.stringify(theme.variables || [], null, 2),
    colorsJson: JSON.stringify(theme.colors || DEFAULT_COLORS, null, 2),
    previewJson: theme.preview ? JSON.stringify(theme.preview, null, 2) : "",
    fontImports: theme.fontImports?.join("\n") || "",
    accentColor: theme.accentColor || theme.colors?.accent || "#1D4ED8",
    enabled: theme.enabled,
  };
}

function parseJsonField<T>(value: string, fallback: T, label: string): T {
  if (!value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function renderPreview(form: FormState): string {
  const variables = parseJsonField<Array<Record<string, unknown>>>(form.variablesJson, [], "Variables");
  const values = new Map(
    variables.map((variable) => [
      String(variable.key || ""),
      String(variable.defaultValue || variable.label || ""),
    ]),
  );
  const html = (form.html || "")
    .replace(/\{\{\s*state\s*\}\}/g, "in")
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => values.get(key.trim()) || "");
  const fontLinks = form.fontImports
    .split(/\n+/)
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => `<link rel="stylesheet" href="${url}">`)
    .join("\n");

  return `<!doctype html><html><head><meta charset="utf-8">${fontLinks}<style>${form.css}</style></head><body>${html}</body></html>`;
}

export default function AdminProductionThemesPage() {
  const [themes, setThemes] = useState<ProductionTheme[]>([]);
  const [form, setForm] = useState<FormState>(() => blankForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<ProductionThemeKind>("lower-third");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadThemes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/production-themes", { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load production themes");
      setThemes(Array.isArray(body.themes) ? body.themes : []);
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Failed to load production themes" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadThemes();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredThemes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return themes
      .filter((theme) => theme.kind === activeKind)
      .filter((theme) => {
        if (!q) return true;
        return [
          theme.name,
          theme.themeId,
          theme.description,
          theme.category,
          ...(theme.tags || []),
        ].some((value) => String(value || "").toLowerCase().includes(q));
      })
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  }, [activeKind, search, themes]);

  const previewHtml = useMemo(() => {
    try {
      return renderPreview(form);
    } catch {
      return "";
    }
  }, [form]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleNew = (kind = activeKind) => {
    setSelectedId(null);
    setActiveKind(kind);
    setForm(blankForm(kind));
  };

  const handleSelectTheme = (theme: ProductionTheme) => {
    setSelectedId(theme.themeId);
    setActiveKind(theme.kind);
    setForm(themeToForm(theme));
  };

  const handleKindChange = (kind: ProductionThemeKind) => {
    setActiveKind(kind);
    if (!selectedId) {
      setForm(blankForm(kind));
    }
  };

  const buildPayload = () => {
    const variables = parseJsonField<Array<Record<string, unknown>>>(form.variablesJson, [], "Variables");
    const colors = parseJsonField<Record<string, string>>(form.colorsJson, DEFAULT_COLORS, "Colors");
    const preview = parseJsonField<Record<string, unknown> | null>(form.previewJson, null, "Preview");
    return {
      themeId: form.themeId,
      kind: form.kind,
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      icon: form.icon.trim(),
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      html: form.html,
      css: form.css,
      variables,
      colors,
      preview,
      fontImports: form.fontImports.split(/\n+/).map((url) => url.trim()).filter(Boolean),
      accentColor: form.accentColor.trim(),
      enabled: form.enabled,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      if (!payload.name) throw new Error("Theme name is required");
      const res = await fetch("/api/admin/production-themes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save production theme");
      const saved = body.theme as ProductionTheme;
      setThemes((current) => {
        const without = current.filter((theme) => theme.themeId !== saved.themeId);
        return [...without, saved];
      });
      setSelectedId(saved.themeId);
      setForm(themeToForm(saved));
      setToast({ type: "success", message: "Production theme saved. Deployed desktop apps will pick it up from the live catalog." });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Failed to save production theme" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/production-themes/${encodeURIComponent(selectedId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to disable production theme");
      const disabled = body.theme as ProductionTheme;
      setThemes((current) => current.map((theme) => theme.themeId === disabled.themeId ? disabled : theme));
      setForm(themeToForm(disabled));
      setToast({ type: "success", message: "Production theme disabled." });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Failed to disable production theme" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {toast && (
        <div className={cn(
          "fixed right-5 top-5 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg",
          toast.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800",
        )}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Admin Catalog</p>
            <h1 className="text-2xl font-semibold text-slate-950">Production Themes</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Add or edit lower-third and ticker themes that deployed desktop apps fetch from the live API.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadThemes()}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => handleNew(activeKind)}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            New Theme
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
              {(["lower-third", "ticker"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => handleKindChange(kind)}
                  className={cn(
                    "h-9 rounded-md text-sm font-semibold transition",
                    activeKind === kind ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950",
                  )}
                >
                  {kind === "lower-third" ? "Lower Thirds" : "Tickers"}
                </button>
              ))}
            </div>
            <label className="mt-4 flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-600">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search themes"
                className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

          <div className="max-h-[680px] overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading themes
              </div>
            ) : filteredThemes.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No {activeKind === "ticker" ? "ticker" : "lower-third"} themes yet.
              </div>
            ) : (
              filteredThemes.map((theme) => (
                <button
                  key={theme.themeId}
                  type="button"
                  onClick={() => handleSelectTheme(theme)}
                  className={cn(
                    "mb-2 w-full rounded-lg border p-3 text-left transition",
                    selectedId === theme.themeId
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="truncate text-sm font-semibold text-slate-950">{theme.name}</strong>
                    <span className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      theme.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                    )}>
                      {theme.enabled ? "Live" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{theme.themeId}</p>
                  {theme.description && (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{theme.description}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {selectedId ? "Edit Theme" : "New Theme"}
                </h2>
                <p className="text-sm text-slate-600">Changes are served from the API after saving.</p>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
            </div>

            <div className="grid gap-5 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Kind">
                  <select
                    value={form.kind}
                    onChange={(event) => {
                      const nextKind = event.target.value as ProductionThemeKind;
                      setActiveKind(nextKind);
                      setForm((current) => ({ ...blankForm(nextKind), name: current.name, description: current.description }));
                    }}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="lower-third">Lower Third</option>
                    <option value="ticker">Ticker</option>
                  </select>
                </Field>
                <Field label="Theme ID">
                  <input
                    value={form.themeId}
                    onChange={(event) => updateForm("themeId", event.target.value)}
                    placeholder="Leave blank to generate"
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name">
                  <input
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    placeholder="Scripture Lower Third"
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
                <Field label="Accent Color">
                  <div className="flex h-11 rounded-lg border border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                    <input
                      type="color"
                      value={form.accentColor || "#1D4ED8"}
                      onChange={(event) => updateForm("accentColor", event.target.value)}
                      className="h-full w-12 rounded-l-lg border-0 bg-transparent p-1"
                    />
                    <input
                      value={form.accentColor}
                      onChange={(event) => updateForm("accentColor", event.target.value)}
                      className="min-w-0 flex-1 rounded-r-lg border-0 px-3 text-sm text-slate-900 outline-none"
                    />
                  </div>
                </Field>
              </div>

              <Field label="Description">
                <input
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="Short note shown in the desktop theme picker"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Category">
                  <input
                    value={form.category}
                    onChange={(event) => updateForm("category", event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
                <Field label="Icon">
                  <input
                    value={form.icon}
                    onChange={(event) => updateForm("icon", event.target.value)}
                    placeholder="Material icon name"
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
                <Field label="Status">
                  <label className="flex h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(event) => updateForm("enabled", event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-700"
                    />
                    Enabled in production
                  </label>
                </Field>
              </div>

              <Field label="Tags">
                <input
                  value={form.tags}
                  onChange={(event) => updateForm("tags", event.target.value)}
                  placeholder="modern, worship, lower-third"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </Field>

              <div className="grid gap-4 xl:grid-cols-2">
                <Field label="HTML">
                  <textarea
                    value={form.html}
                    onChange={(event) => updateForm("html", event.target.value)}
                    rows={12}
                    placeholder={form.kind === "ticker" ? "Optional custom ticker HTML template" : "Lower-third HTML template"}
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 font-mono text-xs leading-5 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
                <Field label="CSS">
                  <textarea
                    value={form.css}
                    onChange={(event) => updateForm("css", event.target.value)}
                    rows={12}
                    placeholder="Theme CSS"
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 font-mono text-xs leading-5 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Field label="Variables JSON">
                  <textarea
                    value={form.variablesJson}
                    onChange={(event) => updateForm("variablesJson", event.target.value)}
                    rows={8}
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 font-mono text-xs leading-5 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
                <Field label="Colors JSON">
                  <textarea
                    value={form.colorsJson}
                    onChange={(event) => updateForm("colorsJson", event.target.value)}
                    rows={8}
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 font-mono text-xs leading-5 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Field label="Font Imports">
                  <textarea
                    value={form.fontImports}
                    onChange={(event) => updateForm("fontImports", event.target.value)}
                    rows={4}
                    placeholder="One stylesheet URL per line"
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 font-mono text-xs leading-5 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
                <Field label="Preview JSON">
                  <textarea
                    value={form.previewJson}
                    onChange={(event) => updateForm("previewJson", event.target.value)}
                    rows={4}
                    placeholder="Optional metadata"
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 font-mono text-xs leading-5 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={() => handleNew(form.kind)}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Start New
                </button>
                {selectedId && (
                  <button
                    type="button"
                    onClick={() => void handleDisable()}
                    disabled={saving || !form.enabled}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Disable
                  </button>
                )}
              </div>
            </div>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 p-4">
              <Eye className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-950">Preview</h2>
            </div>
            <div className="p-4">
              <div className="aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                {previewHtml ? (
                  <iframe
                    srcDoc={previewHtml}
                    sandbox="allow-same-origin allow-scripts"
                    title="Theme preview"
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No preview</div>
                )}
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-950">Production behavior</h3>
                </div>
                <p className="text-sm leading-6 text-slate-600">
                  Enabled themes are returned by the public production catalog endpoint. Desktop apps cache the catalog briefly and then refresh it from production.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
