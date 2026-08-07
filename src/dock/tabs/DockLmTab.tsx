import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Edit2, MonitorUp, Check, StickyNote, HelpCircle } from "lucide-react";
import { dockObsClient, type DockObsStatus } from "../dockObsClient";
import { dockClient, type DockStateMessage, type DockCommandType } from "../../services/dockBridge";
import type { DockPresentationOutputTarget } from "../dockPresentationTarget";
import { isPresentationLinkTarget } from "../dockPresentationTarget";
import type { VoiceBibleCandidate, TranscriptEntry } from "../../services/voiceBibleTypes";

import { parseScriptureReference } from "../../services/scriptureParser";
import { onCreditChange, isProUnlocked } from "../../services/credits";
import Icon from "../DockIcon";
import { getUserScopedKey } from "../../services/userScopedStorage";
import { getSettings } from "../../multiview/mvStore";
import { getOverlayBaseUrlSync } from "../../services/overlayUrl";
import { getEnvConfig } from "../../services/envConfig";
import type { LmDockSnapshot } from "../../services/lmDockService";
import BibleAiOnboarding, {
  isBibleAiOnboardingCompleted,
  resetBibleAiOnboarding,
} from "../../../others/BibleAiOnboarding";
import { publishDockStagedItemToPresentation } from "../../services/presentationDockBridge";
import {
  appendTextToDockNotes,
  resolveDockNotesPresentationSettings,
} from "../dockNotesStorage";
import {
  resolveDockBibleReferenceLabels,
  resolveDockBibleThemeForOverlayMode,
} from "../dockBibleThemeResolution";
import {
  createDockNotesAppendCommand,
  postDockNotesAppendCommand,
} from "../../services/dockNotesInterop";
import { getRecommendedPollingInterval } from "../../services/performanceManager";
import DockNotesTextTools from "../components/DockNotesTextTools";
import { formatNoteText, type NoteTextToolAction } from "../noteTextTools";

type LmStatus = "idle" | "requesting-mic" | "connecting" | "listening" | "error";
type LmOverlayMode = "fullscreen" | "lower-third";

const LM_DOCK_SETTINGS_KEY = "ocs-lm-dock-settings";
const PREFERRED_MIC_STORAGE_KEY = "ocs-speech-to-scripture-mic-id";
const HISTORY_STORAGE_KEY = "ocs-lm-dock-history";
const MAX_HISTORY = 50;
const MAX_TRANSCRIPT_LINES = 40;
const MAX_QUEUE_SIZE = 3;
const LM_QUEUE_RETENTION_MS = 90_000;
const LM_LIVE_VERSE_STORAGE_KEY = "ocs-lm-dock-live-verse";
const SUGGESTION_COOLDOWN_MS = 60_000;
const LM_RELAY_POLL_MS = 2_000;
const LM_RELAY_HIDDEN_POLL_MS = 10_000;

async function loadLmDockService() {
  const module = await import("../../services/lmDockService");
  return module.lmDockService;
}

interface DockLmTabProps {
  presentationOutputTarget?: DockPresentationOutputTarget;
  enablePresentationMicControls?: boolean;
}

interface FreshnessInfo {
  label: string;
  color: string;
  level: "fresh" | "warning" | "stale";
}

export interface RetainedLmCandidate {
  key: string;
  candidate: VoiceBibleCandidate;
  detectedAt: number;
  lastSeenAt: number;
}

function getFreshness(detectedAt: number, now: number): FreshnessInfo {
  const elapsed = (now - detectedAt) / 1000;
  if (elapsed <= 10) return { label: `${Math.round(elapsed)}s ago`, color: "#4caf50", level: "fresh" };
  if (elapsed <= 20) return { label: `${Math.round(elapsed)}s ago`, color: "#FFC107", level: "warning" };
  return { label: `~${Math.round(elapsed)}s ago`, color: "#EF4444", level: "stale" };
}

interface LmDockSettings {
  autoNavigate: boolean;
  translation: string;
  overlayMode: LmOverlayMode;
  autoScroll: boolean;
  autoPushQueue: boolean;
  autoPushSuggestions: boolean;
  autoPushDedupWindow: number;
  pushScene: "ai" | "main";
  suggestionLifetime: number;
}

const DEFAULT_SETTINGS: LmDockSettings = {
  autoNavigate: false,
  translation: "KJV",
  overlayMode: "fullscreen",
  autoScroll: true,
  autoPushQueue: false,
  autoPushSuggestions: false,
  autoPushDedupWindow: 15,
  pushScene: "ai",
  suggestionLifetime: 20,
};

export function normalizeLmOverlayMode(value: unknown, fallback: LmOverlayMode = "fullscreen"): LmOverlayMode {
  return value === "fullscreen" || value === "lower-third" ? value : fallback;
}

export function isLmAutoPushSuppressed(
  lastPushedAt: number | undefined,
  nowMs: number,
  duplicateWindowSec: number,
): boolean {
  if (!lastPushedAt) return false;
  const windowMs = Math.max(0, Number(duplicateWindowSec) || 0) * 1000;
  return windowMs > 0 && nowMs - lastPushedAt < windowMs;
}

export function getSelectedTranscriptEntries(
  entries: TranscriptEntry[],
  selectedEntryIds: ReadonlySet<string>,
): TranscriptEntry[] {
  return entries.filter((entry) => selectedEntryIds.has(entry.id));
}

export function getLmCandidateKey(candidate: Pick<VoiceBibleCandidate, "book" | "chapter" | "verse">): string {
  return `${candidate.book}:${candidate.chapter}:${candidate.verse}`;
}

export function mergeRetainedLmQueue(
  current: RetainedLmCandidate[],
  incoming: VoiceBibleCandidate[],
  nowMs: number,
  retentionMs = LM_QUEUE_RETENTION_MS,
): RetainedLmCandidate[] {
  const next = new Map<string, RetainedLmCandidate>();
  for (const item of current) {
    if (nowMs - item.lastSeenAt <= retentionMs) {
      next.set(item.key, item);
    }
  }
  for (const candidate of incoming) {
    const key = getLmCandidateKey(candidate);
    next.set(key, {
      key,
      candidate,
      detectedAt: nowMs,
      lastSeenAt: nowMs,
    });
  }
  return Array.from(next.values())
    .sort((a, b) => b.detectedAt - a.detectedAt)
    .slice(0, 20);
}

function loadSettings(): LmDockSettings {
  const globalDefaults = getSettings();
  const fallbackOverlayMode = normalizeLmOverlayMode(globalDefaults.defaultBibleOverlayMode);
  try {
    const raw = localStorage.getItem(getUserScopedKey(LM_DOCK_SETTINGS_KEY));
    if (!raw) return { ...DEFAULT_SETTINGS, overlayMode: fallbackOverlayMode };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    const autoPushDedupWindow = Number(merged.autoPushDedupWindow);
    return {
      ...merged,
      overlayMode: normalizeLmOverlayMode(merged.overlayMode, fallbackOverlayMode),
      autoPushQueue: merged.autoPushQueue === true,
      autoPushSuggestions: merged.autoPushSuggestions === true,
      autoPushDedupWindow: Number.isFinite(autoPushDedupWindow)
        ? Math.max(0, autoPushDedupWindow)
        : DEFAULT_SETTINGS.autoPushDedupWindow,
      suggestionLifetime: Math.max(5, Number(merged.suggestionLifetime) || DEFAULT_SETTINGS.suggestionLifetime),
    };
  } catch {
    return { ...DEFAULT_SETTINGS, overlayMode: fallbackOverlayMode };
  }
}

function saveSettings(settings: LmDockSettings): void {
  try {
    localStorage.setItem(getUserScopedKey(LM_DOCK_SETTINGS_KEY), JSON.stringify(settings));
  } catch { }
}

function loadPreferredMicId(): string {
  try {
    return localStorage.getItem(getUserScopedKey(PREFERRED_MIC_STORAGE_KEY)) || "";
  } catch {
    return "";
  }
}

