/**
 * dockSessionBundle.ts — export / import a Dock session together with its pictures and videos.
 *
 * A plain session JSON only remembers WHERE media lives (a local web address and a path on this
 * computer), so on another computer the settings come back but the files do not. A bundle is a zip:
 *
 *   session.json            the same session JSON as always
 *   media/<path>            every file from the uploads folder that the session points at
 *
 * Import puts the files into this computer's uploads folder and rewrites every address and path in
 * the session to match, so themes, backgrounds, media and Multi-View all find their files again.
 * A plain .json (older exports, or a session with no media) still imports as before.
 */
import JSZip from "jszip";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import {
  applyDockSession,
  createDockSessionExport,
  parseDockSessionJSON,
  type DockSessionApplyOptions,
  type DockSessionDownloadResult,
  type DockSessionExport,
  type DockSessionImportResult,
} from "./dockSessionTransfer";

export const BUNDLE_SESSION_FILE = "session.json";
const BUNDLE_MEDIA_DIR = "media/";
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024 * 1024;

/* ── Finding media references ─────────────────────────────────────────────── */

/** An address like http://127.0.0.1:45678/uploads/a%20b.png, or a relative /uploads/a.png. */
const URL_REF = /(https?:\/\/[^/\s"'()<>\\]+)?\/uploads\/([^\s"'()<>?#\\]+)/g;
/** A path on disk like /Users/me/Documents/MakeChurchEasy/uploads/a.png or C:\...\uploads\a.png. */
const PATH_REF = /^((?:[A-Za-z]:)?[\\/].*?[\\/])uploads[\\/](.+)$/s;

function safeRel(rel: string): string | null {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.split("/").some((part) => part === ".." || part === "." || part === "")) return null;
  return clean;
}

function decodeRel(raw: string): string | null {
  try {
    return safeRel(decodeURIComponent(raw));
  } catch {
    return safeRel(raw);
  }
}

function encodeRel(rel: string): string {
  return rel.split("/").map((part) => encodeURIComponent(part)).join("/");
}

/** Every uploads-relative path mentioned by one string. */
function refsInString(text: string, out: Set<string>): void {
  if (!text.includes("uploads")) return;
  if (text.includes("/uploads/") && (text.startsWith("/uploads/") || /https?:\/\//.test(text) || /[("'\s]\/uploads\//.test(text))) {
    for (const match of text.matchAll(URL_REF)) {
      const rel = decodeRel(match[2]);
      if (rel) out.add(rel);
    }
    return;
  }
  const pathMatch = PATH_REF.exec(text.trim());
  if (pathMatch) {
    const rel = safeRel(pathMatch[2]);
    if (rel) out.add(rel);
  }
}

function walkStrings(value: unknown, visit: (text: string) => void): void {
  if (typeof value === "string") {
    visit(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => walkStrings(item, visit));
  } else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => walkStrings(item, visit));
  }
}

function mapStrings<T>(value: T, fn: (text: string) => string): T {
  if (typeof value === "string") return fn(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = mapStrings(item, fn);
    return out as T;
  }
  return value;
}

export function collectUploadRefs(session: DockSessionExport): string[] {
  const refs = new Set<string>();
  walkStrings(session, (text) => refsInString(text, refs));
  return [...refs].sort();
}

/* ── Where the uploads folder is on this computer ─────────────────────────── */

function overlayBase(): string {
  return getOverlayBaseUrlSync().replace(/\/+$/, "");
}

async function uploadsDirectory(): Promise<string> {
  try {
    const response = await fetch(`${overlayBase()}/api/uploads-dir`, { cache: "no-store" });
    if (!response.ok) return "";
    const payload = await response.json() as { path?: unknown };
    return typeof payload.path === "string" ? payload.path.trim() : "";
  } catch {
    return "";
  }
}

/** True on this computer (not a phone or another PC opening the Dock over Wi-Fi). */
function isLoopbackPage(): boolean {
  if (typeof location === "undefined") return false;
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname);
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/* ── Export ───────────────────────────────────────────────────────────────── */

export interface DockBundleDownloadResult extends DockSessionDownloadResult {
  mediaCount: number;
  mediaBytes: number;
  missingMedia: string[];
  /** "zip" when pictures/videos came along, "json" when the session had none. */
  format: "zip" | "json";
}

async function saveBytes(filename: string, bytes: Blob, mime: string, label: string, ext: string): Promise<
  { status: "saved"; path: string | null } | { status: "cancelled" } | { status: "download" }
