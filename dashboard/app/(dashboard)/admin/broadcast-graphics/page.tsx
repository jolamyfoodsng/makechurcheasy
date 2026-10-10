"use client";

/**
 * Admin → Broadcast Graphics
 *
 * Controls every graphic in the desktop app's Broadcast Graphics library:
 *  • Upload a new graphic (one .html or .json "mce-graphic@1" file) — it reaches every
 *    desktop app the next time it is online, no app update needed. Apps keep a copy, so
 *    graphics keep working offline.
 *  • Pause (listed but not usable), make unavailable (not listed), or keep active.
 *  • Choose who may use each graphic: Free users, Paid plans, Ambassadors.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileUp,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  MonitorPlay,
  Trash2,
  Upload,
  X,
  XCircle,
  EyeOff,
  BookOpen,
  BarChart3,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

type GraphicStatus = "active" | "paused" | "hidden";
type Tiers = { free: boolean; paid: boolean; ambassador: boolean };

type GraphicPackage = {
  format?: string;
  id: string;
  version?: number;
  name: string;
  category?: string;
  description?: string;
  color?: string;
  hold?: number;
  placement?: { x?: number; y?: number; scale?: number };
  fields: Array<{ key: string; label?: string; type?: string; default?: string; options?: unknown; shades?: boolean }>;
  html: string;
  css?: string;
  animation?: Record<string, unknown>;
};

/** An uploaded ticker ("mce-ticker@1"). */
type TickerPackage = {
  format?: string;
  id: string;
  version?: number;
  name: string;
  description?: string;
  color?: string;
  badge?: string;
  tickerText?: string;
  speed?: string;
  html: string;
  css?: string;
  fontImports?: string[];
  variables?: Array<{ key: string; label?: string; type?: string; defaultValue?: string; default?: string }>;
};

type GraphicKind = "graphic" | "ticker";

type GraphicUsage = {
  graphicId: string;
  usersAdded: number;
  addsTotal: number;
  usersShown: number;
  shownTotal: number;
  lastUsedAt: string | null;
};

type GraphicUsageUser = {
  userId: string;
  name: string;
  email: string;
  churchName: string;
  plan: string;
  addedCount: number;
  shownCount: number;
  firstAddedAt: string | null;
  lastAddedAt: string | null;
  lastShownAt: string | null;
};

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

type Graphic = {
  graphicId: string;
  kind?: GraphicKind;
  source: "builtin" | "package";
  name: string;
  description: string;
  category: string;
  accentColor: string;
  status: GraphicStatus;
  tiers: Tiers;
  sortOrder: number;
  version: number;
  package: GraphicPackage | TickerPackage | null;
  updatedAt: string;
};

function kindOf(g: Pick<Graphic, "kind">): GraphicKind {
  return g.kind === "ticker" ? "ticker" : "graphic";
}

function isTickerPackage(pkg: unknown): pkg is TickerPackage {
  return !!pkg && typeof pkg === "object" && (pkg as { format?: string }).format === "mce-ticker@1";
}

type BuiltinPreviewTheme = {
  graphicId: string;
  name: string;
  html: string;
  variables: Array<{ key: string; defaultValue?: string }>;
  fontImports?: string[];
};

type BuiltinPreviewCatalog = {
  format: string;
  css: string;
  themes: BuiltinPreviewTheme[];
};

type GraphicPreview = { name: string; package?: GraphicPackage; builtin?: BuiltinPreviewTheme; ticker?: TickerPackage; tickerDoc?: string };

const CATEGORIES = [
  ["speaker", "Speaker"], ["service", "Service"], ["welcome", "Welcome"], ["giving", "Giving"],
  ["subscribe", "Subscribe"], ["announcements", "Announcements"], ["countdown", "Countdown"],
  ["social", "Social Media"], ["branding", "Logo & Branding"], ["scripture", "Scripture"], ["others", "Others"],
] as const;
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES);

const STATUS_META: Record<GraphicStatus, { label: string; hint: string; className: string }> = {
  active: { label: "Active", hint: "Listed and usable", className: "bg-emerald-100 text-emerald-700" },
  paused: { label: "Paused", hint: "Listed, but no one can use it", className: "bg-amber-100 text-amber-700" },
  hidden: { label: "Unavailable", hint: "Not listed in the app", className: "bg-slate-200 text-slate-600" },
};

const TIER_LABELS: Array<[keyof Tiers, string]> = [["free", "Free"], ["paid", "Paid"], ["ambassador", "Ambassador"]];

/* ── package files ─────────────────────────────────────────────────────────── */

/**
 * Read an uploaded file. A .json file is the package itself. An .html file holds:
 *   <script type="application/json" id="mce-graphic">{ id, name, fields, animation, … }</script>
 *   <style id="mce-graphic-css"> … </style>
 *   <template id="mce-graphic-html"> … </template>
 */
