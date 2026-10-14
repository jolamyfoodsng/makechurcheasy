/**
 * useVerseAi.ts — the Studio's window onto the same Verse AI (speech to scripture) service the
 * Dock and the Verse AI page use. It shows the live transcript, the verses the pastor named
 * (Queue) and the verses it thinks the message is about (Suggestions), and lets the operator
 * correct the transcript and keep lines as sermon notes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LmDockSnapshot, LmServiceStatus } from "../services/lmDockService";
import type { VoiceBibleCandidate } from "../services/voiceBibleTypes";
import { appendTextToDockNotes } from "../dock/dockNotesStorage";
import { getDockPlan } from "../dock/dockEntitlement";
import { readNativeDockSetting, writeNativeDockSetting } from "../services/localDockSettings";
import { checkPremiumAccess, getPremiumAccessDeniedMessage } from "../services/premiumActionGuard";

type Service = typeof import("../services/lmDockService").lmDockService;

const MIC_KEY = "ocs-speech-to-scripture-mic-id";
const QUEUE_KEY = "mce-studio-verse-queue";

export interface StudioTranscriptLine {
  id: string;
  text: string;
  finalized: boolean;
}

export function candidateKey(c: Pick<VoiceBibleCandidate, "book" | "chapter" | "verse" | "endVerse">): string {
  return `${c.book}|${c.chapter}|${c.verse}|${c.endVerse ?? ""}`;
}

function readQueue(): VoiceBibleCandidate[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as VoiceBibleCandidate[]) : [];
  } catch {
    return [];
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
  lines: StudioTranscriptLine[];
  queue: VoiceBibleCandidate[];
  suggestions: VoiceBibleCandidate[];
  mics: Array<{ id: string; label: string }>;
  mic: string;
  setMic: (id: string) => void;
  start: () => Promise<void>;
  stop: () => void;
  editLine: (id: string, text: string) => void;
  deleteLine: (id: string) => void;
  /** Append a transcript line to this session's sermon note. Returns the note id, or null. */
  pushToNotes: (text: string) => string | null;
  addToQueue: (candidate: VoiceBibleCandidate) => void;
  removeFromQueue: (candidate: VoiceBibleCandidate) => void;
}

export function useVerseAi(enabled: boolean): StudioVerseAi {
  const serviceRef = useRef<Service | null>(null);
  const [snapshot, setSnapshot] = useState<LmDockSnapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mics, setMics] = useState<Array<{ id: string; label: string }>>([]);
  const [mic, setMicState] = useState(() => readNativeDockSetting<string>(MIC_KEY) || "");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [manual, setManual] = useState<VoiceBibleCandidate[]>(readQueue);
  const sessionStartRef = useRef<number | null>(null);

  // Connect to the service the first time the Verse AI tab is opened.
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
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled]);

  const status: LmServiceStatus = snapshot?.status ?? "idle";
  const listening = status === "listening" || status === "connecting" || status === "requesting-mic";

  useEffect(() => {
    if (typeof snapshot?.startedAt === "number" && snapshot.startedAt !== sessionStartRef.current) {
      sessionStartRef.current = snapshot.startedAt;
      // A new listening session starts with a clean slate of corrections.
      setEdits({});
      setDeleted(new Set());
      setDismissed(new Set());
    }
  }, [snapshot?.startedAt]);

  const setMic = useCallback((id: string) => {
    setMicState(id);
    writeNativeDockSetting(MIC_KEY, id);
  }, []);

  const start = useCallback(async () => {
    const service = serviceRef.current;
    if (!service || listening || starting) return;
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

  const lines = useMemo<StudioTranscriptLine[]>(() => (
    (snapshot?.entries ?? [])
      .filter((entry) => !deleted.has(entry.id) && entry.text.trim())
      .map((entry) => ({ id: entry.id, text: edits[entry.id] ?? entry.text, finalized: entry.finalized }))
  ), [snapshot?.entries, edits, deleted]);

  const queue = useMemo(() => {
    const seen = new Set<string>();
    const out: VoiceBibleCandidate[] = [];
    for (const c of [...manual, ...(snapshot?.queue ?? [])]) {
      const key = candidateKey(c);
      if (seen.has(key) || dismissed.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }, [manual, snapshot?.queue, dismissed]);

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

  const saveManual = (next: VoiceBibleCandidate[]) => {
    setManual(next);
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const addToQueue = useCallback((candidate: VoiceBibleCandidate) => {
    const key = candidateKey(candidate);
    setDismissed((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    saveManual(manual.some((c) => candidateKey(c) === key) ? manual : [...manual, candidate]);
  }, [manual]);

  const removeFromQueue = useCallback((candidate: VoiceBibleCandidate) => {
    const key = candidateKey(candidate);
    saveManual(manual.filter((c) => candidateKey(c) !== key));
    setDismissed((current) => new Set(current).add(key));
  }, [manual]);

  return {
    status,
    listening,
    starting,
    error: error || snapshot?.error || "",
    notice,
    clearNotice: () => setNotice(""),
    matching: Boolean(snapshot?.matching),
    lines,
    queue,
    suggestions,
    mics,
    mic,
    setMic,
    start,
    stop,
    editLine,
    deleteLine,
    pushToNotes,
    addToQueue,
    removeFromQueue,
  };
}
