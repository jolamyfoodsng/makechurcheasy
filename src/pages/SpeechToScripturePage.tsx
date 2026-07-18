/**
 * SpeechToScripturePage.tsx — Three-column speech-to-Bible lookup.
 *
 * Left:  Live transcript feed
 * Center: Verse matching engine (top match + candidate table)
 * Right: Detected references
 *
 * Captures mic audio, transcribes live turns with AssemblyAI realtime STT,
 * matches Bible verses,
 * and sends results to OBS via BroadcastChannel.
 */

import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  Copy,
  Download,
  HelpCircle,
  Lock,
  Mic,
  Radio,
  RotateCcw,
  ShieldAlert,
  StopCircle,
  Wifi,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePerformanceMonitor } from "../dock/usePerformanceMonitor";
import SpeechToScriptureTutorial, {
  isSpeechToScriptureTutorialCompleted,
  markSpeechToScriptureTutorialCompleted,
  resetSpeechToScriptureTutorial,
} from "./SpeechToScriptureTutorial";
import { bibleObsService } from "../bible/bibleObsService";
import type { BibleSlide } from "../bible/types";
import CreditsDisplay from "../components/CreditsDisplay";
import { useAuth } from "../contexts/AuthContext";
import { track } from "../services/analytics";
import {
  APP_VERSION,
  clearDeviceSecretForRecovery,
  getDeviceId,
  getDeviceSecret,
  refreshAccountBootstrapFromServer,
} from "../services/authService";
import { calculateTranscriptionCredits, deductCreditsWithSync, getCreditsBalance, onCreditChange, syncCreditsWithBackend } from "../services/credits";
import { checkEntitlementSync } from "../services/entitlementClient";
import { getEffectivePlan } from "../services/licenseService";
import { lmDockService, type LmDockSnapshot } from "../services/lmDockService";
import { obsService } from "../services/obsService";
import { loadData } from "../services/store";
import { trackVoiceSessionCompleted, trackVoiceSessionStarted } from "../services/tracking";
import type { VoiceBibleCandidate, DetectionSpeed } from "../services/voiceBibleTypes";
import { DETECTION_SPEED_CONFIG, MATCH_SOURCE_LABEL } from "../services/voiceBibleTypes";
import { isWhisperReady, loadWhisperModel } from "../services/whisperService";
import { createTranscript, saveTranscript } from "../transcripts/transcriptService";
import { isConfirmedAppClose } from "../services/appCloseGuard";

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.creatorstudioslabs.stream";

