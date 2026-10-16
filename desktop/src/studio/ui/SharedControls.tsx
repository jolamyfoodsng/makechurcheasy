/**
 * SharedControls.tsx — the Camera card, under the "Show Bible / Text" card.
 *
 * The camera and the words work on their own and share one screen:
 *   Camera  which camera, and Show Camera / Hide Camera. Switching it never touches the words.
 *   Words   (the card above) on / off.
 * Nothing goes on the screen until Send to Screen (or Straight to screen is on).
 */
import { useEffect, useRef } from "react";
import { CameraOff, Video } from "lucide-react";
import type { StudioCameraApi } from "../useStudioCamera";

interface CameraCardProps {
  camera: StudioCameraApi;
  /** A hint when the camera sits behind a full-screen theme (an opaque background hides it). */
  cameraHint: string;
  /** Words are on: the camera sits behind them. */
  wordsOn: boolean;
  /** Camera on / off. (The words are not touched.) */
  onCamera: (on: boolean) => void;
  /** Show the Show / Hide button. Off when the "What's on the screen" picker turns the camera on and off. */
  showToggle?: boolean;
}

/** Opens the system's Camera privacy page (Mac and Windows). */
async function openCameraSettings(): Promise<void> {
  const mac = /Mac/i.test(navigator.userAgent);
  const url = mac ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera" : "ms-settings:privacy-webcam";
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch (err) {
    console.warn("[Studio] Could not open the camera settings:", err);
  }
}

/** The small live picture of the chosen camera. */
function Preview({ stream, on }: { stream: MediaStream | null; on: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);
  return (
    <div className="st-cam__thumb st-cm__prev" aria-hidden="true">
      {stream && on ? <video ref={ref} muted playsInline /> : <CameraOff size={16} />}
    </div>
  );
}

export default function SharedControls(props: CameraCardProps) {
  const { camera } = props;
  const cameraOn = camera.enabled && camera.layout !== "hidden";
  const showHint = Boolean(props.cameraHint) && cameraOn && props.wordsOn;

  return (
    <section className="st-lo__mini st-camcard" aria-label="Camera">
      <div className="st-lo__minihead">
        <strong>Camera</strong>
        <Preview stream={camera.stream} on={cameraOn} />
      </div>
      <div className="st-cm__row">
        <select
          className="st-lay__dev st-cm__sel"
          value={camera.deviceId}
          onChange={(e) => camera.setDeviceId(e.target.value)}
          disabled={camera.devices.length === 0}
          aria-label="Which camera"
          title="Which camera"
        >
          {camera.devices.length === 0 && <option value="">No camera found</option>}
          {camera.devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        {props.showToggle !== false && <button
          type="button"
          className={`st-cm__btn st-cm__toggle${cameraOn ? " is-on" : " is-off"}`}
          onClick={() => props.onCamera(!cameraOn)}
          aria-pressed={cameraOn}
          title={cameraOn ? "Hide Camera: take the camera off the screen. The words stay as they are." : "Show Camera: put the camera on the screen. The words stay as they are."}
        >
          {cameraOn ? <CameraOff size={16} /> : <Video size={16} />} <span>{cameraOn ? "Hide" : "Show"}</span>
        </button>}
      </div>
      {!cameraOn && !camera.error && <p className="st-lay__help">{props.showToggle === false ? "Pick Camera above to show it." : "Choose a camera to show on screen."}</p>}
      {camera.error && (
        <div className="st-lay__err" role="status">
          <span>{camera.error}</span>
          <span className="st-lay__errbtns">
            <button type="button" className="st-lay__btn st-lay__btn--main" onClick={() => void camera.requestAccess()}>Allow camera</button>
            {camera.denied && <button type="button" className="st-lay__btn" onClick={() => void openCameraSettings()}>Open camera settings</button>}
          </span>
        </div>
      )}
      {showHint && <p className="st-lay__help st-lay__help--warn" role="status">{props.cameraHint}</p>}
    </section>
  );
}