> {
  if (isTauriRuntime()) {
    try {
      const [{ save }, { writeFile }] = await Promise.all([
        import("@tauri-apps/plugin-dialog"),
        import("@tauri-apps/plugin-fs"),
      ]);
      const filePath = await save({ defaultPath: filename, filters: [{ name: label, extensions: [ext] }] });
      if (!filePath) return { status: "cancelled" };
      await writeFile(filePath, new Uint8Array(await bytes.arrayBuffer()));
      return { status: "saved", path: filePath };
    } catch (error) {
      console.warn("[Dock] Native save unavailable for the session bundle:", error);
    }
  }
  // The OBS Dock (and other pages on this computer) can't show a native dialog themselves, so the
  // app does it for them: a "Save as" window where the person picks the folder and name.
  if (isLoopbackPage()) {
    try {
      const response = await fetch(`${overlayBase()}/api/save-file-dialog?filename=${encodeURIComponent(filename)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
      });
      if (response.ok) {
        const result = await response.json() as { path?: unknown; cancelled?: unknown };
        if (result.cancelled === true) return { status: "cancelled" };
        if (typeof result.path === "string" && result.path) return { status: "saved", path: result.path };
      }
    } catch (error) {
      console.warn("[Dock] The app's save dialog is unavailable:", error);
    }
  }
  const picker = (window as unknown as {
    showSaveFilePicker?: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  }).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({ suggestedName: filename, types: [{ description: label, accept: { [mime]: [`.${ext}`] } }] });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return { status: "saved", path: null };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return { status: "cancelled" };
    }
  }
  const url = URL.createObjectURL(bytes);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { status: "download" };
}

export async function downloadDockSessionBundle(): Promise<DockBundleDownloadResult> {
  const session = await createDockSessionExport();
  const refs = collectUploadRefs(session);
  const stamp = new Date().toISOString().slice(0, 10);

  const zip = new JSZip();
  const missing: string[] = [];
  let mediaBytes = 0;
  const base = overlayBase();
  for (const rel of refs) {
    try {
      const response = await fetch(`${base}/uploads/${encodeRel(rel)}`, { cache: "no-store" });
      if (!response.ok) {
        missing.push(rel);
        continue;
      }
      const blob = await response.blob();
      mediaBytes += blob.size;
      if (mediaBytes > MAX_BUNDLE_BYTES) throw new Error("The pictures and videos in this session are over 4 GB. Remove some, then export again.");
      zip.file(`${BUNDLE_MEDIA_DIR}${rel}`, (JSZip.support.blob && typeof FileReader !== "undefined") ? blob : new Uint8Array(await blob.arrayBuffer()), { binary: true });
    } catch (error) {
      if (error instanceof Error && /4 GB/.test(error.message)) throw error;
      missing.push(rel);
    }
  }
  const mediaCount = refs.length - missing.length;
  if (missing.length) {
    session.warnings.push(`${missing.length} file${missing.length === 1 ? " was" : "s were"} not found on this computer and could not be included: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
  }

  const json = JSON.stringify(session, null, 2);
  if (mediaCount === 0) {
    const saved = await saveBytes(`makechurch-easy-dock-session-${stamp}.json`, new Blob([json], { type: "application/json" }), "application/json", "JSON files", "json");
    return {
      session,
      savedPath: saved.status === "saved" ? saved.path : null,
      cancelled: saved.status === "cancelled",
      usedBrowserDownload: saved.status === "download",
      mediaCount: 0,
      mediaBytes: 0,
      missingMedia: missing,
      format: "json",
    };
  }

  zip.file(BUNDLE_SESSION_FILE, json);
  const blob = (JSZip.support.blob && typeof FileReader !== "undefined")
    ? await zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true })
    : new Blob([await zip.generateAsync({ type: "uint8array", compression: "STORE" })], { type: "application/zip" });
  const saved = await saveBytes(`makechurch-easy-session-${stamp}.zip`, blob, "application/zip", "Session bundle", "zip");
  return {
    session,
    savedPath: saved.status === "saved" ? saved.path : null,
    cancelled: saved.status === "cancelled",
    usedBrowserDownload: saved.status === "download",
    mediaCount,
    mediaBytes,
    missingMedia: missing,
    format: "zip",
  };
}

/* ── Import ───────────────────────────────────────────────────────────────── */

async function sameFileExists(rel: string, size: number): Promise<"same" | "different" | "none"> {
  try {
    const response = await fetch(`${overlayBase()}/uploads/${encodeRel(rel)}`, { method: "HEAD", cache: "no-store" });
    if (!response.ok) return "none";
    const length = Number(response.headers.get("content-length"));
    return Number.isFinite(length) && length === size ? "same" : "different";
  } catch {
    return "none";
  }
}

