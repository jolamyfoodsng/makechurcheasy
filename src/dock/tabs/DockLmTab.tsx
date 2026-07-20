import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Edit2, MonitorUp, Check, StickyNote } from "lucide-react";
import { dockObsClient, type DockObsStatus } from "../dockObsClient";
import { dockClient, type DockStateMessage, type DockCommandType } from "../../services/dockBridge";
import type { VoiceBibleCandidate, TranscriptEntry } from "../../services/voiceBibleTypes";
import { MATCH_SOURCE_LABEL } from "../../services/voiceBibleTypes";
import { parseScriptureReference } from "../../services/scriptureParser";
import { onCreditChange, isProUnlocked } from "../../services/credits";
import Icon from "../DockIcon";
import { requireEntitlement } from "../dockEntitlement";
import { getUserScopedKey } from "../../services/userScopedStorage";
import { getSettings } from "../../multiview/mvStore";
import { getOverlayBaseUrlSync } from "../../services/overlayUrl";

type LmStatus = "idle" | "requesting-mic" | "connecting" | "listening" | "error";

const LM_DOCK_SETTINGS_KEY = "ocs-lm-dock-settings";
const DOCK_BIBLE_PREFS_KEY = "ocs-dock-bible-preferences";
const HISTORY_STORAGE_KEY = "ocs-lm-dock-history";
const MAX_HISTORY = 50;
const MAX_TRANSCRIPT_LINES = 40;
const MAX_QUEUE_SIZE = 5;
const SUGGESTION_EXPIRY_MS = 20_000;
const SUGGESTION_COOLDOWN_MS = 60_000;
const NOTES_STORAGE_KEY = "ocs-dock-notes-v1";

interface DockNote {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

interface FreshnessInfo {
  label: string;
  color: string;
  level: "fresh" | "warning" | "stale";
}

function getFreshness(detectedAt: number, now: number): FreshnessInfo {
  const elapsed = (now - detectedAt) / 1000;
  if (elapsed <= 10) return { label: `${Math.round(elapsed)}s ago`, color: "#4caf50", level: "fresh" };
  if (elapsed <= 20) return { label: `${Math.round(elapsed)}s ago`, color: "#FFC107", level: "warning" };
  return { label: `~${Math.round(elapsed)}s ago`, color: "#EF4444", level: "stale" };
}

interface LmDockSettings {
  autoPushQueue: boolean;
  autoPushSuggestions: boolean;
  autoNavigate: boolean;
  translation: string;
  overlayMode: "fullscreen" | "lower-third";
  autoScroll: boolean;
  pushScene: "ai" | "main";
  duplicateWindowSec: number;
  suggestionLifetime: number;
}

const DEFAULT_SETTINGS: LmDockSettings = {
  autoPushQueue: true,
  autoPushSuggestions: false,
  autoNavigate: false,
  translation: "KJV",
  overlayMode: "fullscreen",
  autoScroll: true,
  pushScene: "ai",
  duplicateWindowSec: 15,
  suggestionLifetime: 20,
};

function loadSettings(): LmDockSettings {
  const globalDefaults = getSettings();
  try {
    const raw = localStorage.getItem(getUserScopedKey(LM_DOCK_SETTINGS_KEY));
    if (!raw) return { ...DEFAULT_SETTINGS, overlayMode: globalDefaults.defaultBibleOverlayMode };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS, overlayMode: globalDefaults.defaultBibleOverlayMode };
  }
}

function saveSettings(settings: LmDockSettings): void {
  try {
    localStorage.setItem(getUserScopedKey(LM_DOCK_SETTINGS_KEY), JSON.stringify(settings));
  } catch { }
}

