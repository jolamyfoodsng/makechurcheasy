/**
 * SpeechToScripturePage.tsx — Three-column speech-to-Bible lookup.
 *
 * Left:  Live transcript feed
 * Center: Verse matching engine (top match + candidate table)
 * Right: Detected references
 *
 * Captures mic audio, streams to AssemblyAI, matches Bible verses,
 * and sends results to OBS via BroadcastChannel.
 */

import {
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  Copy,
  Download,
  Link,
  Mic,
  Radio,
  StopCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { bibleObsService } from "../bible/bibleObsService";
import type { BibleSlide } from "../bible/types";
import CreditsDisplay from "../components/CreditsDisplay";
import { useAuth } from "../contexts/AuthContext";
import { track } from "../services/analytics";
import { getDeviceId } from "../services/authService";
import { calculateTranscriptionCredits, deductCreditsWithSync } from "../services/credits";
import { checkEntitlement } from "../services/entitlementClient";
import { getEffectivePlan } from "../services/licenseService";
import { lmDockService, type LmDockSnapshot } from "../services/lmDockService";
import { obsService } from "../services/obsService";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import { loadData } from "../services/store";
import { trackVoiceSessionCompleted, trackVoiceSessionStarted } from "../services/tracking";
import type { VoiceBibleCandidate } from "../services/voiceBibleTypes";
import { MATCH_SOURCE_LABEL } from "../services/voiceBibleTypes";
import { isWhisperReady, loadWhisperModel } from "../services/whisperService";
import { createTranscript, saveTranscript } from "../transcripts/transcriptService";

// ── Connectivity hook ──
function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("https://www.gstatic.com/generate_204", {
          method: "HEAD",
          mode: "no-cors",
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        if (!cancelled) setIsOnline(res.ok || res.type === "opaque");
      } catch {
        if (!cancelled) setIsOnline(false);
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return isOnline;
}

// ── Helpers ──
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(" : ");
}

function formatTimerDisplay(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")} : ${String(m).padStart(2, "0")} : ${String(s).padStart(2, "0")}`;
}

function formatTimestamp(entry: { startTime?: number }, elapsed: number): string {
  // If entry has a valid startTime from audio stream, use it;
  // otherwise fall back to elapsed time since listening started
  const seconds = entry.startTime != null && entry.startTime > 0 ? entry.startTime : elapsed;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function SpeechToScripturePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const effectivePlan = getEffectivePlan(user);

  // ── LM state ──
  const [snapshot, setSnapshot] = useState<LmDockSnapshot>(lmDockService.getSnapshot());
  const [mics, setMics] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [micLoading, setMicLoading] = useState(false);
  const [micDropdownOpen, setMicDropdownOpen] = useState(false);
  const micDropdownRef = useRef<HTMLDivElement>(null);
  const listeningStartedAt = useRef<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLine = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  }, []);

  // ── Copy Dock URL ──
  const [dockCopied, setDockCopied] = useState(false);

  const handleCopyDockUrl = useCallback(() => {
    const isDev =
      window.location.protocol === "http:" && window.location.port === "1420";
    const base = isDev ? window.location.origin : getOverlayBaseUrlSync();
    const deviceId = getDeviceId();
    const deviceIdParam = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
    const url = (isDev ? `${base}/lm-dock` : `${base}/lm-dock.html`) + deviceIdParam;
    void navigator.clipboard.writeText(url).then(() => {
      setDockCopied(true);
      setTimeout(() => setDockCopied(false), 2000);
    });
  }, []);

  // ── OBS ──
  const [obsConnected, setObsConnected] = useState(obsService.status === "connected");

  useEffect(() => {
    const unsub = obsService.onStatusChange((s) => setObsConnected(s === "connected"));
    return unsub;
  }, []);

  // ── Subscribe to lmDockService ──
  useEffect(() => {
    return lmDockService.subscribe(setSnapshot);
  }, []);

  // ── Enumerate mics ──
  const enumerateMics = useCallback(async () => {
    setMicLoading(true);
    try {
      const devices = await lmDockService.getMics();
      setMics(devices);
      if (devices.length > 0 && !selectedMic) {
        setSelectedMic(devices[0].id);
      }
    } catch (err) {
      console.warn("[SpeechToScripture] Failed to enumerate mics:", err);
    } finally {
      setMicLoading(false);
    }
  }, [selectedMic]);

  useEffect(() => {
    void enumerateMics();
  }, []);

  // Close mic dropdown on outside click
  useEffect(() => {
    if (!micDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (micDropdownRef.current && !micDropdownRef.current.contains(e.target as Node)) {
        setMicDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [micDropdownOpen]);

  // ── Connectivity & service states ──
  const isOnline = useOnlineStatus();
  const isOffline = !isOnline;

  // ── Start / Stop ──
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [generatedTranscriptId, setGeneratedTranscriptId] = useState<string | null>(null);

  const handleStart = useCallback(() => {
    track("sts_listening_started", { mic: selectedMic || "default" });
    trackVoiceSessionStarted();
    void lmDockService.startListening(selectedMic || undefined);
  }, [selectedMic]);

  const handleStop = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  const confirmStop = useCallback(async () => {
    const { allowed } = await checkEntitlement("speechToScripture", effectivePlan);
    if (!allowed) return;

    track("sts_listening_stopped", { durationSec: elapsedRef.current });
    trackVoiceSessionCompleted(Math.round(elapsedRef.current));

    const serviceFailed = snapshot.status === "error";

    // ── Persist transcript to library before clearing session ──
    const finalized = snapshot.entries.filter((e) => e.finalized);
    if (finalized.length > 0) {
      const text = finalized.map((e, idx) => {
        // Estimate per-entry elapsed time for entries without startTime
        const prevWords = finalized.slice(0, idx).reduce((n, pe) => n + pe.text.split(/\s+/).length, 0);
        const fallbackTime = prevWords * 0.4;
        return `${formatTimestamp(e, fallbackTime)}\t${e.text}`;
      }).join("\n");
      const detectedScriptures = [
        ...snapshot.queue.map((c) => ({
          id: `sc-${c.book}-${c.chapter}-${c.verse}`,
          transcriptId: "",
          reference: c.label,
          verseText: c.snippet,
          confidence: c.confidence,
        })),
        ...snapshot.suggestions
          .filter(s => !snapshot.queue.some(q => q.book === s.book && q.chapter === s.chapter && q.verse === s.verse))
          .map((c) => ({
            id: `sc-${c.book}-${c.chapter}-${c.verse}`,
            transcriptId: "",
            reference: c.label,
            verseText: c.snippet,
            confidence: c.confidence,
          })),
      ];
      const durationSec = elapsedRef.current;
      const title = new Date().toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      }) + " — " + (durationSec >= 60
        ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
        : `${durationSec}s`);
      loadData().then((appData) => {
        const transcript = createTranscript({
          title,
          church: appData.churchName || "",
          language: "English",
          durationSeconds: durationSec,
          transcriptText: text,
          sourceType: "transcription",
          scriptures: detectedScriptures,
        });
        void saveTranscript(transcript).then((result) => {
          if (result.ok) {
            setSaveToast("Transcript saved");
          } else {
            setSaveToast("Saved locally — cloud sync failed");
          }
          setTimeout(() => setSaveToast(null), 3000);
        });
        setGeneratedTranscriptId(transcript.id);
        setTimeout(() => setGeneratedTranscriptId(null), 6000);
        // Deduct transcription credits (1 credit per minute) — synced to MongoDB
        // Skip if the transcription service failed
        void (async () => {
          try {
            const creditsNeeded = await calculateTranscriptionCredits(durationSec);
            if (creditsNeeded > 0 && user?.id && !serviceFailed) {
              const ok = await deductCreditsWithSync(user.id, creditsNeeded, "transcription", `Transcription: ${Math.round(durationSec)}s audio`);
              if (!ok) {
                setSaveToast("Credit deduction failed — insufficient credits");
                setTimeout(() => setSaveToast(null), 4000);
              }
            }
          } catch (err) {
            console.warn("[Credits] Transcription credit deduction error:", err);
            setSaveToast("Credit sync failed — check connection");
            setTimeout(() => setSaveToast(null), 4000);
          }
        })();
      }).catch(() => {
        // Best-effort — don't block stop on save failure
      });
    }

    lmDockService.stopListening();
    setShowStopConfirm(false);
  }, [effectivePlan, snapshot.entries, snapshot.queue, snapshot.suggestions]);

  const isListening = snapshot.status === "listening";
  const isConnecting = snapshot.status === "requesting-mic" || snapshot.status === "connecting";
  const isTranscribing = isListening || isConnecting;
  const levelPercent = Math.round(snapshot.inputLevel * 100);

  // Track wall-clock time when listening starts for timestamp display
  useEffect(() => {
    if (isListening) {
      listeningStartedAt.current = Date.now();
    }
  }, [isListening]);

  // ── Guard: warn before closing app while transcribing ──
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    if (!isTranscribing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isTranscribing]);

  const confirmLeave = useCallback(async () => {
    const { allowed } = await checkEntitlement("speechToScripture", effectivePlan);
    if (!allowed) return;

    const serviceFailed = snapshot.status === "error";

    // ── Persist transcript before navigating away ──
    const finalized = snapshot.entries.filter((e) => e.finalized);
    if (finalized.length > 0) {
      const text = finalized.map((e, idx) => {
        const prevWords = finalized.slice(0, idx).reduce((n, pe) => n + pe.text.split(/\s+/).length, 0);
        const fallbackTime = prevWords * 0.4;
        return `${formatTimestamp(e, fallbackTime)}\t${e.text}`;
      }).join("\n");
      const detectedScriptures = [
        ...snapshot.queue.map((c) => ({
          id: `sc-${c.book}-${c.chapter}-${c.verse}`,
          transcriptId: "",
          reference: c.label,
          verseText: c.snippet,
          confidence: c.confidence,
        })),
        ...snapshot.suggestions
          .filter(s => !snapshot.queue.some(q => q.book === s.book && q.chapter === s.chapter && q.verse === s.verse))
          .map((c) => ({
            id: `sc-${c.book}-${c.chapter}-${c.verse}`,
            transcriptId: "",
            reference: c.label,
            verseText: c.snippet,
            confidence: c.confidence,
          })),
      ];
      const durationSec = elapsedRef.current;
      const title = new Date().toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      }) + " — " + (durationSec >= 60
        ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
        : `${durationSec}s`);
      loadData().then((appData) => {
        const transcript = createTranscript({
          title,
          church: appData.churchName || "",
          language: "English",
          durationSeconds: durationSec,
          transcriptText: text,
          sourceType: "transcription",
          scriptures: detectedScriptures,
        });
        void saveTranscript(transcript).then((result) => {
          if (!result.ok) {
            console.warn("[Transcript] Cloud save failed during leave:", result.error);
          }
        });
        // Deduct transcription credits (1 credit per minute) — synced to MongoDB
        // Skip if the transcription service failed
        void (async () => {
          try {
            const creditsNeeded = await calculateTranscriptionCredits(durationSec);
            if (creditsNeeded > 0 && user?.id && !serviceFailed) {
              const ok = await deductCreditsWithSync(user.id, creditsNeeded, "transcription", `Transcription: ${Math.round(durationSec)}s audio`);
              if (!ok) {
                setSaveToast("Credit deduction failed — insufficient credits");
                setTimeout(() => setSaveToast(null), 4000);
              }
            }
          } catch (err) {
            console.warn("[Credits] Transcription credit deduction error:", err);
            setSaveToast("Credit sync failed — check connection");
            setTimeout(() => setSaveToast(null), 4000);
          }
        })();
      }).catch(() => { });
    }

    lmDockService.stopListening();
    setShowLeaveConfirm(false);
    navigate("/");
  }, [effectivePlan, navigate, snapshot.entries, snapshot.queue, snapshot.suggestions]);

  const cancelLeave = useCallback(() => {
    setShowLeaveConfirm(false);
  }, []);

  // ── Timer ──
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  useEffect(() => {
    if (isListening) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isListening]);

  // ── Selected candidate (overrides auto top-match when set) ──
  const [selectedCandidate, setSelectedCandidate] = useState<VoiceBibleCandidate | null>(null);

  // ── Push verse to OBS ──
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const handlePushVerse = useCallback(async (candidate: VoiceBibleCandidate) => {
    if (!obsConnected) {
      setPushError("Not connected to broadcast");
      return;
    }
    setPushing(true);
    setPushError(null);
    setPushSuccess(null);
    try {
      const slide: BibleSlide = {
        id: `speech-${candidate.book}-${candidate.chapter}-${candidate.verse}`,
        text: candidate.snippet || `${candidate.book} ${candidate.chapter}:${candidate.verse}`,
        reference: `${candidate.label} (${candidate.translation})`,
        verseRange: String(candidate.verse),
        index: 0,
        total: 1,
      };
      await bibleObsService.pushSlide(slide, null, true, false, "fullscreen");
      track("sts_push_to_live", { reference: candidate.label, confidence: candidate.confidence });
      setPushSuccess(`Pushed ${candidate.label} to broadcast`);
      setTimeout(() => setPushSuccess(null), 3000);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  }, [obsConnected]);

  // ── Transcript search ──
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  const [whisperStatus, setWhisperStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [assemblyAIError, setAssemblyAIError] = useState(false);
  const [wasListening, setWasListening] = useState(false);
  const [connectionLostBanner, setConnectionLostBanner] = useState(false);

  useEffect(() => {
    if (isListening) {
      setWasListening(true);
    }
  }, [isListening]);

  useEffect(() => {
    if (wasListening && isOffline && isListening) {
      setConnectionLostBanner(true);
    }
    if (isOnline) {
      setConnectionLostBanner(false);
      setWasListening(false);
    }
  }, [isOffline, isListening, isOnline, wasListening]);

  // Pre-load Whisper model when offline
  useEffect(() => {
    if (isOffline && !isWhisperReady()) {
      setWhisperStatus("loading");
      loadWhisperModel({
        onStatus: (status) => setWhisperStatus(status),
      }).then((ok) => {
        if (ok) setWhisperStatus("ready");
      });
    }
  }, [isOffline]);

  // Track AssemblyAI errors
  useEffect(() => {
    if (snapshot.status === "error" && isOnline) {
      setAssemblyAIError(true);
    }
    if (snapshot.status === "listening" || snapshot.status === "connecting") {
      setAssemblyAIError(false);
    }
  }, [snapshot.status, isOnline]);

  // ── Auto-scroll transcript ──
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [snapshot.entries]);

  // ── Copy / Download transcript ──
  const finalizedEntries = snapshot.entries.filter((e) => e.finalized);
  const fullTranscript = finalizedEntries.map((e) => e.text).join("\n");
  const [copyToast, setCopyToast] = useState(false);

  const handleCopyTranscript = useCallback(() => {
    if (!fullTranscript) return;
    void navigator.clipboard.writeText(fullTranscript);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  }, [fullTranscript]);

  // ── Download workflow ──
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<"txt" | "srt">("txt");
  const [downloading, setDownloading] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const formatSrtTime = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  }, []);

  const generateSrt = useCallback((entries: typeof finalizedEntries): string => {
    let blockIndex = 1;
    const blocks: string[] = [];
    let fallbackTime = 0;

    for (const entry of entries) {
      const start = entry.startTime ?? fallbackTime;
      const end = entry.endTime ?? (start + Math.max(entry.text.split(/\s+/).length * 0.4, 1.5));
      blocks.push(
        `${blockIndex}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${entry.text}\n`,
      );
      fallbackTime = end + 0.1;
      blockIndex++;
    }

    return blocks.join("\n");
  }, [formatSrtTime]);

  const handleDownloadConfirm = useCallback(async () => {
    if (finalizedEntries.length === 0) return;
    setDownloading(true);
    await new Promise((r) => setTimeout(r, 50));

    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      let content: string;
      let mimeType: string;
      let ext: string;

      if (downloadFormat === "srt") {
        content = generateSrt(finalizedEntries);
        mimeType = "application/x-subrip";
        ext = "srt";
      } else {
        content = fullTranscript;
        mimeType = "text/plain";
        ext = "txt";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcript-${ts}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      setDownloadModalOpen(false);
      setDownloadToast(`Transcript downloaded (${ext.toUpperCase()})`);
      setTimeout(() => setDownloadToast(null), 3000);
    } catch {
      setDownloadToast("Failed to download transcript");
      setTimeout(() => setDownloadToast(null), 3000);
    } finally {
      setDownloading(false);
    }
  }, [finalizedEntries, downloadFormat, fullTranscript, generateSrt]);

  // ── Top match: selected candidate or first suggestion (auto) ──
  const topMatch = useMemo(() => {
    if (selectedCandidate) return selectedCandidate;
    // Only use suggestions — never queue items.
    if (snapshot.suggestions.length > 0) return snapshot.suggestions[0];
    return null;
  }, [selectedCandidate, snapshot.suggestions]);

  // ── Clear manual selection when new suggestions arrive ──
  useEffect(() => {
    if (snapshot.suggestions.length > 0) setSelectedCandidate(null);
  }, [snapshot.suggestions]);

  // ── Candidate matches: ONLY suggestions (quote search results) ──
  const candidateMatches = useMemo(() => {
    // CRITICAL: This must ONLY use suggestions, not queue.
    // Queue contains detected references (Hebrews 2:7, John 7:5, etc.)
    // that persist across searches. Mixing them into candidateMatches
    // causes stale references to appear after a new quote search.
    //
    // Suggestions are fully replaced on each quote search — this is
    // the intended behavior for a stateless live search panel.

    const results = [...snapshot.suggestions];

    return results;
  }, [snapshot.suggestions]);

  // ── Copy verse ──
  const [verseCopied, setVerseCopied] = useState(false);

  const handleCopyVerse = useCallback(() => {
    if (!topMatch) return;
    const text = `${topMatch.label}\n${topMatch.snippet}`;
    navigator.clipboard.writeText(text).then(() => {
      setVerseCopied(true);
      setTimeout(() => setVerseCopied(false), 2000);
    });
  }, [topMatch]);

  // ── Detected references: only direct references (queue items) ──
  const detectedRefs = useMemo(() => {
    return snapshot.queue.map((c) => ({
      label: c.label,
      candidate: c,
    }));
  }, [snapshot.queue]);

  // ── Filter transcript entries by search ──
  const filteredEntries = useMemo(() => {
    if (!transcriptSearch.trim()) return snapshot.entries;
    const q = transcriptSearch.toLowerCase();
    return snapshot.entries.filter((e) => e.text.toLowerCase().includes(q));
  }, [snapshot.entries, transcriptSearch]);

  // ── Scripture engine active ──
  const _scriptureActive = isListening || snapshot.suggestions.length > 0 || snapshot.queue.length > 0;
  void _scriptureActive;

  const isBroadcastConnected = obsConnected;

  return (
    <div className="sts3-root">
      {/* ── Header ── */}
      <header className="sts3-header">
        <div className="sts3-header-left">
          <div className="sts3-logo-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
          </div>
          <div>
            <div className="sts3-header-title">Live Transcription &amp; Scripture Detection</div>
            <div className="sts3-header-sub">Real-time speech to scripture detection</div>
          </div>
        </div>
        <CreditsDisplay userId={user?.id} sessionCreditsUsed={isListening ? Math.ceil(elapsed / 60) : 0} />
        <div className="sts3-header-right">
          <button
            className="sts3-btn sts3-btn--dock"
            onClick={handleCopyDockUrl}
          >
            <Link size={14} />
            {dockCopied ? "Copied!" : "Copy to Dock"}
          </button>
          <div className="sts3-header-mic-group">
            <button
              className={`sts3-btn ${isListening ? "sts3-btn--red" : ""}`}
              onClick={isListening ? handleStop : handleStart}
              disabled={isConnecting}
            >
              {isListening ? (
                <><StopCircle size={16} /> Stop Listening</>
              ) : isConnecting ? (
                <><span className="sts3-spinner" /> Connecting…</>
              ) : (
                <><Mic size={16} /> Start Listening</>
              )}
            </button>

          </div>

        </div>
      </header>

      {/* ── Transcript generated banner ── */}
      {generatedTranscriptId && (
        <div
          className="sts3-transcript-banner"
          onClick={() => navigate(`/transcripts/${generatedTranscriptId}`)}
        >
          <CheckCircle size={15} />
          <span>Transcript generated</span>
          <span className="sts3-transcript-banner-link">Click to view →</span>
        </div>
      )}



      {/* ── Connection Lost Banner ── */}
      {connectionLostBanner && isOffline && isListening && (
        <div className="sts3-connection-lost-banner">
          <span>📡</span>
          <div className="sts3-connection-lost-text">
            <strong>Connection Lost</strong>
            <span>Voice Bible has lost internet connectivity. Detection accuracy may be affected.</span>
          </div>
          {snapshot.status === "connecting" && (
            <span className="sts3-reconnecting">
              <span className="sts3-spinner sts3-spinner--small" /> Reconnecting…
            </span>
          )}
        </div>
      )}

      {/* ── Offline Banner ── */}
      {isOffline && !connectionLostBanner && (
        <div className="sts3-offline-banner">
          <span>📡</span>
          <span>No internet connection. Please connect to the internet to use this feature.</span>
          {whisperStatus === "loading" && <span className="sts3-banner-status">Loading model...</span>}
          {whisperStatus === "ready" && <span className="sts3-banner-status sts3-banner-status--ready">Ready</span>}
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className="sts3-main">
        {/* ── Row 1: 50/50 split ── */}
        <div className="sts3-main-row1">
          {/* ── Left: Live Transcript ── */}
          <aside className="sts3-sidebar">
            <div className="sts3-sidebar-header">
              <div className="sts3-select-mic-wrapper" ref={micDropdownRef}>
                <div
                  className="sts3-select-mic"
                  onClick={() => {
                    if (isListening || isConnecting) return;
                    if (!micDropdownOpen) void enumerateMics();
                    setMicDropdownOpen((o) => !o);
                  }}
                >
                  <span className="sts3-select-mic-label">
                    <Mic size={14} />
                    {mics.find((m) => m.id === selectedMic)?.label || (micLoading ? "Loading mics…" : "No microphone")}
                  </span>
                  <ChevronDown size={14} />
                </div>
                {micDropdownOpen && (
                  <div className="sts3-mic-dropdown">
                    {mics.length === 0 && (
                      <div className="sts3-mic-dropdown-item sts3-mic-dropdown-item--disabled">
                        {micLoading ? "Loading mics…" : "No microphones found"}
                      </div>
                    )}
                    {mics.map((mic) => (
                      <div
                        key={mic.id}
                        className={`sts3-mic-dropdown-item${mic.id === selectedMic ? " sts3-mic-dropdown-item--active" : ""}`}
                        onClick={() => {
                          track("sts_mic_changed", { mic: mic.id });
                          setSelectedMic(mic.id);
                          setMicDropdownOpen(false);
                        }}
                      >
                        {mic.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="sts3-timer">
                {formatTimerDisplay(elapsed)}
              </div>
              <div className="sts3-header-actions">
                <button
                  className={`sts3-header-icon-btn${copyToast ? " sts3-header-icon-btn--active" : ""}`}
                  onClick={handleCopyTranscript}
                  disabled={!fullTranscript}
                  title="Copy transcript"
                >
                  {copyToast ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  className="sts3-header-icon-btn"
                  onClick={() => setDownloadModalOpen(true)}
                  disabled={!fullTranscript}
                  title="Download transcript"
                >
                  <Download size={14} />
                </button>
              </div>
            </div>
            <div className="sts3-header-mic-status">
              <div className="sts3-footer-item">
                <Mic size={14} />
                <span className={`sts3-footer-dot ${isListening ? "sts3-footer-dot--green" : ""}`} />
                {isListening ? "Listening" : "Stopped"}
              </div>
              <div className="sts3-footer-item">
                <Radio size={14} className={isBroadcastConnected ? "sts3-footer-icon--green" : ""} />
                {isBroadcastConnected ? "Broadcast Connected" : "Broadcast Disconnected"}
              </div>
            </div>

            {/* Search */}
            <div className="sts3-search-box">
              {/* <Search size={14} className="sts3-search-icon" /> */}
              <input
                className="sts3-search-input"
                type="text"
                placeholder="Search transcript…"
                value={transcriptSearch}
                onChange={(e) => setTranscriptSearch(e.target.value)}
              />
            </div>

            <div className="sts3-sidebar-title">
              {isListening && <span className="sts3-live-badge">LIVE</span>}
              LIVE TRANSCRIPT
            </div>

            <div className="sts3-transcript-list" ref={transcriptRef}>
              {/* Empty state */}
              {filteredEntries.length === 0 && !isListening && (
                <div className="sts3-transcript-empty">

                  <p className="sts3-transcript-empty-text">
                    Start listening to see the live transcript here.
                  </p>

                </div>
              )}

              {/* Transcript entries */}
              {filteredEntries.map((entry) => {
                const isActive = entry === filteredEntries[filteredEntries.length - 1] && entry.finalized;
                const isCopied = copiedId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className={`sts3-transcript-item ${isActive ? "sts3-transcript-item--active" : ""} ${!entry.finalized ? "sts3-transcript-item--interim" : ""}`}
                    onClick={entry.finalized ? () => void handleCopyLine(entry.id, entry.text) : undefined}
                  >
                    <div className="sts3-transcript-time">{formatTimestamp(entry, elapsed)}</div>
                    <div className="sts3-transcript-text-wrap">
                      <div className={`sts3-t-dot ${entry.finalized ? "" : "sts3-t-dot--live"}`} />
                      <div className="sts3-transcript-text">
                        {entry.text}
                        {isCopied && <span className="sts3-copied-badge"><Check size={10} /> Copied</span>}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Listening placeholder */}
              {isListening && (
                <div className="sts3-transcript-item sts3-transcript-item--placeholder">
                  <div className="sts3-transcript-time"></div>
                  <div className="sts3-transcript-text-wrap">
                    <div className="sts3-t-dot sts3-t-dot--live" />
                    <div className="sts3-transcript-text sts3-transcript-text--muted">
                      listening for next segment…
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ── Center: Current Verse (Top Match) ── */}
          <div className="sts3-main-card">
            <div className="sts3-card-title">
              <span>TOP MATCH</span>
              {topMatch && (
                <div className="sts3-card-title-actions">
                  <button
                    className={`sts3-header-icon-btn${pushing ? " sts3-header-icon-btn--active" : ""}`}
                    onClick={() => void handlePushVerse(topMatch)}
                    disabled={pushing || !obsConnected}
                    title="Push to Live"
                  >
                    <Radio size={14} />
                  </button>
                  <button
                    className={`sts3-header-icon-btn${verseCopied ? " sts3-header-icon-btn--active" : ""}`}
                    onClick={handleCopyVerse}
                    title="Copy verse"
                  >
                    {verseCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </div>
            {topMatch ? (
              <>
                <div className="sts3-verse-display">

                  <div className="sts3-verse-content">
                    <h1 className="sts3-verse-ref">{topMatch.label}</h1>
                    <p className="sts3-verse-text">&ldquo;{topMatch.snippet}&rdquo;</p>
                    <div className="sts3-verse-version">{topMatch.translation || "KJV"} VERSION</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="sts3-verse-empty">

                <p className="sts3-verse-empty-text">
                  {isListening
                    ? "Listening for scripture… Speak a reference or quote a verse."
                    : "Start listening to detect Bible verses in real time."}
                </p>
              </div>
            )}
          </div>

          {/* ── Right: Detected References ── */}
          <aside className="sts3-right-panel">
            <div className="sts3-right-title">
              <BookOpen size={14} /> DETECTED REFERENCES
            </div>
            <div className="sts3-ref-list">
              {detectedRefs.length === 0 ? (
                <div className="sts3-ref-empty">
                  <p className="sts3-ref-empty-text">
                    Bible references will appear here when detected.
                  </p>
                </div>
              ) : (
                detectedRefs.map((ref, i) => (
                  <div
                    key={`ref-${ref.candidate.book}-${ref.candidate.chapter}-${ref.candidate.verse}-${i}`}
                    className={`sts3-ref-item ${i === 0 ? "sts3-ref-item--active" : ""}`}
                  >
                    <span className="sts3-ref-label">{ref.label}</span>
                    {i === 0 && <span className="sts3-live-badge">LIVE</span>}
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>

        {/* ── Row 2: Full-width section ── */}
        <div className="sts3-main-row2">
          {/* Candidate Matches */}
          <div className="sts3-candidate-card">
            <div className="sts3-candidate-header">
              <span className="sts3-candidate-title">CANDIDATE MATCHES</span>
              {candidateMatches.length > 0 && (
                <span className="sts3-candidate-count">{candidateMatches.length}</span>
              )}
            </div>
            <div className="sts3-candidate-list">
              {candidateMatches.length === 0 ? (
                <div className="sts3-candidate-empty">
                  <p>No verse matches yet.</p>
                  <p className="sts3-candidate-empty-hint">Mention a Bible reference or quote part of a verse.</p>
                </div>
              ) : (
                candidateMatches.map((c, i) => {
                  const sourceLabel = MATCH_SOURCE_LABEL[c.source ?? "fuzzy"];
                  return (
                    <div
                      key={`cand-${c.book}-${c.chapter}-${c.verse}-${i}`}
                      className="sts3-candidate-item"
                    >
                      <BookOpen size={16} className="sts3-cand-icon" />
                      <div className="sts3-cand-ref">{c.label}</div>
                      <div className="sts3-cand-match" style={{ color: sourceLabel.color }}>
                        {Math.round(c.confidence * 100)}%
                      </div>
                      <div className="sts3-cand-text">{c.snippet}</div>
                      <button
                        className="sts3-cand-push"
                        onClick={() => { setSelectedCandidate(c); void handlePushVerse(c); }}
                        disabled={pushing || !obsConnected}
                        title="Push to broadcast"
                      >
                        <Radio size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}


      {/* ── Audio Level Bar ── */}
      {isListening && (
        <div className="sts3-level-bar">
          <div
            className="sts3-level-fill"
            style={{
              width: `${levelPercent}%`,
              background: levelPercent > 80 ? "var(--error)" : levelPercent > 50 ? "var(--warning)" : "var(--success)",
            }}
          />
        </div>
      )}

      {/* ── Toasts ── */}
      {pushSuccess && (
        <div className="sts3-toast sts3-toast--success">
          <Check size={14} /> {pushSuccess}
        </div>
      )}
      {pushError && (
        <div className="sts3-toast sts3-toast--error">
          <span>⚠</span> {pushError}
        </div>
      )}
      {downloadToast && (
        <div className="sts3-toast sts3-toast--success">
          <Check size={14} /> {downloadToast}
        </div>
      )}
      {saveToast && (
        <div className={`sts3-toast ${saveToast.includes("failed") ? "sts3-toast--error" : "sts3-toast--success"}`}>
          {saveToast.includes("failed") ? <span>⚠</span> : <Check size={14} />} {saveToast}
        </div>
      )}

      {/* ── Download Modal ── */}
      {downloadModalOpen && (
        <div className="sts3-modal-overlay" onClick={() => !downloading && setDownloadModalOpen(false)}>
          <div className="sts3-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sts3-modal-header">
              <h3 className="sts3-modal-title">Download Transcript</h3>
              <button className="sts3-modal-close" onClick={() => setDownloadModalOpen(false)} disabled={downloading}>✕</button>
            </div>
            <div className="sts3-modal-body">
              <label className="sts3-modal-label">Select format</label>
              <div
                className={`sts3-modal-option ${downloadFormat === "txt" ? "sts3-modal-option--active" : ""}`}
                onClick={() => !downloading && setDownloadFormat("txt")}
              >
                <div className="sts3-modal-radio">
                  <div className={`sts3-modal-radio-dot ${downloadFormat === "txt" ? "sts3-modal-radio-dot--on" : ""}`} />
                </div>
                <div className="sts3-modal-option-info">
                  <span className="sts3-modal-option-name">TXT</span>
                  <span className="sts3-modal-option-desc">Plain text transcript</span>
                </div>
              </div>
              <div
                className={`sts3-modal-option ${downloadFormat === "srt" ? "sts3-modal-option--active" : ""}`}
                onClick={() => !downloading && setDownloadFormat("srt")}
              >
                <div className="sts3-modal-radio">
                  <div className={`sts3-modal-radio-dot ${downloadFormat === "srt" ? "sts3-modal-radio-dot--on" : ""}`} />
                </div>
                <div className="sts3-modal-option-info">
                  <span className="sts3-modal-option-name">SRT</span>
                  <span className="sts3-modal-option-desc">Subtitles with timestamps (OBS / video)</span>
                </div>
              </div>
              {finalizedEntries.length > 0 && (
                <div className="sts3-modal-preview">
                  <div className="sts3-modal-preview-row">
                    <span>{finalizedEntries.length} subtitle block{finalizedEntries.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="sts3-modal-preview-row">
                    <span>Duration: {formatTime(elapsed)}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="sts3-modal-footer">
              <button className="sts3-modal-btn sts3-modal-btn--ghost" onClick={() => setDownloadModalOpen(false)} disabled={downloading}>Cancel</button>
              <button
                className="sts3-modal-btn sts3-modal-btn--primary"
                onClick={() => void handleDownloadConfirm()}
                disabled={downloading || finalizedEntries.length === 0}
              >
                {downloading ? "Generating…" : "Download"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stop Confirmation ── */}
      {showStopConfirm && (
        <div className="sts3-modal-overlay" onClick={() => setShowStopConfirm(false)}>
          <div className="sts3-modal sts3-modal--small" onClick={(e) => e.stopPropagation()}>
            <div className="sts3-modal-header">
              <h3 className="sts3-modal-title">Stop Listening?</h3>
            </div>
            <div className="sts3-modal-body">
              <p className="sts3-modal-text">Are you sure you want to stop the live transcription?</p>
            </div>
            <div className="sts3-modal-footer">
              <button className="sts3-modal-btn sts3-modal-btn--ghost" onClick={() => setShowStopConfirm(false)}>Cancel</button>
              <button className="sts3-modal-btn sts3-modal-btn--danger" onClick={confirmStop}>
                <StopCircle size={14} /> Stop Listening
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave Page Confirmation ── */}
      {showLeaveConfirm && (
        <div className="sts3-modal-overlay" onClick={cancelLeave}>
          <div className="sts3-modal sts3-modal--small" onClick={(e) => e.stopPropagation()}>
            <div className="sts3-modal-header">
              <h3 className="sts3-modal-title">Transcription Still Active</h3>
            </div>
            <div className="sts3-modal-body">
              <p className="sts3-modal-text">
                Voice Bible is currently transcribing. Leaving this page will stop the live transcription.
              </p>
            </div>
            <div className="sts3-modal-footer">
              <button className="sts3-modal-btn sts3-modal-btn--ghost" onClick={cancelLeave}>Stay on Page</button>
              <button className="sts3-modal-btn sts3-modal-btn--danger" onClick={confirmLeave}>
                <StopCircle size={14} /> Stop &amp; Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Error ── */}
      {assemblyAIError && (
        <div className="sts3-lock-overlay">
          <div className="sts3-lock-card">
            <h2 className="sts3-lock-title">Voice Bible Service Unavailable</h2>
            <p className="sts3-lock-desc">
              Unable to connect to the transcription service. Please try again shortly.
            </p>
            <button
              className="sts3-btn sts3-btn--primary"
              onClick={() => {
                setAssemblyAIError(false);
                void lmDockService.startListening(selectedMic || undefined);
              }}
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