function withSuffix(rel: string): string {
  const slash = rel.lastIndexOf("/");
  const dir = slash >= 0 ? rel.slice(0, slash + 1) : "";
  const name = slash >= 0 ? rel.slice(slash + 1) : rel;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  return `${dir}${stem}-imported-${Date.now().toString(36)}${ext}`;
}

async function restoreMediaFiles(
  zip: JSZip,
  warnings: string[],
): Promise<{ renamed: Map<string, string>; written: number; skippedSame: number; uploadsDir: string; failed: number }> {
  const renamed = new Map<string, string>();
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.startsWith(BUNDLE_MEDIA_DIR));
  const uploadsDir = await uploadsDirectory();
  let written = 0;
  let skippedSame = 0;
  let failed = 0;
  if (entries.length === 0) return { renamed, written, skippedSame, uploadsDir, failed };
  if (!isTauriRuntime() || !uploadsDir) {
    warnings.push("This window cannot save files, so the pictures and videos in the bundle were not copied. Import it in the MakeChurchEazy app.");
    return { renamed, written, skippedSame, uploadsDir, failed: entries.length };
  }

  const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const sep = uploadsDir.includes("\\") ? "\\" : "/";
  for (const entry of entries) {
    const rel = safeRel(entry.name.slice(BUNDLE_MEDIA_DIR.length));
    if (!rel) {
      failed += 1;
      continue;
    }
    try {
      const data = await entry.async("uint8array");
      const state = await sameFileExists(rel, data.byteLength);
      if (state === "same") {
        skippedSame += 1;
        continue;
      }
      const target = state === "different" ? withSuffix(rel) : rel;
      if (target !== rel) renamed.set(rel, target);
      const targetPath = `${uploadsDir}${sep}${target.split("/").join(sep)}`;
      const parent = targetPath.slice(0, targetPath.lastIndexOf(sep));
      if (parent && parent !== uploadsDir) await mkdir(parent, { recursive: true }).catch(() => undefined);
      await writeFile(targetPath, data);
      written += 1;
    } catch (error) {
      console.warn("[Dock] Could not restore", rel, error);
      failed += 1;
    }
  }
  if (failed) warnings.push(`${failed} picture or video file${failed === 1 ? "" : "s"} could not be copied.`);
  return { renamed, written, skippedSame, uploadsDir, failed };
}

/** Point every address and path in the session at this computer's uploads folder. */
function rewriteSession(session: DockSessionExport, renamed: Map<string, string>, uploadsDir: string): DockSessionExport {
  const base = overlayBase();
  const sep = uploadsDir.includes("\\") ? "\\" : "/";
  const finalRel = (rel: string) => renamed.get(rel) ?? rel;
  const rewrite = (text: string): string => {
    if (!text.includes("uploads")) return text;
    if (text.includes("/uploads/") && (text.startsWith("/uploads/") || /https?:\/\//.test(text) || /[("'\s]\/uploads\//.test(text))) {
      return text.replace(URL_REF, (whole, host: string | undefined, raw: string) => {
        const rel = decodeRel(raw);
        if (!rel) return whole;
        return `${host ? base : ""}/uploads/${encodeRel(finalRel(rel))}`;
      });
    }
    const pathMatch = PATH_REF.exec(text.trim());
    if (pathMatch && uploadsDir) {
      const rel = safeRel(pathMatch[2]);
      if (rel) return `${uploadsDir}${sep}${finalRel(rel).split("/").join(sep)}`;
    }
    return text;
  };
  return mapStrings(session, rewrite);
}

export async function importDockSessionAnyFile(
  file: File,
  options: DockSessionApplyOptions = {},
): Promise<DockSessionImportResult> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (!isZip) {
    return applyDockSession(parseDockSessionJSON(await file.text()), options);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(typeof FileReader !== "undefined" ? file : await file.arrayBuffer());
  } catch {
    throw new Error("The selected file is not a valid session bundle.");
  }
  const sessionEntry = zip.file(BUNDLE_SESSION_FILE);
  if (!sessionEntry) throw new Error("This zip file is not a MakeChurchEazy session bundle (session.json is missing).");

  const session = parseDockSessionJSON(await sessionEntry.async("string"));
  const warnings: string[] = [];
  const media = await restoreMediaFiles(zip, warnings);
  const rewritten = media.uploadsDir ? rewriteSession(session, media.renamed, media.uploadsDir) : session;
  const result = await applyDockSession(rewritten, options);
  result.warnings.push(...warnings);
  return result;
}
