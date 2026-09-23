import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  hideMakeChatGptWindow,
  openMainMakeChurchEasyWindow,
  resizeMakeChatGptContextMenuWindow,
} from "../services/makeChatGptWindow";
import {
  loadVoiceBibleDockState,
  VOICE_BIBLE_STATUS_EVENT_NAME,
} from "../services/voiceBibleDockInterop";
import type { VoiceBibleSnapshot } from "../services/voiceBibleTypes";
import { hasTauriInvoke, safeTauriListen } from "../services/tauriSafe";
import { updateSettings } from "../multiview/mvStore";
import "./makeChatGPT.css";

export default function MakeChatGPTFloating() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
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
    if (!hasTauriInvoke() || event.button !== 0) return;
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

  useEffect(() => {
    if (!contextMenuOpen) return;
    const closeMenu = () => setContextMenuOpen(false);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("blur", closeMenu);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("blur", closeMenu);
    };
  }, [contextMenuOpen]);

  useEffect(() => {
    void resizeMakeChatGptContextMenuWindow(contextMenuOpen).catch(() => undefined);
  }, [contextMenuOpen]);

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuOpen(true);
  };

  const handleOpen = () => {
    setContextMenuOpen(false);
    void openMainMakeChurchEasyWindow();
  };

  const handleHide = () => {
    setContextMenuOpen(false);
    // Persist the preference so the icon stays hidden across app restarts
    updateSettings({ hideFloatingIcon: true });
    void hideMakeChatGptWindow();
  };

  return (
    <div className="makechatgpt-floating-shell">
      <button
        type="button"
        className={`makechatgpt-pet${isTranscribing ? " makechatgpt-pet--transcribing" : ""}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
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
      {contextMenuOpen && (
        <div
          className="makechatgpt-context-menu"
          role="menu"
          aria-label="MakeChurchEasy floating icon menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={handleOpen}>Open MakeChurchEasy</button>
          <button type="button" role="menuitem" onClick={handleHide}>Hide icon</button>
        </div>
      )}
    </div>
  );
}
