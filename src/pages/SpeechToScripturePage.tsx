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
  Clock,
  Copy,
  Download,
  FileText,
  Lock,
  Mic,
  Radio,
  RotateCcw,
  Search,
  ShieldAlert,
  StopCircle,
  Volume2,
  Wifi,
  X,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePerformanceMonitor } from "../dock/usePerformanceMonitor";
import { bibleObsService } from "../bible/bibleObsService";
import type { BibleSlide } from "../bible/types";
import CreditsDisplay from "../components/CreditsDisplay";
import MacSelect from "../components/MacSelect";
import { useAuth } from "../contexts/AuthContext";
import { getSettings as getMvSettings, updateSettings as updateMvSettings } from "../multiview/mvStore";
import { track } from "../services/analytics";
import {
  APP_VERSION,
  clearDeviceSecretForRecovery,
  getDeviceId,
  getDeviceSecret,
  refreshAccountBootstrapFromServer,
} from "../services/authService";
import {
  deductTranscriptionDurationWithSync,
  getCreditsBalance,
  onCreditChange,
  syncCreditsWithBackend,
} from "../services/credits";
import { checkEntitlementSync } from "../services/entitlementClient";
import { getEffectivePlan } from "../services/licenseService";
import { lmDockService, type LmDockSnapshot } from "../services/lmDockService";
import { obsService } from "../services/obsService";
import { loadData } from "../services/store";
import { getUserScopedKey } from "../services/userScopedStorage";
import { trackStsPushToLive, trackVoiceSessionCompleted, trackVoiceSessionStarted } from "../services/tracking";
import type { VoiceBibleCandidate } from "../services/voiceBibleTypes";
import { MATCH_SOURCE_LABEL } from "../services/voiceBibleTypes";
import { isWhisperReady, loadWhisperModel } from "../services/whisperService";
import { createTranscript, saveTranscript } from "../transcripts/transcriptService";
import { loadLmSettings } from "../services/lmSettings";
import { resolveScriptureProjection } from "../services/scriptureProjection";
import { readNativeDockSetting, writeNativeDockSetting } from "../services/localDockSettings";
import { isConfirmedAppClose } from "../services/appCloseGuard";

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.creatorstudioslabs.stream";
const PREFERRED_MIC_STORAGE_KEY = "ocs-speech-to-scripture-mic-id";

type SpeechQuota = {
  plan: string;
  dailyLimitSeconds: number | null;
  dailyRemainingSeconds: number | null;
  weeklyLimitSeconds: number | null;
  weeklyRemainingSeconds: number | null;
  totalRemainingSeconds: number | null;
};

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

function formatQuotaTime(seconds: number | null): string {
  if (seconds === null || seconds < 0 || !Number.isFinite(seconds)) return "Unlimited";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
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

function loadPreferredMicId(): string {
  const nativeMic = readNativeDockSetting<string>(PREFERRED_MIC_STORAGE_KEY);
  if (nativeMic?.trim()) return nativeMic.trim();
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(getUserScopedKey(PREFERRED_MIC_STORAGE_KEY))?.trim() ?? "";
  } catch {
    return "";
  }
}