function loadBiblePrefs(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(DOCK_BIBLE_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
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


export default function DockLmTab() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<LmDockSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);

  const updateSetting = useCallback(<K extends keyof LmDockSettings>(key: K, value: LmDockSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const [obsStatus, setObsStatus] = useState<DockObsStatus>("disconnected");

  useEffect(() => {
    const unsub = dockObsClient.onStatusChange((status) => setObsStatus(status));
    void dockObsClient.connect();
    return unsub;
  }, []);

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
  const [queue, setQueue] = useState<VoiceBibleCandidate[]>([]);
  const [suggestions, setSuggestions] = useState<VoiceBibleCandidate[]>([]);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastAutoPushRef = useRef<string | null>(null);
  const lastAutoPushTimeRef = useRef(0);
  const pushedVersesRef = useRef<Set<string>>(new Set());
  const pollRelayRef = useRef<(() => Promise<void>) | null>(null);
  const relayBusyRef = useRef(false);

  const [activeTab, setActiveTab] = useState<"up-next" | "transcript" | "history">("up-next");
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const detectedAtRef = useRef<Map<string, number>>(new Map());
  const locallyRemovedRef = useRef<Set<string>>(new Set());
  const suggestionCooldownRef = useRef<Map<string, number>>(new Map());

  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [proUnlocked] = useState(() => isProUnlocked());

  useEffect(() => {
    const unsub = onCreditChange((newBalance) => {
      setCreditBalance(newBalance);
    });
    return unsub;
  }, []);

  const creditLabel = proUnlocked ? "Pro" : creditBalance > 0 ? `${creditBalance} cr` : null;

  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  // ── Transcript interaction state ──
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; index: number | null }>({
    visible: false, x: 0, y: 0, index: null,
  });
  const [editModal, setEditModal] = useState<{ visible: boolean; text: string }>({
    visible: false, text: "",
  });
  const clickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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
          matching: boolean;
          error?: string;
        };
        setLmStatus(payload.status);
        if (payload.entries) setEntries(payload.entries);
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
        if (payload.queue) setQueue(payload.queue);
        if (payload.suggestions) setSuggestions(payload.suggestions);
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
          if (state.queue) setQueue(state.queue);
          if (state.suggestions) setSuggestions(state.suggestions);
        }
      } catch (err) {
        console.warn("[DockLmTab] pollRelay FAILED:", err);
      } finally {
        relayBusyRef.current = false;
      }
    };
    pollRelayRef.current = pollRelay;
    void pollRelay();
    const relayInterval = setInterval(pollRelay, 2000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && pollRelayRef.current) {
        void pollRelayRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      unsub();
      clearInterval(relayInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const all = [...queue, ...suggestions];
    for (const c of all) {
      const key = `${c.book}:${c.chapter}:${c.verse}`;
      if (!detectedAtRef.current.has(key)) {
        detectedAtRef.current.set(key, Date.now());
      }
    }
  }, [queue, suggestions]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (settings.autoScroll && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [entries, settings.autoScroll]);

  // ── Push verse to OBS ──
  const handlePushVerse = useCallback(async (candidate: VoiceBibleCandidate, source?: "queue" | "suggestion") => {
    if (obsStatus !== "connected") {
      setPushError(t("lm.notConnected"));
      return;
    }

    const refKey = `${candidate.book}:${candidate.chapter}:${candidate.verse}`;
    pushedVersesRef.current.add(refKey);

    setPushing(true);
    setPushError(null);
    setPushSuccess(null);
    try {
      const biblePrefs = loadBiblePrefs();
      const overlayMode = settings.overlayMode;
      const themeId = overlayMode === "fullscreen"
        ? (biblePrefs.fullscreenThemeId as string || undefined)
        : (biblePrefs.lowerThirdThemeId as string || undefined);

      const quickSettings = overlayMode === "fullscreen"
        ? (biblePrefs.fullscreenQuickThemeSettings as Record<string, unknown> | null | undefined)
        : (biblePrefs.lowerThirdQuickThemeSettings as Record<string, unknown> | null | undefined);

      const targetScene = settings.pushScene === "ai" ? "MCE Presentation" : undefined;

      await dockObsClient.pushBible({
        book: candidate.book,
        chapter: candidate.chapter,
        verse: candidate.verse,
        translation: settings.translation,
        referenceLabel: candidate.label,
        verseText: candidate.snippet,
        overlayMode,
        theme: themeId,
        liveOverrides: quickSettings || null,
        targetScene,
      });

      if (source === "queue") {
        locallyRemovedRef.current.add(`${candidate.book}:${candidate.chapter}:${candidate.verse}`);
      }

      if (source === "suggestion") {
        suggestionCooldownRef.current.set(`${candidate.book}:${candidate.chapter}:${candidate.verse}`, Date.now());
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
  }, [obsStatus, settings.overlayMode, settings.translation, settings.pushScene, t]);

  // ── Push transcript text to OBS ──
  const pushTranscriptToOBS = useCallback(async (text: string) => {
    if (obsStatus !== "connected") {
      showToast(t("lm.notConnected"));
      return;
    }
    setPushing(true);
    try {
      const biblePrefs = loadBiblePrefs();
      const overlayMode = settings.overlayMode;
      const quickSettings = overlayMode === "fullscreen"
        ? (biblePrefs.fullscreenQuickThemeSettings as Record<string, unknown> | null | undefined)
        : (biblePrefs.lowerThirdQuickThemeSettings as Record<string, unknown> | null | undefined);

      await dockObsClient.pushNotesLyrics({
        sectionText: text,
        sectionLabel: "Transcript Note",
        songTitle: "",
        overlayMode,
        bibleThemeSettings: quickSettings as Record<string, unknown> | null ?? null,
        liveOverrides: null,
      });

      showToast("Pushed to OBS");
    } catch (err) {
      showToast("Failed to push to OBS");
    } finally {
      setPushing(false);
    }
  }, [obsStatus, settings.overlayMode, showToast, t]);

  const isListening = lmStatus === "listening" || lmStatus === "connecting" || lmStatus === "requesting-mic";

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

  // ── Auto-push and auto-navigate ──
  useEffect(() => {
    if (candidates.length === 0) return;
    const best = candidates[0];
    if (!best) return;

    const refKey = `${best.book}:${best.chapter}:${best.verse}`;
    const nowMs = Date.now();

    if (settings.autoNavigate) {
      navigateBibleDock(best);
    }

    const isQueueItem = queue.some((q) => `${q.book}:${q.chapter}:${q.verse}` === refKey);
    const shouldAutoPush = isQueueItem ? settings.autoPushQueue : settings.autoPushSuggestions;

    if (shouldAutoPush && obsStatus === "connected" && !pushing && !pushedVersesRef.current.has(refKey)) {
      lastAutoPushRef.current = refKey;
      lastAutoPushTimeRef.current = nowMs;
      void handlePushVerse(best);
    }
  }, [candidates, settings.autoPushQueue, settings.autoPushSuggestions, settings.autoNavigate, obsStatus, pushing, handlePushVerse, navigateBibleDock, queue]);

  const handleStartListening = useCallback(async () => {
    const entitled = await requireEntitlement("speechToScripture", 0);
    if (!entitled) return;
    sendLmCommand("lm:start");
  }, [sendLmCommand]);



  const confirmStop = useCallback(() => {
    sendLmCommand("lm:stop");
    setShowStopConfirm(false);
  }, [sendLmCommand]);

  const processedQueue = useMemo(() => {
    const result: VoiceBibleCandidate[] = [];
    for (const item of queue) {
      const key = `${item.book}:${item.chapter}:${item.verse}`;
      if (locallyRemovedRef.current.has(key)) continue;
      const existingIdx = result.findIndex((r) => `${r.book}:${r.chapter}:${r.verse}` === key);
      if (existingIdx >= 0) result.splice(existingIdx, 1);
      result.unshift(item);
    }
    return result.slice(0, MAX_QUEUE_SIZE);
  }, [queue]);

  const filteredSuggestions = useMemo(() => {
    const nowMs = Date.now();
    return suggestions.filter((s) => {
      const key = `${s.book}:${s.chapter}:${s.verse}`;
      const detectedAt = detectedAtRef.current.get(key) ?? nowMs;
      if (nowMs - detectedAt > SUGGESTION_EXPIRY_MS) return false;
      const cooldownAt = suggestionCooldownRef.current.get(key);
      if (cooldownAt && nowMs - cooldownAt < SUGGESTION_COOLDOWN_MS) return false;
      return true;
    });
  }, [suggestions, now]);

  useEffect(() => {
    const cutoff = Date.now() - SUGGESTION_EXPIRY_MS;
    for (const [key, time] of Array.from(detectedAtRef.current.entries())) {
      if (time < cutoff) {
        detectedAtRef.current.delete(key);
      }
    }
  }, [filteredSuggestions, now]);

  useEffect(() => {
    const cutoff = Date.now() - SUGGESTION_COOLDOWN_MS;
    for (const [key, time] of Array.from(suggestionCooldownRef.current.entries())) {
      if (time < cutoff) {
        suggestionCooldownRef.current.delete(key);
      }
    }
  }, [now]);

  const recentEntries = useMemo(() => entries.slice(-MAX_TRANSCRIPT_LINES), [entries]);

  // ── Transcript interaction handlers ──
  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, index });
  }, []);

  const handleLineClick = useCallback((index: number) => {
    if (isSelectionMode) {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
    } else {
      if (clickTimeout.current) {
        clearTimeout(clickTimeout.current);
        clickTimeout.current = null;
        setIsSelectionMode(true);
        setSelectedIndices(new Set([index]));
        window.getSelection()?.removeAllRanges();
      } else {
        clickTimeout.current = setTimeout(() => {
          const text = recentEntries[index]?.text;
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
    setSelectedIndices(new Set());
  }, []);

  const handleCopyAll = useCallback(() => {
    const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
    const text = sorted.map(idx => recentEntries[idx]?.text ?? "").filter(Boolean).join("\n");
    if (text) {
      navigator.clipboard.writeText(text).catch(() => { });
      showToast(`Copied ${selectedIndices.size} lines`);
    }
    handleCancelSelection();
  }, [selectedIndices, recentEntries, showToast, handleCancelSelection]);

  const handleEditAll = useCallback(() => {
    const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
    const text = sorted.map(idx => recentEntries[idx]?.text ?? "").filter(Boolean).join("\n");
    setEditModal({ visible: true, text });
    handleCancelSelection();
  }, [selectedIndices, recentEntries, handleCancelSelection]);

  const handlePushToNotes = useCallback(async (text: string) => {
    const today = new Date().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

    const raw = localStorage.getItem(getUserScopedKey(NOTES_STORAGE_KEY));
    const notes: DockNote[] = raw ? JSON.parse(raw) : [];
    let note = notes.find((n) => n.title === today);
    const now = Date.now();

    if (note) {
      note.content = note.content + "\n\n" + text;
      note.updatedAt = now;
    } else {
      note = {
        id: crypto.randomUUID?.() ?? `note-${now}`,
        title: today,
        content: text,
        updatedAt: now,
      };
      notes.unshift(note);
    }

    localStorage.setItem(getUserScopedKey(NOTES_STORAGE_KEY), JSON.stringify(notes));

    if (obsStatus !== "connected") {
      showToast("OBS not connected");
      return;
    }

    try {
      await dockObsClient.pushNotesLyrics({
        sectionText: text,
        sectionLabel: "Transcript Note",
        songTitle: today,
        overlayMode: settings.overlayMode,
        bibleThemeSettings: null,
        liveOverrides: null,
        backgroundOnly: false,
      });
      showToast("Pushed to Notes");
    } catch {
      showToast("Failed to push to OBS");
    }
  }, [settings.overlayMode, obsStatus, showToast]);

  const handleEditPushToOBS = useCallback(() => {
    pushTranscriptToOBS(editModal.text);
    setEditModal({ visible: false, text: "" });
  }, [editModal.text, pushTranscriptToOBS]);

  const maxSelectedIndex = selectedIndices.size > 0 ? Math.max(...Array.from(selectedIndices)) : -1;

  return (
    <div style={S.root} ref={rootRef}>
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
            style={S.gearBtn}
            onClick={() => setShowSettings(!showSettings)}
            title={t("lm.settings")}
          >
            <Icon name="settings" size={14} />
          </button>

        </div>
      </div>

      <div style={S.tabBar}>
        {(["up-next", "transcript", "history"] as const).map((tab) => (
          <button
            key={tab}
            style={{ ...S.tab, ...(activeTab === tab ? S.tabActive : undefined) }}
            onClick={() => setActiveTab(tab)}
          >
            <Icon
              name={tab === "up-next" ? "queue" : tab === "transcript" ? "subtitles" : "history"}
              size={12}
            />
            {tab === "up-next" ? t("lm.tabUpNext") : tab === "transcript" ? t("lm.tabTranscript") : t("lm.tabHistory")}
          </button>
        ))}
      </div>

      {activeTab === "up-next" && (
        <div style={S.tabContent}>
          <div style={S.queueSection}>
            <div style={S.sectionHeader}>
              <span style={S.sectionLabel}>{t("lm.queue")}</span>
              {processedQueue.length > 0 && (
                <span style={S.sectionCount}>{processedQueue.length}</span>
              )}
            </div>
            <div style={S.queueScroll}>
              {processedQueue.length === 0 && (
                <div style={S.sectionEmpty}>
                  <span style={S.sectionEmptyText}>
                    {appConnected ? t("lm.waitingForDetection") : t("lm.openAppToStart")}
                  </span>
                </div>
              )}
              {processedQueue.map((c, i) => {
                const key = `${c.book}:${c.chapter}:${c.verse}`;
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
                      <button
                        style={S.pushBtn}
                        onClick={() => void handlePushVerse(c, "queue")}
                        disabled={pushing || obsStatus !== "connected"}
                        title={t("lm.pushToObsTitle")}
                      >
                        <Icon name="play" size={11} />
                        {t("lm.pushToObs")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={S.suggestionsSection}>
            <div style={S.sectionHeader}>
              <span style={S.sectionLabel}>{t("lm.suggestions")}</span>
              {filteredSuggestions.length > 0 && (
                <span style={S.sectionCount}>{filteredSuggestions.length}</span>
              )}
            </div>
            <div style={S.suggestionsScroll}>
              {filteredSuggestions.length === 0 && (
                <div style={S.sectionEmpty}>
                  <span style={S.sectionEmptyText}>{t("lm.suggestionsEmpty")}</span>
                </div>
              )}
              {filteredSuggestions.map((c, i) => {
                const key = `${c.book}:${c.chapter}:${c.verse}`;
                const detectedAt = detectedAtRef.current.get(key) ?? Date.now();
                const freshness = getFreshness(detectedAt, now);
                const srcLabel = MATCH_SOURCE_LABEL[c.source ?? "fuzzy"];

                return (
                  <div key={`sug-${key}-${i}`} style={S.suggestionCard}>
                    <div style={S.suggestionCardTop}>
                      <span style={S.suggestionRef}>{c.label}</span>
                      <span style={{ ...S.matchBadge, color: srcLabel.color, borderColor: srcLabel.color + "40" }}>
                        {srcLabel.label}
                      </span>
                    </div>
                    {c.snippet && (
                      <div style={S.verseText}>{c.snippet}</div>
                    )}
                    <div style={S.suggestionCardBottom}>
                      <span style={{ fontSize: 10, color: freshness.color }}>{freshness.label}</span>
                      <button
                        style={S.pushBtn}
                        onClick={() => void handlePushVerse(c, "suggestion")}
                        disabled={pushing || obsStatus !== "connected"}
                        title={t("lm.pushToObsTitle")}
                      >
                        <Icon name="play" size={11} />
                        {t("lm.pushToObs")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
                const isSelected = selectedIndices.has(index);
                const showActionBar = isSelectionMode && index === maxSelectedIndex;

                return (
                  <div
                    key={entry.id}
                    style={{
                      ...S.transcriptItem,
                      ...(isSelected ? S.transcriptItemSelected : {}),
                      ...(isSelectionMode ? { paddingLeft: 4 } : {}),
                      ...(showActionBar ? { paddingBottom: 0 } : {}),
                    }}
                    title="Click to copy · Double-click to select · Edit or Push to OBS once selected"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('[data-action-bar]')) return;
                      if ((e.target as HTMLElement).tagName.toLowerCase() === "input") return;
                      handleLineClick(index);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, index)}
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
                            setSelectedIndices((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(index);
                              else next.delete(index);
                              return next;
                            });
                          }}
                        />
                      </div>
                      <span style={{
                        ...S.transcriptTextBase,
                        ...(isSelected ? S.transcriptTextSelected : {}),
                        ...(!entry.finalized ? S.transcriptTextActive : S.transcriptTextDim),
                      }}>
                        {entry.text}
                      </span>

                    </div>

                    {showActionBar && (
                      <div data-action-bar style={S.actionBar}>
                        <div style={S.actionBarLeft}>
                          <span style={S.selectionCount}>{selectedIndices.size} selected</span>
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
                            title="Copy All"
                          >
                            <Copy size={14} />
                            <span style={S.btnText}>Copy All</span>
                          </button>
                          <button
                            style={S.btnAction}
                            onClick={(e) => { e.stopPropagation(); handleEditAll(); }}
                            title="Edit"
                          >
                            <Edit2 size={14} />
                            <span style={S.btnText}>Edit</span>
                          </button>
                          <button
                            style={S.btnAction}
                            onClick={(e) => {
                              e.stopPropagation();
                              const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
                              const text = sorted.map(idx => recentEntries[idx]?.text ?? "").filter(Boolean).join("\n");
                              handlePushToNotes(text);
                              handleCancelSelection();
                            }}
                            title="Save to Notes"
                          >
                            <StickyNote size={14} />
                            <span style={S.btnText}>Notes</span>
                          </button>
                          <button
                            style={S.btnPrimary}
                            onClick={(e) => {
                              e.stopPropagation();
                              const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
                              const text = sorted.map(idx => recentEntries[idx]?.text ?? "").filter(Boolean).join("\n");
                              pushTranscriptToOBS(text);
                              handleCancelSelection();
                            }}
                            title="Push to OBS"
                            disabled={pushing || obsStatus !== "connected"}
                          >
                            <MonitorUp size={14} />
                            <span style={S.btnText}>Push to OBS</span>
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

      {!isListening && entries.length === 0 && candidates.length === 0 && queue.length === 0 && suggestions.length === 0 && (
        <div style={S.emptyState}>
          <Icon name="mic" size={32} style={{ opacity: 0.15 }} />
          <span style={S.emptyText}>
            {t("lm.openAppToStart")}
          </span>
          {appConnected && (
            <button
              style={S.startBtn}
              onClick={() => void handleStartListening()}
              title={t("lm.startListeningHint")}
            >
              <Icon name="mic" size={12} />
              {t("lm.startListening")}
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={S.errorBanner}>
          <Icon name="warning" size={12} style={{ color: "#EF4444" }} />
          <span style={{ color: "#FCA5A5", fontSize: 11 }}>{error}</span>
        </div>
      )}

      <div style={S.hintBar}>
        <span style={S.hintText}>Click to copy a line · Double-click to select · Edit or Push to OBS once selected</span>
      </div>

      {contextMenu.visible && (
        <div
          style={{ ...S.contextMenu, top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={S.contextMenuItem}
            onClick={() => {
              if (contextMenu.index !== null) {
                setIsSelectionMode(true);
                setSelectedIndices(new Set([contextMenu.index]));
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            Select
          </button>
          <button
            style={S.contextMenuItem}
            onClick={() => {
              if (contextMenu.index !== null) {
                const text = recentEntries[contextMenu.index]?.text;
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
              if (contextMenu.index !== null) {
                const text = recentEntries[contextMenu.index]?.text ?? "";
                setEditModal({ visible: true, text });
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            Edit
          </button>
          <button
            style={S.contextMenuItem}
            onClick={() => {
              if (contextMenu.index !== null) {
                const text = recentEntries[contextMenu.index]?.text;
                if (text) pushTranscriptToOBS(text);
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
            disabled={pushing || obsStatus !== "connected"}
          >
            Push to OBS
          </button>
          <button
            style={S.contextMenuItem}
            onClick={() => {
              if (contextMenu.index !== null) {
                const text = recentEntries[contextMenu.index]?.text ?? "";
                void handlePushToNotes(text);
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            Save to Notes
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
                <StickyNote size={14} /> Save to Notes
              </button>
              <button
                style={S.btnPrimary}
                onClick={() => { handleEditPushToOBS(); handleCancelSelection(); }}
                disabled={pushing || obsStatus !== "connected"}
              >
                Push to OBS
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div style={S.settingsGroup}>
                <div style={S.settingsGroupLabel}>AUTO PUSH</div>
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

              <div style={S.settingsGroup}>
                <div style={S.settingsGroupLabel}>DEDUPLICATION</div>
                <div style={S.settingRow}>
                  <span style={S.settingLabel}>{t("lm.dedupWindow")}</span>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={settings.duplicateWindowSec}
                    onChange={(e) => updateSetting("duplicateWindowSec", Math.max(0, Number(e.target.value) || 0))}
                    style={S.settingNumber}
                  />
                  <span style={S.settingUnit}>sec</span>
                </div>
                <span style={S.settingHint}>{t("lm.dedupHint")}</span>
              </div>

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
                <div style={S.settingRow}>
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
    borderBottomColor: "#3B82F6",
    background: "rgba(59,130,246,0.06)",
  },
  tabContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },

  queueSection: {
    flex: "1 1 0",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
    borderBottom: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
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
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(74,222,128,0.2)",
    background: "rgba(74,222,128,0.04)",
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
    fontSize: 13,
    fontWeight: 700,
    color: "var(--dock-text, #E2E8F0)",
  },
  queueCardBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },

  suggestionsSection: {
    flex: "1 1 0",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
    borderBottom: "1px solid var(--dock-border, rgba(255,255,255,0.06))",
  },
  suggestionsScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 12px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  suggestionCard: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--dock-border, rgba(255,255,255,0.08))",
    background: "var(--dock-card, rgba(255,255,255,0.03))",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  suggestionCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  suggestionRef: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--dock-text, #E2E8F0)",
  },
  matchBadge: {
    fontSize: 9,
    fontWeight: 600,
    padding: "1px 5px",
    borderRadius: 3,
    border: "1px solid",
    lineHeight: "1.4",
    flexShrink: 0,
  },
  suggestionCardBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },

  verseText: {
    fontSize: 11,
    lineHeight: "1.4",
    color: "var(--dock-text-dim, #94A3B8)",
    fontStyle: "italic",
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
  },
  transcriptItem: {
    padding: "6px 8px",
    borderRadius: 6,
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
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    padding: "4px 4px 4px 28px",
    gap: 6,
  },
  actionBarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap" as const,
  },
  selectionCount: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--dock-text, #E2E8F0)",
  },
  btnCancel: {
    background: "none",
    border: "none",
    color: "#64748B",
    fontSize: 11,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 4,
  },
  actionBarRight: {
    display: "flex",
    gap: 4,
  },
  btnAction: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "#334155",
    color: "#E2E8F0",
    border: "none",
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
  },
  btnPrimary: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
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
    marginTop: -2,
    marginBottom: 6,
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