async function readPackageFile(file: File): Promise<GraphicPackage | TickerPackage> {
  const text = await file.text();
  if (/\.json$/i.test(file.name) || text.trim().startsWith("{")) {
    return JSON.parse(text) as GraphicPackage | TickerPackage;
  }
  const doc = new DOMParser().parseFromString(text, "text/html");
  const tickerMeta = doc.querySelector<HTMLScriptElement>('script#mce-ticker');
  if (tickerMeta) {
    const manifest = JSON.parse(tickerMeta.textContent || "{}") as TickerPackage;
    const tickerStyle = doc.querySelector("style#mce-ticker-css");
    const tickerTpl = doc.querySelector<HTMLTemplateElement>("template#mce-ticker-html");
    if (!tickerTpl) throw new Error('The HTML file needs <template id="mce-ticker-html"> with the ticker\'s markup.');
    return {
      ...manifest,
      format: "mce-ticker@1",
      css: tickerStyle?.textContent ?? manifest.css ?? "",
      html: tickerTpl.innerHTML.trim(),
    };
  }
  const meta = doc.querySelector<HTMLScriptElement>('script#mce-graphic, script[type="application/json"][data-mce-graphic]');
  if (!meta) throw new Error('The HTML file needs <script type="application/json" id="mce-graphic"> with the graphic\'s settings.');
  const manifest = JSON.parse(meta.textContent || "{}") as GraphicPackage;
  const style = doc.querySelector("style#mce-graphic-css") || doc.querySelector("style[data-mce-graphic]");
  const tpl = doc.querySelector<HTMLTemplateElement>("template#mce-graphic-html");
  if (!tpl) throw new Error('The HTML file needs <template id="mce-graphic-html"> with the graphic\'s markup.');
  return {
    ...manifest,
    format: manifest.format || "mce-graphic@1",
    css: style?.textContent ?? manifest.css ?? "",
    html: tpl.innerHTML.trim(),
  };
}

/** Quick checks before upload (the server validates again). */
function checkPackage(pkg: GraphicPackage | TickerPackage): string | null {
  if (!pkg || typeof pkg !== "object") return "This is not a graphic package.";
  if (isTickerPackage(pkg)) {
    if (!pkg.name) return "The ticker needs a name.";
    if (!pkg.html || !pkg.html.trim()) return "The ticker needs markup (html).";
    if (!/\{\{\s*(tickerText|text|message|messages)\s*\}\}/i.test(pkg.html)) return "The ticker markup needs a {{tickerText}} placeholder.";
    if (/<\s*script\b|\son[a-z]+\s*=|javascript\s*:/i.test(pkg.html)) return "The markup may not contain scripts or event handlers.";
    return null;
  }
  if (!pkg.name) return "The graphic needs a name.";
  if (!pkg.html || !pkg.html.trim()) return "The graphic needs markup (html).";
  if (!Array.isArray(pkg.fields)) return "The graphic needs a fields list.";
  if (/<\s*script\b|\son[a-z]+\s*=|javascript\s*:/i.test(pkg.html)) return "The markup may not contain scripts or event handlers.";
  return null;
}

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function escAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A full-screen 1920×1080 preview using the same runtime as the desktop app and OBS
 * (public/kinetic/* are copies of desktop/public/kinetic/*; the app's bundled fonts are
 * loaded from Google Fonts here, since the admin is online).
 */
function previewDoc(pkg: GraphicPackage, values?: Record<string, string>, backdrop = "#4a5260"): string {
  const id = String(pkg.id || "preview").replace(/[^\w-]/g, "");
  const attrs = (pkg.fields || [])
    .map((f) => {
      const key = String(f.key || "").replace(/[^\w-]/g, "");
      if (!key) return "";
      const v = values?.[key] ?? String(f.default ?? "");
      return `data-v-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${escAttr(v)}"`;
    })
    .join(" ");
  const b64 = toBase64Utf8(JSON.stringify({ ...pkg, id, updatedAt: String(Date.now()) }));
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${backdrop}}
#c{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;display:flex;align-items:flex-end}
.kx-root{display:flex;align-items:flex-end;width:100%;padding:0}</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,800&family=Oswald:wght@500;600;700&family=Roboto+Condensed:wght@400;700&family=Great+Vibes&family=Bebas+Neue&family=Playfair+Display:wght@400;700&display=swap">
<script src="/kinetic/gsap.min.js"></script><script src="/kinetic/kinetic-lower-thirds.js"></script><script src="/kinetic/mce-graphic-packages.js"></script>
</head><body><div id="c"><div class="kx-root" data-kx="pkg-${id}" data-kx-pkg="${b64}" ${attrs} data-v-kx-scale="1" data-v-kx-speed="1"></div></div>
<script>
var c=document.getElementById("c");function fit(){var s=Math.min(innerWidth/1920,innerHeight/1080);c.style.transform="translate("+(innerWidth-1920*s)/2+"px,"+(innerHeight-1080*s)/2+"px) scale("+s+")";}
addEventListener("resize",fit);fit();
function go(st){if(window.MCEKinetic)MCEKinetic.run(c,st);}
(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){go("in")},150)});
addEventListener("message",function(e){if(e.data==="in")go("in");if(e.data==="out")go("out");});
</script></body></html>`;
}

function builtinPreviewDoc(theme: BuiltinPreviewTheme, css: string, backdrop = "#4a5260"): string {
  const values = Object.fromEntries((theme.variables || []).map((variable) => [
    variable.key,
    String(variable.defaultValue ?? ""),
  ]));
  let html = theme.html || "";
  for (const [key, value] of Object.entries(values)) {
    const safe = escAttr(value);
    html = html.split(`{{${key}}}`).join(safe);
  }
  html = html.split("{{state}}").join("in");
  const fontLinks = (theme.fontImports || [])
    .filter((url) => /^https:\/\//i.test(url))
    .map((url) => `<link rel="stylesheet" href="${escAttr(url)}">`)
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${fontLinks}
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${backdrop}}#kx-canvas{position:absolute;left:0;top:0;width:1440px;height:810px;transform-origin:0 0;display:flex;align-items:center;justify-content:center}#kx-canvas>.kx-root{width:auto;padding:0}${css}</style>
<script src="/kinetic/gsap.min.js"></script><script src="/kinetic/kinetic-lower-thirds.js"></script><script src="/kinetic/subscribe-lower-thirds.js"></script><script src="/kinetic/church-lower-thirds.js"></script><script src="/kinetic/sunday-lower-thirds.js"></script><script src="/kinetic/mce-graphic-packages.js"></script>
</head><body><div id="kx-canvas">${html}</div><script>
(function(){var canvas=document.getElementById("kx-canvas");function fit(){var s=Math.min(innerWidth/1440,innerHeight/810);canvas.style.transform="translate("+((innerWidth-1440*s)/2)+"px,"+((innerHeight-810*s)/2)+"px) scale("+s+")";}function run(state){if(window.MCEKinetic)window.MCEKinetic.run(canvas,state);}fit();addEventListener("resize",fit);addEventListener("message",function(e){if(e.source!==window.parent)return;if(e.data==="in")run("in");if(e.data==="out")run("out");});(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){run("in");},100);});})();
</script></body></html>`;
}

