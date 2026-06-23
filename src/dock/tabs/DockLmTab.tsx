/**
 * DockLmTab.tsx — LM Dock (receive-only output).
 *
 * Displays transcript feed, Bible match suggestions, and push-to-preview
 * controls. Mic capture happens in the main app's Speech to Scripture page;
 * results arrive here via BroadcastChannel / HTTP relay.
 *
 * Features:
 *   - Settings panel with auto-push, auto-navigate, translation, overlay mode
 *   - Pushes to MCE Presentation scene
 *   - Reads Bible Dock theme settings for consistent preview styling
 *   - Hover-to-push on candidate cards
 *
 * URL: http://127.0.0.1:<port>/lm-dock.html
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { dockObsClient, type DockObsStatus } from "../dockObsClient";
import { dockClient, type DockStateMessage, type DockCommandType } from "../../services/dockBridge";
import type { VoiceBibleCandidate, TranscriptEntry } from "../../services/voiceBibleTypes";
import { MATCH_SOURCE_LABEL } from "../../services/voiceBibleTypes";
import { onCreditChange, isProUnlocked } from "../../services/credits";
import Icon from "../DockIcon";
import { requireEntitlement } from "../dockEntitlement";
import { getUserScopedKey } from "../../services/userScopedStorage";

type LmStatus = "idle" | "requesting-mic" | "connecting" | "listening" | "error";

const LM_DOCK_SETTINGS_KEY = "ocs-lm-dock-settings";
const DOCK_BIBLE_PREFS_KEY = "ocs-dock-bible-preferences";

// ── Settings types ──

interface LmDockSettings {
  autoPushQueue: boolean;
  autoPushSuggestions: boolean;
  autoNavigate: boolean;
  translation: string;
  overlayMode: "fullscreen" | "lower-third";
  autoScroll: boolean;
  showSnippets: boolean;
  pushScene: "ai" | "main";
  duplicateWindowSec: number;
}

const DEFAULT_SETTINGS: LmDockSettings = {
  autoPushQueue: true,
  autoPushSuggestions: false,
  autoNavigate: false,
  translation: "KJV",
  overlayMode: "fullscreen",
  autoScroll: true,
  showSnippets: true,
  pushScene: "ai",
  duplicateWindowSec: 15,
};

function loadSettings(): LmDockSettings {
  try {
    const raw = localStorage.getItem(getUserScopedKey(LM_DOCK_SETTINGS_KEY));
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: LmDockSettings): void {
  try {
    localStorage.setItem(getUserScopedKey(LM_DOCK_SETTINGS_KEY), JSON.stringify(settings));
  } catch { /* ignore */ }
}