// ── Connectivity hook ──
function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
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
  const { t } = useTranslation();

  // ── Translated config maps (constants are defined outside component) ──
  const speedLabelMap = useMemo(() => ({
    fast: t("verseAi.speedFast"),
    balanced: t("verseAi.speedBalanced"),
    accurate: t("verseAi.speedAccurate"),
  }), [t]);

  const speedDescMap = useMemo(() => ({
    fast: t("verseAi.speedFastDesc"),
    balanced: t("verseAi.speedBalancedDesc"),
    accurate: t("verseAi.speedAccurateDesc"),
  }), [t]);

  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const effectivePlan = getEffectivePlan(user);

  // ── Tutorial state ──
  const [tourActive, setTourActive] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // ── Backend access check (declared early for use in useEffects below) ──
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessDenied, setAccessDenied] = useState<{
    reason: string;
    requiredPlan?: string;
  } | null>(null);

  // ── Auto-start tutorial on first visit ──
  useEffect(() => {
    if (!isSpeechToScriptureTutorialCompleted() && !tourActive) {
      const timer = setTimeout(() => setTourActive(true), 600);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upfront plan gate — block immediately if plan doesn't include Verse AI ──
  useEffect(() => {
    if (isAdmin) return; // Admins bypass all entitlement checks
    const result = checkEntitlementSync("speechToScripture", effectivePlan);
    if (!result.allowed) {
      setAccessDenied({
        reason: "feature_not_available",
        requiredPlan: result.requiredPlan,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePlan, isAdmin]);

  // ── Track credit balance for Start button gating ──
  const [creditBalance, setCreditBalance] = useState(() => getCreditsBalance());
  const [isUnlimited, setIsUnlimited] = useState(false);
  const isPro = effectivePlan === "pro";

  useEffect(() => {
    if (isPro) return;
    void syncCreditsWithBackend().then((bal) => {
      if (bal === -1) {
        setIsUnlimited(true);
      } else if (bal >= 0) {
        setIsUnlimited(false);
        setCreditBalance(bal);
      }
    });
    const unsub = onCreditChange((bal) => setCreditBalance(bal));
    return unsub;
  }, [isPro]);

  const hasCredits = isAdmin || isPro || isUnlimited || creditBalance > 0;

  // ── LM state ──
  const [snapshot, setSnapshot] = useState<LmDockSnapshot>(lmDockService.getSnapshot());
  const [mics, setMics] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [micLoading, setMicLoading] = useState(false);
  const [micDropdownOpen, setMicDropdownOpen] = useState(false);
  const micDropdownRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLine = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
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
  const performanceMonitor = usePerformanceMonitor(true);
  const performanceSnapshotRef = useRef(performanceMonitor.current);
  const lmDiagnostics = lmDockService.getDiagnostics();
  const lmDiagnosticsRef = useRef(lmDiagnostics);

  useEffect(() => {
    performanceSnapshotRef.current = performanceMonitor.current;
  }, [performanceMonitor.current]);

  useEffect(() => {
    lmDiagnosticsRef.current = lmDiagnostics;
  }, [lmDiagnostics]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setShowDiagnostics((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const sample = () => {
      const perf = performanceSnapshotRef.current;
      if (!performanceMonitor.memorySupported || perf.heapUsedMB <= 0) return;

      const diag = lmDiagnosticsRef.current;
      const logPayload = {
        heapUsedMB: perf.heapUsedMB,
        heapLimitMB: perf.heapLimitMB,
        heapFraction: perf.heapFraction,
        fps: perf.fps,
        avgFrameMs: perf.avgFrameMs,
        obsWebSockets: obsConnected ? 1 : 0,
        speechHttpSync: diag.status !== "idle" ? 1 : 0,
        audioContexts: 0,
        recognitionSessions: diag.status !== "idle" ? 1 : 0,
        activeTimers: diag.activeTimers,
        transcriptEntries: diag.entryCount,
      };

      if (perf.heapUsedMB >= 2000) {
        console.error("[SpeechToScripture] High Memory Critical", logPayload);
      } else if (perf.heapUsedMB >= 1500) {
        console.warn("[SpeechToScripture] High Memory Warning", logPayload);
      } else {
        console.info("[SpeechToScripture] Memory sample", logPayload);
      }
    };

    sample();
    const interval = window.setInterval(sample, 60_000);
    return () => window.clearInterval(interval);
  }, [obsConnected, performanceMonitor.memorySupported]);

  // ── Start / Stop ──
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [generatedTranscriptId, setGeneratedTranscriptId] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    // Disable button and show checking state
    setCheckingAccess(true);
    setAccessDenied(null);

    try {
      const deviceId = getDeviceId();
      console.log("[SpeechToScripture] 🎤 handleStart called, deviceId:", deviceId);
      const requestAccess = async () => {
        const res = await fetch(
          `${API_BASE}/api/device/speech-to-scripture/check-access?deviceId=${encodeURIComponent(deviceId || "")}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-App-Version": APP_VERSION,
              "X-Device-Secret": getDeviceSecret() || "",
            },
          }
        );
        const data = await res.json().catch(() => ({ allowed: false, reason: "server_error" }));
        return { res, data };
      };

      let { data } = await requestAccess();
      console.log("[SpeechToScripture] 📋 Access check response:", JSON.stringify(data));

      // If device not found, try refreshing bootstrap (may re-register device) and retry once
      if (!data.allowed && data.reason === "device_not_found") {
        console.warn("[SpeechToScripture] Device not found, refreshing bootstrap...");
        const refreshResult = await refreshAccountBootstrapFromServer();
        if (refreshResult.status === "ok") {
          ({ data } = await requestAccess());
        } else {
          console.warn("[SpeechToScripture] Bootstrap refresh failed:", refreshResult.status);
        }
      }

      // If still not found, retry without device secret (legacy recovery path:
      // the API allows devices without a stored secret through)
      if (!data.allowed && data.reason === "device_not_found") {
        console.warn("[SpeechToScripture] Still not found, retrying without device secret...");
        await clearDeviceSecretForRecovery();
        ({ data } = await requestAccess());
      }

      if (!data.allowed) {
        console.warn("[SpeechToScripture] ❌ Access DENIED:", data.reason, "requiredPlan:", data.requiredPlan);
        setAccessDenied({ reason: data.reason, requiredPlan: data.requiredPlan });
        return;
      }

      // Backend approved — start listening
      console.log("[SpeechToScripture] ✅ Access ALLOWED — calling lmDockService.startListening()");
      track("sts_listening_started", { mic: selectedMic || "default" });
      trackVoiceSessionStarted();
      void lmDockService.startListening(selectedMic || undefined);
    } catch (err) {
      console.warn("[SpeechToScripture] ❌ Access check FAILED (network/error):", err);
      const isNetworkError = err instanceof TypeError && /fetch|network/i.test(err.message);
      setAccessDenied({ reason: isNetworkError ? "internet_verification_required" : "server_error" });
    } finally {
      setCheckingAccess(false);
    }
  }, [selectedMic]);

  const handleStop = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  const confirmStop = useCallback(() => {
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
            setSaveToast({ message: t("verseAi.transcriptSaved"), isError: false });
          } else {
            setSaveToast({ message: t("verseAi.savedLocallyCloudFailed"), isError: true });
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
                setSaveToast({ message: t("verseAi.creditDeductionFailed"), isError: true });
                setTimeout(() => setSaveToast(null), 4000);
              }
            }
          } catch (err) {
            console.warn("[Credits] Transcription credit deduction error:", err);
            setSaveToast({ message: t("verseAi.creditSyncFailed"), isError: true });
            setTimeout(() => setSaveToast(null), 4000);
          } finally {
            // Backend deduction is done — clear the pending session offset so
            // the display reflects the real balance from here on.
            setPendingSessionCredits(0);
          }
        })();
      }).catch(() => {
        // Best-effort — don't block stop on save failure
      });
    }

    lmDockService.stopListening();
    setShowStopConfirm(false);
  }, [snapshot.entries, snapshot.queue, snapshot.status, snapshot.suggestions, t, user?.id]);

  const isListening = snapshot.status === "listening";
  const isConnecting = snapshot.status === "requesting-mic" || snapshot.status === "connecting";
  const isTranscribing = isListening || isConnecting;
  const levelPercent = Math.round(snapshot.inputLevel * 100);

  // ── Guard: warn before closing app while transcribing ──
  useEffect(() => {
    if (!isTranscribing) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (isConfirmedAppClose()) {
        return;
      }
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isTranscribing]);

  // ── Timer ──
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // After listening stops, hold the session credit count until the backend
  // deduction is confirmed, preventing the display from jumping back.
  const [pendingSessionCredits, setPendingSessionCredits] = useState(0);

  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  useEffect(() => {
    if (isTranscribing && snapshot.startedAt) {
      setPendingSessionCredits(0);
      const updateElapsed = () => {
        setElapsed(Math.max(0, Math.floor((Date.now() - snapshot.startedAt!) / 1000)));
      };
      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (elapsedRef.current > 0) {
        // Capture the credit count at the moment listening stopped so the
        // display stays consistent until the backend deduction is confirmed.
        setPendingSessionCredits(Math.max(1, Math.ceil(elapsedRef.current / 60)));
      } else {
        setPendingSessionCredits(0);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTranscribing, snapshot.startedAt]);

  // ── Selected candidate (overrides auto top-match when set) ──
  const [selectedCandidate, setSelectedCandidate] = useState<VoiceBibleCandidate | null>(null);

  // ── Push verse to OBS ──
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const handlePushVerse = useCallback(async (candidate: VoiceBibleCandidate) => {
    if (!obsConnected) {
      setPushError(t("verseAi.notConnectedToBroadcast"));
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
      setPushSuccess(t("verseAi.pushedToBroadcast", { reference: candidate.label }));
      setTimeout(() => setPushSuccess(null), 3000);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  }, [obsConnected]);

  // ── Transcript search ──
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const [whisperStatus, setWhisperStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [assemblyAIError, setAssemblyAIError] = useState(false);
  const [wasListening, setWasListening] = useState(false);
  const [connectionLostBanner, setConnectionLostBanner] = useState(false);

  // ── Detection Speed ──
  const [detectionSpeed, setDetectionSpeedState] = useState<DetectionSpeed>("balanced");

  // Load detection speed from settings on mount
  useEffect(() => {
    void (async () => {
      try {
        const { getVoiceBibleSettings } = await import("../services/voiceBibleSettings");
        const settings = await getVoiceBibleSettings();
        setDetectionSpeedState(settings.detectionSpeed);
        lmDockService.setDetectionSpeed(settings.detectionSpeed);
      } catch {
        // Use default "balanced"
      }
    })();
  }, []);

  const handleDetectionSpeedChange = useCallback((speed: DetectionSpeed) => {
    setDetectionSpeedState(speed);
    lmDockService.setDetectionSpeed(speed);
    // Persist to settings
    void (async () => {
      try {
        const { getVoiceBibleSettings, saveVoiceBibleSettings } = await import("../services/voiceBibleSettings");
        const current = await getVoiceBibleSettings();
        await saveVoiceBibleSettings({ ...current, detectionSpeed: speed });
      } catch {
        // Best effort — don't block UI
      }
    })();
  }, []);

  useEffect(() => {
    if (isListening) {
      setWasListening(true);
      return;
    }
    setWasListening(false);
    setConnectionLostBanner(false);
  }, [isListening]);

  useEffect(() => {
    if (wasListening && isOffline && isListening) {
      setConnectionLostBanner(true);
    }
    if (isOnline) {
      setConnectionLostBanner(false);
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
  const finalizedEntries = useMemo(() => snapshot.entries.filter((e) => e.finalized), [snapshot.entries]);
  const fullTranscript = useMemo(() => finalizedEntries.map((e) => e.text).join("\n"), [finalizedEntries]);
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
  const [saveToast, setSaveToast] = useState<{ message: string; isError: boolean } | null>(null);

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
      setDownloadToast(t("verseAi.transcriptDownloaded", { ext: ext.toUpperCase() }));
      setTimeout(() => setDownloadToast(null), 3000);
    } catch {
      setDownloadToast(t("verseAi.downloadFailed"));
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

  const visibleEntries = useMemo(() => filteredEntries.slice(-250), [filteredEntries]);
  const hiddenEntryCount = Math.max(0, filteredEntries.length - visibleEntries.length);

  // ── Scripture engine active ──
  const _scriptureActive = isListening || snapshot.suggestions.length > 0 || snapshot.queue.length > 0;
  void _scriptureActive;

  const isBroadcastConnected = obsConnected;
  const perf = performanceMonitor.current;
  const diagnostics = lmDiagnostics;
  const websocketCount = obsConnected ? 1 : 0;

  return (
    <div className="sts3-root">
      {/* ── Header ── */}
      <header className="sts3-header" data-stt-tutorial="welcome">
        <div className="sts3-header-left">
          <div className="sts3-logo-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
          </div>
          <div>
            <div className="sts3-header-title">Verse AI</div>
            <div className="sts3-header-sub">Real-time speech to scripture detection</div>
          </div>
        </div>
        <CreditsDisplay userId={user?.id} sessionCreditsUsed={isListening ? Math.ceil(elapsed / 60) : pendingSessionCredits} />
        <div className="sts3-header-right">
          <button
            className="production-btn production-btn--ghost"
            onClick={() => { resetSpeechToScriptureTutorial(); setTourActive(true); setBannerDismissed(false); }}
            title={t("stt.button.tooltip")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", background: "transparent", cursor: "pointer" }}
          >
            <HelpCircle size={16} /> {t("stt.button")}
          </button>
          <div className="sts3-header-mic-group" data-stt-tutorial="start-btn">
            <button
              className={`sts3-btn ${isListening ? "sts3-btn--red" : ""}`}
              onClick={isListening ? handleStop : handleStart}
              disabled={isConnecting || checkingAccess || (!isListening && !hasCredits)}
              title={!isListening && !hasCredits ? t("verseAi.noCredits") : t("verseAi.startListening")}>
              {isListening ? (
                <><StopCircle size={16} /> {t("verseAi.stopListening")}</>
              ) : checkingAccess ? (
                <><span className="sts3-spinner" /> {t("verseAi.checkingAccess")}</>
              ) : isConnecting ? (
                <><span className="sts3-spinner" /> {t("verseAi.connecting")}</>
              ) : !hasCredits ? (
                <><Lock size={16} /> {t("verseAi.noCredits")}</>
              ) : (
                <><Mic size={16} /> {t("verseAi.showInObs")}</>
              )}
            </button>
          </div>

        </div>
      </header>

      {/* ── Incomplete tutorial banner ── */}
      {!tourActive && !isSpeechToScriptureTutorialCompleted() && !bannerDismissed && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", margin: "0 24px 16px", background: "rgba(var(--primary-rgb, 99, 102, 241), 0.08)", border: "1px solid rgba(var(--primary-rgb, 99, 102, 241), 0.2)", borderRadius: 8, fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          <AlertTriangle size={14} style={{ color: "var(--primary)", flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{t("stt.banner")}</span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "var(--primary)", color: "#fff", border: "1px solid var(--primary)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, cursor: "pointer" }} onClick={() => setTourActive(true)}>
              {t("stt.banner.continue")}
            </button>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", background: "transparent", cursor: "pointer" }} onClick={() => { resetSpeechToScriptureTutorial(); setTourActive(true); setBannerDismissed(false); }}>
              <RotateCcw size={12} /> {t("stt.banner.restart")}
            </button>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", background: "transparent", cursor: "pointer" }} onClick={() => setBannerDismissed(true)}>
              {t("stt.banner.dismiss")}
            </button>
          </div>
        </div>
      )}

      {/* ── Transcript generated banner ── */}
      {generatedTranscriptId && (
        <div
          className="sts3-transcript-banner"
          onClick={() => navigate(`/transcripts/${generatedTranscriptId}`)}
        >
          <CheckCircle size={15} />
          <span>{t("verseAi.transcriptGenerated")}</span>
          <span className="sts3-transcript-banner-link">{t("verseAi.clickToView")}</span>
        </div>
      )}



      {/* ── Connection Lost Banner ── */}
      {connectionLostBanner && isOffline && isListening && (
        <div className="sts3-connection-lost-banner">
          <span>📡</span>
          <div className="sts3-connection-lost-text">
            <strong>{t("verseAi.connectionLost")}</strong>
            <span>{t("verseAi.connectionLostDesc")}</span>
          </div>
          {snapshot.status === "connecting" && (
            <span className="sts3-reconnecting">
              <span className="sts3-spinner sts3-spinner--small" /> {t("verseAi.reconnecting")}
            </span>
          )}
        </div>
      )}

      {/* ── Offline Banner ── */}
      {isOffline && !connectionLostBanner && (
        <div className="sts3-offline-banner">
          <span>📡</span>
          <span>{t("verseAi.offlineDesc")}</span>
          {whisperStatus === "loading" && <span className="sts3-banner-status">{t("verseAi.loadingModel")}</span>}
          {whisperStatus === "ready" && <span className="sts3-banner-status sts3-banner-status--ready">{t("verseAi.ready")}</span>}
        </div>
      )}

      {showDiagnostics && (
        <section
          aria-label="Speech diagnostics"
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 1200,
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            background: "rgba(12, 14, 18, 0.96)",
            boxShadow: "0 18px 60px rgba(0, 0, 0, 0.35)",
            color: "var(--text)",
            padding: 14,
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                Hidden Diagnostics
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 700 }}>Speech-to-Scripture</div>
            </div>
            <button
              type="button"
              onClick={() => setShowDiagnostics(false)}
              style={{
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-muted)",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 4 }}>RAM Usage</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                {performanceMonitor.memorySupported ? `${perf.heapUsedMB} MB` : "Unsupported"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {performanceMonitor.memorySupported && perf.heapLimitMB > 0 ? `of ${perf.heapLimitMB} MB` : "performance.memory unavailable"}
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 4 }}>CPU / Render</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{perf.fps} FPS</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {perf.avgFrameMs} ms/frame
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 4 }}>Open Socket Count</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{websocketCount}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                OBS {obsConnected ? "connected" : "disconnected"} · Speech Sync {snapshot.status !== "idle" ? "active" : "idle"}
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 4 }}>Audio Context Count</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>0</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Mic capture runs in Rust, not the browser
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 4 }}>Recognition Sessions</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{snapshot.status !== "idle" ? 1 : 0}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Session token {diagnostics.sessionToken}
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 4 }}>Active Timers</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{diagnostics.activeTimers}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                poll, pause, quote search, interim search
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <span>Entries: {diagnostics.entryCount}</span>
            <span>Queue: {diagnostics.queueCount}</span>
            <span>Suggestions: {diagnostics.suggestionCount}</span>
            <span>Finalized chunks: {diagnostics.finalizedChunkCount}</span>
          </div>
        </section>
      )}

      {/* ── Main Layout ── */}
      <div className="sts3-main">
        {/* ── Row 1: 50/50 split ── */}
        <div className="sts3-main-row1">
          {/* ── Left: Live Transcript ── */}
          <aside className="sts3-sidebar">
            <div className="sts3-sidebar-header">
              <div className="sts3-select-mic-wrapper" ref={micDropdownRef} data-stt-tutorial="mic-select">
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
                    {mics.find((m) => m.id === selectedMic)?.label || (micLoading ? t("verseAi.loadingMics") : t("verseAi.noMicrophone"))}
                  </span>
                  <ChevronDown size={14} />
                </div>
                {micDropdownOpen && (
                  <div className="sts3-mic-dropdown">
                    {mics.length === 0 && (
                      <div className="sts3-mic-dropdown-item sts3-mic-dropdown-item--disabled">
                        {micLoading ? t("verseAi.loadingMics") : t("verseAi.noMicrophonesFound")}
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
                  title={t("verseAi.copyTranscriptTitle")}
                >
                  {copyToast ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  className="sts3-header-icon-btn"
                  onClick={() => setDownloadModalOpen(true)}
                  disabled={!fullTranscript}
                  title={t("verseAi.downloadTranscriptTitle")}
                >
                  <Download size={14} />
                </button>
              </div>
            </div>
            <div className="sts3-header-mic-status">
              <div className="sts3-footer-item">
                <Mic size={14} />
                <span className={`sts3-footer-dot ${isListening ? "sts3-footer-dot--green" : ""}`} />
                {isListening ? t("verseAi.listening") : t("verseAi.stopped")}
              </div>
              <div className="sts3-footer-item">
                <Radio size={14} className={isBroadcastConnected ? "sts3-footer-icon--green" : ""} />
                {isBroadcastConnected ? t("verseAi.broadcastConnected") : t("verseAi.broadcastDisconnected")}
              </div>
            </div>

            {/* Detection Speed Toggle */}
            <div className="sts3-detection-speed">
              <div className="sts3-detection-speed-label">{t("verseAi.detectionSpeed")}</div>
              <div className="sts3-detection-speed-options">
                {(["fast", "balanced", "accurate"] as DetectionSpeed[]).map((speed) => {
                  return (
                    <button
                      key={speed}
                      className={`sts3-detection-speed-btn ${detectionSpeed === speed ? "sts3-detection-speed-btn--active" : ""}`}
                      onClick={() => handleDetectionSpeedChange(speed)}
                      title={speedDescMap[speed]}
                    >
                      <span className="sts3-detection-speed-icon">{DETECTION_SPEED_CONFIG[speed].icon}</span>
                      <span className="sts3-detection-speed-name">{speedLabelMap[speed]}</span>
                    </button>
                  );
                })}
              </div>
              <div className="sts3-detection-speed-hint">
                {speedDescMap[detectionSpeed]}
              </div>
            </div>

            {/* Search */}
            <div className="sts3-search-box">
              {/* <Search size={14} className="sts3-search-icon" /> */}
              <input
                className="sts3-search-input"
                type="text"
                placeholder={t("verseAi.searchTranscript")}
                value={transcriptSearch}
                onChange={(e) => setTranscriptSearch(e.target.value)}
              />
            </div>

            <div className="sts3-sidebar-title">
              {isListening && <span className="sts3-live-badge">{t("verseAi.live")}</span>}
              {t("verseAi.liveTranscript")}
            </div>

            <div
              className={`sts3-transcript-toggle${transcriptCollapsed ? " sts3-transcript-toggle--collapsed" : ""}`}
              onClick={() => setTranscriptCollapsed((c) => !c)}
            >
              <span>{t("verseAi.liveTranscriptLabel")}</span>
              <ChevronDown size={14} />
            </div>

            <div className={`sts3-transcript-list${transcriptCollapsed ? " sts3-transcript-collapsed" : ""}`} ref={transcriptRef} data-stt-tutorial="transcript">
              {/* Empty state */}
              {filteredEntries.length === 0 && !isListening && (
                <div className="sts3-transcript-empty">

                  <p className="sts3-transcript-empty-text">
                    {t("verseAi.transcriptEmpty")}
                  </p>

                </div>
              )}

              {/* Transcript entries */}
              {hiddenEntryCount > 0 && (
                <div className="sts3-transcript-item sts3-transcript-item--placeholder">
                  <div className="sts3-transcript-time"></div>
                  <div className="sts3-transcript-text-wrap">
                    <div className="sts3-t-dot" />
                    <div className="sts3-transcript-text sts3-transcript-text--muted">
                      Showing latest {visibleEntries.length} of {filteredEntries.length} transcript lines
                    </div>
                  </div>
                </div>
              )}

              {visibleEntries.map((entry) => {
                const isActive = entry === visibleEntries[visibleEntries.length - 1] && entry.finalized;
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
                        {isCopied && <span className="sts3-copied-badge"><Check size={10} /> {t("verseAi.copiedLabel")}</span>}
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
                      {t("verseAi.listeningForSegment")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ── Center: Current Verse (Top Match) ── */}
          <div className="sts3-main-card" data-stt-tutorial="top-match">
            <div className="sts3-card-title">
              <span>{t("verseAi.topMatch")}</span>
              {topMatch && (
                <div className="sts3-card-title-actions">
                  <button
                    className={`sts3-header-icon-btn${pushing ? " sts3-header-icon-btn--active" : ""}`}
                    onClick={() => void handlePushVerse(topMatch)}
                    disabled={pushing || !obsConnected}
                    title={t("verseAi.pushToLive")}
                  >
                    <Radio size={14} />
                  </button>
                  <button
                    className={`sts3-header-icon-btn${verseCopied ? " sts3-header-icon-btn--active" : ""}`}
                    onClick={handleCopyVerse}
                    title={t("verseAi.copyVerse")}
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
                    <div className="sts3-verse-version">{topMatch.translation || "KJV"} {t("verseAi.version")}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="sts3-verse-empty">

                <p className="sts3-verse-empty-text">
                  {isListening
                    ? t("verseAi.listeningForScripture")
                    : t("verseAi.startToDetect")}
                </p>
              </div>
            )}
          </div>

          {/* ── Right: Detected References ── */}
          <aside className="sts3-right-panel">
            <div className="sts3-right-title">
              <BookOpen size={14} /> {t("verseAi.detectedReferences")}
            </div>
            <div className="sts3-ref-list">
              {detectedRefs.length === 0 ? (
                <div className="sts3-ref-empty">
                  <p className="sts3-ref-empty-text">
                    {t("verseAi.refsEmpty")}
                  </p>
                </div>
              ) : (
                detectedRefs.map((ref, i) => (
                  <div
                    key={`ref-${ref.candidate.book}-${ref.candidate.chapter}-${ref.candidate.verse}-${i}`}
                    className={`sts3-ref-item ${i === 0 ? "sts3-ref-item--active" : ""}`}
                  >
                    <span className="sts3-ref-label">{ref.label}</span>
                    {i === 0 && <span className="sts3-live-badge">{t("verseAi.live")}</span>}
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>

        {/* ── Row 2: Full-width section ── */}
        <div className="sts3-main-row2">
          {/* Candidate Matches */}
          <div className="sts3-candidate-card" data-stt-tutorial="candidates">
            <div className="sts3-candidate-header">
              <span className="sts3-candidate-title">{t("verseAi.candidateMatches")}</span>
              {candidateMatches.length > 0 && (
                <span className="sts3-candidate-count">{candidateMatches.length}</span>
              )}
            </div>
            <div className="sts3-candidate-list">
              {candidateMatches.length === 0 ? (
                <div className="sts3-candidate-empty">
                  <p>{t("verseAi.candidateEmpty")}</p>
                  <p className="sts3-candidate-empty-hint">{t("verseAi.candidateEmptyHint")}</p>
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
                        title={t("verseAi.pushToBroadcast")}
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

      {/* ── Search Telemetry (dev mode only) ── */}
      {isListening && import.meta.env.DEV && snapshot.telemetry && snapshot.telemetry.searchCount > 0 && (
        <div className="sts3-telemetry">
          <div className="sts3-telemetry-row">
            <span className="sts3-telemetry-label">{t("verseAi.searches")}:</span>
            <span className="sts3-telemetry-value">{snapshot.telemetry.searchCount}</span>
          </div>
          <div className="sts3-telemetry-row">
            <span className="sts3-telemetry-label">{t("verseAi.searchToResults")}:</span>
            <span className="sts3-telemetry-value">{snapshot.telemetry.searchToResultsMs}ms</span>
          </div>
          <div className="sts3-telemetry-row">
            <span className="sts3-telemetry-label">{t("verseAi.avgLatency")}:</span>
            <span className="sts3-telemetry-value">{snapshot.telemetry.avgLatencyMs}ms</span>
          </div>
          <div className="sts3-telemetry-row">
            <span className="sts3-telemetry-label">{t("verseAi.mode")}:</span>
            <span className="sts3-telemetry-value">{DETECTION_SPEED_CONFIG[detectionSpeed].icon} {detectionSpeed}</span>
          </div>
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
        <div className={`sts3-toast ${saveToast.isError ? "sts3-toast--error" : "sts3-toast--success"}`}>
          {saveToast.isError ? <span>⚠</span> : <Check size={14} />} {saveToast.message}
        </div>
      )}

      {/* ── Download Modal ── */}
      {downloadModalOpen && (
        <div className="sts3-modal-overlay" onClick={() => !downloading && setDownloadModalOpen(false)}>
          <div className="sts3-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sts3-modal-header">
              <h3 className="sts3-modal-title">{t("verseAi.downloadTranscript")}</h3>
              <button className="sts3-modal-close" onClick={() => setDownloadModalOpen(false)} disabled={downloading} title={t("verseAi.close")}>✕</button>
            </div>
            <div className="sts3-modal-body">
              <label className="sts3-modal-label">{t("verseAi.selectFormat")}</label>
              <div
                className={`sts3-modal-option ${downloadFormat === "txt" ? "sts3-modal-option--active" : ""}`}
                onClick={() => !downloading && setDownloadFormat("txt")}
              >
                <div className="sts3-modal-radio">
                  <div className={`sts3-modal-radio-dot ${downloadFormat === "txt" ? "sts3-modal-radio-dot--on" : ""}`} />
                </div>
                <div className="sts3-modal-option-info">
                  <span className="sts3-modal-option-name">TXT</span>
                  <span className="sts3-modal-option-desc">{t("verseAi.plainTextTranscript")}</span>
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
                  <span className="sts3-modal-option-desc">{t("verseAi.subtitlesWithTimestamps")}</span>
                </div>
              </div>
              {finalizedEntries.length > 0 && (
                <div className="sts3-modal-preview">
                  <div className="sts3-modal-preview-row">
                    <span>{t("verseAi.subtitleBlockCount", { count: finalizedEntries.length })}</span>
                  </div>
                  <div className="sts3-modal-preview-row">
                    <span>{t("verseAi.duration")}: {formatTime(elapsed)}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="sts3-modal-footer">
              <button className="sts3-modal-btn sts3-modal-btn--ghost" onClick={() => setDownloadModalOpen(false)} disabled={downloading} title={t("verseAi.cancel")}>{t("verseAi.cancel")}</button>
              <button
                className="sts3-modal-btn sts3-modal-btn--primary"
                onClick={() => void handleDownloadConfirm()}
                disabled={downloading || finalizedEntries.length === 0}
                title={t("verseAi.generating")}>
                {downloading ? t("verseAi.generating") : t("verseAi.download")}
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
              <h3 className="sts3-modal-title">{t("verseAi.stopListeningTitle")}</h3>
            </div>
            <div className="sts3-modal-body">
              <p className="sts3-modal-text">{t("verseAi.stopListeningConfirm")}</p>
            </div>
            <div className="sts3-modal-footer">
              <button className="sts3-modal-btn sts3-modal-btn--ghost" onClick={() => setShowStopConfirm(false)} title={t("verseAi.cancel")}>{t("verseAi.cancel")}</button>
              <button className="sts3-modal-btn sts3-modal-btn--danger" onClick={confirmStop} title={t("verseAi.stopListening")}>
                <StopCircle size={14} /> {t("verseAi.stopListening")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Access Denied Modal ── */}
      {accessDenied && (
        <div className="sts3-lock-overlay">
          <div className="sts3-lock-card">
            {(accessDenied.reason === "subscription_expired" || accessDenied.reason === "trial_expired") && (
              <>
                <Zap size={40} style={{ color: "var(--warning)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">
                  {t(accessDenied.reason === "trial_expired" ? "verseAi.freeTrialEnded" : "verseAi.subscriptionRequired")}
                </h2>
                <p className="sts3-lock-desc">
                  {t(accessDenied.reason === "trial_expired" ? "verseAi.freeTrialEndedDesc" : "verseAi.subscriptionRequiredDesc")}
                  {" "}
                  {t("common.upgradePlansStartToday", { amount: "3,500" })}
                </p>
                <button
                  className="sts3-btn sts3-btn--primary"
                  onClick={() => navigate("/pricing")}
                  title={t(accessDenied.reason === "trial_expired" ? "verseAi.chooseAPlan" : "verseAi.manageSubscription")}>
                  {t(accessDenied.reason === "trial_expired" ? "verseAi.chooseAPlan" : "verseAi.manageSubscription")}
                </button>
              </>
            )}
            {accessDenied.reason === "device_revoked" && (
              <>
                <ShieldAlert size={40} style={{ color: "var(--error)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">{t("verseAi.deviceRemoved")}</h2>
                <p className="sts3-lock-desc">
                  {t("verseAi.deviceRemovedDesc")}
                </p>
                <button
                  className="sts3-btn sts3-btn--primary"
                  onClick={() => {
                    setAccessDenied(null);
                    logout();
                  }}
                  title={t("verseAi.signOut")}>
                  {t("verseAi.signOut")}
                </button>
              </>
            )}
            {accessDenied.reason === "account_suspended" && (
              <>
                <Lock size={40} style={{ color: "var(--error)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">{t("verseAi.accountRestricted")}</h2>
                <p className="sts3-lock-desc">
                  {t("verseAi.accountRestrictedDesc")}
                </p>
                <button
                  className="sts3-btn sts3-btn--primary"
                  onClick={() => setAccessDenied(null)}
                  title={t("verseAi.contactSupport")}>
                  {t("verseAi.contactSupport")}
                </button>
              </>
            )}
            {accessDenied.reason === "insufficient_credits" && (
              <>
                <Zap size={40} style={{ color: "var(--warning)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">{t("verseAi.insufficientCredits")}</h2>
                <p className="sts3-lock-desc">
                  {t("verseAi.insufficientCreditsDesc")}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="sts3-btn sts3-btn--primary"
                    onClick={() => navigate("/pricing")}
                    title={t("verseAi.upgradePlan")}>
                    {t("verseAi.upgradePlan")}
                  </button>
                  <button
                    className="sts3-btn sts3-btn--ghost"
                    onClick={() => setAccessDenied(null)}
                    title={t("verseAi.dismiss")}>
                    {t("verseAi.dismiss")}
                  </button>
                </div>
              </>
            )}
            {accessDenied.reason === "feature_not_available" && (
              <>
                <Lock size={40} style={{ color: "var(--warning)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">{t("verseAi.verseAINotAvailable")}</h2>
                <p className="sts3-lock-desc">
                  {t("verseAi.featureNotAvailableDesc")}
                  {accessDenied.requiredPlan && (
                    <>
                      {" "}{t("verseAi.upgradeToUnlock", { plan: accessDenied.requiredPlan.charAt(0).toUpperCase() + accessDenied.requiredPlan.slice(1) })}
                    </>
                  )}
                </p>
                <button
                  className="sts3-btn sts3-btn--primary"
                  onClick={() => navigate("/pricing")}
                  title={t("verseAi.viewPlans")}>
                  {t("verseAi.viewPlans")}
                </button>
              </>
            )}
            {accessDenied.reason === "internet_verification_required" && (
              <>
                <Wifi size={40} style={{ color: "var(--warning)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">{t("verseAi.connectionRequired")}</h2>
                <p className="sts3-lock-desc">
                  {t("verseAi.connectionRequiredDesc")}
                </p>
                <button
                  className="sts3-btn sts3-btn--primary"
                  onClick={() => setAccessDenied(null)}
                  title={t("verseAi.retry")}>
                  {t("verseAi.retry")}
                </button>
              </>
            )}
            {accessDenied.reason === "server_error" && (
              <>
                <AlertTriangle size={40} style={{ color: "var(--warning)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">{t("verseAi.serverError")}</h2>
                <p className="sts3-lock-desc">
                  {t("verseAi.serverErrorDesc")}
                </p>
                <button
                  className="sts3-btn sts3-btn--primary"
                  onClick={() => setAccessDenied(null)}
                  title={t("verseAi.retry")}>
                  {t("verseAi.retry")}
                </button>
              </>
            )}
            {accessDenied.reason === "device_not_found" && (
              <>
                <ShieldAlert size={40} style={{ color: "var(--danger)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">{t("verseAi.deviceNotFound")}</h2>
                <p className="sts3-lock-desc">
                  {t("verseAi.deviceNotFoundDesc")}
                </p>
                <button
                  className="sts3-btn sts3-btn--primary"
                  onClick={() => setAccessDenied(null)}
                  title={t("verseAi.retry")}>
                  {t("verseAi.retry")}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Service Error ── */}
      {assemblyAIError && (
        <div className="sts3-lock-overlay">
          <div className="sts3-lock-card">
            <h2 className="sts3-lock-title">{t("verseAi.voiceBibleUnavailable")}</h2>
            <p className="sts3-lock-desc">
              {t("verseAi.voiceBibleUnavailableDesc")}
            </p>
            <button
              className="sts3-btn sts3-btn--primary"
              onClick={() => {
                setAssemblyAIError(false);
                void lmDockService.startListening(selectedMic || undefined);
              }}
              title={t("verseAi.retryConnection")}>
              {t("verseAi.retryConnection")}
            </button>
          </div>
        </div>
      )}

      {/* ── Tutorial Tour ── */}
      <SpeechToScriptureTutorial
        isActive={tourActive}
        onClose={() => setTourActive(false)}
        onFinish={() => { markSpeechToScriptureTutorialCompleted(); setTourActive(false); }}
      />
    </div>
  );
}