/** The same substitution the desktop app does for HTML tickers (badge, messages, speed, variables). */
function tickerPreviewDoc(pkg: TickerPackage, backdrop = "#4a5260"): string {
  const values: Record<string, string> = {};
  for (const v of pkg.variables || []) values[v.key] = String(v.defaultValue ?? v.default ?? "");
  values.badge = values.badge || pkg.badge || "Announcements";
  values.tickerText = values.tickerText || pkg.tickerText || "Sunday Service 9:00 AM \u2022 Midweek Prayer Wednesday 6:30 PM \u2022 Welcome home";
  values.speed = pkg.speed || "24s";
  values.state = "in";
  const html = (pkg.html || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key: string) => escAttr(values[key] ?? ""));
  const fonts = (pkg.fontImports || [])
    .filter((url) => /^https:\/\/fonts\.googleapis\.com\//i.test(url))
    .map((url) => `<link rel="stylesheet" href="${escAttr(url)}">`).join("");
  return `<!doctype html><html><head><meta charset="utf-8">${fonts}
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:${backdrop}}
#c{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0}
${pkg.css || ""}</style></head><body><div id="c">${html}</div>
<script>var c=document.getElementById("c");function fit(){var s=Math.min(innerWidth/1920,innerHeight/1080);c.style.transform="translate("+(innerWidth-1920*s)/2+"px,"+(innerHeight-1080*s)/2+"px) scale("+s+")";}addEventListener("resize",fit);fit();</script>
</body></html>`;
}

function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── page ──────────────────────────────────────────────────────────────────── */

type Draft = { pkg: GraphicPackage | TickerPackage; fileName: string; status: GraphicStatus; tiers: Tiers; replaceId?: string };

