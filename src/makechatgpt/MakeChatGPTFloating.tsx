import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openMainMakeChurchEasyWindow } from "../services/makeChatGptWindow";
import {
  loadVoiceBibleDockState,
  VOICE_BIBLE_STATUS_EVENT_NAME,
} from "../services/voiceBibleDockInterop";
import type { VoiceBibleSnapshot } from "../services/voiceBibleTypes";
import { hasTauriInvoke, safeTauriListen } from "../services/tauriSafe";
import "./makeChatGPT.css";

export default function MakeChatGPTFloating() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    timer: number | null;
    started: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;

    const applySnapshot = (snapshot: VoiceBibleSnapshot | null | undefined) => {
      if (!mounted || !snapshot) return;
      setIsTranscribing(
        snapshot.status === "listening" ||
        snapshot.status === "transcribing" ||
        snapshot.status === "matching",
      );
    };

    void loadVoiceBibleDockState()
      .then((state) => applySnapshot(state?.snapshot))
      .catch(() => undefined);

    if (hasTauriInvoke()) {
      void safeTauriListen<VoiceBibleSnapshot>(VOICE_BIBLE_STATUS_EVENT_NAME, (event) => {
        applySnapshot(event.payload);
      }).then((removeListener) => {
        if (mounted) unlisten = removeListener;
        else removeListener();
      }).catch(() => undefined);
    }

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  const beginNativeDrag = () => {
    if (!hasTauriInvoke()) return;
    const dragState = dragStateRef.current;
    if (dragState?.started) return;
    if (dragState) dragState.started = true;
    suppressClickRef.current = true;
    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!hasTauriInvoke()) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: null as number | null,
      started: false,
    };
    dragState.timer = window.setTimeout(() => {
      if (dragStateRef.current === dragState) beginNativeDrag();
    }, 180);
    dragStateRef.current = dragState;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 6;
    if (!moved) return;
    if (dragState.timer !== null) window.clearTimeout(dragState.timer);
    dragState.timer = null;
    beginNativeDrag();
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    if (dragState.timer !== null) window.clearTimeout(dragState.timer);
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    void openMainMakeChurchEasyWindow();
  };

  return (
    <button
      type="button"
      className={`makechatgpt-pet${isTranscribing ? " makechatgpt-pet--transcribing" : ""}`}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label={isTranscribing ? "Open MakeChurchEasy — transcription active" : "Open MakeChurchEasy"}
      title={isTranscribing ? "MakeChurchEasy — transcription active" : "Open MakeChurchEasy"}
    >
      <img
        className="makechatgpt-pet__icon"
        src={isTranscribing ? "/app_icons/app_icon_mic_connected_but_obs_not_connected.jpeg" : "/app_icons/app_icon_general.png"}
        alt=""
        draggable={false}
      />
    </button>
  );
}
