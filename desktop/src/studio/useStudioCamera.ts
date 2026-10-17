/**
 * useStudioCamera.ts — the Studio camera: which cameras exist, the chosen one, a small live
 * thumbnail for the operator, and where the camera sits on the screen (sent to the output).
 *
 * Webcams, USB cameras, HDMI capture cards and virtual cameras (phone apps, NDI tools) all show up
 * as system cameras, so they are all listed here. Choosing "Not on the screen" switches the
 * camera off (closes it); any other choice switches it on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { setPreviewCamera, type StudioCameraLayout } from "./studioEngine";
import { isNativeId, isNdiId, listNativeCameras, nativeCameraAvailable, nativeOption, nativeTarget, openNativeStream, startNativeCamera, stopNativeCamera, waitNativePictures } from "./nativeCamera";

export interface StudioCameraDevice {
  id: string;
  label: string;
}

export interface StudioCameraApi {
  devices: StudioCameraDevice[];
  deviceId: string;
  setDeviceId: (id: string) => void;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  layout: StudioCameraLayout;
  setLayout: (layout: StudioCameraLayout) => void;
  /** The app itself opened the camera (like OBS): screens only show its pictures. */
  native: boolean;
  /** Which camera path is in use and why, in plain words (shown under the thumbnail). */
  source: string;
  /** Why no NDI sources can be listed ("" = NDI works, or the app camera is not in use). */
  ndiNote: string;
  /** The operator's thumbnail stream (null while off). */
  stream: MediaStream | null;
  error: string;
  /** The system said no (camera access is off for the app). */
  denied: boolean;
  /** Ask the system for camera access now (call it from a click so the prompt can show). */
  requestAccess: () => Promise<void>;
  refresh: () => Promise<void>;
}

const isDeniedError = (err: unknown): boolean => {
  const name = (err as { name?: string } | null)?.name;
  return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError";
};

/** What went wrong, in plain words. */
function explainCameraError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (isDeniedError(err)) return "Camera access is off for MakeChurchEazy. Press Allow camera, or turn it on in your system settings.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy in another app. Close it there (FaceTime, Zoom, OBS) and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "That camera isn't available. Plug it in, or pick another one.";
  return "Couldn't open the camera. Check the cable and that camera access is on.";
}

/** Open a camera. A saved camera that has gone (ids change) falls back to the default one. */
async function openCamera(deviceId: string): Promise<MediaStream> {
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
    } catch (err) {
      if (isDeniedError(err)) throw err;
      // Stale or unplugged camera: try the system's default one below.
    }
  }
  return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
}

async function listCameras(askPermission: boolean): Promise<{ devices: StudioCameraDevice[]; error: string }> {
  if (!navigator.mediaDevices?.enumerateDevices) return { devices: [], error: "This screen can't use a camera." };
  try {
    let list = await navigator.mediaDevices.enumerateDevices();
    const unnamed = list.some((d) => d.kind === "videoinput" && !d.label);
    if (askPermission && unnamed && navigator.mediaDevices.getUserMedia) {
      // Asking once makes the system show the camera names (and its permission prompt).
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach((t) => t.stop());
      list = await navigator.mediaDevices.enumerateDevices();
    }
    const devices = list
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
    return { devices, error: devices.length ? "" : "No camera found. Plug in a webcam or capture card." };
  } catch {
    return { devices: [], error: "Camera not allowed. Turn on camera access for MakeChurchEazy in your system settings." };
  }
}

/**
 * `keepOpen`: keep the camera open (for the live screen) even when the staged camera is switched
 * off in Preview, so Go Live's camera does not drop while you stage the next thing.
 */