function savePreferredMicId(micId: string): void {
  writeNativeDockSetting(PREFERRED_MIC_STORAGE_KEY, micId.trim());
  if (typeof localStorage === "undefined") return;
  try {
    const key = getUserScopedKey(PREFERRED_MIC_STORAGE_KEY);
    const trimmed = micId.trim();
    if (trimmed) localStorage.setItem(key, trimmed);
    else localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export default function SpeechToScripturePage() {
  const { t } = useTranslation();

  // The root app keeps the speech service demand-loaded. Initialize it here
  // when this route is explicitly opened so direct page controls and Dock
  // commands share the same managed service instance.
  useEffect(() => {
    lmDockService.init();
  }, []);

  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const effectivePlan = getEffectivePlan(user);

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // ── Backend access check (declared early for use in useEffects below) ──
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [sessionLimitSeconds, setSessionLimitSeconds] = useState<number | null>(null);
  const [speechQuota, setSpeechQuota] = useState<SpeechQuota | null>(null);
  const [accessDenied, setAccessDenied] = useState<{
    reason: string;
    requiredPlan?: string;
  } | null>(null);

  const hasCustomApiKey = Boolean(
    (import.meta as any).env?.VITE_DEEPGRAM_API_KEY ||
    (import.meta as any).env?.VITE_ASSEMBLYAI_API_KEY ||
    (import.meta as any).env?.DEV
  );

  // ── Upfront plan gate — block immediately if plan doesn't include Verse AI ──
  useEffect(() => {
    if (isAdmin || hasCustomApiKey) return; // Admins and local dev / custom API keys bypass all entitlement checks
    const result = checkEntitlementSync("speechToScripture", effectivePlan);
    if (!result.allowed) {
      setAccessDenied({
        reason: "feature_not_available",
        requiredPlan: result.requiredPlan,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePlan, isAdmin, hasCustomApiKey]);

  // ── Track credit balance for Start button gating ──
  const [creditBalance, setCreditBalance] = useState(() => getCreditsBalance());
  const [isUnlimited, setIsUnlimited] = useState(false);
  const hasUnlimitedPlan = effectivePlan === "ambassador" || effectivePlan === "unlimited";

  const updateSpeechQuota = useCallback((data: any) => {
    const dailyRemainingSeconds = typeof data?.dailyRemainingSeconds === "number"
      ? data.dailyRemainingSeconds
      : null;
    const weeklyRemainingSeconds = typeof data?.weeklyRemainingSeconds === "number"
      ? data.weeklyRemainingSeconds
      : null;
    const transcriptionBalance = data?.transcriptionBalance;
    const totalRemainingSeconds = typeof transcriptionBalance?.totalAvailableSeconds === "number"
      ? transcriptionBalance.totalAvailableSeconds
      : null;

    if (typeof data?.plan !== "string" && dailyRemainingSeconds === null && totalRemainingSeconds === null) return;
    setSpeechQuota({
      plan: typeof data?.plan === "string" ? data.plan : effectivePlan,
      dailyLimitSeconds: typeof data?.dailyLimitMinutes === "number" ? data.dailyLimitMinutes * 60 : null,
      dailyRemainingSeconds,
      weeklyLimitSeconds: typeof data?.weeklyLimitMinutes === "number" ? data.weeklyLimitMinutes * 60 : null,
      weeklyRemainingSeconds,
      totalRemainingSeconds,
    });
  }, [effectivePlan]);

  const hasQuotaRemaining = !speechQuota || [
    speechQuota.dailyRemainingSeconds,
    speechQuota.weeklyRemainingSeconds,
    speechQuota.plan !== "free" && speechQuota.totalRemainingSeconds !== null && speechQuota.totalRemainingSeconds >= 0
      ? speechQuota.totalRemainingSeconds
      : null,
  ].filter((value): value is number => typeof value === "number").every((value) => value > 0);

  const quotaRemainingSeconds = speechQuota
    ? [
        speechQuota.dailyRemainingSeconds,
        speechQuota.weeklyRemainingSeconds,
        speechQuota.plan !== "free" && speechQuota.totalRemainingSeconds !== null && speechQuota.totalRemainingSeconds >= 0
          ? speechQuota.totalRemainingSeconds
          : null,
      ].filter((value): value is number => typeof value === "number").reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY)
    : null;

  // Read the server-controlled allowance when the page opens so the banner
  // and Start button are accurate before the first listening session.
  useEffect(() => {
    if (isAdmin || hasCustomApiKey) return;
    const deviceId = getDeviceId();
    if (!deviceId) return;
    void fetch(
      `${API_BASE}/api/device/speech-to-scripture/check-access?deviceId=${encodeURIComponent(deviceId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Version": APP_VERSION,
          "X-Device-Secret": getDeviceSecret() || "",
        },
      },
    ).then((res) => res.json().catch(() => null)).then((data) => {
      if (data) updateSpeechQuota(data);
    }).catch(() => {
      // The start flow remains the authoritative retry path.
    });
  }, [hasCustomApiKey, isAdmin, updateSpeechQuota]);

  const quotaExhausted = Boolean(speechQuota && !hasQuotaRemaining);

  useEffect(() => {
    if (hasUnlimitedPlan || hasCustomApiKey) return;
    void syncCreditsWithBackend().then((bal) => {
      if (bal === null) {
        setIsUnlimited(false);
      } else if (bal === -1) {
        setIsUnlimited(true);
      } else if (bal >= 0) {
        setIsUnlimited(false);
        setCreditBalance(bal);
      }
    });
    const unsub = onCreditChange((bal) => setCreditBalance(bal));
    return unsub;
  }, [hasCustomApiKey, hasUnlimitedPlan]);

  const hasCredits = isAdmin || hasUnlimitedPlan || isUnlimited || hasCustomApiKey || creditBalance > 0;
  const chargedSessionCreditsRef = useRef(0);
  const chargedSessionSecondsRef = useRef(0);
  const sessionIdRef = useRef("");
  const chargingSessionCreditsRef = useRef(false);
  const stoppedForCreditFailureRef = useRef(false);
  const limitStopTriggeredRef = useRef(false);

  // ── LM state ──
  const [snapshot, setSnapshot] = useState<LmDockSnapshot>(lmDockService.getSnapshot());
  const [mics, setMics] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedMic, setSelectedMic] = useState(() => loadPreferredMicId());
  const [micLoading, setMicLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLine = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  }, []);

  const selectMic = useCallback((micId: string) => {
    setSelectedMic(micId);
    savePreferredMicId(micId);
  }, []);

  const [inputGain, setInputGainState] = useState(() => {
    const mv = getMvSettings();
    return Number(mv.inputGain ?? 100);
  });

  const handleGainChange = useCallback((newGain: number) => {
    const clamped = Math.max(50, Math.min(400, newGain));
    setInputGainState(clamped);
    updateMvSettings({ inputGain: clamped });
    void lmDockService.setInputGain(clamped);
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
      if (devices.length > 0) {
        const savedMic = loadPreferredMicId();
        const currentStillAvailable = selectedMic && devices.some((device) => device.id === selectedMic);
        const savedStillAvailable = savedMic && devices.some((device) => device.id === savedMic);
        if (!currentStillAvailable) {
          const nextMicId = savedStillAvailable ? savedMic : devices[0].id;
          selectMic(nextMicId);
        }
      }
    } catch (err) {
      console.warn("[SpeechToScripture] Failed to enumerate mics:", err);
    } finally {
      setMicLoading(false);
    }
  }, [selectMic, selectedMic]);

  useEffect(() => {
    void enumerateMics();
  }, []);

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

  const chargeTranscriptionDuration = useCallback(async (
    elapsedSeconds: number,
    reason: "live" | "final",
  ): Promise<boolean> => {
    if (isAdmin || hasUnlimitedPlan || isUnlimited || hasCustomApiKey) {
      chargedSessionSecondsRef.current = Math.max(chargedSessionSecondsRef.current, elapsedSeconds);
      return true;
    }

    const deltaSeconds = Math.round(elapsedSeconds - chargedSessionSecondsRef.current);
    if (deltaSeconds <= 0) return true;
    if (chargingSessionCreditsRef.current) return true;

    chargingSessionCreditsRef.current = true;
    try {
      const offset = Math.round(chargedSessionSecondsRef.current);
      const requestId = `${sessionIdRef.current || "sts"}_${offset}`;

      const res = await deductTranscriptionDurationWithSync({
        seconds: deltaSeconds,
        requestId,
        description: reason === "live"
          ? `Transcription live charge: ${deltaSeconds}s audio`
          : `Transcription final charge: ${deltaSeconds}s audio`,
        metadata: {
          durationSec: deltaSeconds,
          source: "speech_to_scripture",
          chargeReason: reason,
          previouslyChargedSeconds: offset,
          sessionId: sessionIdRef.current,
        },
      });

      if (!res.success) {
        setSpeechQuota((previous) => previous
          ? {
              ...previous,
              dailyRemainingSeconds: typeof res.dailyRemainingSeconds === "number"
                ? res.dailyRemainingSeconds
                : previous.dailyRemainingSeconds,
              weeklyRemainingSeconds: typeof res.weeklyRemainingSeconds === "number"
                ? res.weeklyRemainingSeconds
                : previous.weeklyRemainingSeconds,
            }
          : previous);
        if (res.exhausted || res.reason === "daily_speech_limit" || res.reason === "weekly_speech_limit") {
          setAccessDenied({ reason: res.reason || "TRANSCRIPTION_CREDITS_EXHAUSTED" });
        }
        setSaveToast({ message: t("verseAi.creditDeductionFailed"), isError: true });
        setTimeout(() => setSaveToast(null), 4000);
        return false;
      }

      chargedSessionSecondsRef.current += deltaSeconds;
      chargedSessionCreditsRef.current = Math.round((chargedSessionSecondsRef.current / 60) * 100) / 100;
      setSpeechQuota((previous) => {
        if (!previous) return previous;
        const subtract = (value: number | null) => value === null ? null : Math.max(0, value - deltaSeconds);
        return {
          ...previous,
          dailyRemainingSeconds: subtract(previous.dailyRemainingSeconds),
          weeklyRemainingSeconds: subtract(previous.weeklyRemainingSeconds),
          totalRemainingSeconds: subtract(previous.totalRemainingSeconds),
        };
      });
      return true;
    } catch (err) {
      console.warn("[Credits] Transcription duration deduction error:", err);
      setSaveToast({ message: t("verseAi.creditSyncFailed"), isError: true });
      setTimeout(() => setSaveToast(null), 4000);
      return false;
    } finally {
      chargingSessionCreditsRef.current = false;
    }
  }, [hasCustomApiKey, hasUnlimitedPlan, isAdmin, isUnlimited, t]);

  const chargeTranscriptionCredits = useCallback(async (
    _targetCredits: number,
    elapsedSeconds: number,
    reason: "live" | "final",
  ): Promise<boolean> => {
    return chargeTranscriptionDuration(elapsedSeconds, reason);
  }, [chargeTranscriptionDuration]);

  const handleStart = useCallback(async () => {
    // Disable button and show checking state
    setCheckingAccess(true);
    setAccessDenied(null);
    setSessionLimitSeconds(null);

    try {
      if (hasCustomApiKey) {
        console.log("[SpeechToScripture] 🚀 Using direct API key / Dev mode — starting lmDockService directly");
        chargedSessionCreditsRef.current = 0;
        stoppedForCreditFailureRef.current = false;
        limitStopTriggeredRef.current = false;
        setSessionLimitSeconds(null);
        track("sts_listening_started", { mic: selectedMic || "default" });
        trackVoiceSessionStarted();
        await lmDockService.startListening(selectedMic || undefined);
        return;
      }

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
      updateSpeechQuota(data);
      console.log("[SpeechToScripture] 📋 Access check response:", JSON.stringify(data));

      // If device not found, try refreshing bootstrap (may re-register device) and retry once
      if (!data.allowed && data.reason === "device_not_found") {
        console.warn("[SpeechToScripture] Device not found, refreshing bootstrap...");
        const refreshResult = await refreshAccountBootstrapFromServer();
        if (refreshResult.status === "ok") {
          ({ data } = await requestAccess());
          updateSpeechQuota(data);
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
        updateSpeechQuota(data);
      }

      if (!data.allowed) {
        console.warn("[SpeechToScripture] ❌ Access DENIED:", data.reason, "requiredPlan:", data.requiredPlan);
        setAccessDenied({ reason: data.reason, requiredPlan: data.requiredPlan });
        return;
      }

      // Backend approved — start listening
      console.log("[SpeechToScripture] ✅ Access ALLOWED — calling lmDockService.startListening()");
      sessionIdRef.current = `sts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      chargedSessionSecondsRef.current = 0;
      chargedSessionCreditsRef.current = 0;
      stoppedForCreditFailureRef.current = false;
      limitStopTriggeredRef.current = false;
      const sessionLimits = [
        typeof data.dailyRemainingSeconds === "number" ? data.dailyRemainingSeconds : null,
        typeof data.weeklyRemainingSeconds === "number" ? data.weeklyRemainingSeconds : null,
        typeof data.transcriptionBalance?.totalAvailableSeconds === "number" && data.transcriptionBalance.totalAvailableSeconds >= 0
          ? data.transcriptionBalance.totalAvailableSeconds
          : null,
      ].filter((value): value is number => typeof value === "number");
      setSessionLimitSeconds(sessionLimits.length > 0 ? Math.min(...sessionLimits) : null);
      track("sts_listening_started", { mic: selectedMic || "default" });
      trackVoiceSessionStarted();
      await lmDockService.startListening(selectedMic || undefined);
    } catch (err) {
      console.warn("[SpeechToScripture] ❌ Access check FAILED (network/error):", err);
      const isNetworkError = err instanceof TypeError && /fetch|network/i.test(err.message);
      setAccessDenied({ reason: isNetworkError ? "internet_verification_required" : "server_error" });
    } finally {
      setCheckingAccess(false);
    }
  }, [hasCustomApiKey, selectedMic, updateSpeechQuota]);

  const confirmStop = useCallback(() => {
    track("sts_listening_stopped", { durationSec: elapsedRef.current });
    trackVoiceSessionCompleted(Math.round(elapsedRef.current));

    const serviceFailed = snapshot.status === "error";
    const durationSec = elapsedRef.current;

    // Deduct transcription credits for the actual AI audio session. This must
    // not depend on transcript saving or finalized rows; otherwise a real
    // AssemblyAI session can complete with no credit transaction recorded.
    void (async () => {
      try {
        const remainingSeconds = Math.max(0, durationSec - chargedSessionSecondsRef.current);
        if (remainingSeconds > 0 && !serviceFailed) {
          const ok = await chargeTranscriptionDuration(durationSec, "final");
          if (!ok) {
            setAccessDenied((previous) => previous || { reason: "TRANSCRIPTION_CREDITS_EXHAUSTED" });
            setSaveToast({ message: t("verseAi.creditDeductionFailed"), isError: true });
            setTimeout(() => setSaveToast(null), 4000);
          }
        }
      } catch (err) {
        console.warn("[Credits] Transcription credit deduction error:", err);
        setSaveToast({ message: t("verseAi.creditSyncFailed"), isError: true });
        setTimeout(() => setSaveToast(null), 4000);
      }
    })();

    // ── Persist transcript to library before clearing session ──
    const finalized = snapshot.entries.filter((e) => e.finalized);
    if (finalized.length > 0) {
      const text = finalized.map((e, idx) => {
        // Estimate per-entry elapsed time for entries without startTime
        const prevWords = finalized.slice(0, idx).reduce((n, pe) => n + pe.text.split(/\s+/).length, 0);
        const fallbackTime = prevWords * 0.4;
        return `${formatTimestamp(e, fallbackTime)}\t${e.text}`;
      }).join("\n");
      const persistableCandidates = [
        ...snapshot.queue,
        ...snapshot.suggestions.filter(
          (candidate) => (
            (candidate.source === "alias" || candidate.source === "keyword") &&
            candidate.confidence >= 0.90
          ),
        ),
      ].filter((candidate, index, all) => (
        all.findIndex((other) => (
          other.book === candidate.book &&
          other.chapter === candidate.chapter &&
          other.verse === candidate.verse
        )) === index
      ));
      const detectedScriptures = persistableCandidates.map((c) => ({
        id: `sc-${c.book}-${c.chapter}-${c.verse}`,
        transcriptId: "",
        reference: c.label,
        verseText: c.snippet,
        confidence: c.confidence,
      }));
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
      }).catch(() => {
        // Best-effort — don't block stop on save failure
      });
    }

    lmDockService.stopListening();
    setShowStopConfirm(false);
  }, [chargeTranscriptionCredits, snapshot.entries, snapshot.queue, snapshot.status, snapshot.suggestions, t, user?.id]);

  const isListening = snapshot.status === "listening";
  const isConnecting = snapshot.status === "requesting-mic" || snapshot.status === "connecting";
  const canStopListening = isListening || isConnecting;
  const isTranscribing = isListening;
  const levelPercent = Math.round(snapshot.inputLevel * 100);

  const handleStop = useCallback(() => {
    if (isConnecting) {
      confirmStop();
      return;
    }
    setShowStopConfirm(true);
  }, [confirmStop, isConnecting]);

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

  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  useEffect(() => {
    if (isTranscribing && snapshot.startedAt) {
      const updateElapsed = () => {
        setElapsed(Math.max(0, Math.floor((Date.now() - snapshot.startedAt!) / 1000)));
      };
      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTranscribing, snapshot.startedAt]);

  const handleInactivityStop = useCallback(() => {
    confirmStop();
    lmDockService.stopDueToInactivity();
  }, [confirmStop]);

  // ── Auto-stop when inactivity countdown reaches 0 ──
  useEffect(() => {
    if (snapshot.inactivityPrompt?.active && snapshot.inactivityPrompt.remainingSeconds === 0 && isTranscribing) {
      handleInactivityStop();
    }
  }, [snapshot.inactivityPrompt, isTranscribing, handleInactivityStop]);

  // ── Auto-clear inactivity notice after 6 seconds ──
  useEffect(() => {
    if (!snapshot.inactivityNotice) return;
    const timer = setTimeout(() => {
      lmDockService.clearInactivityNotice();
    }, 6000);
    return () => clearTimeout(timer);
  }, [snapshot.inactivityNotice]);

  useEffect(() => {
    if (!isTranscribing || sessionLimitSeconds === null || sessionLimitSeconds <= 0 || elapsed < sessionLimitSeconds || limitStopTriggeredRef.current) return;
    limitStopTriggeredRef.current = true;
    const limitReason = speechQuota?.dailyRemainingSeconds === 0
      ? "daily_speech_limit"
      : speechQuota?.weeklyRemainingSeconds === 0
        ? "weekly_speech_limit"
        : "TRANSCRIPTION_CREDITS_EXHAUSTED";
    setAccessDenied({ reason: limitReason });
    confirmStop();
  }, [confirmStop, elapsed, isTranscribing, sessionLimitSeconds, speechQuota]);

  useEffect(() => {
    if (!isListening || stoppedForCreditFailureRef.current) return;

    let cancelled = false;
    void (async () => {
      const chargeSeconds = Math.max(1, elapsed);
      // Periodically charge every 15s elapsed
      if (cancelled || (chargeSeconds - chargedSessionSecondsRef.current) < 15) return;

      const ok = await chargeTranscriptionDuration(chargeSeconds, "live");
      if (!cancelled && !ok) {
        console.warn("[SpeechToScripture] 🛑 Stopped listening due to credit failure!", { chargeSeconds });
        stoppedForCreditFailureRef.current = true;
        lmDockService.stopListening();
        setShowStopConfirm(false);
        setAccessDenied((previous) => previous || {
          reason: speechQuota?.dailyRemainingSeconds === 0
            ? "daily_speech_limit"
            : speechQuota?.weeklyRemainingSeconds === 0
              ? "weekly_speech_limit"
              : "TRANSCRIPTION_CREDITS_EXHAUSTED",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chargeTranscriptionDuration, elapsed, isListening, speechQuota]);

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
      const settings = loadLmSettings();
      candidate = await resolveScriptureProjection(candidate, settings.translation);
      const slide: BibleSlide = {
        id: `speech-${candidate.book}-${candidate.chapter}-${candidate.verse}`,
        text: candidate.snippet || `${candidate.book} ${candidate.chapter}:${candidate.verse}`,
        reference: `${candidate.label} (${candidate.translation})`,
        verseRange: candidate.endVerse ? `${candidate.verse}-${candidate.endVerse}` : String(candidate.verse),
        index: 0,
        total: 1,
      };
      await bibleObsService.pushSlide(slide, null, true, false, settings.overlayMode);
      track("sts_push_to_live", { reference: candidate.label, confidence: candidate.confidence });
      trackStsPushToLive();
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
    if (snapshot.status === "error") {
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

  // ── Top match: manual selection or the newest reference/quotation ──
  const topMatch = useMemo(() => {
    if (selectedCandidate) return selectedCandidate;
    return snapshot.latestMatch ?? null;
  }, [selectedCandidate, snapshot.latestMatch]);

  // ── Follow the newest detection when it arrives ──
  useEffect(() => {
    setSelectedCandidate(null);
  }, [snapshot.latestMatch]);

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
      <header className="sts3-header">
        <div className="sts3-header-left">
          <div className="sts3-logo-box">
            <Mic size={18} />
          </div>
          <div>
            <div className="sts3-header-title">Verse AI</div>
            <div className="sts3-header-sub">{t("verseAi.headerDesc", "Real-time speech to scripture detection & OBS broadcast")}</div>
            {speechQuota?.plan === "free" && (
              <div className="sts3-plan-badge">
                Free plan · {formatQuotaTime(speechQuota.dailyRemainingSeconds)} today · {formatQuotaTime(speechQuota.weeklyRemainingSeconds)} this week
              </div>
            )}
            {speechQuota && speechQuota.plan !== "free" && (
              <div className="sts3-plan-badge">
                {speechQuota.plan} plan · {formatQuotaTime(speechQuota.totalRemainingSeconds)} remaining
              </div>
            )}
          </div>
        </div>
        <div className="sts3-header-right">
          {/* Quick links: Transcripts library & New Session */}
          <button
            type="button"
            className="sts3-header-icon-btn"
            style={{ width: "auto", padding: "6px 12px", gap: "6px", display: "inline-flex", fontSize: "0.82rem", borderRadius: "8px" }}
            onClick={() => navigate("/transcripts")}
            title="View all saved transcripts"
          >
            <FileText size={15} />
            <span>Transcripts</span>
          </button>

          {!canStopListening && (snapshot.entries.length > 0 || snapshot.suggestions.length > 0) && (
            <button
              type="button"
              className="sts3-header-icon-btn"
              style={{ width: "auto", padding: "6px 12px", gap: "6px", display: "inline-flex", fontSize: "0.82rem", borderRadius: "8px" }}
              onClick={() => {
                lmDockService.stopListening();
                setElapsed(0);
              }}
              title="Start a new speech session"
            >
              <RotateCcw size={15} />
              <span>New Session</span>
            </button>
          )}

          <CreditsDisplay userId={user?.id} />
          <button
            className={`sts3-btn ${canStopListening ? "sts3-btn--red" : "sts3-btn--primary"}`}
            onClick={canStopListening ? handleStop : handleStart}
            disabled={checkingAccess || (!canStopListening && (!hasCredits || quotaExhausted))}
            title={isConnecting ? `${t("verseAi.connecting")} (${t("verseAi.cancel")})` : !canStopListening && quotaExhausted ? "Speech to Scripture limit reached" : !canStopListening && !hasCredits ? t("verseAi.noCredits") : canStopListening ? t("verseAi.stopListening") : t("verseAi.startListening")}>
            {canStopListening ? (
              isConnecting ? (
                <><span className="sts3-spinner" /> {t("verseAi.connecting")}</>
              ) : (
                <><StopCircle size={15} /> {t("verseAi.stopListening")}</>
              )
            ) : checkingAccess ? (
              <><span className="sts3-spinner" /> {t("verseAi.checkingAccess")}</>
            ) : quotaExhausted ? (
              <><Clock size={15} /> Limit reached</>
            ) : !hasCredits ? (
              <><Lock size={15} /> {t("verseAi.noCredits")}</>
            ) : (
              <><Mic size={15} /> {t("verseAi.showInObs", "Start Listening")}</>
            )}
          </button>
        </div>
      </header>

      {speechQuota && (
        <div className={`sts3-quota-banner${quotaExhausted ? " sts3-quota-banner--exhausted" : ""}`}>
          <Clock size={15} />
          <span>
            {quotaExhausted
              ? speechQuota.plan === "free"
                ? speechQuota.dailyRemainingSeconds === 0
                  ? "Limit reached for today. Try again tomorrow."
                  : "Weekly limit reached. Your allowance refreshes next week."
                : "Transcription allowance reached. Upgrade or add more credits to continue."
              : speechQuota.plan === "free"
                ? `${formatQuotaTime(quotaRemainingSeconds)} left · ${formatQuotaTime(speechQuota.weeklyRemainingSeconds)} this week`
                : `${formatQuotaTime(quotaRemainingSeconds)} left in your transcription allowance`}
          </span>
          {!quotaExhausted && <button type="button" onClick={() => navigate("/subscription/plans")}>Upgrade</button>}
          {quotaExhausted && <button type="button" onClick={() => navigate("/subscription/plans")}>View plans</button>}
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
              <MacSelect
                options={mics.map((mic) => ({ value: mic.id, label: mic.label }))}
                value={selectedMic}
                onChange={(micId) => {
                  track("sts_mic_changed", { mic: micId });
                  selectMic(micId);
                }}
                onReload={() => void enumerateMics()}
                ariaLabel={t("verseAi.selectMicrophone")}
                quickStartLabel={t("verseAi.quickStart")}
                allDevicesLabel={t("verseAi.allDevices")}
                reloadLabel={t("verseAi.reloadDevices")}
                loadingLabel={t("verseAi.loadingMics")}
                placeholder={t("verseAi.noMicrophone")}
                emptyLabel={t("verseAi.noMicrophonesFound")}
                loading={micLoading}
                disabled={isListening || isConnecting}
              />
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
              <div className="sts3-gain-control" title={t("verseAi.micGainTitle", "Microphone Sensitivity / Boost (50% - 400%)")}>
                <Volume2 size={13} />
                <span style={{ minWidth: 38 }}>{inputGain}%</span>
                <input
                  type="range"
                  min="50"
                  max="400"
                  step="25"
                  value={inputGain}
                  onChange={(e) => handleGainChange(Number(e.target.value))}
                  className="sts3-gain-slider"
                  aria-label="Microphone Sensitivity Boost"
                />
                {isListening && (
                  <div className="sts3-mini-meter" title={`Mic Level: ${levelPercent}%`}>
                    <div
                      className="sts3-mini-meter-fill"
                      style={{
                        width: `${levelPercent}%`,
                        backgroundColor: levelPercent > 80 ? "var(--error, #ef4444)" : levelPercent > 50 ? "var(--warning, #f59e0b)" : "var(--success, #10b981)",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="sts3-search-box">
              <Search size={13} className="sts3-search-icon" />
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

            <div className={`sts3-transcript-list${transcriptCollapsed ? " sts3-transcript-collapsed" : ""}`} ref={transcriptRef}>
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
          <div className="sts3-main-card">
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
          <div className="sts3-candidate-card">
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

      {/* ── Inactivity Prompt Modal ── */}
      {snapshot.inactivityPrompt?.active && (
        <div className="sts3-modal-overlay">
          <div className="sts3-modal sts3-modal--small" onClick={(e) => e.stopPropagation()}>
            <div className="sts3-modal-header" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Clock size={20} style={{ color: "var(--warning)" }} />
              <h3 className="sts3-modal-title">Are you still using Voice AI?</h3>
            </div>
            <div className="sts3-modal-body">
              <p className="sts3-modal-text">
                No speech detected for {snapshot.inactivityPrompt.intervalMinutes} minutes. Listening will automatically stop in{" "}
                <strong>{snapshot.inactivityPrompt.remainingSeconds}s</strong> to conserve credits.
              </p>
            </div>
            <div className="sts3-modal-footer">
              <button
                className="sts3-modal-btn sts3-modal-btn--ghost"
                onClick={handleInactivityStop}
                title="Stop listening"
              >
                Stop
              </button>
              <button
                className="sts3-modal-btn sts3-modal-btn--primary"
                onClick={() => lmDockService.confirmStillUsing()}
                title="I'm still using it"
              >
                I'm still using it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inactivity Notice Toast ── */}
      {snapshot.inactivityNotice && (
        <div className="sts3-inactivity-toast">
          <Clock size={18} className="sts3-inactivity-toast__icon" />
          <span>{snapshot.inactivityNotice}</span>
          <button
            className="sts3-inactivity-toast__close"
            onClick={() => lmDockService.clearInactivityNotice()}
            title="Dismiss"
          >
            ✕
          </button>
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
                  onClick={() => navigate("/subscription/plans")}
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
            {(accessDenied.reason === "insufficient_credits" || accessDenied.reason === "TRANSCRIPTION_CREDITS_EXHAUSTED") && (
              <>
                <Zap size={40} style={{ color: "var(--warning)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">Transcription Credits Exhausted</h2>
                <p className="sts3-lock-desc">
                  You have used all your included and top-up transcription credits. Top up credits or upgrade your plan to continue real-time sermon transcription.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  <button
                    className="sts3-btn sts3-btn--primary"
                    onClick={() => navigate("/credits")}
                    title="Top Up Credits">
                    Top Up Credits
                  </button>
                  <button
                    className="sts3-btn sts3-btn--secondary"
                    onClick={() => navigate("/subscription/plans")}
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
            {(accessDenied.reason === "daily_speech_limit" || accessDenied.reason === "weekly_speech_limit") && (
              <>
                <Clock size={40} style={{ color: "var(--warning)", marginBottom: 16 }} />
                <h2 className="sts3-lock-title">
                  {accessDenied.reason === "daily_speech_limit" ? "Daily limit reached" : "Weekly limit reached"}
                </h2>
                <p className="sts3-lock-desc">
                  {accessDenied.reason === "daily_speech_limit"
                    ? "Limit reached for today. Try again tomorrow."
                    : "Your weekly allowance is used. It will refresh at the start of the next week."}
                  {speechQuota?.dailyLimitSeconds !== null && speechQuota?.dailyLimitSeconds !== undefined && (
                    <> Free accounts have {formatQuotaTime(speechQuota.dailyLimitSeconds)} per day.</>
                  )}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="sts3-btn sts3-btn--primary" onClick={() => navigate("/subscription/plans")} title="View plans">View plans</button>
                  <button className="sts3-btn sts3-btn--ghost" onClick={() => setAccessDenied(null)} title="Dismiss">Dismiss</button>
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
                  onClick={() => navigate("/subscription/plans")}
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
          <div className="sts3-lock-card" style={{ position: "relative" }}>
            <button
              onClick={() => {
                setAssemblyAIError(false);
                lmDockService.stopListening();
              }}
              title={t("common.close", "Close and Stop")}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "transparent",
                border: "none",
                color: "var(--text-muted, #94a3b8)",
                cursor: "pointer",
                padding: 6,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
              <X size={18} />
            </button>
            <h2 className="sts3-lock-title">{t("verseAi.voiceBibleUnavailable")}</h2>
            <p className="sts3-lock-desc">
              {t("verseAi.voiceBibleUnavailableDesc")}
            </p>
            {snapshot.error && (
              <p className="sts3-lock-desc" role="alert" style={{ color: "var(--error)" }}>
                {snapshot.error}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
              <button
                className="sts3-btn sts3-btn--primary"
                onClick={() => {
                  setAssemblyAIError(false);
                  void lmDockService.startListening(selectedMic || undefined);
                }}
                title={t("verseAi.retryConnection")}>
                {t("verseAi.retryConnection")}
              </button>
              <button
                className="sts3-btn sts3-btn--red"
                onClick={() => {
                  setAssemblyAIError(false);
                  lmDockService.stopListening();
                }}
                title={t("verseAi.stopListening", "Stop Listening")}>
                <StopCircle size={15} /> {t("verseAi.stopListening", "Stop")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