function loadBiblePrefs(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(DOCK_BIBLE_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function DockLmTab() {
  // ── Settings ──
  const [settings, setSettings] = useState<LmDockSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);

  const updateSetting = useCallback(<K extends keyof LmDockSettings>(key: K, value: LmDockSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  // ── OBS connection ──
  const [obsStatus, setObsStatus] = useState<DockObsStatus>("disconnected");

  useEffect(() => {
    const unsub = dockObsClient.onStatusChange((status) => setObsStatus(status));
    void dockObsClient.connect();
    return unsub;
  }, []);

  // ── Dock bridge connection ──
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

  // ── LM state from main app ──
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

    // HTTP polling fallback — works across browser processes
    const pollRelay = async () => {
      try {
        const res = await fetch("/api/lm-state");
        const state = await res.json();
        if (state && state.status) {
          setLmStatus(state.status);
          if (state.entries) setEntries(state.entries);
          setMatching(state.matching ?? false);
          setError(state.error ?? null);
          if (state.candidates) setCandidates(state.candidates);
          if (state.queue) setQueue(state.queue);
          if (state.suggestions) setSuggestions(state.suggestions);
        }
      } catch { /* relay unavailable */ }
    };
    pollRelayRef.current = pollRelay;
    void pollRelay();
    const relayInterval = setInterval(pollRelay, 800);

    // Force immediate update when tab becomes visible (browsers throttle hidden tabs)
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

  // ── LM state from main app ──
  const [lmStatus, setLmStatus] = useState<LmStatus>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [candidates, setCandidates] = useState<VoiceBibleCandidate[]>([]);
  const [queue, setQueue] = useState<VoiceBibleCandidate[]>([]);
  const [suggestions, setSuggestions] = useState<VoiceBibleCandidate[]>([]);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lastAutoPushRef = useRef<string | null>(null);
  const lastAutoPushTimeRef = useRef(0);
  const pollRelayRef = useRef<(() => Promise<void>) | null>(null);

  // ── Tab and confirmation state ──
  const [activeTab, setActiveTab] = useState<"queue" | "transcript">("queue");
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Credits ──
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [proUnlocked] = useState(() => isProUnlocked());

  // Live-update from event bus (main app syncs from backend and emits changes)
  useEffect(() => {
    const unsub = onCreditChange((newBalance) => {
      setCreditBalance(newBalance);
    });
    return unsub;
  }, []);

  // ── LM state from main app ──

  // ── Auto-scroll transcript ──
  useEffect(() => {
    if (settings.autoScroll && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [entries, settings.autoScroll]);

  // ── Push to OBS ──
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const handlePushVerse = useCallback(async (candidate: VoiceBibleCandidate) => {
    if (obsStatus !== "connected") {
      setPushError("Not connected to broadcast");
      return;
    }
    if (!(await requireEntitlement("speechToScripture", 0))) return;
    setPushing(true);
    setPushError(null);
    setPushSuccess(null);
    try {
      // Read Bible Dock theme settings for consistent styling
      const biblePrefs = loadBiblePrefs();
      const overlayMode = settings.overlayMode;
      const themeId = overlayMode === "fullscreen"
        ? (biblePrefs.fullscreenThemeId as string || undefined)
        : (biblePrefs.lowerThirdThemeId as string || undefined);

      // Read quick settings (background color/image/video from BackgroundPickerCard)
      const quickSettings = overlayMode === "fullscreen"
        ? (biblePrefs.fullscreenQuickThemeSettings as Record<string, unknown> | null | undefined)
        : (biblePrefs.lowerThirdQuickThemeSettings as Record<string, unknown> | null | undefined);

      // When pushScene is "ai", push to MCE Presentation scene
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
      setPushSuccess(`Pushed ${candidate.label}`);
      setTimeout(() => setPushSuccess(null), 3000);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  }, [obsStatus, settings.overlayMode, settings.translation, settings.pushScene]);

  // ── Auto-navigate Bible Dock ──
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
    // HTTP fallback for OBS CEF
    fetch("/api/lm-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      keepalive: true,
    }).catch(() => { });
  }, [settings.translation]);

  // ── Auto-push and auto-navigate on new candidates ──
  useEffect(() => {
    if (candidates.length === 0) return;
    const best = candidates[0];
    if (!best) return;

    const refKey = `${best.book}:${best.chapter}:${best.verse}`;
    const now = Date.now();
    const duplicateWindow = settings.duplicateWindowSec * 1000;

    // Auto-navigate
    if (settings.autoNavigate) {
      navigateBibleDock(best);
    }

    // Check if this candidate is from the queue or suggestions
    const isQueueItem = queue.some((q) => `${q.book}:${q.chapter}:${q.verse}` === refKey);
    const shouldAutoPush = isQueueItem ? settings.autoPushQueue : settings.autoPushSuggestions;

    // Auto-push (with dedup)
    if (shouldAutoPush && obsStatus === "connected" && !pushing) {
      const isDuplicate = lastAutoPushRef.current === refKey && (now - lastAutoPushTimeRef.current) < duplicateWindow;
      if (!isDuplicate) {
        lastAutoPushRef.current = refKey;
        lastAutoPushTimeRef.current = now;
        void handlePushVerse(best);
      }
    }
  }, [candidates, settings.autoPushQueue, settings.autoPushSuggestions, settings.autoNavigate, settings.duplicateWindowSec, obsStatus, pushing, handlePushVerse, navigateBibleDock, queue]);

  const handleCopyLine = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  }, []);

  const isListening = lmStatus === "listening" || lmStatus === "connecting" || lmStatus === "requesting-mic";

  /** Send command via both BroadcastChannel and HTTP relay (for OBS CEF cross-process) */
  const sendLmCommand = useCallback((type: DockCommandType, payload?: unknown) => {
    const cmd = { type, payload: payload ?? {}, timestamp: Date.now() };
    dockClient.sendCommand(cmd);
    // HTTP fallback — BroadcastChannel is dead across processes (OBS CEF)
    fetch("/api/lm-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      keepalive: true,
    }).catch(() => { });
  }, []);

  const handleStartListening = useCallback(async () => {
    if (!(await requireEntitlement("speechToScripture", 0))) return;
    sendLmCommand("lm:start");
  }, [sendLmCommand]);

  const handleStopListening = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  const confirmStop = useCallback(() => {
    sendLmCommand("lm:stop");
    setShowStopConfirm(false);
  }, [sendLmCommand]);

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Icon name="mic" size={16} />
          <span style={styles.headerTitle}>LM Dock</span>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: proUnlocked ? "#f5a623" : creditBalance <= 0 ? "#ef4444" : "#a3a3a3",
            marginLeft: 6,
          }}>
            {proUnlocked ? "Pro" : `${creditBalance} cr`}
          </span>
        </div>
        <div style={styles.headerRight}>
          <button
            style={{
              ...styles.listenBtn,
              ...(isListening ? styles.listenBtnActive : {}),
            }}
            onClick={isListening ? handleStopListening : handleStartListening}
            title={isListening ? "Stop Listening" : "Start Listening"}
          >
            <Icon name={isListening ? "stop" : "mic"} size={12} />
            <span>{isListening ? "Stop" : "Start"}</span>
          </button>
          <button
            style={styles.settingsBtn}
            onClick={() => {
              void pollRelayRef.current?.();
            }}
            title="Refresh"
          >
            <Icon name="refresh" size={14} />
          </button>
          <button
            style={styles.settingsBtn}
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <Icon name="settings" size={14} />
          </button>
          <div
            style={{
              ...styles.statusDot,
              background: appConnected
                ? obsStatus === "connected" ? "#4caf50" : "#ff9800"
                : "#666",
            }}
            title={appConnected ? `Broadcast: ${obsStatus}` : "Main app not connected"}
          />
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div style={styles.settingsPanel}>
          <div style={styles.settingsTitle}>Settings</div>

          {/* Auto-push queue */}
          <label style={styles.settingRow}>
            <span style={styles.settingLabel}>Auto-push queue to broadcast</span>
            <input
              type="checkbox"
              checked={settings.autoPushQueue}
              onChange={(e) => updateSetting("autoPushQueue", e.target.checked)}
              style={styles.settingCheckbox}
            />
          </label>
          <span style={styles.settingHint}>
            Auto-push Bible references (open to John 3:16, next verse, etc.) to broadcast preview
          </span>

          {/* Auto-push suggestions */}
          <label style={styles.settingRow}>
            <span style={styles.settingLabel}>Auto-push suggestions to broadcast</span>
            <input
              type="checkbox"
              checked={settings.autoPushSuggestions}
              onChange={(e) => updateSetting("autoPushSuggestions", e.target.checked)}
              style={styles.settingCheckbox}
            />
          </label>
          <span style={styles.settingHint}>
            Auto-push quote matches (for god so loved the world, etc.) to broadcast preview
          </span>

          {/* Auto-navigate */}
          <label style={styles.settingRow}>
            <span style={styles.settingLabel}>Auto-navigate Bible Dock</span>
            <input
              type="checkbox"
              checked={settings.autoNavigate}
              onChange={(e) => updateSetting("autoNavigate", e.target.checked)}
              style={styles.settingCheckbox}
            />
          </label>
          <span style={styles.settingHint}>
            Navigate the main Bible Dock to the detected verse automatically
          </span>

          {/* Push scene */}
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Push target</span>
            <select
              style={styles.settingSelect}
              value={settings.pushScene}
              onChange={(e) => updateSetting("pushScene", e.target.value as "ai" | "main")}
            >
              <option value="ai">AI Preview (separate)</option>
              <option value="main">Main Preview</option>
            </select>
          </div>
          <span style={styles.settingHint}>
            AI Preview uses a separate scene; Main Preview uses Bible Dock's scene
          </span>

          {/* Overlay mode */}
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Overlay mode</span>
            <select
              style={styles.settingSelect}
              value={settings.overlayMode}
              onChange={(e) => updateSetting("overlayMode", e.target.value as "fullscreen" | "lower-third")}
            >
              <option value="fullscreen">Fullscreen</option>
              <option value="lower-third">Lower Third</option>
            </select>
          </div>

          {/* Translation */}
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Translation</span>
            <select
              style={styles.settingSelect}
              value={settings.translation}
              onChange={(e) => updateSetting("translation", e.target.value)}
            >
              <option value="KJV">KJV</option>
              <option value="NIV">NIV</option>
              <option value="ESV">ESV</option>
              <option value="NKJV">NKJV</option>
              <option value="NLT">NLT</option>
            </select>
          </div>

          {/* Duplicate window */}
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Dedup window (sec)</span>
            <input
              type="number"
              min={0}
              max={60}
              value={settings.duplicateWindowSec}
              onChange={(e) => updateSetting("duplicateWindowSec", Math.max(0, Number(e.target.value) || 0))}
              style={styles.settingNumber}
            />
          </div>
          <span style={styles.settingHint}>
            Suppress same verse within this window (auto-push only)
          </span>

          {/* Auto-scroll */}
          <label style={styles.settingRow}>
            <span style={styles.settingLabel}>Auto-scroll transcript</span>
            <input
              type="checkbox"
              checked={settings.autoScroll}
              onChange={(e) => updateSetting("autoScroll", e.target.checked)}
              style={styles.settingCheckbox}
            />
          </label>

          {/* Show snippets */}
          <label style={styles.settingRow}>
            <span style={styles.settingLabel}>Show verse snippets</span>
            <input
              type="checkbox"
              checked={settings.showSnippets}
              onChange={(e) => updateSetting("showSnippets", e.target.checked)}
              style={styles.settingCheckbox}
            />
          </label>
        </div>
      )}

      {/* Status bar */}
      <div style={styles.statusBar}>
        {isListening && (
          <span style={styles.statusBadge}>
            <span style={styles.statusBadgeDot} />
            Listening
          </span>
        )}
        {settings.autoPushQueue && (
          <span style={styles.statusAutoPush}>
            <Icon name="send" size={10} />
            Auto-Q
          </span>
        )}
        {settings.autoPushSuggestions && (
          <span style={styles.statusAutoPush}>
            <Icon name="send" size={10} />
            Auto-S
          </span>
        )}
        {queue.length > 0 && (
          <span style={styles.statusQueue}>
            <Icon name="cast" size={10} />
            {queue.length}
          </span>
        )}
        {lmStatus === "idle" && entries.length === 0 && candidates.length === 0 && queue.length === 0 && suggestions.length === 0 && (
          <span style={styles.statusIdle}>
            Waiting for Speech to Scripture...
          </span>
        )}
        {error && (
          <span style={styles.statusError}>
            <Icon name="error" size={12} />
            {error}
          </span>
        )}
      </div>

      {/* Main Tabs */}
      <div style={styles.mainTabs}>
        <button
          style={{
            ...styles.mainTab,
            ...(activeTab === "queue" ? styles.mainTabActive : {}),
          }}
          onClick={() => setActiveTab("queue")}
        >
          <Icon name="cast" size={12} />
          <span>Queue & Suggestions</span>
          {(queue.length > 0 || suggestions.length > 0) && (
            <span style={styles.mainTabCount}>{queue.length + suggestions.length}</span>
          )}
        </button>
        <button
          style={{
            ...styles.mainTab,
            ...(activeTab === "transcript" ? styles.mainTabActive : {}),
          }}
          onClick={() => setActiveTab("transcript")}
        >
          <Icon name="subtitles" size={12} />
          <span>Transcript</span>
          {entries.length > 0 && (
            <span style={styles.mainTabCount}>{entries.length}</span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div style={styles.tabContent}>
        <>
          {/* Queue & Suggestions Tab */}
          {activeTab === "queue" && (
            <>
              {!appConnected && queue.length === 0 && suggestions.length === 0 && (
                <div style={styles.emptyState}>
                  <Icon name="mic" size={32} style={{ opacity: 0.2 }} />
                  <span style={styles.emptyText}>
                    Open Speech to Scripture in the main app to start listening
                  </span>
                </div>
              )}
              {(appConnected || queue.length > 0 || suggestions.length > 0) && (
                <>
                  {/* Queue — Auto-pushed to OBS */}
                  <div style={styles.section}>
                    <label style={styles.label}>
                      <Icon name="cast" size={12} />
                      Queue (Auto-pushed)
                      {queue.length > 0 && (
                        <span style={styles.labelCount}>{queue.length}</span>
                      )}
                    </label>
                    {queue.length === 0 && (
                      <div style={styles.emptySection}>
                        <span style={styles.emptyText}>Bible references will appear here when mentioned</span>
                      </div>
                    )}
                    <div style={styles.queueList}>
                      {queue.map((c, i) => (
                        <div
                          key={`queue-${c.book}-${c.chapter}-${c.verse}-${i}`}
                          style={{
                            ...styles.queueCard,
                            ...(i === 0 ? styles.queueCardActive : {}),
                          }}
                        >
                          <div style={styles.queueHeader}>
                            <span style={styles.queueRef}>{c.label}</span>
                            <div style={styles.queueRight}>
                              {i === 0 && <span style={styles.queueBadge}>LIVE</span>}
                              <button
                                style={styles.queuePushBtn}
                                onClick={() => void handlePushVerse(c)}
                                disabled={pushing || obsStatus !== "connected"}
                                title="Push to Broadcast Preview"
                              >
                                <Icon name="play" size={10} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suggestions — Manual push only */}
                  <div style={styles.section}>
                    <label style={styles.label}>
                      <Icon name="menu_book" size={12} />
                      Suggestions
                      {suggestions.length > 0 && (
                        <span style={styles.labelCount}>{suggestions.length}</span>
                      )}
                    </label>
                    {suggestions.length === 0 && (
                      <div style={styles.emptySection}>
                        <span style={styles.emptyText}>Quote matches will appear here</span>
                      </div>
                    )}
                    <div style={styles.candidateList}>
                      {suggestions.map((c, i) => {
                        const srcLabel = MATCH_SOURCE_LABEL[c.source ?? "fuzzy"];
                        return (
                          <div
                            key={`suggestion-${c.book}-${c.chapter}-${c.verse}-${i}`}
                            className="lm-candidate-card"
                            style={styles.candidateCard}
                          >
                            <div style={styles.candidateHeader}>
                              <span style={styles.candidateRef}>{c.label}</span>
                              <span style={{ ...styles.candidateConf, color: srcLabel.color, fontSize: 10 }}>
                                {srcLabel.label}
                              </span>
                            </div>
                            {settings.showSnippets && c.snippet && (
                              <div style={styles.candidateSnippet}>
                                {c.snippet.length > 120 ? `${c.snippet.slice(0, 120)}...` : c.snippet}
                              </div>
                            )}
                            <button
                              className="lm-push-btn"
                              style={styles.pushBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handlePushVerse(c);
                              }}
                              disabled={pushing || obsStatus !== "connected"}
                            >
                              <Icon name="send" size={12} />
                              <span>{pushing ? "Pushing..." : "Push to Preview"}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Legacy candidates (fallback) */}
                  {candidates.length > 0 && queue.length === 0 && suggestions.length === 0 && (
                    <div style={styles.section}>
                      <label style={styles.label}>
                        Suggestions ({candidates.length})
                      </label>
                      <div style={styles.candidateList}>
                        {candidates.map((c, i) => {
                          const srcLabel = MATCH_SOURCE_LABEL[c.source ?? "fuzzy"];
                          return (
                            <div
                              key={`${c.book}-${c.chapter}-${c.verse}-${i}`}
                              className="lm-candidate-card"
                              style={styles.candidateCard}
                            >
                              <div style={styles.candidateHeader}>
                                <span style={styles.candidateRef}>{c.label}</span>
                                <span style={{ ...styles.candidateConf, color: srcLabel.color, fontSize: 10 }}>
                                  {srcLabel.label}
                                </span>
                              </div>
                              {settings.showSnippets && c.snippet && (
                                <div style={styles.candidateSnippet}>
                                  {c.snippet.length > 120 ? `${c.snippet.slice(0, 120)}...` : c.snippet}
                                </div>
                              )}
                              <button
                                className="lm-push-btn"
                                style={styles.pushBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handlePushVerse(c);
                                }}
                                disabled={pushing || obsStatus !== "connected"}
                              >
                                <Icon name="send" size={12} />
                                <span>{pushing ? "Pushing..." : "Push to Preview"}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Transcript Tab */}
          {activeTab === "transcript" && (
            <>
              {/* Transcript Feed */}
              <div style={styles.section}>
                <div style={styles.transcriptFeed} ref={transcriptRef}>
                  {entries.map((entry) => {
                    const isCopied = copiedId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className="lm-transcript-line"
                        style={{
                          ...styles.transcriptLine,
                          ...(entry.finalized ? styles.transcriptLineClickable : {}),
                          ...(entry.finalized ? {} : styles.transcriptLineActive),
                          ...(isCopied ? styles.transcriptLineCopied : {}),
                          ...(entry.finalized ? { transition: "background 0.15s ease, transform 0.1s ease, border-color 0.15s ease", borderLeft: "2px solid transparent" } : {}),
                        }}
                        onClick={entry.finalized ? () => void handleCopyLine(entry.id, entry.text) : undefined}
                      >
                        {!entry.finalized && <span style={styles.liveDot} />}
                        <span style={entry.finalized ? styles.transcriptText : styles.transcriptTextActive}>
                          {entry.text}
                        </span>
                        {entry.finalized && (
                          <span style={{
                            ...styles.copyHint,
                            ...(isCopied ? { opacity: 1, transform: "translateX(0)" } : {}),
                          }}>
                            {isCopied ? (
                              <>
                                <Icon name="check" size={10} />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Icon name="content_copy" size={10} />
                                <span>Click to copy</span>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {isListening && entries.length === 0 && (
                    <div style={styles.transcriptLine}>
                      <span style={styles.transcriptPlaceholder}>Listening...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Matching indicator — subtle, doesn't block transcript */}
              {matching && (
                <div style={{ ...styles.section, opacity: 0.6 }}>
                  <span style={{ ...styles.statusText, fontSize: 10 }}>Searching scriptures…</span>
                </div>
              )}
            </>
          )}
        </>
      </div>

      {/* Success / Error toasts */}
      {
        pushSuccess && (
          <div style={styles.toast}>
            <Icon name="check_circle" size={14} />
            <span>{pushSuccess}</span>
          </div>
        )
      }
      {
        pushError && (
          <div style={styles.toastError}>
            <Icon name="error" size={14} />
            <span>{pushError}</span>
          </div>
        )
      }

      {/* Stop Confirmation Dialog */}
      {
        showStopConfirm && (
          <div style={styles.modalOverlay} onClick={() => setShowStopConfirm(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Stop Listening?</h3>
              </div>
              <div style={styles.modalBody}>
                <p style={styles.modalText}>
                  Are you sure you want to stop the live transcription?
                </p>
              </div>
              <div style={styles.modalFooter}>
                <button
                  style={styles.modalBtnGhost}
                  onClick={() => setShowStopConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  style={styles.modalBtnDanger}
                  onClick={confirmStop}
                >
                  <Icon name="stop" size={12} />
                  <span>Stop Listening</span>
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Empty state */}
      {
        !isListening && entries.length === 0 && candidates.length === 0 && queue.length === 0 && suggestions.length === 0 && (
          <div style={styles.emptyState}>
            <Icon name="mic" size={32} style={{ opacity: 0.2 }} />
            <span style={styles.emptyText}>
              Open Speech to Scripture in the main app to start listening. Results will appear here.
            </span>
          </div>
        )
      }
    </div>
  );
}

// ── Styles ──

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    background: "var(--dock-surface, #1e2028)",
    color: "var(--dock-text, #e8e8ea)",
    fontFamily: '"Open Sans", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    borderBottom: "1px solid var(--dock-border, #2a2d38)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  settingsBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    border: "none",
    borderRadius: 3,
    background: "transparent",
    color: "var(--dock-text-dim, #888)",
    cursor: "pointer",
    transition: "color 0.15s",
  },
  listenBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    fontSize: 10,
    fontWeight: 600,
    border: "none",
    borderRadius: 3,
    background: "var(--dock-accent, #5b6abf)",
    color: "#fff",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  listenBtnActive: {
    background: "#dc2626",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
  },
  settingsPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 10px",
    borderBottom: "1px solid var(--dock-border, #2a2d38)",
    background: "var(--dock-input-bg, #16181f)",
    flexShrink: 0,
    maxHeight: 280,
    overflowY: "auto" as const,
  },
  settingsTitle: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "var(--dock-text-dim, #888)",
    marginBottom: 2,
  },
  settingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 24,
  },
  settingLabel: {
    fontSize: 11,
    color: "var(--dock-text, #e8e8ea)",
    flex: 1,
  },
  settingHint: {
    fontSize: 9,
    color: "var(--dock-text-dim, #666)",
    marginTop: -2,
    marginBottom: 2,
    lineHeight: 1.3,
  },
  settingCheckbox: {
    width: 14,
    height: 14,
    accentColor: "#5b6abf",
    cursor: "pointer",
    flexShrink: 0,
  },
  settingSelect: {
    padding: "2px 4px",
    fontSize: 10,
    border: "1px solid var(--dock-border, #2a2d38)",
    borderRadius: 3,
    background: "var(--dock-surface, #1e2028)",
    color: "var(--dock-text, #e8e8ea)",
    outline: "none",
    cursor: "pointer",
    minWidth: 100,
  },
  settingNumber: {
    padding: "2px 4px",
    fontSize: 10,
    border: "1px solid var(--dock-border, #2a2d38)",
    borderRadius: 3,
    background: "var(--dock-surface, #1e2028)",
    color: "var(--dock-text, #e8e8ea)",
    outline: "none",
    width: 50,
    textAlign: "center" as const,
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderBottom: "1px solid var(--dock-border, #2a2d38)",
    flexShrink: 0,
    minHeight: 28,
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10,
    fontWeight: 600,
    color: "#4caf50",
  },
  statusBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#4caf50",
    animation: "pulse 1.5s infinite",
  },
  statusAutoPush: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontSize: 9,
    fontWeight: 600,
    color: "#5b6abf",
    background: "rgba(91, 106, 191, 0.1)",
    padding: "1px 5px",
    borderRadius: 3,
  },
  statusAutoNav: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontSize: 9,
    fontWeight: 600,
    color: "#ff9800",
    background: "rgba(255, 152, 0, 0.1)",
    padding: "1px 5px",
    borderRadius: 3,
  },
  statusQueue: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontSize: 9,
    fontWeight: 600,
    color: "#4caf50",
    background: "rgba(76, 175, 80, 0.1)",
    padding: "1px 5px",
    borderRadius: 3,
  },
  statusIdle: {
    fontSize: 10,
    color: "var(--dock-text-dim, #666)",
    fontStyle: "italic" as const,
  },
  statusError: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    color: "#ff5252",
  },
  section: {
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    flexShrink: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    color: "var(--dock-text-dim, #888)",
  },
  statusText: {
    fontSize: 9,
    color: "var(--dock-text-dim, #666)",
    fontStyle: "italic" as const,
  },
  transcriptFeed: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    maxHeight: 120,
    overflowY: "auto" as const,
    borderRadius: 3,
    background: "var(--dock-input-bg, #16181f)",
    border: "1px solid var(--dock-border, #2a2d38)",
    padding: "4px 0",
  },
  transcriptLine: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    padding: "2px 8px",
    fontSize: 11,
    lineHeight: 1.4,
  },
  transcriptLineActive: {
    background: "rgba(244, 67, 54, 0.06)",
  },
  liveDot: {
    display: "inline-block",
    width: 5,
    height: 5,
    minWidth: 5,
    borderRadius: "50%",
    background: "#f44336",
    marginTop: 4,
    animation: "pulse 1.2s infinite",
  },
  transcriptText: {
    color: "var(--dock-text, #bbb)",
  },
  transcriptTextActive: {
    color: "var(--dock-text, #e8e8ea)",
  },
  copyBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    minWidth: 18,
    border: "none",
    borderRadius: 3,
    background: "transparent",
    color: "var(--dock-text-dim, #888)",
    cursor: "pointer",
    flexShrink: 0,
    marginLeft: "auto",
  },
  transcriptPlaceholder: {
    color: "var(--dock-text-dim, #555)",
    fontStyle: "italic" as const,
    fontSize: 10,
  },
  candidateList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxHeight: 200,
    overflowY: "auto" as const,
  },
  candidateCard: {
    padding: "6px 8px",
    borderRadius: 3,
    border: "1px solid var(--dock-border, #2a2d38)",
    background: "var(--dock-input-bg, #16181f)",
    cursor: "default",
    transition: "border-color 0.15s",
  },
  candidateHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  candidateRef: {
    fontSize: 11,
    fontWeight: 700,
  },
  candidateConf: {
    fontSize: 9,
    color: "var(--dock-text-dim, #888)",
  },
  candidateSnippet: {
    fontSize: 10,
    color: "var(--dock-text-dim, #999)",
    marginTop: 3,
    lineHeight: 1.4,
  },
  pushBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 5,
    padding: "4px 8px",
    fontSize: 10,
    fontWeight: 600,
    border: "none",
    borderRadius: 3,
    background: "var(--dock-accent, #5b6abf)",
    color: "#fff",
    cursor: "pointer",
    width: "100%",
  },
  queueList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxHeight: 200,
    overflowY: "auto",
  },
  queueCard: {
    padding: "6px 8px",
    borderRadius: 3,
    border: "1px solid var(--dock-border, #2a2d38)",
    background: "var(--dock-input-bg, #16181f)",
  },
  queueCardActive: {
    borderColor: "#5b6abf",
    background: "rgba(91, 106, 191, 0.1)",
  },
  queueHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  queueRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  queueRef: {
    fontSize: 11,
    fontWeight: 700,
  },
  queueBadge: {
    fontSize: 9,
    fontWeight: 700,
    background: "#4caf50",
    color: "#fff",
    padding: "1px 5px",
    borderRadius: 2,
  },
  queueSnippet: {
    fontSize: 10,
    color: "var(--dock-text-dim, #999)",
    marginTop: 3,
    lineHeight: 1.4,
  },
  queuePushBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    padding: 0,
    border: "none",
    borderRadius: 3,
    background: "#4caf50",
    color: "#fff",
    cursor: "pointer",
    flexShrink: 0,
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 10px",
    margin: "0 10px 8px",
    fontSize: 10,
    borderRadius: 3,
    background: "rgba(76, 175, 80, 0.15)",
    color: "#4caf50",
    border: "1px solid rgba(76, 175, 80, 0.3)",
    flexShrink: 0,
  },
  toastError: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 10px",
    margin: "0 10px 8px",
    fontSize: 10,
    borderRadius: 3,
    background: "rgba(255, 82, 82, 0.1)",
    color: "#ff5252",
    border: "1px solid rgba(255, 82, 82, 0.2)",
    flexShrink: 0,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 32,
    flex: 1,
  },
  emptyText: {
    fontSize: 11,
    color: "var(--dock-text-dim, #666)",
    textAlign: "center" as const,
    lineHeight: 1.5,
    maxWidth: 200,
  },
  mainTabs: {
    display: "flex",
    borderBottom: "1px solid var(--dock-border, #2a2d38)",
    flexShrink: 0,
  },
  mainTab: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "8px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--dock-text-dim, #888)",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    transition: "color 0.15s, border-color 0.15s",
  },
  mainTabActive: {
    color: "var(--dock-text, #e8e8ea)",
    borderBottomColor: "#5b6abf",
  },
  mainTabCount: {
    fontSize: 9,
    fontWeight: 600,
    background: "#5b6abf",
    color: "#fff",
    borderRadius: 10,
    padding: "1px 5px",
    minWidth: 14,
    textAlign: "center" as const,
  },
  tabContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  },
  labelCount: {
    fontSize: 9,
    fontWeight: 600,
    background: "#5b6abf",
    color: "#fff",
    borderRadius: 10,
    padding: "1px 5px",
    marginLeft: 4,
  },
  emptySection: {
    padding: "12px 16px",
    textAlign: "center" as const,
  },
  transcriptLineClickable: {
    cursor: "pointer",
    transition: "background 0.15s ease, transform 0.1s ease",
  },
  transcriptLineCopied: {
    background: "rgba(76, 175, 80, 0.08)",
    borderLeft: "2px solid #4caf50",
  },
  copyHint: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontSize: 9,
    color: "var(--dock-text-dim, #555)",
    opacity: 0,
    marginLeft: "auto",
    flexShrink: 0,
    transition: "opacity 0.2s ease, transform 0.2s ease",
    transform: "translateX(-4px)",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
  },
  modal: {
    background: "var(--dock-surface, #1e2028)",
    border: "1px solid var(--dock-border, #2a2d38)",
    borderRadius: 8,
    width: 300,
    maxWidth: "90vw",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
  },
  modalHeader: {
    padding: "14px 16px 0",
  },
  modalTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--dock-text, #e8e8ea)",
  },
  modalBody: {
    padding: "12px 16px",
  },
  modalText: {
    margin: 0,
    fontSize: 12,
    color: "var(--dock-text-secondary, #b6c0d4)",
    lineHeight: 1.5,
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    padding: "0 16px 14px",
  },
  modalBtnGhost: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 600,
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "var(--dock-text-secondary, #b6c0d4)",
    cursor: "pointer",
  },
  modalBtnDanger: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 600,
    border: "none",
    borderRadius: 4,
    background: "#dc2626",
    color: "#fff",
    cursor: "pointer",
  },
  // ── Daily limit styles ──
  listenBtnDisabled: {
    background: "rgba(255, 152, 0, 0.15)",
    color: "#ff9800",
    cursor: "not-allowed",
    opacity: 0.8,
  },
  statusLimit: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10,
    fontWeight: 600,
    color: "#ff9800",
  },
  limitOverlay: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 40,
    flex: 1,
    textAlign: "center" as const,
  },
  limitIcon: {
    fontSize: 36,
    lineHeight: 1,
    marginBottom: 4,
  },
  limitTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#ff9800",
  },
  limitDesc: {
    fontSize: 11,
    color: "var(--dock-text-dim, #888)",
    lineHeight: 1.5,
    maxWidth: 260,
  },
  limitCountdown: {
    fontSize: 11,
    color: "var(--dock-text-dim, #666)",
    marginTop: 8,
  },
  limitTimer: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--dock-text, #e8e8ea)",
    fontVariantNumeric: "tabular-nums",
  },
};
