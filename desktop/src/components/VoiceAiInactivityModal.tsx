/**
 * VoiceAiInactivityModal — the "Are you still using Voice AI?" prompt, shown on
 * every page of the app (the Speech to Scripture page shows its own copy).
 * Yes keeps listening; No, or letting the countdown run out, stops it.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Clock } from "./icons/NativeIcons";

type Prompt = { active: boolean; remainingSeconds: number; intervalMinutes: number } | null;

export function VoiceAiInactivityModal() {
  const [prompt, setPrompt] = useState<Prompt>(null);
  const location = useLocation();

  useEffect(() => {
    const onPrompt = (event: Event) => setPrompt((event as CustomEvent<Prompt>).detail ?? null);
    window.addEventListener("mce:voice-ai-inactivity", onPrompt);
    return () => window.removeEventListener("mce:voice-ai-inactivity", onPrompt);
  }, []);

  if (!prompt?.active) return null;
  if (location.pathname.includes("speech-to-scripture")) return null;

  const keepListening = async () => {
    setPrompt(null);
    const { lmDockService } = await import("../services/lmDockService");
    lmDockService.confirmStillUsing();
  };
  const stop = async () => {
    setPrompt(null);
    const { lmDockService } = await import("../services/lmDockService");
    lmDockService.stopDueToInactivity();
  };

  return (
    <div className="sts3-modal-overlay" style={{ zIndex: 10000 }}>
      <div className="sts3-modal sts3-modal--small" role="alertdialog" aria-live="assertive">
        <div className="sts3-modal-header" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Clock size={20} style={{ color: "var(--warning)" }} />
          <h3 className="sts3-modal-title">Are you still using Voice AI?</h3>
        </div>
        <div className="sts3-modal-body">
          <p className="sts3-modal-text">
            No speech detected for {prompt.intervalMinutes} minutes. Voice AI will stop in{" "}
            <strong>{prompt.remainingSeconds}s</strong> unless you keep it on.
          </p>
        </div>
        <div className="sts3-modal-footer">
          <button className="sts3-modal-btn sts3-modal-btn--ghost" onClick={stop}>
            No, stop
          </button>
          <button className="sts3-modal-btn sts3-modal-btn--primary" onClick={keepListening} autoFocus>
            Yes, keep listening
          </button>
        </div>
      </div>
    </div>
  );
}
