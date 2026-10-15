/**
 * useCameraRelay.ts — sends the live camera to the screen windows.
 *
 * The Studio already has the camera open. A second window (the projector, the TV or phone link,
 * OBS) often can't open the same camera, so instead the Studio sends it a small picture about ten
 * times a second through the app's own local server. The screen windows show those pictures.
 *
 * This is the BACKUP: the screen windows prefer the live video link (useCameraLink). While no window
 * is asking for pictures the Studio sends only one a second, so it costs almost nothing.
 */
import { useEffect } from "react";
import { studioBaseUrl } from "./studioEngine";

/** What happened to the last picture sent (the Output menu shows this so a failure is not silent). */
export const cameraRelayStatus: { ok: boolean; text: string; at: number } = { ok: false, text: "not started", at: 0 };

const FRAME_MS = 100; // ~10 pictures a second
const MAX_WIDTH = 1280;
const QUALITY = 0.78;

export function useCameraRelay(stream: MediaStream | null, active: boolean): void {
  useEffect(() => {
    if (!active || !stream) return undefined;
    let stopped = false;
    let busy = false;
    let wanted = true; // a window is asking for pictures
    let lastSentAt = 0;
    let url = "";
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    // Some webviews only decode a camera picture for a video that is on the page, so it sits there
    // invisible (1 pixel, see-through, not clickable).
    video.setAttribute("aria-hidden", "true");
    video.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
    document.body.appendChild(video);
    void video.play().catch(() => undefined);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const send = async (body: Blob | string) => {
      if (!url) url = `${await studioBaseUrl()}/api/studio-camera`;
      let res: Response;
      try {
        res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body });
      } catch {
        cameraRelayStatus.ok = false;
        cameraRelayStatus.text = "the app's local server did not answer";
        cameraRelayStatus.at = Date.now();
        throw new Error("no answer");
      }
      cameraRelayStatus.ok = res.ok;
      cameraRelayStatus.text = res.ok ? "sending" : res.status === 404 ? "this version of the app can't take the camera (restart it)" : `the app refused it (HTTP ${res.status})`;
      cameraRelayStatus.at = Date.now();
      try {
        const info = (await res.json()) as { wanted?: boolean };
        wanted = info.wanted !== false;
      } catch {
        wanted = true;
      }
    };

    const tick = () => {
      if (stopped || busy || !ctx) return;
      if (video.readyState < 2 || !video.videoWidth) return;
      const now = Date.now();
      if (!wanted && now - lastSentAt < 1000) return;
      lastSentAt = now;
      busy = true;
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob || stopped) {
            busy = false;
            return;
          }
          send(blob)
            .catch(() => undefined)
            .finally(() => {
              busy = false;
            });
        },
        "image/jpeg",
        QUALITY,
      );
    };

    const timer = window.setInterval(tick, FRAME_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      video.srcObject = null;
      video.remove();
      // An empty picture tells the screen windows the camera is off.
      void send("").catch(() => undefined);
    };
  }, [stream, active]);
}
