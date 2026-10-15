/**
 * studioPrefs.ts — Studio choices that must survive a refresh, a restart and a new computer.
 *
 * Browser storage can be cleared or fill up, so the logo picked in Studio settings is written as a real file in
 * the app's uploads folder (studio-logo.png) together with a small studio-prefs.json that says which logo is in
 * use. Studio reads that file back on start, and the cloud backup carries the logo picture too.
 */
const LOGO_FILE = "studio-logo.png";
const PREFS_FILE = "studio-prefs.json";

export interface StudioPrefs {
  /** "" = use the church logo; otherwise the file name in uploads. */
  logoFile?: string;
  /** Changes whenever the logo picture changes, so screens do not show a cached older one. */
  logoVersion?: number;
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) return null;
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function saveUpload(fileName: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke<string>("save_upload_file", { fileName, fileData: Array.from(bytes) });
    return true;
  } catch {
    return false;
  }
}

export function studioLogoUrl(version?: number): string {
  return `/uploads/${LOGO_FILE}?v=${version ?? 0}`;
}

export async function readStudioPrefs(base: string): Promise<StudioPrefs | null> {
  if (!base) return null;
  try {
    const res = await fetch(`${base}/uploads/${PREFS_FILE}?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const raw = (await res.json()) as StudioPrefs;
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

export async function writeStudioPrefs(prefs: StudioPrefs): Promise<boolean> {
  return saveUpload(PREFS_FILE, new TextEncoder().encode(JSON.stringify(prefs)));
}

/** Saves the picture and the prefs file. Returns the logo address to use, or null if it could not be written. */
export async function saveStudioLogo(dataUrl: string): Promise<string | null> {
  const bytes = dataUrlToBytes(dataUrl);
  if (!bytes) return null;
  if (!(await saveUpload(LOGO_FILE, bytes))) return null;
  const version = Date.now();
  if (!(await writeStudioPrefs({ logoFile: LOGO_FILE, logoVersion: version }))) return null;
  return studioLogoUrl(version);
}

/** Back to the church logo (the file stays, the prefs file says it is not in use). */
export async function clearStudioLogo(): Promise<void> {
  await writeStudioPrefs({ logoFile: "", logoVersion: Date.now() });
}

/** The logo picture as a data URL for the cloud backup, or "" when the church logo is in use. */
export async function readStudioLogoForBackup(base: string): Promise<string> {
  const prefs = await readStudioPrefs(base);
  if (!prefs?.logoFile) return "";
  try {
    const res = await fetch(`${base}/uploads/${prefs.logoFile}?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return "";
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}