function savePreferredMicId(micId: string): void {
  try {
    localStorage.setItem(getUserScopedKey(PREFERRED_MIC_STORAGE_KEY), micId);
  } catch { }
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(HISTORY_STORAGE_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  try {
    localStorage.setItem(getUserScopedKey(HISTORY_STORAGE_KEY), JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch { }
}

function loadLiveVerse(): VoiceBibleCandidate | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(LM_LIVE_VERSE_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as VoiceBibleCandidate : null;
  } catch {
    return null;
  }
}

function saveLiveVerse(candidate: VoiceBibleCandidate | null): void {
  try {
    if (candidate) {
      localStorage.setItem(getUserScopedKey(LM_LIVE_VERSE_STORAGE_KEY), JSON.stringify(candidate));
    } else {
      localStorage.removeItem(getUserScopedKey(LM_LIVE_VERSE_STORAGE_KEY));
    }
  } catch { }
}


export default function DockLmTab({
  presentationOutputTarget = "obs",
  enablePresentationMicControls = false,
}: DockLmTabProps = {}) {
  const { t } = useTranslation();
  const presentationLinkMode = isPresentationLinkTarget(presentationOutputTarget);
  const allowLocalMicControls = presentationLinkMode && enablePresentationMicControls;
  const isTestEnv = getEnvConfig().isTest;
  const openAppToStartText = isTestEnv
    ? "Open Speech to Scripture in MakeChurchEasy Test on this computer to start listening."
    : allowLocalMicControls
      ? "Choose a microphone in settings, then start listening from this presentation page."
      : t("lm.openAppToStart");
  const pushActionLabel = presentationLinkMode ? "Show" : t("lm.pushToObs");
  const pushActionTitle = presentationLinkMode
    ? "Show this scripture on the presentation screen"
    : t("lm.pushToObsTitle");
  const transcriptPushLabel = presentationLinkMode ? "Show on screen" : "Push to OBS";
  const transcriptPushShortLabel = presentationLinkMode ? "Show" : "Push OBS";

  const [settings, setSettings] = useState<LmDockSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);

  const updateSetting = useCallback(<K extends keyof LmDockSettings>(key: K, value: LmDockSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);
  const updateOverlayMode = useCallback((mode: LmOverlayMode) => {
    updateSetting("overlayMode", mode);
  }, [updateSetting]);

  const [obsStatus, setObsStatus] = useState<DockObsStatus>("disconnected");

  useEffect(() => {
    if (presentationLinkMode) return () => { };
    const unsub = dockObsClient.onStatusChange((status) => setObsStatus(status));
    void dockObsClient.connect();
    return unsub;
  }, [presentationLinkMode]);

  const [appConnected, setAppConnected] = useState(false);

  useEffect(() => {
    dockClient.init();
    const unsub = dockClient.onState((msg: DockStateMessage) => {
      if (msg.type === "state:pong") {
        setAppConnected(true);
      }
    });
    dockClient.sendCommand({ type: "ping", timestamp: Date.now() });
    const interval = setInterval(() => {
      dockClient.sendCommand({ type: "ping", timestamp: Date.now() });
    }, 5000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const [lmStatus, setLmStatus] = useState<LmStatus>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [candidates, setCandidates] = useState<VoiceBibleCandidate[]>([]);
  const [retainedQueue, setRetainedQueue] = useState<RetainedLmCandidate[]>([]);
  const [suggestions, setSuggestions] = useState<VoiceBibleCandidate[]>([]);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mics, setMics] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedMic, setSelectedMic] = useState(() => loadPreferredMicId());
  const [micLoading, setMicLoading] = useState(false);
  const [micError, setMicError] = useState("");

  const pollRelayRef = useRef<(() => Promise<void>) | null>(null);
  const relayBusyRef = useRef(false);

  const [activeTab, setActiveTab] = useState<"up-next" | "transcript" | "history">("up-next");
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [liveVerse, setLiveVerseState] = useState<VoiceBibleCandidate | null>(() => loadLiveVerse());
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const detectedAtRef = useRef<Map<string, number>>(new Map());
  const suggestionCooldownRef = useRef<Map<string, number>>(new Map());
  const autoPushedKeysRef = useRef<Set<string>>(new Set());
  const autoPushInFlightRef = useRef<Set<string>>(new Set());
  const autoPushLastPushedAtRef = useRef<Map<string, number>>(new Map());
  const liveVerseRef = useRef<VoiceBibleCandidate | null>(liveVerse);
  const lastRepublishedOverlayModeRef = useRef<LmOverlayMode>(settings.overlayMode);

  const setLiveVerse = useCallback((candidate: VoiceBibleCandidate | null) => {
    liveVerseRef.current = candidate;
    setLiveVerseState(candidate);
    saveLiveVerse(candidate);
    if (candidate) {
      detectedAtRef.current.set(getLmCandidateKey(candidate), Date.now());
    }
  }, []);

  const syncQueueSnapshot = useCallback((incoming: VoiceBibleCandidate[]) => {
    const nowMs = Date.now();
    setRetainedQueue((current) => mergeRetainedLmQueue(current, incoming, nowMs));
    for (const candidate of incoming) {
      detectedAtRef.current.set(getLmCandidateKey(candidate), nowMs);
    }
  }, []);

  const syncSuggestionSnapshot = useCallback((
    incoming: VoiceBibleCandidate[],
    clearEmpty = false,
  ) => {
    if (incoming.length > 0) {
      const nowMs = Date.now();
      for (const candidate of incoming) {
        detectedAtRef.current.set(getLmCandidateKey(candidate), nowMs);
      }
    }
    // A relay poll can briefly return the previous empty state while a new
    // search result is being posted. Do not erase a clickable suggestion
    // during an active listening session; explicit session resets may clear.
    if (incoming.length > 0 || clearEmpty) {
      setSuggestions(incoming);
    }
  }, []);

  // ── Pinned verses ──
  const PINNED_STORAGE_KEY = "ocs-lm-dock-pinned";
  const [pinnedVerses, setPinnedVerses] = useState<VoiceBibleCandidate[]>(() => {
    try {
      const raw = localStorage.getItem(getUserScopedKey(PINNED_STORAGE_KEY));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const savePinned = useCallback((verses: VoiceBibleCandidate[]) => {
    try { localStorage.setItem(getUserScopedKey(PINNED_STORAGE_KEY), JSON.stringify(verses)); } catch { }
  }, []);

  const applyLmSnapshot = useCallback((snapshot: LmDockSnapshot) => {
    setAppConnected(true);
    setLmStatus(snapshot.status);
    setEntries(snapshot.entries);
    setCandidates(snapshot.candidates);
    syncQueueSnapshot(snapshot.queue);
    syncSuggestionSnapshot(
      snapshot.suggestions,
      snapshot.status === "idle" || snapshot.status === "requesting-mic" || snapshot.status === "connecting",
    );
    setMatching(snapshot.matching);
    setError(snapshot.error ?? null);
  }, [syncQueueSnapshot, syncSuggestionSnapshot]);

  const selectPresentationMic = useCallback((micId: string) => {
    setSelectedMic(micId);
    savePreferredMicId(micId);
  }, []);

  const refreshPresentationMics = useCallback(async () => {
    if (!allowLocalMicControls) return;
    setMicLoading(true);
    setMicError("");
    try {
      const service = await loadLmDockService();
      const devices = await service.getMics();
      setMics(devices);
      if (devices.length > 0) {
        const savedMic = loadPreferredMicId();
        const selectedStillAvailable = selectedMic && devices.some((device) => device.id === selectedMic);
        const savedStillAvailable = savedMic && devices.some((device) => device.id === savedMic);
        if (!selectedStillAvailable) {
          selectPresentationMic(savedStillAvailable ? savedMic : devices[0].id);
        }
      }
    } catch (err) {
      setMicError(err instanceof Error ? err.message : "Could not load microphones.");
    } finally {
      setMicLoading(false);
    }
  }, [allowLocalMicControls, selectPresentationMic, selectedMic]);

  const handlePinVerse = useCallback((c: VoiceBibleCandidate) => {
    setPinnedVerses((prev) => {
      const key = `${c.book}:${c.chapter}:${c.verse}`;
      const exists = prev.some((p) => `${p.book}:${p.chapter}:${p.verse}` === key);
      if (exists) return prev;
      const next = [...prev, c];
      savePinned(next);
      return next;
    });
  }, [savePinned]);

  const handleUnpinVerse = useCallback((key: string) => {
    setPinnedVerses((prev) => {
      const next = prev.filter((p) => `${p.book}:${p.chapter}:${p.verse}` !== key);
      savePinned(next);
      return next;
    });
  }, [savePinned]);

  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!isBibleAiOnboardingCompleted()) {
      setShowOnboarding(true);
    }
  }, []);

  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [proUnlocked] = useState(() => isProUnlocked());

  useEffect(() => {
    const unsub = onCreditChange((newBalance) => {
      setCreditBalance(newBalance);
    });
    return unsub;
  }, []);

  const creditLabel = proUnlocked ? "Full" : creditBalance > 0 ? `${creditBalance} cr` : null;

  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  // ── Transcript interaction state ──
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; entryId: string | null }>({
    visible: false, x: 0, y: 0, entryId: null,
  });
  const [editModal, setEditModal] = useState<{ visible: boolean; text: string }>({
    visible: false, text: "",
  });
  const clickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const [now, setNow] = useState(Date.now());

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) setContextMenu(prev => ({ ...prev, visible: false }));
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [contextMenu.visible]);

  // ── Polling / BroadcastChannel ──
  useEffect(() => {
    const unsub = dockClient.onState((msg: DockStateMessage) => {
      if (msg.type === "state:lm-status") {
        const payload = msg.payload as {
          status: LmStatus;
          entries?: TranscriptEntry[];
          suggestions?: VoiceBibleCandidate[];
          matching: boolean;
          error?: string;
        };
        setLmStatus(payload.status);
        if (payload.entries) setEntries(payload.entries);
        if (payload.suggestions) {
          syncSuggestionSnapshot(
            payload.suggestions,
            payload.status === "idle" || payload.status === "requesting-mic" || payload.status === "connecting",
          );
        }
        setMatching(payload.matching);
        setError(payload.error ?? null);
      } else if (msg.type === "state:lm-transcript") {
        const payload = msg.payload as { entries: TranscriptEntry[] };
        setEntries(payload.entries);
      } else if (msg.type === "state:lm-candidates") {
        const payload = msg.payload as {
          candidates: VoiceBibleCandidate[];
          queue?: VoiceBibleCandidate[];
          suggestions?: VoiceBibleCandidate[];
        };
        setCandidates(payload.candidates);
        if (payload.queue) syncQueueSnapshot(payload.queue);
        if (payload.suggestions) syncSuggestionSnapshot(payload.suggestions);
      }
    });

    const pollRelay = async () => {
      if (relayBusyRef.current) return;
      relayBusyRef.current = true;
      try {
        const res = await fetch(`${getOverlayBaseUrlSync()}/api/lm-state`);
        const state = await res.json();
        if (state && state.status) {
          setAppConnected(true);
          setLmStatus(state.status);
          if (state.entries) setEntries(state.entries);
          setMatching(state.matching ?? false);
          setError(state.error ?? null);
          if (state.candidates) setCandidates(state.candidates);
          if (state.queue) syncQueueSnapshot(state.queue);
          if (state.suggestions) {
            syncSuggestionSnapshot(
              state.suggestions,
              state.status === "idle" || state.status === "requesting-mic" || state.status === "connecting",
            );
          }
        }
      } catch (err) {
        console.warn("[DockLmTab] pollRelay FAILED:", err);
      } finally {
        relayBusyRef.current = false;
      }
    };
    const getRelayPollInterval = () =>
      document.visibilityState === "hidden"
        ? getRecommendedPollingInterval(LM_RELAY_HIDDEN_POLL_MS)
        : getRecommendedPollingInterval(LM_RELAY_POLL_MS);
    let relayTimer: number | null = null;
    let stopped = false;
    const scheduleRelayPoll = () => {
      if (stopped) return;
      relayTimer = window.setTimeout(async () => {
        relayTimer = null;
        await pollRelay();
        scheduleRelayPoll();
      }, getRelayPollInterval());
    };

    pollRelayRef.current = pollRelay;
    void pollRelay();
    scheduleRelayPoll();

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && pollRelayRef.current) {
        if (relayTimer) window.clearTimeout(relayTimer);
        void pollRelayRef.current();
        scheduleRelayPoll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopped = true;
      unsub();
      if (relayTimer) window.clearTimeout(relayTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncQueueSnapshot, syncSuggestionSnapshot]);

  useEffect(() => {
    if (!allowLocalMicControls) return undefined;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void loadLmDockService().then((service) => {
      if (cancelled) return;
      unsubscribe = service.subscribe(applyLmSnapshot);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [allowLocalMicControls, applyLmSnapshot]);

  useEffect(() => {
    if (!allowLocalMicControls) return;
    void refreshPresentationMics();
  }, [allowLocalMicControls, refreshPresentationMics]);

  useEffect(() => {
    const all = [...retainedQueue.map((item) => item.candidate), ...suggestions];
    for (const c of all) {
      const key = getLmCandidateKey(c);
      if (!detectedAtRef.current.has(key)) {
        detectedAtRef.current.set(key, Date.now());
      }
    }
  }, [retainedQueue, suggestions]);

  const hasFreshnessItems = retainedQueue.length > 0 || suggestions.length > 0;

  useEffect(() => {
    if (!hasFreshnessItems) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasFreshnessItems]);

  useEffect(() => {
    if (settings.autoScroll && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [entries, settings.autoScroll]);

  const pushBibleCandidateToOutput = useCallback(async (
    candidate: VoiceBibleCandidate,
    overlayMode: LmOverlayMode,
  ) => {
    const bibleTheme = await resolveDockBibleThemeForOverlayMode(overlayMode);
    const verseRange = String(candidate.verse);
    const referenceLabels = resolveDockBibleReferenceLabels(
      candidate.book,
      candidate.chapter,
      verseRange,
      settings.translation,
    );

    if (presentationLinkMode) {
      await publishDockStagedItemToPresentation({
        type: "bible",
        label: referenceLabels.displayReferenceLabel,
        subtitle: candidate.snippet,
        data: {
          book: candidate.book,
          chapter: candidate.chapter,
          verse: candidate.verse,
          verseEnd: candidate.verse,
          verseRange,
          rawReferenceLabel: referenceLabels.rawReferenceLabel,
          referenceLabel: referenceLabels.displayReferenceLabel,
          displayReferenceLabel: referenceLabels.displayReferenceLabel,
          referenceBaseLabel: referenceLabels.referenceBaseLabel,
          translation: settings.translation,
          verseText: candidate.snippet,
          overlayMode,
          theme: bibleTheme.themeId,
          bibleThemeSettings: bibleTheme.themeSettings,
          liveOverrides: bibleTheme.liveOverrides,
          _dockLive: true,
        },
      });
      return;
    }

    const targetScene = settings.pushScene === "ai" ? "MCE Presentation" : undefined;
    const stageData: Parameters<typeof dockObsClient.pushBible>[0] = {
      book: candidate.book,
      chapter: candidate.chapter,
      verse: candidate.verse,
      verseEnd: candidate.verse,
      verseRange,
      translation: settings.translation,
      rawReferenceLabel: referenceLabels.rawReferenceLabel,
      referenceLabel: referenceLabels.displayReferenceLabel,
      displayReferenceLabel: referenceLabels.displayReferenceLabel,
      referenceBaseLabel: referenceLabels.referenceBaseLabel,
      verseText: candidate.snippet,
      overlayMode,
      theme: bibleTheme.themeId,
      bibleThemeSettings: bibleTheme.themeSettings,
      liveOverrides: bibleTheme.liveOverrides,
      targetScene,
    };
    const lowerThirdPayload = {
      verseText: candidate.snippet,
      referenceText: referenceLabels.displayReferenceLabel,
      verseRange,
      bibleThemeSettings: bibleTheme.themeSettings,
      liveOverrides: null,
      themeId: bibleTheme.themeId,
    };
    const pushLive = () => overlayMode === "lower-third"
      ? dockObsClient.pushBibleOverlayFast(lowerThirdPayload)
      : dockObsClient.pushBible(stageData);

    await pushLive();
  }, [presentationLinkMode, settings.pushScene, settings.translation]);

  useEffect(() => {
    if (lastRepublishedOverlayModeRef.current === settings.overlayMode) return;
    lastRepublishedOverlayModeRef.current = settings.overlayMode;
    const live = liveVerseRef.current;
    if (!live) return;
    if (!presentationLinkMode && obsStatus !== "connected") return;

    setPushError(null);
    void pushBibleCandidateToOutput(live, settings.overlayMode)
      .then(() => {
        setLiveVerse(live);
        setPushSuccess(settings.overlayMode === "lower-third" ? "Switched to LT" : "Switched to Full");
        setTimeout(() => setPushSuccess(null), 1600);
      })
      .catch((err) => {
        setPushError(err instanceof Error ? err.message : String(err));
      });
  }, [obsStatus, presentationLinkMode, pushBibleCandidateToOutput, setLiveVerse, settings.overlayMode]);

  // ── Show/push detected scripture ──
  const handlePushVerse = useCallback(async (candidate: VoiceBibleCandidate, source?: "queue" | "suggestion") => {
    if (!presentationLinkMode && obsStatus !== "connected") {
      setPushError(t("lm.notConnected"));
      return;
    }

    setPushing(true);
    setPushError(null);
    setPushSuccess(null);
    try {
      const overlayMode = settings.overlayMode;
      await pushBibleCandidateToOutput(candidate, overlayMode);
      setLiveVerse(candidate);
      setRetainedQueue((current) => mergeRetainedLmQueue(current, [candidate], Date.now()));

      if (source === "suggestion") {
        suggestionCooldownRef.current.set(getLmCandidateKey(candidate), Date.now());
      }

      setHistory((prev) => {
        const next = [candidate.label, ...prev.filter((h) => h !== candidate.label)].slice(0, MAX_HISTORY);
        saveHistory(next);
        return next;
      });

      setPushSuccess(`${t("lm.pushed")} ${candidate.label}`);
      setTimeout(() => setPushSuccess(null), 4000);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  }, [obsStatus, presentationLinkMode, pushBibleCandidateToOutput, setLiveVerse, settings.overlayMode, t]);

  // ── Show/push transcript text ──
  const pushTranscriptToOBS = useCallback(async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) {
      showToast("Nothing to push");
      return;
    }
    if (!presentationLinkMode && obsStatus !== "connected") {
      showToast(t("lm.notConnected"));
      return;
    }
    setPushing(true);
    try {
      const notesSettings = await resolveDockNotesPresentationSettings(settings.overlayMode, {
        forceOverlayMode: true,
      });
      const obsData = {
        sectionText: cleanText,
        sectionLabel: "Transcript Note",
        songTitle: "Transcript Note",
        overlayMode: notesSettings.overlayMode,
        bibleThemeSettings: notesSettings.themeSettings,
        liveOverrides: null,
        backgroundOnly: false,
      };

      if (presentationLinkMode) {
        await publishDockStagedItemToPresentation({
          type: "notes",
          label: "Transcript Note",
          subtitle: cleanText,
          data: {
            ...obsData,
            theme: notesSettings.themeId,
            _dockLive: true,
          },
        });
        showToast("Shown on presentation screen");
        return;
      }

      const bringNotesForward = dockObsClient
        .bringNotesOverlayForward(notesSettings.overlayMode)
        .catch(() => { });

      void bringNotesForward
        .then(() => dockObsClient.primeNotesOverlay(obsData))
        .catch(() => { });

      await bringNotesForward.then(() => (
        notesSettings.overlayMode === "lower-third"
          ? dockObsClient.pushNotesOverlayFast(obsData)
          : dockObsClient.pushNotesLyrics(obsData)
      ));

      showToast("Pushed to OBS");
    } catch (err) {
      showToast(presentationLinkMode ? "Failed to show on presentation screen" : "Failed to push to OBS");
    } finally {
      setPushing(false);
    }
  }, [obsStatus, presentationLinkMode, settings.overlayMode, showToast, t]);

  const isListening = lmStatus === "listening" || lmStatus === "connecting" || lmStatus === "requesting-mic";

  const handlePresentationListeningToggle = useCallback(async () => {
    if (!allowLocalMicControls) return;
    if (isListening) {
      setShowStopConfirm(true);
      return;
    }
    setMicError("");
    try {
      if (mics.length === 0) {
        await refreshPresentationMics();
      }
      const service = await loadLmDockService();
      await service.startListening(selectedMic || undefined);
    } catch (err) {
      setMicError(err instanceof Error ? err.message : "Could not start listening.");
    }
  }, [allowLocalMicControls, isListening, mics.length, refreshPresentationMics, selectedMic]);

  const sendLmCommand = useCallback((type: DockCommandType, payload?: unknown) => {
    const cmd = { type, payload: payload ?? {}, timestamp: Date.now() };
    dockClient.sendCommand(cmd);
    fetch(`${getOverlayBaseUrlSync()}/api/lm-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      keepalive: true,
    }).catch(() => { });
  }, []);

  const navigateBibleDock = useCallback((candidate: VoiceBibleCandidate) => {
    const cmd = {
      type: "lm:navigate" as DockCommandType,
      payload: {
        book: candidate.book,
        chapter: candidate.chapter,
        verse: candidate.verse,
        translation: settings.translation,
      },
      timestamp: Date.now(),
    };
    dockClient.sendCommand(cmd);
    fetch(`${getOverlayBaseUrlSync()}/api/lm-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      keepalive: true,
    }).catch(() => { });
  }, [settings.translation]);

  // ── Track tab bar width for responsive layout ──
  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTabBarWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Auto-navigate inside the dock only ──
  useEffect(() => {
    if (!settings.autoNavigate) return;
    if (candidates.length === 0) return;
    const best = candidates[0];
    if (!best) return;

    navigateBibleDock(best);
  }, [candidates, settings.autoNavigate, navigateBibleDock]);

  const confirmStop = useCallback(() => {
    if (allowLocalMicControls) {
      void loadLmDockService().then((service) => service.stopListening());
    } else {
      sendLmCommand("lm:stop");
    }
    setShowStopConfirm(false);
  }, [allowLocalMicControls, sendLmCommand]);

  const processedQueue = useMemo(() => {
    const seen = new Set<string>();
    const result: VoiceBibleCandidate[] = [];
    for (const retained of retainedQueue) {
      const item = retained.candidate;
      const key = retained.key;
      detectedAtRef.current.set(key, retained.detectedAt);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result.slice(0, MAX_QUEUE_SIZE);
  }, [retainedQueue]);

  const queueVerses = processedQueue;
  const suggestionExpiryMs = Math.max(5, Number(settings.suggestionLifetime) || 20) * 1000;
  const queuedVerseKeys = useMemo(() => new Set(processedQueue.map((c) => getLmCandidateKey(c))), [processedQueue]);

  const filteredSuggestions = useMemo(() => {
    const nowMs = Date.now();
    return suggestions.filter((s) => {
      const key = getLmCandidateKey(s);
      if (queuedVerseKeys.has(key)) return false;
      const detectedAt = detectedAtRef.current.get(key) ?? nowMs;
      if (nowMs - detectedAt > suggestionExpiryMs) return false;
      const cooldownAt = suggestionCooldownRef.current.get(key);
      if (cooldownAt && nowMs - cooldownAt < SUGGESTION_COOLDOWN_MS) return false;
      return true;
    });
  }, [queuedVerseKeys, suggestionExpiryMs, suggestions, now]);

  useEffect(() => {
    const visibleAutoPushKeys = new Set<string>();
    for (const c of queueVerses) visibleAutoPushKeys.add(`queue:${getLmCandidateKey(c)}`);
    for (const c of filteredSuggestions) visibleAutoPushKeys.add(`suggestion:${getLmCandidateKey(c)}`);

    for (const key of Array.from(autoPushedKeysRef.current)) {
      if (!visibleAutoPushKeys.has(key)) autoPushedKeysRef.current.delete(key);
    }
  }, [filteredSuggestions, queueVerses]);

  useEffect(() => {
    if (!settings.autoPushQueue && !settings.autoPushSuggestions) return;
    if (!presentationLinkMode && obsStatus !== "connected") return;
    if (autoPushInFlightRef.current.size > 0) return;

    const candidatesToPush: Array<{
      key: string;
      source: "queue" | "suggestion";
      candidate: VoiceBibleCandidate;
    }> = [];

    if (settings.autoPushQueue) {
      for (const candidate of queueVerses) {
        candidatesToPush.push({
          key: `queue:${getLmCandidateKey(candidate)}`,
          source: "queue",
          candidate,
        });
      }
    }

    if (settings.autoPushSuggestions) {
      for (const candidate of filteredSuggestions) {
        candidatesToPush.push({
          key: `suggestion:${getLmCandidateKey(candidate)}`,
          source: "suggestion",
          candidate,
        });
      }
    }

    const unseen = candidatesToPush.filter(({ key }) => (
      !autoPushedKeysRef.current.has(key) && !autoPushInFlightRef.current.has(key)
    ));
    if (unseen.length === 0) return;

    for (const item of unseen) autoPushedKeysRef.current.add(item.key);

    const nowMs = Date.now();
    const target = unseen.find(({ key }) => (
      !isLmAutoPushSuppressed(
        autoPushLastPushedAtRef.current.get(key),
        nowMs,
        settings.autoPushDedupWindow,
      )
    ));
    if (!target) return;

    autoPushInFlightRef.current.add(target.key);
    autoPushLastPushedAtRef.current.set(target.key, nowMs);
    void handlePushVerse(target.candidate, target.source).finally(() => {
      autoPushInFlightRef.current.delete(target.key);
    });
  }, [
    filteredSuggestions,
    handlePushVerse,
    obsStatus,
    presentationLinkMode,
    queueVerses,
    settings.autoPushDedupWindow,
    settings.autoPushQueue,
    settings.autoPushSuggestions,
  ]);

  useEffect(() => {
    const cutoff = Date.now() - Math.max(suggestionExpiryMs, LM_QUEUE_RETENTION_MS);
    for (const [key, time] of Array.from(detectedAtRef.current.entries())) {
      if (time < cutoff) {
        detectedAtRef.current.delete(key);
      }
    }
  }, [filteredSuggestions, now, suggestionExpiryMs]);

  useEffect(() => {
    const cutoff = Date.now() - SUGGESTION_COOLDOWN_MS;
    for (const [key, time] of Array.from(suggestionCooldownRef.current.entries())) {
      if (time < cutoff) {
        suggestionCooldownRef.current.delete(key);
      }
    }
  }, [now]);

  const recentEntries = useMemo(() => entries.slice(-MAX_TRANSCRIPT_LINES), [entries]);
  const selectedEntries = useMemo(
    () => getSelectedTranscriptEntries(recentEntries, selectedEntryIds),
    [recentEntries, selectedEntryIds],
  );
  const contextEntry = useMemo(
    () => contextMenu.entryId
      ? recentEntries.find((entry) => entry.id === contextMenu.entryId) ?? null
      : null,
    [contextMenu.entryId, recentEntries],
  );

  // Keep selection limited to entries that are still in the visible transcript
  // window, while preserving selected entries when new lines are appended.
  useEffect(() => {
    const visibleIds = new Set(recentEntries.map((entry) => entry.id));
    setSelectedEntryIds((current) => {
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [recentEntries]);

  // ── Live word indicator ──
  const liveEntryIndex = useMemo(() => {
    for (let i = recentEntries.length - 1; i >= 0; i--) {
      if (!recentEntries[i].finalized) return i;
    }
    return recentEntries.length > 0 ? recentEntries.length - 1 : -1;
  }, [recentEntries]);

  const renderText = useCallback((text: string, isLive: boolean) => {
    if (!isLive || !text) return text;
    const words = text.trim().split(/\s+/);
    if (words.length <= 1) return text;
    const lastWord = words.pop()!;
    return (
      <>
        {words.join(" ")} <span style={S.liveWord}>{lastWord}</span>
      </>
    );
  }, []);

  // ── Transcript interaction handlers ──
  const handleContextMenu = useCallback((e: React.MouseEvent, entryId: string) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, entryId });
  }, []);

  const handleLineClick = useCallback((entryId: string) => {
    if (isSelectionMode) {
      setSelectedEntryIds((prev) => {
        const next = new Set(prev);
        if (next.has(entryId)) next.delete(entryId);
        else next.add(entryId);
        return next;
      });
    } else {
      if (clickTimeout.current) {
        clearTimeout(clickTimeout.current);
        clickTimeout.current = null;
        setIsSelectionMode(true);
        setSelectedEntryIds(new Set([entryId]));
        window.getSelection()?.removeAllRanges();
      } else {
        clickTimeout.current = setTimeout(() => {
          const text = recentEntries.find((entry) => entry.id === entryId)?.text;
          if (text) {
            navigator.clipboard.writeText(text).catch(() => { });
            showToast("Copied to clipboard!");
          }
          clickTimeout.current = null;
        }, 250);
      }
    }
  }, [isSelectionMode, recentEntries, showToast]);

  const handleCancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedEntryIds(new Set());
  }, []);

  const handleCopyAll = useCallback(() => {
    const text = selectedEntries.map((entry) => entry.text).filter(Boolean).join("\n");
    if (text) {
      navigator.clipboard.writeText(text).catch(() => { });
      showToast(`Copied ${selectedEntries.length} lines`);
    }
    handleCancelSelection();
  }, [selectedEntries, showToast, handleCancelSelection]);

  const handleEditAll = useCallback(() => {
    const text = selectedEntries.map((entry) => entry.text).filter(Boolean).join("\n");
    setEditModal({ visible: true, text });
    handleCancelSelection();
  }, [selectedEntries, handleCancelSelection]);

  const applyEditTextTool = useCallback((action: NoteTextToolAction, linesPerSlide?: number) => {
    setEditModal((current) => ({
      ...current,
      text: formatNoteText(current.text, action, linesPerSlide),
    }));
  }, []);

  const handlePushToNotes = useCallback(async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) {
      showToast("Nothing to save");
      return;
    }

    const command = createDockNotesAppendCommand(cleanText);
    const result = appendTextToDockNotes(cleanText, undefined, { sourceId: command.commandId });
    const relayCommand = {
      ...command,
      ...(result?.note.title ? { title: result.note.title } : {}),
    };
    dockClient.sendCommand({
      type: "notes:append",
      payload: relayCommand,
      commandId: relayCommand.commandId,
      timestamp: Date.now(),
    });
    void postDockNotesAppendCommand(relayCommand).catch((err) => {
      console.warn("[DockLmTab] Notes relay failed:", err);
    });
    showToast(result ? "Saved in Notes" : "Nothing to save");
  }, [showToast]);

  const handleEditPushToOBS = useCallback(() => {
    pushTranscriptToOBS(editModal.text);
    setEditModal({ visible: false, text: "" });
  }, [editModal.text, pushTranscriptToOBS]);

  const lastSelectedEntryId = selectedEntries.length > 0
    ? selectedEntries[selectedEntries.length - 1].id
    : null;
  const renderOverlayModeSwitch = useCallback((variant: "bar" | "settings" = "bar") => {
    const options: Array<{ mode: LmOverlayMode; label: string; ariaLabel: string; title: string }> = [
      {
        mode: "fullscreen",
        label: "Full",
        ariaLabel: t("lm.fullscreen"),
        title: "Show detected scriptures as a full-screen slide",
      },
      {
        mode: "lower-third",
        label: "LT",
        ariaLabel: t("lm.lowerThird"),
        title: "Show detected scriptures as a lower-third overlay",
      },
    ];

    return (
      <div
        style={variant === "settings" ? S.modeSwitchPanel : S.modeSwitchBar}
        data-testid="lm-overlay-mode-switch"
      >
        <div style={variant === "settings" ? S.modeSwitchLabelWide : S.modeSwitchLabel}>
          <Icon name="slideshow" size={variant === "settings" ? 13 : 12} />
          <span>{t("lm.overlayMode")}</span>
        </div>
        <div
          style={variant === "settings" ? S.modeSegmentedWide : S.modeSegmented}
          role="group"
          aria-label={t("lm.overlayMode")}
        >
          {options.map((option) => {
            const active = settings.overlayMode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                style={{
                  ...S.modeSegmentButton,
                  ...(variant === "settings" ? S.modeSegmentButtonWide : undefined),
                  ...(active ? S.modeSegmentButtonActive : undefined),
                }}
                onClick={() => updateOverlayMode(option.mode)}
                aria-pressed={active}
                aria-label={option.ariaLabel}
                title={option.title}
                data-testid={`lm-mode-${option.mode}`}
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }, [settings.overlayMode, t, updateOverlayMode]);

  return (
    <div style={S.root} ref={rootRef}>
      <style>{`@keyframes lm-pulse{0%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.6)}100%{opacity:1;transform:scale(1)}}`}</style>
      {isTestEnv && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            background: "rgba(127, 29, 29, 0.92)",
            borderBottom: "1px solid rgba(245, 158, 11, 0.65)",
            color: "#fff7ed",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 42,
              padding: "2px 6px",
              borderRadius: 999,
              background: "#f59e0b",
              color: "#7f1d1d",
            }}
          >
            Test
          </span>
          <span>Testing environment only. Start Speech to Scripture from the test desktop app on this machine.</span>
        </div>
      )}
      <div style={S.statusBar}>
        <div style={S.statusBarLeft}>
          <div
            style={{
              ...S.statusDot,
              background: isListening ? "#4caf50" : appConnected ? "#ff9800" : "#666",
              boxShadow: isListening ? "0 0 6px #4caf50" : "none",
            }}
          />
          <span style={S.statusText}>
            {isListening ? t("lm.listening") : appConnected ? t("lm.connected") : t("lm.offline")}
          </span>
        </div>
        <div style={S.statusBarRight}>
          <span style={S.statusChip}>
            <Icon name="subtitles" size={10} />
            {entries.length}
          </span>
          <span style={S.statusChip}>
            <Icon name="menu_book" size={10} />
            {processedQueue.length + filteredSuggestions.length}
          </span>
          {creditLabel && (
            <span style={{ ...S.statusChip, color: proUnlocked ? "#4caf50" : undefined }}>
              {creditLabel}
            </span>
          )}
          <button
            style={S.helpBtn}
            onClick={() => {
              resetBibleAiOnboarding();
              setShowOnboarding(true);
            }}
            title="Bible AI Tour"
            data-onboarding="help-btn"
          >
            <HelpCircle size={14} />
          </button>
          <button
            style={S.gearBtn}
            onClick={() => setShowSettings(!showSettings)}
            title={t("lm.settings")}
            data-onboarding="settings-btn"
          >
            <Icon name="settings" size={14} />
          </button>

        </div>
      </div>

      {!presentationLinkMode && renderOverlayModeSwitch()}

      <div style={S.tabBar} ref={tabBarRef}>
        {(["up-next", "transcript", "history"] as const).map((tab) => (
          <button
            key={tab}
            style={{ ...S.tab, ...(activeTab === tab ? S.tabActive : undefined) }}
            onClick={() => setActiveTab(tab)}
            title={tab === "up-next" ? t("lm.tabUpNext") : tab === "transcript" ? t("lm.tabTranscript") : t("lm.tabHistory")}
          >
            <Icon
              name={tab === "up-next" ? "queue" : tab === "transcript" ? "subtitles" : "history"}
              size={12}
            />
            {tabBarWidth >= 200 && (
              <span>{tab === "up-next" ? t("lm.tabUpNext") : tab === "transcript" ? t("lm.tabTranscript") : t("lm.tabHistory")}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "up-next" && (
        <div style={S.tabContent}>
          {/* ── QUEUE ── */}
          <div style={S.queueSectionFull} data-onboarding="queue-section">
            <div style={S.sectionHeader}>
              <span style={S.sectionLabel}>{t("lm.queue")}</span>
              {queueVerses.length > 0 && (
                <span style={S.sectionCount}>{queueVerses.length}</span>
              )}
            </div>
            {pinnedVerses.length > 0 && (
              <div style={S.pinnedRow}>
                {pinnedVerses.map((c, i) => {
                  const key = getLmCandidateKey(c);
                  return (
                    <div
                      key={`pin-${key}-${i}`}
                      style={S.pinnedChip}
                      onClick={() => void handlePushVerse(c, "queue")}
                      title={presentationLinkMode ? "Click to show on the presentation screen" : "Click to push to OBS"}
                    >
                      📌 {c.label}
                      <button
                        style={S.pinnedChipClose}
                        onClick={(e) => { e.stopPropagation(); handleUnpinVerse(key); }}
                        title="Unpin"
                      >
                        <Icon name="close" size={9} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={S.queueScroll}>
              {queueVerses.length === 0 && pinnedVerses.length === 0 && (
                <div style={S.sectionEmpty}>
                  <span style={S.sectionEmptyText}>
                    {appConnected ? t("lm.waitingForDetection") : openAppToStartText}
                  </span>
                </div>
              )}
              {queueVerses.map((c, i) => {
                const key = getLmCandidateKey(c);
                const detectedAt = detectedAtRef.current.get(key) ?? Date.now();
                const freshness = getFreshness(detectedAt, now);

                return (
                  <div key={`queue-${key}-${i}`} style={S.queueCard}>
                    <div style={S.queueCardTop}>
                      <span style={S.queueRef}>{c.label}</span>
                    </div>
                    {c.snippet && (
                      <div style={S.verseText}>{c.snippet}</div>
                    )}
                    <div style={S.queueCardBottom}>
                      <span style={{ fontSize: 10, color: freshness.color }}>{freshness.label}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          style={S.pinBtnSmall}
                          onClick={() => handlePinVerse(c)}
                          title="Pin verse"
                        >
                          <Icon name="push_pin" size={10} />
                        </button>
                        <button
                          style={S.pushBtn}
                          onClick={() => void handlePushVerse(c, "queue")}
                          disabled={pushing || (!presentationLinkMode && obsStatus !== "connected")}
                          title={pushActionTitle}
                        >
                          <Icon name="play" size={11} />
                          {pushActionLabel}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {filteredSuggestions.length > 0 && (
            <div style={S.suggestionsSection} data-onboarding="suggestions-section">
              <div style={S.sectionHeader}>
                <span style={S.sectionLabel}>{t("lm.suggestions", "Suggestions")}</span>
                <span style={S.sectionCount}>{filteredSuggestions.length}</span>
              </div>
              <div style={S.suggestionsScroll}>
                {filteredSuggestions.map((c, i) => {
                  const key = getLmCandidateKey(c);
                  const detectedAt = detectedAtRef.current.get(key) ?? Date.now();
                  const freshness = getFreshness(detectedAt, now);

                  return (
                    <div key={`suggestion-${key}-${i}`} style={S.suggestionCard}>
                      <div style={S.queueCardTop}>
                        <span style={S.queueRef}>{c.label}</span>
                        <span style={{ fontSize: 10, color: freshness.color }}>{freshness.label}</span>
                      </div>
                      {c.snippet && (
                        <div style={S.verseText}>{c.snippet}</div>
                      )}
                      <div style={S.queueCardBottom}>
                        <span style={S.suggestionHint}>{t("lm.manualSuggestion", "Suggested match")}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            style={S.pinBtnSmall}
                            onClick={() => handlePinVerse(c)}
                            title="Pin verse"
                          >
                            <Icon name="push_pin" size={10} />
                          </button>
                          <button
                            style={S.pushBtn}
                            onClick={() => void handlePushVerse(c, "suggestion")}
                            disabled={pushing || (!presentationLinkMode && obsStatus !== "connected")}
                            title={pushActionTitle}
                          >
                            <Icon name="play" size={11} />
                            {pushActionLabel}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "transcript" && (
        <div style={S.tabContent}>
          <div style={S.transcriptSectionFull}>
            <div style={S.transcriptFeed} ref={transcriptRef}>
              {recentEntries.length === 0 && (
                <div style={S.sectionEmpty}>
                  <span style={S.sectionEmptyText}>
                    {isListening ? t("lm.waitingForSpeech") : t("lm.noTranscript")}
                  </span>
                </div>
              )}
              {recentEntries.map((entry, index) => {
                const isSelected = selectedEntryIds.has(entry.id);
                const showActionBar = isSelectionMode && entry.id === lastSelectedEntryId;
                const isLive = index === liveEntryIndex;

                return (
                  <div
                    key={entry.id}
                    style={{
                      ...S.transcriptItem,
                      ...(isSelected ? S.transcriptItemSelected : {}),
                      ...(isSelectionMode ? { paddingLeft: 2 } : {}),
                      ...(showActionBar ? { paddingBottom: 0 } : {}),
                      ...(isLive ? S.transcriptItemLive : {}),
                    }}
                    title={`Click to copy · Double-click to select · Save in Notes or ${transcriptPushLabel} once selected`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('[data-action-bar]')) return;
                      if ((e.target as HTMLElement).tagName.toLowerCase() === "input") return;
                      handleLineClick(entry.id);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, entry.id)}
                  >
                    <div style={S.transcriptLine}>
                      <div style={{
                        ...S.checkboxContainer,
                        ...(isSelectionMode ? S.checkboxContainerVisible : {}),
                      }}>
                        <input
                          type="checkbox"
                          style={S.checkbox}
                          checked={isSelected}
                          onChange={(e) => {
                            setSelectedEntryIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(entry.id);
                              else next.delete(entry.id);
                              return next;
                            });
                          }}
                        />
                      </div>
                      {isLive && <span style={S.liveDot} />}
                      <span style={{
                        ...S.transcriptTextBase,
                        ...(isSelected ? S.transcriptTextSelected : {}),
                        ...(!entry.finalized ? S.transcriptTextActive : S.transcriptTextDim),
                        ...(isLive ? S.transcriptTextLive : {}),
                      }}>
                        {renderText(entry.text, isLive)}
                      </span>

                    </div>

                    {showActionBar && (
                      <div data-action-bar style={S.actionBar}>
                        <div style={S.actionBarLeft}>
                          <span style={S.selectionCount}>{selectedEntries.length} selected</span>
                          <button
                            style={S.btnCancel}
                            onClick={(e) => { e.stopPropagation(); handleCancelSelection(); }}
                          >
                            Cancel
                          </button>
                        </div>
                        <div style={S.actionBarRight}>
                          <button
                            style={S.btnAction}
                            onClick={(e) => { e.stopPropagation(); handleCopyAll(); }}
                            title="Copy selected transcript lines"
                          >
                            <Copy size={12} />
                            <span style={S.btnText}>Copy</span>
                          </button>
                          <button
                            style={S.btnAction}
                            onClick={(e) => { e.stopPropagation(); handleEditAll(); }}
                            title="Edit"
                          >
                            <Edit2 size={12} />
                            <span style={S.btnText}>Edit</span>
                          </button>
                          <button
                            style={S.btnAction}
                            onClick={(e) => {
                              e.stopPropagation();
                              const text = selectedEntries.map((selected) => selected.text).filter(Boolean).join("\n");
                              handlePushToNotes(text);
                              handleCancelSelection();
                            }}
                            title="Save in Notes tab"
                          >
                            <StickyNote size={12} />
                            <span style={S.btnText}>Save in Notes</span>
                          </button>
                          <button
                            style={S.btnPrimary}
                            onClick={(e) => {
                              e.stopPropagation();
                              const text = selectedEntries.map((selected) => selected.text).filter(Boolean).join("\n");
                              pushTranscriptToOBS(text);
                              handleCancelSelection();
                            }}
                            title={transcriptPushLabel}
                            disabled={pushing || (!presentationLinkMode && obsStatus !== "connected")}
                          >
                            <MonitorUp size={12} />
                            <span style={S.btnText}>{transcriptPushShortLabel}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div style={S.tabContent}>
          <div style={S.historySectionFull}>
            {history.length === 0 && (
              <div style={S.sectionEmpty}>
                <span style={S.sectionEmptyText}>{t("lm.historyEmpty")}</span>
              </div>
            )}
            {history.map((ref, i) => {
              const parsed = parseScriptureReference(ref);
              const clickable = parsed && parsed.book && parsed.chapter && parsed.verse;
              return (
                <div
                  key={`hist-${i}`}
                  style={clickable ? S.historyItemClickable : S.historyItem}
                  onClick={() => {
                    if (!clickable || !parsed.book || !parsed.chapter || !parsed.verse) return;
                    const cmd = {
                      type: "lm:navigate" as DockCommandType,
                      payload: {
                        book: parsed.book,
                        chapter: parsed.chapter,
                        verse: parsed.verse,
                        translation: settings.translation,
                      },
                      timestamp: Date.now(),
                    };
                    dockClient.sendCommand(cmd);
                    fetch(`${getOverlayBaseUrlSync()}/api/lm-command`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(cmd),
                      keepalive: true,
                    }).catch(() => { });
                  }}
                  title={clickable ? t("lm.historyClickHint") : undefined}
                >
                  {clickable && <Icon name="menu_book" size={12} style={{ flexShrink: 0, opacity: 0.5 }} />}
                  <span>{ref}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pushSuccess && (
        <div style={S.toast}>
          <Icon name="check_circle" size={14} />
          <span>{pushSuccess}</span>
        </div>
      )}
      {pushError && (
        <div style={S.toastError}>
          <Icon name="error" size={14} />
          <span>{pushError}</span>
        </div>
      )}

      {toastMessage && (
        <div style={S.transcriptToast}>
          <Check size={14} />
          <span>{toastMessage}</span>
        </div>
      )}

      {matching && (
        <div style={S.matchingBar}>
          <span style={S.matchingText}>{t("lm.searchingScriptures")}</span>
        </div>
      )}

      {showStopConfirm && (
        <div style={S.modalOverlay} onClick={() => setShowStopConfirm(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <h3 style={S.modalTitle}>{t("lm.stopListening")}</h3>
            </div>
            <div style={S.modalBody}>
              <p style={S.modalText}>{t("lm.stopListeningConfirm")}</p>
            </div>
            <div style={S.modalFooter}>
              <button style={S.modalBtnGhost} onClick={() => setShowStopConfirm(false)}>
                {t("common.cancel")}
              </button>
              <button style={S.modalBtnDanger} onClick={confirmStop}>
                <Icon name="stop" size={12} />
                <span>{t("lm.stopListening")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {!isListening && entries.length === 0 && candidates.length === 0 && retainedQueue.length === 0 && suggestions.length === 0 && (
        <div style={S.emptyState}>
          <Icon name="mic" size={32} style={{ opacity: 0.15 }} />
          <span style={S.emptyText}>
            {openAppToStartText}
          </span>

        </div>
      )}

      {error && (
        <div style={S.errorBanner}>
          <Icon name="warning" size={12} style={{ color: "#EF4444" }} />
          <span style={{ color: "#FCA5A5", fontSize: 11 }}>{error}</span>
        </div>
      )}

      <div style={S.hintBar}>
        <span style={S.hintText}>Click to copy a line · Double-click to select · Save in Notes or {transcriptPushLabel}</span>
      </div>

      {contextMenu.visible && (
        <div
          style={{ ...S.contextMenu, top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={S.contextMenuItem}
            onClick={() => {
              if (contextMenu.entryId !== null) {
                setIsSelectionMode(true);
                setSelectedEntryIds(new Set([contextMenu.entryId]));
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            Select
          </button>
          <button
            style={S.contextMenuItem}
            onClick={() => {
              if (contextEntry?.text) {
                const text = contextEntry.text;
                if (text) {
                  navigator.clipboard.writeText(text).catch(() => { });
                  showToast("Copied to clipboard!");
                }
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            Copy
          </button>
          <button
            style={S.contextMenuItem}
            onClick={() => {
              if (contextEntry) {
                setEditModal({ visible: true, text: contextEntry.text });
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            Edit
          </button>
          <button
            style={S.contextMenuItem}
            onClick={() => {
              if (contextEntry?.text) {
                const text = contextEntry.text;
                if (text) pushTranscriptToOBS(text);
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
            disabled={pushing || (!presentationLinkMode && obsStatus !== "connected")}
          >
            {transcriptPushLabel}
          </button>
          <button
            style={S.contextMenuItem}
            onClick={() => {
              if (contextEntry) {
                void handlePushToNotes(contextEntry.text);
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            Save in Notes
          </button>
        </div>
      )}

      {editModal.visible && (
        <div style={S.editModalOverlay} onClick={() => setEditModal({ visible: false, text: "" })}>
          <div style={S.editModalContent} onClick={(e) => e.stopPropagation()}>
            <div style={S.editModalHeader}>
              <h2 style={S.editModalTitle}>
                <Edit2 size={16} /> Edit Selection
              </h2>
              <button style={S.editModalClose} onClick={() => setEditModal({ visible: false, text: "" })}>
                ✕
              </button>
            </div>
            <div style={S.editModalBody}>
              <DockNotesTextTools
                className="dock-notes-text-tools dock-notes-text-tools--editor"
                buttonClassName="dock-notes-text-tools__btn"
                onAction={applyEditTextTool}
              />
              <label style={S.editModalLabel}>Content to edit</label>
              <textarea
                style={S.editModalTextarea}
                rows={6}
                value={editModal.text}
                onChange={(e) => setEditModal(prev => ({ ...prev, text: e.target.value }))}
              />
            </div>
            <div style={S.editModalFooter}>
              <button style={S.modalBtnGhost} onClick={() => { setEditModal({ visible: false, text: "" }); handleCancelSelection(); }}>Cancel</button>
              <button style={S.btnSecondary} onClick={() => { void handlePushToNotes(editModal.text); setEditModal({ visible: false, text: "" }); handleCancelSelection(); }}>
                <StickyNote size={14} /> Save in Notes
              </button>
              <button
                style={S.btnPrimary}
                onClick={() => { handleEditPushToOBS(); handleCancelSelection(); }}
                disabled={pushing || (!presentationLinkMode && obsStatus !== "connected")}
              >
                {transcriptPushLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <BibleAiOnboarding
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {showSettings && (
        <>
          <div style={S.settingsOverlay} onClick={() => setShowSettings(false)} />
          <div style={S.settingsPanel}>
            <div style={S.settingsHeader}>
              <span style={S.settingsTitle}>{t("lm.settings")}</span>
              <button style={S.settingsClose} onClick={() => setShowSettings(false)}>
                <Icon name="close" size={14} />
              </button>
            </div>

            <div style={S.settingsBody}>
              {!presentationLinkMode && (
                <div style={S.settingsGroup}>
                  <div style={S.settingsGroupLabel}>{t("lm.overlayMode")}</div>
                  {renderOverlayModeSwitch("settings")}
                  <span style={S.settingHint}>{t("lm.overlayModeHint", "Choose how detected scriptures and transcript notes appear when pushed.")}</span>
                </div>
              )}

              {allowLocalMicControls && (
                <div style={S.settingsGroup}>
                  <div style={S.settingsGroupLabel}>MICROPHONE</div>
                  <div style={S.settingRow}>
                    <span style={S.settingLabel}>Default mic</span>
                    <button
                      type="button"
                      style={S.settingGhostButton}
                      onClick={() => void refreshPresentationMics()}
                      disabled={micLoading || isListening}
                    >
                      {micLoading ? "Loading..." : "Refresh"}
                    </button>
                  </div>
                  <select
                    style={{ ...S.settingSelect, ...S.settingSelectFull }}
                    value={selectedMic}
                    onChange={(e) => selectPresentationMic(e.target.value)}
                    disabled={micLoading || isListening}
                    aria-label="Default microphone"
                  >
                    {mics.length === 0 ? (
                      <option value="">{micLoading ? "Loading microphones..." : "Default microphone"}</option>
                    ) : (
                      mics.map((mic) => (
                        <option key={mic.id || mic.label} value={mic.id}>{mic.label}</option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    style={{
                      ...S.presentationMicButton,
                      ...(isListening ? S.presentationMicButtonActive : null),
                    }}
                    onClick={() => void handlePresentationListeningToggle()}
                    disabled={lmStatus === "connecting" || lmStatus === "requesting-mic"}
                  >
                    <Icon name={isListening ? "stop" : "mic"} size={13} />
                    <span>
                      {lmStatus === "requesting-mic"
                        ? "Requesting mic..."
                        : lmStatus === "connecting"
                          ? "Connecting..."
                          : isListening
                            ? "Stop listening"
                            : "Start listening"}
                    </span>
                  </button>
                  <span style={S.settingHint}>Start Scripture Assistant from this presentation page without opening Verse AI.</span>
                  {micError && <span style={S.settingError}>{micError}</span>}
                </div>
              )}

              <div style={S.settingsGroup}>
                <div style={S.settingsGroupLabel}>AUTO-PUSH</div>
                <label style={S.settingRow}>
                  <span style={S.settingLabel}>{t("lm.autoPushQueue")}</span>
                  <input
                    type="checkbox"
                    checked={settings.autoPushQueue}
                    onChange={(e) => updateSetting("autoPushQueue", e.target.checked)}
                    style={S.settingCheckbox}
                  />
                </label>
                <span style={S.settingHint}>{t("lm.autoPushQueueHint")}</span>

                <label style={S.settingRow}>
                  <span style={S.settingLabel}>{t("lm.autoPushSuggestions")}</span>
                  <input
                    type="checkbox"
                    checked={settings.autoPushSuggestions}
                    onChange={(e) => updateSetting("autoPushSuggestions", e.target.checked)}
                    style={S.settingCheckbox}
                  />
                </label>
                <span style={S.settingHint}>{t("lm.autoPushSuggestionsHint")}</span>

                {(settings.autoPushQueue || settings.autoPushSuggestions) && (
                  <>
                    <div style={S.settingRow}>
                      <span style={S.settingLabel}>{t("lm.dedupWindow")}</span>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={settings.autoPushDedupWindow}
                        onChange={(e) => updateSetting("autoPushDedupWindow", Math.max(0, Number(e.target.value) || 0))}
                        style={S.settingNumber}
                      />
                      <span style={S.settingUnit}>sec</span>
                    </div>
                    <span style={S.settingHint}>{t("lm.dedupHint")}</span>
                  </>
                )}
              </div>

              <div style={S.settingsGroup}>
                <div style={S.settingsGroupLabel}>NAVIGATION</div>
                <label style={S.settingRow}>
                  <span style={S.settingLabel}>{t("lm.autoNavigate")}</span>
                  <input
                    type="checkbox"
                    checked={settings.autoNavigate}
                    onChange={(e) => updateSetting("autoNavigate", e.target.checked)}
                    style={S.settingCheckbox}
                  />
                </label>
                <span style={S.settingHint}>{t("lm.autoNavigateHint")}</span>
              </div>

              {!presentationLinkMode && (
                <div style={S.settingsGroup}>
                  <div style={S.settingsGroupLabel}>PUSH TARGET</div>
                  <div style={S.settingRow}>
                    <span style={S.settingLabel}>{t("lm.pushTarget")}</span>
                    <select
                      style={S.settingSelect}
                      value={settings.pushScene}
                      onChange={(e) => updateSetting("pushScene", e.target.value as "ai" | "main")}
                    >
                      <option value="ai">{t("lm.pushTargetAi")}</option>
                      <option value="main">{t("lm.pushTargetMain")}</option>
                    </select>
                  </div>
                </div>
              )}

              <div style={S.settingsGroup}>
                <div style={S.settingsGroupLabel}>SUGGESTION LIFETIME</div>
                <div style={S.settingRow}>
                  <span style={S.settingLabel}>{t("lm.expireAfter")}</span>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={settings.suggestionLifetime}
                    onChange={(e) => updateSetting("suggestionLifetime", Math.max(5, Number(e.target.value) || 20))}
                    style={S.settingNumber}
                  />
                  <span style={S.settingUnit}>sec</span>
                </div>
                <span style={S.settingHint}>{t("lm.expireAfterHint")}</span>
              </div>

              <div style={S.settingsGroup}>
                <div style={S.settingsGroupLabel}>TRANSLATION</div>
                <div style={S.settingRow} data-onboarding="translation-setting">
                  <span style={S.settingLabel}>{t("lm.translation")}</span>
                  <select
                    style={S.settingSelect}
                    value={settings.translation}
                    onChange={(e) => updateSetting("translation", e.target.value)}
                  >
                    <option value="KJV">KJV</option>
                    <option value="NKJV">NKJV</option>
                    <option value="NIV">NIV</option>
                    <option value="ESV">ESV</option>
                    <option value="NLT">NLT</option>
                  </select>
                </div>
              </div>

              <div style={S.settingsGroup}>
                <div style={S.settingsGroupLabel}>DISPLAY</div>
                <label style={S.settingRow}>
                  <span style={S.settingLabel}>{t("lm.autoScrollTranscript")}</span>
                  <input
                    type="checkbox"
                    checked={settings.autoScroll}
                    onChange={(e) => updateSetting("autoScroll", e.target.checked)}
                    style={S.settingCheckbox}
                  />
                </label>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    background: "var(--dock-bg, #0f172a)",
    color: "var(--dock-text, #E2E8F0)",
    fontSize: 12,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },

  statusBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "2px 12px",
    borderBottom: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
    flexShrink: 0,
    minHeight: 12,
    background: "var(--dock-bg, #0f172a)",
  },
  statusBarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    opacity: 0.8,
  },
  statusBarRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  statusChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 4,
    background: "rgba(255,255,255,0.06)",
    color: "var(--dock-text-dim, #94A3B8)",
  },
  gearBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "none",
    background: "rgba(255,255,255,0.06)",
    color: "var(--dock-text-dim, #94A3B8)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  helpBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "var(--dock-text-dim, #64748B)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  modeSwitchBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderBottom: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
    background: "rgba(255,255,255,0.025)",
    flexShrink: 0,
  },
  modeSwitchPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 6,
  },
  modeSwitchLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minWidth: 74,
    color: "var(--dock-text, #E2E8F0)",
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  modeSwitchLabelWide: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "var(--dock-text, #E2E8F0)",
    fontSize: 11,
    fontWeight: 700,
  },
  modeSegmented: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    minHeight: 30,
    padding: 2,
    borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(0,0,0,0.16)",
    gap: 2,
  },
  modeSegmentedWide: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    minHeight: 34,
    padding: 2,
    borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(0,0,0,0.16)",
    gap: 2,
  },
  modeSegmentButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minWidth: 0,
    minHeight: 26,
    padding: "4px 6px",
    border: "none",
    borderRadius: 5,
    background: "transparent",
    color: "var(--dock-text-dim, #94A3B8)",
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.15s, color 0.15s",
  },
  modeSegmentButtonWide: {
    minHeight: 30,
    fontSize: 11,
  },
  modeSegmentButtonActive: {
    background: "#9F442B",
    color: "#FFFFFF",
  },

  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
    flexShrink: 0,
    background: "var(--dock-bg, #0f172a)",
  },
  tab: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "8px 0",
    border: "none",
    borderBottom: "2px solid transparent",
    background: "transparent",
    color: "var(--dock-text-dim, #64748B)",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "inherit",
  },
  tabActive: {
    color: "#3B82F6",
    borderBottom: "2px solid #3B82F6",
    background: "rgba(59,130,246,0.06)",
  },
  tabContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },

  // ── Current / Live verse ──
  currentSection: {
    flexShrink: 0,
    padding: "6px 12px 4px",
  },
  currentCard: {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid rgba(59,130,246,0.25)",
    background: "rgba(59,130,246,0.04)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  currentCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  currentDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#60A5FA",
    animation: "lm-pulse 1.2s ease-in-out infinite",
    flexShrink: 0,
  },
  currentBadge: {
    fontSize: 9,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#60A5FA",
  },
  currentRef: {
    fontSize: 13,
    fontWeight: 700,
    color: "#E2E8F0",
  },
  currentText: {
    fontSize: 11,
    lineHeight: "1.5",
    color: "var(--dock-text-dim, #94A3B8)",
    fontStyle: "italic",
  },
  currentBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  currentTime: {
    fontSize: 10,
    color: "var(--dock-text-dim, #64748B)",
  },
  pinBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 3,
    border: "1px solid var(--dock-border, rgba(255,255,255,0.08))",
    background: "rgba(255,255,255,0.04)",
    color: "var(--dock-text-dim, #94A3B8)",
    cursor: "pointer",
  },
  pinBtnSmall: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    borderRadius: 3,
    border: "none",
    background: "rgba(255,255,255,0.04)",
    color: "var(--dock-text-dim, #94A3B8)",
    cursor: "pointer",
  },
  // ── Pinned chips ──
  pinnedRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  pinnedChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "1px 8px 1px 6px",
    borderRadius: 3,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--dock-text-dim, #94A3B8)",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  pinnedChipClose: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 12,
    height: 12,
    borderRadius: 2,
    border: "none",
    background: "transparent",
    color: "rgba(255,255,255,0.2)",
    cursor: "pointer",
    padding: 0,
  },
  // ── Queue list ──
  queueSectionFull: {
    flex: "1 1 0",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px 4px",
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--dock-text-dim, #64748B)",
  },
  sectionCount: {
    fontSize: 9,
    fontWeight: 600,
    padding: "1px 5px",
    borderRadius: 4,
    background: "rgba(255,255,255,0.08)",
    color: "var(--dock-text-dim, #94A3B8)",
  },
  queueScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 12px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  suggestionsSection: {
    flex: "0 0 auto",
    maxHeight: "42%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderTop: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
  },
  suggestionsScroll: {
    overflowY: "auto",
    padding: "4px 12px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  sectionEmpty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  sectionEmptyText: {
    fontSize: 11,
    color: "var(--dock-text-dim, #64748B)",
    textAlign: "center",
  },

  queueCard: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
    background: "rgba(255,255,255,0.02)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  suggestionCard: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid rgba(34,197,94,0.22)",
    background: "rgba(34,197,94,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  queueCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  queueRef: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--dock-text, #E2E8F0)",
  },
  queueCardBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  suggestionHint: {
    fontSize: 10,
    color: "var(--dock-text-dim, #94A3B8)",
  },



  verseText: {
    fontSize: 11,
    lineHeight: "1.4",
    color: "var(--dock-text-dim, #94A3B8)",
    fontStyle: "italic",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
  },

  pushBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 10px",
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 5,
    border: "1px solid rgba(59,130,246,0.3)",
    background: "rgba(59,130,246,0.12)",
    color: "#60A5FA",
    cursor: "pointer",
    transition: "all 0.15s",
  },

  // ── Transcript ──
  transcriptSectionFull: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },
  transcriptFeed: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 8px 8px",
    maxHeight: "70%",
  },
  transcriptItem: {
    padding: "4px 6px",
    borderRadius: 4,
    cursor: "pointer",
    transition: "background-color 0.15s",
    position: "relative",
    display: "flex",
    flexDirection: "column",
  },
  transcriptItemSelected: {
    background: "rgba(59,130,246,0.1)",
  },
  transcriptLine: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
  },
  transcriptTextBase: {
    flex: 1,
    fontSize: 12,
    lineHeight: "1.5",
    userSelect: "none",
    transition: "color 0.15s",
  },
  transcriptTextDim: {
    color: "var(--dock-text-dim, #64748B)",
  },
  transcriptTextActive: {
    color: "var(--dock-text, #E2E8F0)",
  },
  transcriptTextSelected: {
    color: "#93C5FD",
  },

  checkboxContainer: {
    width: 0,
    opacity: 0,
    overflow: "hidden",
    transition: "width 0.2s, opacity 0.2s",
    flexShrink: 0,
    paddingTop: 2,
  },
  checkboxContainerVisible: {
    width: 18,
    opacity: 1,
    marginRight: 4,
  },
  checkbox: {
    width: 14,
    height: 14,
    accentColor: "#3B82F6",
    cursor: "pointer",
    flexShrink: 0,
  },

  actionBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginLeft: 28,
    padding: 6,
    gap: 8,
    border: "1px solid rgba(59,130,246,0.22)",
    borderRadius: 8,
    background: "rgba(15,23,42,0.82)",
  },
  actionBarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  selectionCount: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--dock-text, #E2E8F0)",
  },
  btnCancel: {
    background: "transparent",
    border: "1px solid rgba(148,163,184,0.18)",
    color: "#CBD5E1",
    fontSize: 11,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 6,
  },
  actionBarRight: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  btnAction: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "#1F2937",
    color: "#E2E8F0",
    border: "1px solid rgba(148,163,184,0.18)",
    padding: "5px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnPrimary: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "5px 9px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnText: {},

  // ── Context menu ──
  contextMenu: {
    position: "fixed" as const,
    background: "#0f172a",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "4px 0",
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)",
    zIndex: 100,
    minWidth: 140,
    display: "flex",
    flexDirection: "column" as const,
  },
  contextMenuItem: {
    padding: "6px 12px",
    fontSize: 12,
    color: "#cbd5e1",
    background: "none",
    border: "none",
    textAlign: "left" as const,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },

  // ── Edit modal ──
  editModalOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  editModalContent: {
    background: "#0f172a",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    width: "90%",
    maxWidth: 500,
    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
    margin: "0 12px",
    overflow: "hidden",
  },
  editModalHeader: {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  editModalTitle: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: 0,
  },
  editModalClose: {
    background: "none",
    border: "none",
    color: "#64748B",
    fontSize: 18,
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: 4,
  },
  editModalBody: {
    padding: "14px 16px",
  },
  editModalLabel: {
    display: "block",
    fontSize: 11,
    fontWeight: 500,
    color: "#64748B",
    marginBottom: 6,
  },
  editModalTextarea: {
    width: "100%",
    background: "rgba(15,23,42,0.8)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#cbd5e1",
    padding: "10px 12px",
    fontFamily: "inherit",
    fontSize: 13,
    lineHeight: "1.5",
    resize: "vertical" as const,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  editModalFooter: {
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(30,41,59,0.3)",
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  btnSecondary: {
    background: "transparent",
    border: "1px solid #475569",
    color: "#cbd5e1",
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },

  // ── Transcript toast ──
  transcriptToast: {
    position: "fixed" as const,
    top: 60,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1e293b",
    border: "1px solid #475569",
    color: "#E2E8F0",
    padding: "6px 14px",
    borderRadius: 9999,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)",
    zIndex: 50,
    pointerEvents: "none" as const,
  },

  // ── History ──
  historySectionFull: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 12px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  historyItem: {
    fontSize: 11,
    padding: "6px 8px",
    color: "var(--dock-text-dim, #94A3B8)",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  historyItemClickable: {
    fontSize: 11,
    padding: "6px 8px",
    color: "var(--dock-text, #E2E8F0)",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    background: "rgba(59,130,246,0.06)",
    border: "1px solid rgba(59,130,246,0.15)",
    transition: "all 0.15s",
  },

  // ── Toasts ──
  toast: {
    position: "fixed" as const,
    bottom: 60,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 8,
    background: "#166534",
    color: "#BBF7D0",
    fontSize: 12,
    fontWeight: 600,
    zIndex: 1000,
    pointerEvents: "none" as const,
  },
  toastError: {
    position: "fixed" as const,
    bottom: 60,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 8,
    background: "#991B1B",
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: 600,
    zIndex: 1000,
    pointerEvents: "none" as const,
  },

  // ── Matching indicator ──
  matchingBar: {
    padding: "4px 12px",
    borderTop: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
    background: "rgba(59,130,246,0.06)",
  },
  matchingText: {
    fontSize: 10,
    color: "#60A5FA",
    fontWeight: 600,
  },

  // ── Stop confirmation modal ──
  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
  },
  modal: {
    width: "80%",
    maxWidth: 280,
    borderRadius: 10,
    background: "var(--dock-bg, #1E293B)",
    border: "1px solid var(--dock-border, rgba(255,255,255,0.1))",
    overflow: "hidden",
  },
  modalHeader: {
    padding: "12px 16px 0",
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: 700,
    margin: 0,
    color: "var(--dock-text, #E2E8F0)",
  },
  modalBody: {
    padding: "8px 16px",
  },
  modalText: {
    fontSize: 12,
    color: "var(--dock-text-dim, #94A3B8)",
    margin: 0,
  },
  modalFooter: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    padding: "8px 16px 12px",
  },
  modalBtnGhost: {
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent",
    color: "var(--dock-text-dim, #94A3B8)",
    cursor: "pointer",
  },
  modalBtnDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: "none",
    background: "#DC2626",
    color: "#fff",
    cursor: "pointer",
  },

  // ── Empty state ──
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 32,
  },
  emptyText: {
    fontSize: 11,
    color: "var(--dock-text-dim, #64748B)",
    textAlign: "center",
    lineHeight: "1.4",
  },

  // ── Settings side panel ──
  settingsOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    zIndex: 900,
  },
  settingsPanel: {
    position: "fixed" as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: "85%",
    maxWidth: 300,
    background: "var(--dock-bg, #0f172a)",
    borderLeft: "1px solid var(--dock-border, rgba(255,255,255,0.08))",
    display: "flex",
    flexDirection: "column",
    zIndex: 901,
    overflow: "hidden",
  },
  settingsHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderBottom: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
    flexShrink: 0,
  },
  settingsTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--dock-text, #E2E8F0)",
  },
  settingsClose: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "none",
    background: "rgba(255,255,255,0.06)",
    color: "var(--dock-text-dim, #94A3B8)",
    cursor: "pointer",
  },
  settingsBody: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 14px 20px",
  },
  settingsGroup: {
    marginBottom: 16,
  },
  settingsGroupLabel: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--dock-text-dim, #64748B)",
    marginBottom: 6,
  },
  settingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 0",
  },
  settingLabel: {
    fontSize: 11,
    color: "var(--dock-text, #E2E8F0)",
  },
  settingHint: {
    fontSize: 10,
    color: "var(--dock-text-dim, #64748B)",
    marginTop: 6,
    marginBottom: 6,
    display: "block",
    lineHeight: 1.35,
  },
  settingError: {
    display: "block",
    marginTop: 6,
    color: "#EF4444",
    fontSize: 10,
    lineHeight: 1.35,
  },
  settingCheckbox: {
    width: 14,
    height: 14,
    accentColor: "#3B82F6",
  },
  settingSelect: {
    fontSize: 11,
    padding: "3px 6px",
    borderRadius: 5,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--dock-text, #E2E8F0)",
    outline: "none",
  },
  settingSelectFull: {
    width: "100%",
    minHeight: 30,
    marginBottom: 8,
  },
  settingGhostButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    padding: "0 8px",
    borderRadius: 5,
    border: "1px solid rgba(148,163,184,0.24)",
    background: "rgba(15,23,42,0.35)",
    color: "var(--dock-text-dim, #94A3B8)",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  presentationMicButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    minHeight: 32,
    marginBottom: 8,
    borderRadius: 6,
    border: "1px solid rgba(29,78,216,0.55)",
    background: "#1D4ED8",
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
  },
  presentationMicButtonActive: {
    borderColor: "rgba(239,68,68,0.7)",
    background: "#991B1B",
  },
  settingNumber: {
    width: 50,
    fontSize: 11,
    padding: "3px 6px",
    borderRadius: 5,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--dock-text, #E2E8F0)",
    outline: "none",
    textAlign: "center",
  },
  settingUnit: {
    fontSize: 10,
    color: "var(--dock-text-dim, #64748B)",
    marginLeft: 4,
  },
  startBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: "#166534",
    color: "#BBF7D0",
    cursor: "pointer",
    marginTop: 8,
  },
  stopBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "none",
    background: "rgba(239,68,68,0.15)",
    color: "#EF4444",
    cursor: "pointer",
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    background: "rgba(239,68,68,0.08)",
    borderTop: "1px solid rgba(239,68,68,0.15)",
  },

  // ── Live word indicator ──
  transcriptItemLive: {
    borderLeft: "3px solid #3B82F6",
    paddingLeft: 4,
    background: "rgba(59,130,246,0.04)",
    borderRadius: "0 4px 4px 0",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#3B82F6",
    flexShrink: 0,
    marginTop: 5,
    animation: "lm-pulse 1.2s ease-in-out infinite",
    boxShadow: "0 0 6px rgba(59,130,246,0.6)",
  },
  transcriptTextLive: {
    color: "#ffffff",
    fontWeight: 600,
  },
  liveWord: {
    color: "#93C5FD",
    fontWeight: 700,
    fontSize: 13,
    textShadow: "0 0 12px rgba(59,130,246,0.35)",
  },

  hintBar: {
    flexShrink: 0,
    padding: "4px 12px",
    borderTop: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
    background: "rgba(255,255,255,0.02)",
    textAlign: "center",
  },
  hintText: {
    fontSize: 9,
    color: "var(--dock-text-dim, #64748B)",
    letterSpacing: "0.02em",
  },
};