export default function AdminBroadcastGraphicsPage() {
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<GraphicKind>("graphic");
  const [sourceFilter, setSourceFilter] = useState<"all" | "package" | "builtin">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | GraphicStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<GraphicPreview | null>(null);
  const builtinPreviewCatalog = useRef<BuiltinPreviewCatalog | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [usage, setUsage] = useState<Record<string, GraphicUsage>>({});
  const [sortBy, setSortBy] = useState<"default" | "shown" | "added">("default");
  const [usageView, setUsageView] = useState<{ graphic: Graphic; users: GraphicUsageUser[] | null; error?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const builtinTickerPreviews = useRef<Record<string, string> | null>(null);

  const notify = useCallback((type: "success" | "error", message: string) => setToast({ type, message }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/broadcast-graphics", { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load broadcast graphics");
      setGraphics(Array.isArray(body.graphics) ? body.graphics : []);
      // Usage is extra information; the list still works without it.
      try {
        const usageRes = await fetch("/api/admin/broadcast-graphics/usage", { credentials: "include", cache: "no-store" });
        const usageBody = await usageRes.json().catch(() => ({}));
        if (usageRes.ok && Array.isArray(usageBody.graphics)) {
          setUsage(Object.fromEntries((usageBody.graphics as GraphicUsage[]).map((u) => [u.graphicId, u])));
        }
      } catch {
        // ignore
      }
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load broadcast graphics");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(async (g: Graphic, changes: Partial<Pick<Graphic, "status" | "tiers" | "sortOrder" | "name" | "category">>) => {
    setBusyId(g.graphicId);
    setGraphics((list) => list.map((x) => (x.graphicId === g.graphicId ? { ...x, ...changes } : x)));
    try {
      const res = await fetch(`/api/admin/broadcast-graphics/${encodeURIComponent(g.graphicId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to update");
      setGraphics((list) => list.map((x) => (x.graphicId === g.graphicId ? { ...x, ...body.graphic } : x)));
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to update");
      void load();
    } finally {
      setBusyId(null);
    }
  }, [load, notify]);

  const remove = useCallback(async (g: Graphic) => {
    const question = g.source === "package"
      ? `Delete "${g.name}"? It disappears from every desktop app the next time it goes online. Graphics people already saved from it stop working.`
      : `Reset "${g.name}" to its defaults (active, everyone)?`;
    const noun = kindOf(g) === "ticker" ? "Ticker" : "Graphic";
    if (!window.confirm(question)) return;
    setBusyId(g.graphicId);
    try {
      const res = await fetch(`/api/admin/broadcast-graphics/${encodeURIComponent(g.graphicId)}`, { method: "DELETE", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed");
      notify("success", g.source === "package" ? `${noun} deleted.` : `${noun} reset.`);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }, [load, notify]);

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const pkg = await readPackageFile(file);
      const problem = checkPackage(pkg);
      if (problem) throw new Error(problem);
      const replaceId = replaceTarget.current || undefined;
      const existing = graphics.find((g) => g.graphicId === (replaceId || pkg.id));
      if (existing && kindOf(existing) !== (isTickerPackage(pkg) ? "ticker" : "graphic")) {
        throw new Error(`"${existing.graphicId}" is a ${kindOf(existing)}; this file is a ${isTickerPackage(pkg) ? "ticker" : "graphic"}.`);
      }
      setDraft({
        pkg,
        fileName: file.name,
        status: existing?.status ?? "active",
        tiers: existing?.tiers ?? { free: true, paid: true, ambassador: true },
        replaceId,
      });
    } catch (error) {
      notify("error", error instanceof Error ? `Couldn't read ${file.name}: ${error.message}` : "Couldn't read the file");
    } finally {
      replaceTarget.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [graphics, notify]);

  const publish = useCallback(async () => {
    if (!draft) return;
    setBusyId("__publish");
    try {
      const res = await fetch("/api/admin/broadcast-graphics", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: draft.pkg, status: draft.status, tiers: draft.tiers, replaceId: draft.replaceId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to publish");
      notify("success", `"${body.graphic?.name || draft.pkg.name}" is published (version ${body.graphic?.version ?? 1}). Desktop apps get it the next time they are online.`);
      setDraft(null);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to publish");
    } finally {
      setBusyId(null);
    }
  }, [draft, load, notify]);

  const handlePreview = useCallback(async (g: Graphic) => {
    if (kindOf(g) === "ticker") {
      if (isTickerPackage(g.package)) {
        setPreview({ name: g.name, ticker: g.package });
        return;
      }
      try {
        if (!builtinTickerPreviews.current) {
          const response = await fetch("/broadcast-graphics/builtin-ticker-previews.json", { cache: "no-store" });
          if (!response.ok) throw new Error("Could not load the built-in ticker previews.");
          const body = await response.json() as { tickers?: Record<string, string> };
          builtinTickerPreviews.current = body.tickers || {};
        }
        const doc = builtinTickerPreviews.current[g.graphicId];
        if (!doc) throw new Error(`Preview data is missing for ${g.name}.`);
        setPreview({ name: g.name, tickerDoc: doc });
      } catch (error) {
        notify("error", error instanceof Error ? error.message : "Could not open this preview.");
      }
      return;
    }
    if (g.package && !isTickerPackage(g.package)) {
      setPreview({ name: g.name, package: g.package });
      return;
    }
    try {
      if (!builtinPreviewCatalog.current) {
        const response = await fetch("/broadcast-graphics/builtin-previews.json", { cache: "force-cache" });
        if (!response.ok) throw new Error("Could not load the built-in graphic previews.");
        builtinPreviewCatalog.current = await response.json() as BuiltinPreviewCatalog;
      }
      const theme = builtinPreviewCatalog.current.themes.find((item) => item.graphicId === g.graphicId);
      if (!theme) throw new Error(`Preview data is missing for ${g.name}.`);
      setPreview({ name: g.name, builtin: theme });
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not open this preview.");
    }
  }, [notify]);

  const previewStarter = useCallback(async () => {
    try {
      const response = await fetch("/broadcast-graphics/starter-graphic.html", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the starter graphic.");
      const file = new File([await response.text()], "starter-graphic.html", { type: "text/html" });
      const pkg = await readPackageFile(file);
      const problem = checkPackage(pkg);
      if (problem) throw new Error(problem);
      if (isTickerPackage(pkg)) throw new Error("The starter graphic file is a ticker.");
      setPreview({ name: `${pkg.name} · Starter preview`, package: pkg });
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not preview the starter graphic.");
    }
  }, [notify]);

  const previewStarterTicker = useCallback(async () => {
    try {
      const response = await fetch("/broadcast-graphics/starter-ticker.html", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the starter ticker.");
      const pkg = await readPackageFile(new File([await response.text()], "starter-ticker.html", { type: "text/html" }));
      if (!isTickerPackage(pkg)) throw new Error("The starter ticker file is not a ticker.");
      setPreview({ name: `${pkg.name} · Starter preview`, ticker: pkg });
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not preview the starter ticker.");
    }
  }, [notify]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return graphics.filter((g) =>
      kindOf(g) === tab
      && (sourceFilter === "all" || g.source === sourceFilter)
      && (statusFilter === "all" || g.status === statusFilter)
      && (tab === "ticker" || categoryFilter === "all" || g.category === categoryFilter)
      && (!q || [g.name, g.graphicId, g.description, g.category, CATEGORY_LABEL[g.category] || g.category,
        g.source === "builtin" ? "bundled" : "uploaded", STATUS_META[g.status].label]
        .some((value) => value.toLowerCase().includes(q))));
  }, [graphics, tab, search, sourceFilter, statusFilter, categoryFilter]);

  const sorted = useMemo(() => {
    if (sortBy === "default") return filtered;
    const key = sortBy === "shown" ? "shownTotal" : "usersAdded";
    return [...filtered].sort((a, b) => (usage[b.graphicId]?.[key] ?? 0) - (usage[a.graphicId]?.[key] ?? 0));
  }, [filtered, sortBy, usage]);

  const openUsage = useCallback(async (g: Graphic) => {
    setUsageView({ graphic: g, users: null });
    try {
      const res = await fetch(`/api/admin/broadcast-graphics/usage?graphicId=${encodeURIComponent(g.graphicId)}`, { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load usage");
      setUsageView({ graphic: g, users: Array.isArray(body.users) ? body.users : [] });
    } catch (error) {
      setUsageView({ graphic: g, users: [], error: error instanceof Error ? error.message : "Failed to load usage" });
    }
  }, []);

  const counts = useMemo(() => {
    const list = graphics.filter((g) => kindOf(g) === tab);
    return {
      total: list.length,
      uploaded: list.filter((g) => g.source === "package").length,
      paused: list.filter((g) => g.status === "paused").length,
      hidden: list.filter((g) => g.status === "hidden").length,
      limited: list.filter((g) => !g.tiers.free).length,
      graphics: graphics.filter((g) => kindOf(g) === "graphic").length,
      tickers: graphics.filter((g) => kindOf(g) === "ticker").length,
    };
  }, [graphics, tab]);
  const isTickers = tab === "ticker";
  const noun = isTickers ? "ticker" : "graphic";

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {toast && (
        <div className={cn(
          "fixed right-6 top-6 z-50 flex max-w-md items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white",
        )}>
          {toast.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".html,.htm,.json,application/json,text/html"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <MonitorPlay className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Desktop app</p>
            <h1 className="text-2xl font-semibold text-slate-900">Broadcast Graphics</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Every graphic and ticker in the app&apos;s Broadcast Graphics library. Upload new ones, pause or hide any of them,
              and choose who can use it. Apps pick up changes the next time they&apos;re online and keep working offline.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowGuide((v) => !v)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <BookOpen className="h-4 w-4" /> Format guide
          </button>
          <a href={isTickers ? "/broadcast-graphics/starter-ticker.html" : "/broadcast-graphics/starter-graphic.html"} download className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" /> Starter file
          </a>
          <button type="button" onClick={() => void (isTickers ? previewStarterTicker() : previewStarter())} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Eye className="h-4 w-4" /> Preview starter
          </button>
          <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </button>
          <button type="button" onClick={() => { replaceTarget.current = null; fileRef.current?.click(); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">
            <Upload className="h-4 w-4" /> Upload {noun}
          </button>
        </div>
      </div>

      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
        {([["graphic", "Graphics", counts.graphics], ["ticker", "Tickers", counts.tickers]] as const).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setCategoryFilter("all"); }}
            className={cn("h-9 rounded-md px-4 text-sm font-semibold transition", tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
          >
            {label} <span className="ml-1 text-xs font-medium text-slate-400">{n}</span>
          </button>
        ))}
      </div>

      {showGuide && (isTickers ? <TickerFormatGuide /> : <FormatGuide />)}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[[isTickers ? "Tickers" : "Graphics", counts.total], ["Uploaded", counts.uploaded], ["Paused", counts.paused], ["Unavailable", counts.hidden], ["Plan-limited", counts.limited]].map(([label, n]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="text-xl font-semibold text-slate-900">{n}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-600">
          <Search className="h-4 w-4" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isTickers ? "Search tickers" : "Search graphics"} className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400" />
        </label>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
          <option value="all">All sources</option>
          <option value="package">Uploaded</option>
          <option value="builtin">Bundled with the app</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="hidden">Unavailable</option>
        </select>
        {!isTickers && (
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
            <option value="all">All categories</option>
            {CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        )}
        {!isTickers && <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
          <option value="default">Default order</option>
          <option value="shown">Most shown on air</option>
          <option value="added">Most added to OBS</option>
        </select>}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="hidden grid-cols-[minmax(0,1fr)_150px_250px_170px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
          <span>{isTickers ? "Ticker" : "Graphic"}</span><span>Status</span><span>Who can use it</span><span className="text-right">Actions</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading {noun}s</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No {noun}s match these filters.</div>
        ) : (isTickers ? filtered : sorted).map((g) => (
          <div key={g.graphicId} className={cn("grid gap-3 border-b border-slate-100 px-4 py-3 last:border-0 lg:grid-cols-[minmax(0,1fr)_150px_250px_170px] lg:items-center lg:gap-4", busyId === g.graphicId && "opacity-60")}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: g.accentColor || "#6366f1" }} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="truncate text-sm font-semibold text-slate-900">{g.name}</strong>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", g.source === "package" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600")}>
                    {g.source === "package" ? `Uploaded · v${g.version}` : "Bundled"}
                  </span>
                  {!isTickers && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{CATEGORY_LABEL[g.category] || g.category}</span>}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{g.graphicId}</p>
                {isTickers ? (g.description ? <p className="mt-1 truncate text-xs text-slate-500">{g.description}</p> : null) : (() => {
                  const u = usage[g.graphicId];
                  return (
                    <button
                      type="button"
                      onClick={() => void openUsage(g)}
                      className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline"
                      title="See who uses this graphic"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      {u && (u.usersAdded || u.shownTotal)
                        ? `Added by ${u.usersAdded} · Shown ${u.shownTotal}× by ${u.usersShown} · last used ${shortDate(u.lastUsedAt)}`
                        : "No usage yet"}
                    </button>
                  );
                })()}
              </div>
            </div>

            <div>
              <select
                value={g.status}
                disabled={busyId === g.graphicId}
                onChange={(e) => void patch(g, { status: e.target.value as GraphicStatus })}
                title={STATUS_META[g.status].hint}
                className={cn("h-9 w-full rounded-lg border-0 px-3 text-sm font-semibold", STATUS_META[g.status].className)}
              >
                {(Object.keys(STATUS_META) as GraphicStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {TIER_LABELS.map(([tier, label]) => {
                const on = g.tiers[tier];
                return (
                  <button
                    key={tier}
                    type="button"
                    disabled={busyId === g.graphicId}
                    onClick={() => void patch(g, { tiers: { ...g.tiers, [tier]: !on } })}
                    className={cn(
                      "h-8 rounded-full border px-3 text-xs font-semibold transition",
                      on ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-400 line-through",
                    )}
                    title={tier === "free" ? "Free: everyone can use it" : `${label} users can use it`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-1">
              <IconButton title="Preview" onClick={() => void handlePreview(g)}><Eye className="h-4 w-4" /></IconButton>
              {g.source === "package" && g.package && (
                <>
                  <IconButton title="Download package" onClick={() => downloadText(`${g.graphicId}.json`, JSON.stringify(g.package, null, 2))}><Download className="h-4 w-4" /></IconButton>
                  <IconButton title="Upload a new version" onClick={() => { replaceTarget.current = g.graphicId; fileRef.current?.click(); }}><FileUp className="h-4 w-4" /></IconButton>
                </>
              )}
              {g.status !== "paused"
                ? <IconButton title="Pause" onClick={() => void patch(g, { status: "paused" })}><PauseCircle className="h-4 w-4" /></IconButton>
                : <IconButton title="Make active" onClick={() => void patch(g, { status: "active" })}><PlayCircle className="h-4 w-4" /></IconButton>}
              {g.status !== "hidden" && <IconButton title="Make unavailable" onClick={() => void patch(g, { status: "hidden" })}><EyeOff className="h-4 w-4" /></IconButton>}
              {g.source === "package"
                ? <IconButton title="Delete" danger onClick={() => void remove(g)}><Trash2 className="h-4 w-4" /></IconButton>
                : <IconButton title="Reset to defaults" onClick={() => void remove(g)}><RotateCcw className="h-4 w-4" /></IconButton>}
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <Modal title={draft.replaceId ? `New version of ${draft.replaceId}` : isTickerPackage(draft.pkg) ? "Publish a new ticker" : "Publish a new graphic"} onClose={() => setDraft(null)}>
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <div>
              {isTickerPackage(draft.pkg) ? <TickerPreviewFrame pkg={draft.pkg} /> : <PreviewFrame pkg={draft.pkg} />}
              <p className="mt-2 text-xs text-slate-500">
                {draft.fileName} · {isTickerPackage(draft.pkg) ? `${draft.pkg.variables?.length ?? 0} variables` : `${draft.pkg.fields?.length ?? 0} fields`} · id <code>{draft.replaceId || draft.pkg.id}</code>
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">{draft.pkg.name}</div>
                <div className="text-xs text-slate-500">{isTickerPackage(draft.pkg) ? "Ticker" : CATEGORY_LABEL[String(draft.pkg.category)] || "Others"}</div>
                {draft.pkg.description && <p className="mt-1 text-xs text-slate-600">{draft.pkg.description}</p>}
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                Status
                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as GraphicStatus })} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
                  {(Object.keys(STATUS_META) as GraphicStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label} — {STATUS_META[s].hint}</option>)}
                </select>
              </label>
              <div>
                <div className="text-xs font-semibold text-slate-600">Who can use it</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {TIER_LABELS.map(([tier, label]) => (
                    <button key={tier} type="button" onClick={() => setDraft({ ...draft, tiers: { ...draft.tiers, [tier]: !draft.tiers[tier] } })}
                      className={cn("h-8 rounded-full border px-3 text-xs font-semibold", draft.tiers[tier] ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-400 line-through")}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">Free means everyone. Turn Free off to keep it for paid plans and/or ambassadors.</p>
              </div>
              <button type="button" disabled={busyId === "__publish"} onClick={() => void publish()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                {busyId === "__publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Publish to desktop apps
              </button>
            </div>
          </div>
        </Modal>
      )}

      {usageView && (
        <Modal title={`Usage · ${usageView.graphic.name}`} onClose={() => setUsageView(null)}>
          <UsagePanel graphic={usageView.graphic} users={usageView.users} error={usageView.error} summary={usage[usageView.graphic.graphicId]} onCopied={(n) => notify("success", `Copied ${n} email${n === 1 ? "" : "s"}`)} />
        </Modal>
      )}

      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}>
          {preview.package && <PreviewFrame pkg={preview.package} />}
          {preview.ticker && <TickerPreviewFrame pkg={preview.ticker} />}
          {preview.tickerDoc && <TickerPreviewFrame doc={preview.tickerDoc} />}
          {preview.builtin && builtinPreviewCatalog.current && <BuiltinPreviewFrame theme={preview.builtin} css={builtinPreviewCatalog.current.css} />}
        </Modal>
      )}
    </div>
  );
}

function UsagePanel({ graphic, users, error, summary, onCopied }: {
  graphic: Graphic;
  users: GraphicUsageUser[] | null;
  error?: string;
  summary?: GraphicUsage;
  onCopied: (count: number) => void;
}) {
  if (users === null) {
    return <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading usage</div>;
  }
  const emails = Array.from(new Set(users.map((u) => u.email).filter(Boolean)));
  const exportCsv = () => {
    const header = ["Church", "Name", "Email", "Plan", "Times added to OBS", "First added", "Times shown on air", "Last shown"];
    const rows = users.map((u) => [u.churchName, u.name, u.email, u.plan, u.addedCount, u.firstAddedAt || "", u.shownCount, u.lastShownAt || ""]);
    downloadText(`${graphic.graphicId}-usage.csv`, [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");
  };
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Churches that added it", summary?.usersAdded ?? 0], ["Times added to OBS", summary?.addsTotal ?? 0], ["Churches that showed it", summary?.usersShown ?? 0], ["Times shown on air", summary?.shownTotal ?? 0]].map(([label, n]) => (
          <div key={String(label)} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="text-xl font-semibold text-slate-900">{n}</div>
          </div>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Counts start from the desktop app version that reports graphic usage.</p>
        <div className="flex gap-2">
          <button type="button" disabled={!emails.length} onClick={() => { void navigator.clipboard?.writeText(emails.join(", ")).then(() => onCopied(emails.length)); }}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Copy className="h-4 w-4" /> Copy emails
          </button>
          <button type="button" disabled={!users.length} onClick={exportCsv}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download className="h-4 w-4" /> Download CSV
          </button>
        </div>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : users.length === 0 ? (
        <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">Nobody has added or shown this graphic yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Church / user</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2 text-right">Added</th>
                <th className="px-3 py-2">First added</th>
                <th className="px-3 py-2 text-right">Shown</th>
                <th className="px-3 py-2">Last shown</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-900">{u.churchName || u.name || "—"}</div>
                    {u.churchName && u.name && <div className="text-xs text-slate-500">{u.name}</div>}
                  </td>
                  <td className="px-3 py-2">{u.email ? <a className="text-indigo-600 hover:underline" href={`mailto:${u.email}`}>{u.email}</a> : "—"}</td>
                  <td className="px-3 py-2 capitalize text-slate-700">{u.plan}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900">{u.addedCount}</td>
                  <td className="px-3 py-2 text-slate-700">{shortDate(u.firstAddedAt)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900">{u.shownCount}</td>
                  <td className="px-3 py-2 text-slate-700">{shortDate(u.lastShownAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IconButton({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100", danger ? "hover:text-red-600" : "hover:text-slate-900")}>
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function PreviewFrame({ pkg }: { pkg: GraphicPackage }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [backdrop, setBackdrop] = useState("#4a5260");
  const doc = useMemo(() => previewDoc(pkg, undefined, backdrop), [pkg, backdrop]);
  const send = (msg: string) => ref.current?.contentWindow?.postMessage(msg, "*");
  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-800">
        <iframe ref={ref} title="Graphic preview" srcDoc={doc} sandbox="allow-scripts" className="h-full w-full border-0" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => send("in")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><PlayCircle className="h-3.5 w-3.5" /> Animate in</button>
        <button type="button" onClick={() => send("out")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" /> Animate out</button>
        <span className="ml-auto text-xs text-slate-500">Backdrop</span>
        {["#4a5260", "#f4f5f7", "#00b140", "#111111"].map((c) => (
          <button key={c} type="button" onClick={() => setBackdrop(c)} aria-label={`Backdrop ${c}`}
            className={cn("h-6 w-8 rounded border", backdrop === c ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-300")} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function TickerPreviewFrame({ pkg, doc }: { pkg?: TickerPackage; doc?: string }) {
  const [backdrop, setBackdrop] = useState("#4a5260");
  const srcDoc = useMemo(() => {
    if (pkg) return tickerPreviewDoc(pkg, backdrop);
    // Built-in previews come as full documents with a transparent page; set the backdrop.
    return (doc || "").replace("</head>", `<style>html,body{background:${backdrop} !important}.pos-full-bottom{position:fixed;left:0;right:0;bottom:0}</style></head>`);
  }, [pkg, doc, backdrop]);
  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-800">
        <iframe title="Ticker preview" srcDoc={srcDoc} sandbox="allow-scripts" className="h-full w-full border-0" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Shown with sample messages, as it appears across the bottom of the screen.</span>
        <span className="ml-auto text-xs text-slate-500">Backdrop</span>
        {["#4a5260", "#f4f5f7", "#00b140", "#111111"].map((color) => (
          <button key={color} type="button" onClick={() => setBackdrop(color)} aria-label={`Backdrop ${color}`} className={cn("h-6 w-8 rounded border", backdrop === color ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-300")} style={{ background: color }} />
        ))}
      </div>
    </div>
  );
}

function TickerFormatGuide() {
  return (
    <div className="mb-6 rounded-lg border border-indigo-100 bg-indigo-50/50 p-5 text-sm leading-6 text-slate-700">
      <h2 className="text-base font-semibold text-slate-900">Ticker file format (mce-ticker@1)</h2>
      <p className="mt-1">
        One file per ticker. Use the <a className="font-semibold text-indigo-700 underline" href="/broadcast-graphics/starter-ticker.html" download>starter ticker</a>,
        edit it, and upload it here (or upload the same thing as a <code>.json</code> file). Tickers contain no code — only markup and styles.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li><b>Settings</b> in <code>&lt;script type=&quot;application/json&quot; id=&quot;mce-ticker&quot;&gt;</code>: <code>id</code>, <code>name</code>, <code>description</code>, <code>color</code>, <code>badge</code> (default heading), <code>tickerText</code> (sample messages), <code>speed</code> (e.g. <code>&quot;24s&quot;</code>), <code>fontImports</code> (Google Fonts stylesheet links only) and optional <code>variables</code>.</li>
        <li><b>Markup</b> in <code>&lt;template id=&quot;mce-ticker-html&quot;&gt;</code>. The app fills <code>{"{{badge}}"}</code> with the heading, <code>{"{{tickerText}}"}</code> with the messages, <code>{"{{speed}}"}</code> with the scroll duration and <code>{"{{state}}"}</code> with in/out. Put <code>{"{{tickerText}}"}</code> twice inside the moving strip and scroll it by -50% for a seamless loop.</li>
        <li><b>Class names the app understands</b>: <code>.ticker-shell</code> (bar background/text colour), <code>.ticker-badge</code> (heading colours), <code>.ticker-move</code> (the moving strip: pause, loop once, speed) and <code>.pos-full-bottom</code> (moved to the top when the user picks Top).</li>
        <li><b>Styles</b> in <code>&lt;style id=&quot;mce-ticker-css&quot;&gt;</code>. Size for a 1920×1080 screen. No <code>@import</code>; embed pictures as <code>data:</code> URLs. Up to 1.5 MB.</li>
        <li>Uploading a file with the same <code>id</code> publishes a new version. Free users count tickers against their plan&apos;s ticker limit.</li>
      </ul>
    </div>
  );
}

function BuiltinPreviewFrame({ theme, css }: { theme: BuiltinPreviewTheme; css: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [backdrop, setBackdrop] = useState("#4a5260");
  const doc = useMemo(() => builtinPreviewDoc(theme, css, backdrop), [theme, css, backdrop]);
  const send = (msg: string) => ref.current?.contentWindow?.postMessage(msg, "*");
  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-800">
        <iframe ref={ref} title={`${theme.name} preview`} srcDoc={doc} sandbox="allow-scripts allow-same-origin" className="h-full w-full border-0" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => send("in")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><PlayCircle className="h-3.5 w-3.5" /> Animate in</button>
        <button type="button" onClick={() => send("out")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" /> Animate out</button>
        <span className="ml-auto text-xs text-slate-500">Backdrop</span>
        {["#4a5260", "#f4f5f7", "#00b140", "#111111"].map((color) => (
          <button key={color} type="button" onClick={() => setBackdrop(color)} aria-label={`Backdrop ${color}`} className={cn("h-6 w-8 rounded border", backdrop === color ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-300")} style={{ background: color }} />
        ))}
      </div>
    </div>
  );
}

function FormatGuide() {
  return (
    <div className="mb-6 rounded-lg border border-indigo-100 bg-indigo-50/50 p-5 text-sm leading-6 text-slate-700">
      <h2 className="text-base font-semibold text-slate-900">Graphic file format (mce-graphic@1)</h2>
      <p className="mt-1">
        One file per graphic. Use the <a className="font-semibold text-indigo-700 underline" href="/broadcast-graphics/starter-graphic.html" download>starter file</a>,
        edit it, and upload it here. You can also upload the same thing as a single <code>.json</code> file.
        Files contain no code — only markup, styles, fields and an animation list — so they are safe to run in every church&apos;s OBS.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li><b>Settings</b> in <code>&lt;script type=&quot;application/json&quot; id=&quot;mce-graphic&quot;&gt;</code>: <code>id</code>, <code>name</code>, <code>category</code> (speaker, service, welcome, giving, subscribe, announcements, countdown, social, branding, scripture, others), <code>description</code>, <code>color</code>, <code>hold</code> (seconds on screen), <code>placement</code> (<code>x</code>/<code>y</code> = px from the left/bottom of a 1920×1080 screen, <code>scale</code>), <code>fields</code> and <code>animation</code>.</li>
        <li><b>Fields</b> become the boxes users fill in: <code>text</code>, <code>color</code> (add <code>&quot;shades&quot;: true</code> for <code>--key-l</code>/<code>--key-d</code>), <code>select</code> (<code>&quot;options&quot;: &quot;icons&quot;</code> or a list), <code>list</code> (<code>&quot;options&quot;: &quot;brands&quot;</code> for social icons) and <code>image</code> (a logo; the church&apos;s logo is used when empty).</li>
        <li><b>Markup</b> in <code>&lt;template id=&quot;mce-graphic-html&quot;&gt;</code>: <code>{"{{key}}"}</code> text, <code>{"{{key|br}}"}</code> text with | as a line break, <code>{"{{icon:key}}"}</code> / <code>{"{{icon=mail}}"}</code>, <code>{"{{brands:key}}"}</code> / <code>{"{{brand=youtube}}"}</code>, <code>{"{{image:key|fallbackKey}}"}</code>, and <code>{"{{#key}}…{{/key}}"}</code> to show a part only when a field has a value. Colours are CSS variables: <code>var(--key)</code>.</li>
        <li><b>Styles</b> in <code>&lt;style id=&quot;mce-graphic-css&quot;&gt;</code> are scoped to the graphic automatically. Size things in 1920×1080 pixels. Avoid class names containing <code>-name</code>, <code>-panel</code>, <code>-card</code>, <code>-bg</code> or <code>-tag</code> (OBS colour overrides target them).</li>
        <li><b>Fonts &amp; pictures must work offline:</b> use the bundled fonts (Montserrat, Oswald, Roboto, Roboto Condensed, Open Sans, Archivo Black, Arimo, Tinos, Anton, Great Vibes, Bebas Neue, Saira…) or embed a font / picture as a <code>data:</code> URL. Files can be up to 1.5 MB.</li>
        <li><b>Animation</b>: <code>&quot;in&quot;</code> is a list of steps <code>[&quot;.selector&quot;, &quot;effect&quot;, startSeconds, {`{"d": duration, "s": stagger}`}]</code>. Effects: wipeL, wipeR, wipeU, wipeD, wipeC, wipeV, growX, growY, pop, spin, slam, up, down, left, right, fade, slideUp, maskUp, maskDown, maskL, blurL, stretch, skew, draw (SVG strokes). For anything else use <code>{`{"sel": ".x", "from": {...}, "to": {...}, "at": 1, "d": 0.5}`}</code> with GSAP properties, or <code>&quot;set&quot;</code>. <code>&quot;out&quot;</code> is optional (default: the in steps reversed). <code>&quot;ambient&quot;</code> loops while on screen.</li>
        <li>Uploading a file with the same <code>id</code> publishes a new version. Desktop apps download changes when they are online and keep the last copy for offline use.</li>
      </ul>
    </div>
  );
}
