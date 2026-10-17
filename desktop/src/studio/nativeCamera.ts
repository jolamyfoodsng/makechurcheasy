/**
 * nativeCamera.ts — the Studio camera opened ONCE by the app itself (Rust), like OBS does.
 *
 * Rust opens the camera and keeps the newest picture. Every window only shows that picture:
 * the Studio draws it for its thumbnail and monitors (a canvas stream, see openNativeStream), and
 * the Program Projector / TV link / OBS source fetch the same pictures from the app's local server.
 * No window opens a camera of its own, so nothing fights over it and nothing is renegotiated.
 *
 * Everything here fails soft: if the native side is missing or says no (for example camera access
 * was not given yet), callers fall back to the old browser camera.
 */
import { studioBaseUrl } from "./studioEngine";

/** A camera on this computer (`index`) or an NDI® source on the network (`ndi`, its full name). */
export interface NativeCameraDevice {
  index?: number;
  ndi?: string;
  name: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const base = await studioBaseUrl();
    const res = await fetch(`${base}${path}`, { cache: "no-store", ...init });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Camera start/stop controls one native device shared by every Studio view. Keep those
// commands in call order so a canceled, older React effect cannot stop a newer selection.
let cameraActionQueue: Promise<void> = Promise.resolve();
function queueCameraAction<T>(action: () => Promise<T>): Promise<T> {
  const next = cameraActionQueue.then(action, action);
  cameraActionQueue = next.then(() => undefined, () => undefined);
  return next;
}

/** True when this build has the native camera. */
export async function nativeCameraAvailable(): Promise<boolean> {
  const status = await call<{ available?: boolean }>("/api/studio-cam/status");
  return Boolean(status?.available);
}

/** The cameras and NDI sources the app can open. `ndiError` says why no NDI source can be listed ("" = NDI works). */
export async function listNativeCameras(): Promise<{ devices: NativeCameraDevice[]; error: string; ndiError: string }> {
  const data = await call<{ devices?: NativeCameraDevice[]; error?: string; ndiError?: string }>("/api/studio-cam/devices");
  return {
    devices: data?.devices ?? [],
    error: data?.error ?? (data ? "" : "The native camera did not answer."),
    ndiError: data?.ndiError ?? "",
  };
}

/** Start a camera on this computer (its index) or an NDI source (`{ ndi: name }`). */
export async function startNativeCamera(source: number | { ndi: string }): Promise<{ ok: boolean; error: string }> {
  return queueCameraAction(async () => {
    const data = await call<{ ok?: boolean; error?: string }>("/api/studio-cam/start", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(typeof source === "number" ? { index: source } : source),
    });
    return { ok: Boolean(data?.ok), error: data?.error ?? (data ? "" : "The native camera did not answer.") };
  });
}

export async function stopNativeCamera(): Promise<void> {
  await queueCameraAction(async () => {
    await call("/api/studio-cam/stop", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  });
}

export async function nativeCameraStatus(): Promise<{ running: boolean; error: string; frames: number } | null> {
  const data = await call<{ running?: boolean; error?: string; frames?: number }>("/api/studio-cam/status");
  return data ? { running: Boolean(data.running), error: data.error ?? "", frames: data.frames ?? 0 } : null;
}

/**
 * After starting: wait until the first native picture exists. Resolves with the reason when the camera
 * could not be opened or no picture arrives, so the caller can fall back to the browser camera
 * instead of showing a black box.
 */
export async function waitNativePictures(timeoutMs = 5000): Promise<{ ok: boolean; error: string }> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const status = await nativeCameraStatus();
    if (!status) return { ok: false, error: "The native camera did not answer." };
    if (status.error) return { ok: false, error: status.error };
    if (status.running && status.frames > 0) return { ok: true, error: "" };
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  return { ok: false, error: "The native camera opened but sent no pictures." };
}

/**
 * Device ids in the Studio: "n:<index>" for a camera and "ndi:<name>" for an NDI source, so they can
 * never be mistaken for a browser camera id. Both are opened by the app itself.
 */
export const nativeId = (index: number): string => `n:${index}`;
export const ndiId = (name: string): string => `ndi:${name}`;
export const isNdiId = (id: string): boolean => id.startsWith("ndi:");
export const ndiName = (id: string): string => id.slice(4);
export const isNativeId = (id: string): boolean => id.startsWith("n:") || isNdiId(id);
/** A listed device as the Studio's camera picker shows it. */
export const nativeOption = (d: NativeCameraDevice): { id: string; label: string } =>
  d.ndi ? { id: ndiId(d.ndi), label: `${d.name} (NDI)` } : { id: nativeId(d.index ?? 0), label: d.name };
/** What to ask the app to open for a Studio device id. */
export const nativeTarget = (id: string): number | { ndi: string } => (isNdiId(id) ? { ndi: ndiName(id) } : nativeIndex(id));
export const nativeIndex = (id: string): number => {
  const n = Number(id.slice(2));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The native pictures as a MediaStream (a canvas that is redrawn from them), so the thumbnail and the
 * monitors in the Studio work exactly as they did with a browser camera. Call close() when done.
 */
export function openNativeStream(onFirstFrame?: () => void): { stream: MediaStream; close: () => void } {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(30);
  let closed = false;
  let seq = 0;
  let first = true;
  void (async () => {
    const base = await studioBaseUrl().catch(() => "");
    while (!closed && base) {
      try {
        const res = await fetch(`${base}/api/studio-camera?since=${seq}`, { cache: "no-store" });
        const next = Number(res.headers.get("X-Frame-Seq") || 0);
        if (res.status === 200) {
          const blob = await res.blob();
          seq = next || seq + 1;
          if (blob.size > 0 && ctx) {
            const bitmap = await createImageBitmap(blob);
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
            }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close?.();
            if (first) { first = false; onFirstFrame?.(); }
          }
          continue;
        }
        if (next) seq = next;
      } catch {
        /* the local server is busy: try again */
      }
      await new Promise((resolve) => window.setTimeout(resolve, 15));
    }
  })();
  return {
    stream,
    close: () => {
      closed = true;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
