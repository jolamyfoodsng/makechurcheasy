/**
 * useVerseAi.ts — the Studio's window onto the same Verse AI (speech to scripture) service the
 * Dock and the Verse AI page use.
 *
 *  lines        the live transcript (with the time each line was heard)
 *  detected     references actually said this session (the service's queue), oldest first
 *  queue        the operator's working list: detected references + verses added by hand;
 *               removable and reorderable, kept between restarts
 *  suggestions  verses the message seems to be about (never projected by themselves)
 *
 * The service lives outside React, so leaving the Bible section or the Studio does not stop
 * listening; the hook only subscribes to it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LmDockSnapshot, LmServiceStatus } from "../services/lmDockService";
import type { VoiceBibleCandidate } from "../services/voiceBibleTypes";
import { appendTextToDockNotes } from "../dock/dockNotesStorage";
import { getDockPlan } from "../dock/dockEntitlement";
import { readNativeDockSetting, writeNativeDockSetting } from "../services/localDockSettings";
import { checkPremiumAccess, getPremiumAccessDeniedMessage } from "../services/premiumActionGuard";
import { getSettings as getMvSettings, updateSettings as updateMvSettings } from "../multiview/mvStore";
import { appendNew, candidateKey, moveItem } from "./studioQueue";

export { candidateKey } from "./studioQueue";

type Service = typeof import("../services/lmDockService").lmDockService;

const MIC_KEY = "ocs-speech-to-scripture-mic-id";
const QUEUE_KEY = "mce-studio-verse-queue";
const REMOVED_KEY = "mce-studio-verse-queue-removed";

export interface StudioTranscriptLine {
  id: string;
  text: string;
  finalized: boolean;
  /** When the line was first heard (ms since epoch). */
  at: number;
}

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, value: unknown[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export interface StudioVerseAi {
  status: LmServiceStatus;
  listening: boolean;
  starting: boolean;
  error: string;
  notice: string;
  clearNotice: () => void;
  matching: boolean;
  /** 0–1 microphone level, for the meter. */
  inputLevel: number;
  /** When this listening session started (ms), for the timer. */
  startedAt: number | null;
  lines: StudioTranscriptLine[];
  detected: VoiceBibleCandidate[];
  queue: VoiceBibleCandidate[];
  suggestions: VoiceBibleCandidate[];
  /** The last few finished sentences (to explain suggestions). */
  recentSpeech: string;
  mics: Array<{ id: string; label: string }>;
  refreshingMics: boolean;
  refreshMics: () => Promise<void>;
  mic: string;
  setMic: (id: string) => void;
  /** Microphone sensitivity in percent (100 = as recorded). */
  gain: number;
  setGain: (percent: number) => void;
  start: () => Promise<void>;
  stop: () => void;
  editLine: (id: string, text: string) => void;
  deleteLine: (id: string) => void;
  clearTranscript: () => void;
  /** Append a transcript line to this session's sermon note. Returns the note id, or null. */
  pushToNotes: (text: string) => string | null;
  addToQueue: (candidate: VoiceBibleCandidate) => void;
  removeFromQueue: (candidate: VoiceBibleCandidate) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
}

/** `enabled` = connect to the service (the Studio connects as soon as it opens). */
export function useVerseAi(enabled: boolean): StudioVerseAi {
  const serviceRef = useRef<Service | null>(null);
  const [snapshot, setSnapshot] = useState<LmDockSnapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mics, setMics] = useState<Array<{ id: string; label: string }>>([]);
  const [refreshingMics, setRefreshingMics] = useState(false);
  const [mic, setMicState] = useState(() => readNativeDockSetting<string>(MIC_KEY) || "");
  const [gain, setGainState] = useState(() => {
    const value = Number(getMvSettings().inputGain);
    return Number.isFinite(value) && value > 0 ? value : 100;
  });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set());
  const [queue, setQueue] = useState<VoiceBibleCandidate[]>(() => readList<VoiceBibleCandidate>(QUEUE_KEY));
  const [removed, setRemoved] = useState<Set<string>>(() => new Set(readList<string>(REMOVED_KEY)));
  const [detected, setDetected] = useState<VoiceBibleCandidate[]>([]);
  const heardAt = useRef<Map<string, number>>(new Map());
  const sessionStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    void import("../services/lmDockService").then(({ lmDockService }) => {
      if (cancelled) return;
      serviceRef.current = lmDockService;
      unsubscribe = lmDockService.subscribe((next) => setSnapshot(next));
      void lmDockService.getMics().then((list) => {
        if (cancelled) return;
        setMics(list);
        setMicState((current) => (current && list.some((m) => m.id === current) ? current : list[0]?.id ?? ""));
      }).catch(() => undefined);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? `Verse AI could not load: ${err.message}` : "Verse AI could not load.");
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled]);

  const status: LmServiceStatus = snapshot?.status ?? "idle";
  const listening = status === "listening" || status === "connecting" || status === "requesting-mic";

  // A new listening session starts with a clean slate of corrections and detections.
  useEffect(() => {
    if (typeof snapshot?.startedAt === "number" && snapshot.startedAt !== sessionStartRef.current) {
      sessionStartRef.current = snapshot.startedAt;
      setEdits({});
      setDeleted(new Set());
      setDetected([]);
      setRemoved(new Set());
      writeList(REMOVED_KEY, []);
    }
  }, [snapshot?.startedAt]);

  // New detections: into Detected (this session) and appended once to the Queue.
  const serviceQueue = snapshot?.queue;
  useEffect(() => {
    if (!serviceQueue || serviceQueue.length === 0) return;
    setDetected((current) => appendNew(current, serviceQueue));
    setQueue((current) => {
      const next = appendNew(current, serviceQueue, removed);
      if (next !== current) writeList(QUEUE_KEY, next);
      return next;
    });
  }, [serviceQueue, removed]);

  const setMic = useCallback((id: string) => {
    setMicState(id);
    writeNativeDockSetting(MIC_KEY, id);
  }, []);

  const refreshMics = useCallback(async () => {
    setRefreshingMics(true);
    try {
      const service = serviceRef.current ?? (await import("../services/lmDockService")).lmDockService;
      serviceRef.current = service;
      const list = await service.getMics();
      setMics(list);
      setMicState((current) => current && list.some((device) => device.id === current) ? current : list[0]?.id ?? "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? `Could not refresh microphones: ${err.message}` : "Could not refresh microphones.");
    } finally {
      setRefreshingMics(false);
    }
  }, []);

  const setGain = useCallback((percent: number) => {
    const value = Math.max(10, Math.min(300, Math.round(percent)));
    setGainState(value);
    try {
      updateMvSettings({ inputGain: value });
    } catch {
      /* the setting just isn't saved */
    }
    void serviceRef.current?.setInputGain(value);
  }, []);

  const start = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) {
      setError("Verse AI is still loading. Try again in a moment.");
      return;
    }
    if (listening || starting) return;
    setError("");
    setNotice("");
    setStarting(true);
    try {
      const access = await checkPremiumAccess("speechToScripture");
      if (!access.allowed) {
        const message = getPremiumAccessDeniedMessage(access.reason || "server_error");
        setNotice(`${message.title}: ${message.description}`);
        return;
      }
      await service.startListening(mic || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start listening.");
    } finally {
      setStarting(false);
    }
  }, [listening, starting, mic]);

  const stop = useCallback(() => {
    serviceRef.current?.stopListening();
  }, []);

  const lines = useMemo<StudioTranscriptLine[]>(() => {
    const now = Date.now();
    return (snapshot?.entries ?? [])
      .filter((entry) => !deleted.has(entry.id) && entry.text.trim())
      .map((entry) => {
        let at = heardAt.current.get(entry.id);
        if (at === undefined) {
          at = now;
          heardAt.current.set(entry.id, at);
        }
        return { id: entry.id, text: edits[entry.id] ?? entry.text, finalized: entry.finalized, at };
      });
  }, [snapshot?.entries, edits, deleted]);

  const recentSpeech = useMemo(
    () => lines.filter((l) => l.finalized).slice(-3).map((l) => l.text).join(" "),
    [lines],
  );

  const suggestions = useMemo(() => {
    const queued = new Set(queue.map(candidateKey));
    return (snapshot?.suggestions ?? []).filter((c) => !queued.has(candidateKey(c)));
  }, [snapshot?.suggestions, queue]);

  const editLine = useCallback((id: string, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setEdits((current) => ({ ...current, [id]: clean }));
  }, []);

  const deleteLine = useCallback((id: string) => {
    setDeleted((current) => new Set(current).add(id));
  }, []);

  const clearTranscript = useCallback(() => {
    const ids = (snapshot?.entries ?? []).map((e) => e.id);
    setDeleted((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, [snapshot?.entries]);

  const pushToNotes = useCallback((text: string): string | null => {
    if (getDockPlan() === "free") {
      setNotice("Saving to Notes needs a paid plan.");
      return null;
    }
    const startedAt = sessionStartRef.current;
    const sessionId = startedAt ? `lm-session-${startedAt}` : undefined;
    const title = startedAt ? `Speech Notes · ${new Date(startedAt).toLocaleString()}` : undefined;
    const result = appendTextToDockNotes(text, title, { sessionId });
    return result?.note.id ?? null;
  }, []);

  const saveQueue = (next: VoiceBibleCandidate[]) => {
    writeList(QUEUE_KEY, next);
    return next;
  };

  const addToQueue = useCallback((candidate: VoiceBibleCandidate) => {
    const key = candidateKey(candidate);
    setRemoved((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      writeList(REMOVED_KEY, Array.from(next));
      return next;
    });
    setQueue((current) => (current.some((c) => candidateKey(c) === key)
      ? current
      : saveQueue([...current, { ...candidate, detectedAt: candidate.detectedAt ?? Date.now() }])));
  }, []);

  const removeFromQueue = useCallback((candidate: VoiceBibleCandidate) => {
    const key = candidateKey(candidate);
    setQueue((current) => saveQueue(current.filter((c) => candidateKey(c) !== key)));
    setRemoved((current) => {
      const next = new Set(current).add(key);
      writeList(REMOVED_KEY, Array.from(next));
      return next;
    });
  }, []);

  const moveInQueue = useCallback((from: number, to: number) => {
    setQueue((current) => {
      const next = moveItem(current, from, to);
      return next === current ? current : saveQueue(next);
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue((current) => {
      const keys = current.map(candidateKey);
      setRemoved((old) => {
        const next = new Set(old);
        keys.forEach((k) => next.add(k));
        writeList(REMOVED_KEY, Array.from(next));
        return next;
      });
      return saveQueue([]);
    });
  }, []);

  return {
    status,
    listening,
    starting,
    error: error || snapshot?.error || "",
    notice,
    clearNotice: () => setNotice(""),
    matching: Boolean(snapshot?.matching),
    inputLevel: snapshot?.inputLevel ?? 0,
    startedAt: listening ? (snapshot?.startedAt ?? null) : null,
    lines,
    detected,
    queue,
    suggestions,
    recentSpeech,
    mics,
    refreshingMics,
    refreshMics,
    mic,
    setMic,
    gain,
    setGain,
    start,
    stop,
    editLine,
    deleteLine,
    clearTranscript,
    pushToNotes,
    addToQueue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
  };
}