export function useStudioCamera(initial: { deviceId: string; layout: StudioCameraLayout }, keepOpen = false, wordsHidden = false): StudioCameraApi {
  const [devices, setDevices] = useState<StudioCameraDevice[]>([]);
  const [deviceId, setDeviceIdState] = useState(initial.deviceId);
  const [enabled, setEnabledState] = useState(false);
  // The small camera box over the words was removed: it now means "camera + words".
  const [layout, setLayoutState] = useState<StudioCameraLayout>(initial.layout === "in-front" ? "behind-content" : initial.layout);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  // Native: the app opens the camera once; this window only draws its pictures. If the native side is
  // missing or refuses, everything below falls back to the browser camera, as before.
  const [nativeOk, setNativeOk] = useState<boolean | null>(null);
  const useNative = nativeOk === true;
  const nativeRef = useRef(useNative);
  nativeRef.current = useNative;
  const [nativeNote, setNativeNote] = useState("");
  const [ndiNote, setNdiNote] = useState("");
  useEffect(() => {
    let cancelled = false;
    void nativeCameraAvailable().then(async (ok) => {
      if (cancelled) return;
      if (!ok) { setNativeNote("this build has no app camera (rebuild the app)"); setNativeOk(false); return; }
      const list = await listNativeCameras();
      if (cancelled) return;
      setNdiNote(list.ndiError);
      if (list.devices.length === 0) { setNativeNote(list.error || "no cameras listed yet"); setNativeOk(false); return; } // no access yet: the browser camera asks first
      const options = list.devices.map(nativeOption);
      setDevices(options);
      setDeviceIdState((current) => (isNativeId(current) && options.some((d) => d.id === current) ? current : options[0].id));
      setNativeOk(true);
    });
    return () => { cancelled = true; };
  }, [retryTick]);

  const refresh = useCallback(async () => {
    if (nativeOk === true) {
      const list = await listNativeCameras();
      setNdiNote(list.ndiError);
      if (list.devices.length) {
        const options = list.devices.map(nativeOption);
        setDevices(options);
        setError("");
        setDeviceIdState((current) => (isNativeId(current) && options.some((d) => d.id === current) ? current : options[0].id));
        return;
      }
    }
    const result = await listCameras(true);
    setDevices(result.devices);
    setError(result.error);
    setDeviceIdState((current) => (current && result.devices.some((d) => d.id === current) ? current : result.devices[0]?.id ?? ""));
  }, [nativeOk]);

  // Names without asking first (they may be blank until permission is given).
  useEffect(() => {
    if (nativeOk === null || nativeOk === true) return undefined; // the native list is used
    void listCameras(false).then((result) => {
      setDevices(result.devices);
      setDeviceIdState((current) => current || result.devices[0]?.id || "");
    });
    const onChange = () => {
      void listCameras(false).then((result) => {
        setDevices(result.devices);
        setDeviceIdState((current) => {
          if (current && !result.devices.some((d) => d.id === current)) {
            setError("The camera was disconnected. Pick another one, or plug it back in.");
          }
          return current;
        });
      });
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, [nativeOk]);

  // The operator's thumbnail: open while the camera is on (or live), closed when off.
  const wantOpen = enabled || keepOpen;
  useEffect(() => {
    if (nativeOk === null) return undefined; // still finding out whether the app can open the camera itself
    if (nativeOk === true) {
      // The app opens the camera (once). This window just draws the pictures it sends.
      if (!wantOpen) {
        void stopNativeCamera();
        streamRef.current = null;
        setStream(null);
        return undefined;
      }
      let cancelled = false;
      let handle: { stream: MediaStream; close: () => void } | null = null;
      const target = isNativeId(deviceId) ? nativeTarget(deviceId) : 0;
      // An NDI source that fails is a network problem, not a reason to give up on the app camera:
      // say why and stay on the app camera, so the operator can pick another source.
      const ndi = isNdiId(deviceId);
      void startNativeCamera(target).then((started) => {
        // A newer effect now owns the shared native camera. Its queued start/stop command
        // determines the final state; this stale effect must not stop that newer selection.
        if (cancelled) return;
        if (!started.ok && ndi) {
          setError(started.error || "The NDI source could not be opened.");
          return;
        }
        if (!started.ok) {
          // The native side said no: use the browser camera instead (it also asks the system for access).
          setNativeNote(started.error || "could not start");
          setError(started.error);
          setNativeOk(false);
          return;
        }
        // Only trust it once a picture has really arrived; otherwise the thumbnail would just be black.
        return waitNativePictures(ndi ? 12000 : undefined).then((seen) => {
          if (cancelled) return;
          if (!seen.ok && ndi) {
            void stopNativeCamera();
            setError(seen.error);
            return;
          }
          if (!seen.ok) {
            console.warn("[Studio] Native camera gave no picture, using the browser camera:", seen.error);
            void stopNativeCamera();
            setNativeNote(seen.error);
            setError(seen.error);
            setNativeOk(false);
            return;
          }
          handle = openNativeStream();
          streamRef.current = handle.stream;
          setStream(handle.stream);
          setError("");
          setDenied(false);
        });
      });
      return () => {
        cancelled = true;
        handle?.close();
      };
    }
    if (!wantOpen || !navigator.mediaDevices?.getUserMedia) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
      return undefined;
    }
    let cancelled = false;
    openCamera(deviceId)
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = next;
        setStream(next);
        setError("");
        setDenied(false);
        // The default camera was used instead of a saved one that has gone: show the one in use.
        const usedId = next.getVideoTracks()[0]?.getSettings?.().deviceId;
        if (usedId && deviceId && usedId !== deviceId) setDeviceIdState(usedId);
        next.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (streamRef.current === next) {
              setStream(null);
              setError("The camera stopped. Check the cable, then switch it off and on.");
            }
          });
        });
        // Labels become readable once a camera is open.
        void listCameras(false).then((result) => setDevices(result.devices));
      })
      .catch((err) => {
        console.warn("[Studio] Could not open the camera:", err);
        if (!cancelled) {
          setError(explainCameraError(err));
          setDenied(isDeniedError(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wantOpen, deviceId, retryTick, nativeOk]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (nativeRef.current) void stopNativeCamera();
  }, []);

  // The camera you arrange here is what Preview shows. It reaches the screen with Go Live.
  useEffect(() => {
    const label = devices.find((d) => d.id === deviceId)?.label ?? "";
    // Keep visibility explicit and independent of camera layout. If the camera drops, the screen
    // still knows whether text should remain visible or stay hidden.
    void setPreviewCamera({ enabled, deviceId, layout, label, wordsOff: wordsHidden, native: useNative });
  }, [enabled, deviceId, layout, devices, wordsHidden, useNative]);

  // Asks the system for camera access (the system shows its own question the first time).
  const requestAccess = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This screen can't use a camera.");
      return;
    }
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach((t) => t.stop());
      setDenied(false);
      setError("");
      await refresh();
      setRetryTick((tick) => tick + 1);
    } catch (err) {
      console.warn("[Studio] Camera access was not given:", err);
      setError(explainCameraError(err));
      setDenied(isDeniedError(err));
    }
  }, [refresh]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    if (on) void refresh();
  }, [refresh]);

  const setLayout = useCallback((next: StudioCameraLayout) => {
    setLayoutState(next);
    // One simple control: "Not on the screen" switches the camera off, any other choice turns it on.
    setEnabledState(next !== "hidden");
  }, []);

  return { devices, deviceId, setDeviceId: setDeviceIdState, native: useNative, ndiNote: useNative ? ndiNote : "", source: useNative ? "App camera" : `Browser camera${nativeNote ? ` (app camera: ${nativeNote})` : ""}`, enabled, setEnabled, layout, setLayout, stream, error, denied, requestAccess, refresh };
}
