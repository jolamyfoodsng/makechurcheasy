/**
 * StudioPage.tsx — Presentation Studio: run the projector without OBS.
 *
 * Layout (as designed): Bible / Worship / Notes / Media tabs on top; the library on
 * the left (Bible doc, songs, notes, media); Program and Preview in the middle with
 * Go live, Previous and Next; today's schedule on the right; and along the bottom the
 * Holyrics-style picker (books, chapters, verses) or one card per slide.
 *
 * Click a card or verse = Preview. Double-click = Live. Space = Go live and move on.
 * The engine in ../studio/studioEngine.ts sends the slide to the projector with the
 * theme picked for that module, the same look the Dock gives in OBS.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  Layers,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorOff,
  MonitorPlay,
  Music,
  Play,
  Radio,
  Settings as SettingsIcon,
  Square,
  Sun,
  Wifi,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSettings as getMvSettings } from "../multiview/mvStore";
import { getAllSongs, WORSHIP_SONGS_UPDATED_EVENT } from "../worship/worshipDb";
import type { Song } from "../worship/types";
import { DOCK_NOTES_UPDATED_EVENT, loadDockNotes, type DockNote } from "../dock/dockNotesStorage";
import { addWholeNoteToActiveSchedule } from "../dock/dockScheduleService";
import type { VoiceBibleCandidate } from "../services/voiceBibleTypes";
import { getAllMedia } from "../library/libraryDb";
import type { MediaItem } from "../library/libraryTypes";
import type { ServicePlanItem } from "../service-planner/types";
import {
  bibleSlides,
  clearProgram,
  goLive,
  loadStudioThemes,
  noteSlides,
  previewMonitorUrl,
  setPreviewState,
  setProgramMix,
  setProgramScreen,
  studioBaseUrl,
  type StudioMode,
  type StudioScreen,
  type StudioThemes,
  type StudioTransition,
} from "../studio/studioEngine";
import { mediaSlide, songSlides, type DeckSlide } from "../studio/studioSlides";
import { useStudioBible } from "../studio/useStudioBible";
import { useVerseAi } from "../studio/useVerseAi";
import { loadMix, saveMix, type StudioMixLayer } from "../studio/studioMix";
import { BibleNav, BibleVerses } from "../studio/ui/BibleDoc";
import SlideCards from "../studio/ui/SlideCards";
import SchedulePanel from "../studio/ui/SchedulePanel";
import VerseAiPanel from "../studio/ui/VerseAiPanel";
import MixPanel from "../studio/ui/MixPanel";
import { MediaList, NoteList, SongList } from "../studio/ui/LibraryLists";
import {
  closeAllProjectors,
  closeProjector,
  listOpenProjectors,
  listStudioMonitors,
  monitorLabel,
  onProjectorsChange,
  openProjector,
  pickDefaultMonitorKey,
  saveOutputMonitor,
  type OpenProjector,
  type ProjectorFeed,
  type StudioMonitor,
} from "../studio/studioOutputWindow";
import "./StudioPage.css";

const PREFS_KEY = "mce-studio-prefs";
/** The Studio has the whole window: the app sidebar and status strips are hidden while it is open. */
const PAGE_CLASS = "studio-page";

type Source = "bible" | "worship" | "notes" | "media" | "lower";
/** The bottom panel always has two tabs: the content of the open source, and Verse AI. */
type BottomTab = "slides" | "verseai";

const SOURCES: Array<{ id: Source; label: string; icon: typeof BookOpen }> = [
  { id: "bible", label: "Bible", icon: BookOpen },
  { id: "worship", label: "Worship", icon: Music },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "media", label: "Media", icon: ImageIcon },
  { id: "lower", label: "Lower thirds", icon: Layers },
];

interface StudioPrefs {
  transition: StudioTransition;
  previewFirst: boolean;
  source: Source;
  look: StudioMode;
}

function readPrefs(): StudioPrefs {
  const fallback: StudioPrefs = { transition: "fade", previewFirst: true, source: "bible", look: "fullscreen" };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<StudioPrefs>) } : fallback;
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: StudioPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function logoUrlFromPath(path: string): string {
  const value = (path || "").trim();
  if (!value) return "";
  if (/^(data:|https?:|blob:)/i.test(value) || value.startsWith("/uploads/")) return value;
  const name = value.replace(/^file:\/\//i, "").split(/[\\/]/).pop();
  return name ? `/uploads/${encodeURIComponent(name)}` : "";
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/** A 1920×1080 page scaled to fit its box, so the monitors look exactly like the projector. */
function ScaledFrame({ src, title }: { src: string; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setScale(Math.max(0.05, box.clientWidth / 1920));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={boxRef} className="studio-frame">
      {src && <iframe title={title} src={src} tabIndex={-1} style={{ transform: `scale(${scale})` }} />}
      {/* Catches clicks so right-click opens the Studio menu, not the webview's "Open Frame / Inspect" menu. */}
      <div className="studio-frame__shield" aria-hidden="true" />
    </div>
  );
}

export default function StudioPage() {
  const navigate = useNavigate();
  const initialPrefs = useState(readPrefs)[0];
  const [base, setBase] = useState("");
  const [transition, setTransition] = useState<StudioTransition>(initialPrefs.transition);
  const [previewFirst, setPreviewFirst] = useState(initialPrefs.previewFirst);
  const [source, setSource] = useState<Source>(initialPrefs.source);
  const [look, setLook] = useState<StudioMode>(initialPrefs.look);
  const [message, setMessage] = useState("");
  const [immersive, setImmersive] = useState(false);

  // Library
  const bible = useStudioBible();
  const [songs, setSongs] = useState<Song[]>([]);
  const [songId, setSongId] = useState("");
  const [notes, setNotes] = useState<DockNote[]>([]);
  const [noteId, setNoteId] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaId, setMediaId] = useState("");
  const [themes, setThemes] = useState<StudioThemes | null>(null);

  // Preview / Program
  const [previewIdx, setPreviewIdx] = useState(0);
  const [pendingVerse, setPendingVerse] = useState<number | null>(null);
  const [pendingLive, setPendingLive] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("slides");
  const [aiOpened, setAiOpened] = useState(false);
  const [mix, setMix] = useState<StudioMixLayer[]>(loadMix);
  const mixRef = useRef<StudioMixLayer[]>(mix);
  const mixTimers = useRef<Record<string, number>>({});
  const [liveKey, setLiveKey] = useState("");
  const [screen, setScreen] = useState<StudioScreen>("live");

  // Outputs
  const [monitors, setMonitors] = useState<StudioMonitor[]>([]);
  const [monitorKey, setMonitorKey] = useState("");
  const [projectorList, setProjectorList] = useState<OpenProjector[]>(() => listOpenProjectors());
  const [busy, setBusy] = useState(false);
  const [outputsPanel, setOutputsPanel] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState(false);
  const [wifiLink, setWifiLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; feed: ProjectorFeed } | null>(null);
  const outputOpen = projectorList.some((p) => p.feed === "program");

  useEffect(() => onProjectorsChange(setProjectorList), []);

  useEffect(() => {
    savePrefs({ transition, previewFirst, source, look });
  }, [transition, previewFirst, source, look]);

  // ── Load the library ──
  useEffect(() => {
    let cancelled = false;
    const loadSongs = () => void getAllSongs().then((list) => { if (!cancelled) setSongs(list); }).catch(() => undefined);
    const loadNotes = () => { if (!cancelled) setNotes(loadDockNotes()); };
    const loadMedia = () => void getAllMedia()
      .then((list) => { if (!cancelled) setMedia(list.filter((m) => m.type === "image" || m.type === "video")); })
      .catch(() => undefined);
    const loadThemes = () => void loadStudioThemes().then((t) => { if (!cancelled) setThemes(t); }).catch(() => undefined);
    loadSongs();
    loadNotes();
    loadMedia();
    loadThemes();
    const onFocus = () => { loadSongs(); loadNotes(); loadMedia(); loadThemes(); };
    window.addEventListener(WORSHIP_SONGS_UPDATED_EVENT, loadSongs);
    window.addEventListener(DOCK_NOTES_UPDATED_EVENT, loadNotes);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener(WORSHIP_SONGS_UPDATED_EVENT, loadSongs);
      window.removeEventListener(DOCK_NOTES_UPDATED_EVENT, loadNotes);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const refreshMonitors = useCallback(async () => {
    try {
      const list = await listStudioMonitors();
      setMonitors(list);
      if (list.length) {
        const key = await pickDefaultMonitorKey(list);
        setMonitorKey((current) => (current && list.some((m) => m.key === current) ? current : key));
      }
    } catch {
      setMonitors([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void studioBaseUrl().then((url) => { if (!cancelled) setBase(url); });
    void refreshMonitors();
    window.addEventListener("focus", refreshMonitors);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshMonitors);
    };
  }, [refreshMonitors]);

  // ── The slides of what is open ──
  const bibleReady = bible.loadedKey === `${bible.book}|${bible.chapter}|${bible.translation}`;

  const deck: DeckSlide[] = useMemo(() => {
    if (source === "bible") {
      return bibleReady ? bibleSlides(bible.book, bible.chapter, bible.translation, bible.verses) : [];
    }
    if (source === "worship") {
      const song = songs.find((s) => s.id === songId);
      return song ? songSlides(song) : [];
    }
    if (source === "notes") {
      const note = notes.find((n) => n.id === noteId);
      return note ? noteSlides(note.id, note.title || "Note", note.content) : [];
    }
    if (source === "lower") return [];
    return media.map(mediaSlide).filter((s): s is DeckSlide => s !== null);
  }, [source, bibleReady, bible.book, bible.chapter, bible.translation, bible.verses, songs, songId, notes, noteId, media]);

  const safeIdx = Math.min(previewIdx, Math.max(0, deck.length - 1));
  const previewSlide = deck[safeIdx] ?? null;
  const liveIdx = deck.findIndex((s) => s.key === liveKey);
  const liveSlide = liveIdx >= 0 ? deck[liveIdx] : null;
  const previewIsLive = liveIdx >= 0 && liveIdx === safeIdx;

  // Keep the Preview screen on the selected slide.
  useEffect(() => {
    setPreviewState(previewSlide, themes, look);
  }, [previewSlide, themes, look]);

  // ── Program / Preview ──
  const sendLive = useCallback((index: number) => {
    const slide = deck[index];
    if (!slide) return;
    goLive(slide, themes, look, transition);
    setLiveKey(slide.key);
    setScreen("live");
    if (previewFirst) setPreviewIdx(Math.min(deck.length - 1, index + 1));
    else setPreviewIdx(index);
  }, [deck, themes, look, transition, previewFirst]);

  const select = useCallback((index: number) => {
    const next = Math.max(0, Math.min(deck.length - 1, index));
    setPreviewIdx(next);
    if (!previewFirst) sendLive(next);
  }, [deck.length, previewFirst, sendLive]);

  // Jump to a verse once its chapter has loaded (and show it, if it was asked to go live).
  useEffect(() => {
    if (source !== "bible" || !bibleReady || pendingVerse === null) return;
    const index = bible.verses.findIndex((v) => v.verse === pendingVerse);
    setPendingVerse(null);
    setPendingLive(false);
    if (pendingLive && index >= 0) sendLive(index);
    else setPreviewIdx(index >= 0 ? index : 0);
  }, [source, bibleReady, pendingVerse, pendingLive, bible.verses, sendLive]);

  const handleClear = useCallback(() => {
    clearProgram(look);
    setLiveKey("");
    setScreen("live");
  }, [look]);

  const toggleScreen = useCallback((next: StudioScreen) => {
    const target: StudioScreen = screen === next ? "live" : next;
    if (target === "logo") {
      const settings = getMvSettings();
      setProgramScreen("logo", { logoUrl: logoUrlFromPath(settings.brandLogoPath), churchName: settings.churchName });
    } else {
      setProgramScreen(target);
    }
    setScreen(target);
  }, [screen]);

  // ── Choosing what to open ──
  const chooseSource = useCallback((next: Source) => {
    setSource(next);
    setBottomTab("slides");
    setPreviewIdx(0);
  }, []);

  const goToReference = useCallback((book: string, chapter: number, verse?: number) => {
    setSource("bible");
    bible.goTo(book, chapter);
    setPendingVerse(verse ?? 1);
  }, [bible]);

  const openScheduleItem = useCallback((item: ServicePlanItem) => {
    const payload = item.payloadSnapshot || {};
    if (item.type === "bible") {
      const book = String(payload.book || "");
      const chapter = Number(payload.chapter);
      if (book && Number.isFinite(chapter)) {
        const translation = String(payload.translation || "");
        if (translation && bible.translations.includes(translation)) bible.setTranslation(translation);
        goToReference(book, chapter, Number(payload.verse) || 1);
      }
      return;
    }
    if (item.type === "worship") {
      const id = String(payload.songId || item.sourceId || "");
      if (id && songs.some((s) => s.id === id)) {
        setSongId(id);
        chooseSource("worship");
      }
      return;
    }
    if (item.type === "sermon") {
      const id = String(payload.noteId || item.sourceId || "");
      if (id && notes.some((n) => n.id === id)) {
        setNoteId(id);
        chooseSource("notes");
      }
      return;
    }
    if (item.type === "media") {
      const id = String(item.sourceId || "");
      const index = media.findIndex((m) => m.id === id);
      if (index >= 0) {
        setMediaId(id);
        setSource("media");
        setPreviewIdx(index);
      }
    }
  }, [bible, goToReference, songs, notes, media, chooseSource]);

  // ── Screen Mix ──
  useEffect(() => {
    mixRef.current = mix;
    setProgramMix(mix);
    saveMix(mix);
  }, [mix]);

  useEffect(() => () => {
    Object.values(mixTimers.current).forEach((id) => window.clearTimeout(id));
  }, []);

  const toggleMixLayer = useCallback((id: string) => {
    const layer = mixRef.current.find((l) => l.id === id);
    if (!layer) return;
    const shown = !layer.shown;
    window.clearTimeout(mixTimers.current[id]);
    setMix((current) => current.map((l) => (l.id === id ? { ...l, shown } : l)));
    // A banner can hide itself after a few seconds.
    if (shown && layer.kind === "banner" && (layer.seconds ?? 0) > 0) {
      mixTimers.current[id] = window.setTimeout(() => {
        setMix((current) => current.map((l) => (l.id === id ? { ...l, shown: false } : l)));
      }, (layer.seconds ?? 0) * 1000);
    }
  }, []);

  // ── Verse AI ──
  const ai = useVerseAi(aiOpened);

  const openVerse = useCallback((candidate: VoiceBibleCandidate, live: boolean) => {
    goToReference(candidate.book, candidate.chapter, candidate.verse);
    setPendingLive(live);
  }, [goToReference]);

  const convertNote = useCallback((target: DockNote) => {
    const title = target.title || "Sermon notes";
    const count = target.content.split(/\n\s*\n/).filter((p) => p.trim()).length;
    addWholeNoteToActiveSchedule({ noteTitle: title, noteContent: target.content, noteId: target.id });
    setNoteId(target.id);
    chooseSource("notes");
    setBottomTab("slides");
    setMessage(`“${title}” is now ${count} slide${count === 1 ? "" : "s"} and is in today's schedule.`);
  }, [chooseSource]);

  // ── Full screen mode (the window itself fills the screen) ──
  const toggleImmersive = useCallback(async (force?: boolean) => {
    const next = force ?? !immersive;
    setImmersive(next);
    try {
      await getCurrentWindow().setFullscreen(next);
    } catch {
      /* browser preview */
    }
  }, [immersive]);

  // No app sidebar on the Studio; leaving the page brings it back.
  useEffect(() => {
    document.documentElement.classList.add(PAGE_CLASS);
    return () => {
      document.documentElement.classList.remove(PAGE_CLASS);
      void getCurrentWindow().setFullscreen(false).catch(() => undefined);
    };
  }, []);

  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  }, [navigate]);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F11") {
        event.preventDefault();
        void toggleImmersive();
        return;
      }
      if (event.key === "Escape" && (menu || outputsPanel || settingsPanel)) {
        setMenu(null);
        setOutputsPanel(false);
        setSettingsPanel(false);
        return;
      }
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        // Show what is in Preview and move on; if Preview is already live, show the next one.
        if (deck.length) sendLive(previewIsLive ? Math.min(deck.length - 1, safeIdx + 1) : safeIdx);
      } else if (event.key === "PageUp") {
        event.preventDefault();
        if (deck.length) sendLive(Math.max(0, (liveIdx >= 0 ? liveIdx : safeIdx) - 1));
      } else if (event.key === "ArrowRight") {
        select(safeIdx + 1);
      } else if (event.key === "ArrowLeft") {
        select(safeIdx - 1);
      } else if (event.key === "b" || event.key === "B") {
        toggleScreen("black");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleImmersive, menu, outputsPanel, settingsPanel, deck.length, sendLive, previewIsLive, safeIdx, liveIdx, select, toggleScreen]);

  // ── Projectors ──
  const openProjectorOn = useCallback(async (feed: ProjectorFeed, target: string) => {
    setBusy(true);
    setMessage("");
    setMenu(null);
    try {
      if (feed === "program" && target !== "window") {
        setMonitorKey(target);
        saveOutputMonitor(target);
      }
      const opened = await openProjector(feed, target);
      const what = feed === "program" ? "Program" : "Preview";
      setMessage(opened.monitorKey
        ? `${what} projector is on ${opened.where}. Press Esc on it to close it.`
        : `${what} projector opened in a window.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't open the projector.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCloseOutput = useCallback(async (feed: ProjectorFeed = "program") => {
    setMenu(null);
    await closeAllProjectors(feed);
  }, []);

  const loadWifiLink = useCallback(async () => {
    try {
      const info = await invoke<{ baseUrl?: string }>("get_lan_overlay_info", { targetHost: null });
      const lanBase = String(info?.baseUrl || "").replace(/\/+$/, "");
      setWifiLink(lanBase ? `${lanBase}/studio-output.html` : "");
    } catch {
      setWifiLink("");
    }
  }, []);

  useEffect(() => {
    if (outputsPanel) void loadWifiLink();
  }, [outputsPanel, loadWifiLink]);

  const copyWifiLink = useCallback(async () => {
    if (!wifiLink) return;
    await navigator.clipboard.writeText(wifiLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [wifiLink]);

  const openMonitorMenu = useCallback((feed: ProjectorFeed, event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    void refreshMonitors();
    setMenu({
      feed,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 520)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 320)),
    });
  }, [refreshMonitors]);

  // ── Labels ──
  const previewUrl = base ? previewMonitorUrl(base) : "";
  const outputMonitorName = projectorList.find((p) => p.feed === "program")?.where ?? "";
  const slideName = (slide: DeckSlide | null) => (slide ? (slide.reference || `${slide.itemTitle} · ${slide.label}`) : "");
  const liveName = slideName(liveSlide);
  const liveScheduleLabel = liveSlide ? (liveSlide.reference || liveSlide.itemTitle) : "";

  const song = songs.find((s) => s.id === songId);
  const note = notes.find((n) => n.id === noteId);
  const bottomTitle = source === "bible"
    ? `${bible.book} ${bible.chapter} · ${bible.translation}`
    : source === "worship" ? (song?.metadata.title || "Worship") : source === "notes" ? (note?.title || "Notes") : source === "lower" ? "Lower thirds and overlays" : "Pictures and videos";
  const bottomHint = source === "bible"
    ? "Click to preview, double-click to go live"
    : source === "media"
      ? "Click to preview, double-click to show"
      : source === "lower" ? "Add a banner, then show or hide it"
      : deck.length ? "Click a card to preview it, double-click to go live" : "";

  const previewVerse = previewSlide?.verse ?? 0;
  const liveVerse = liveSlide?.verse ?? null;
  const verseIdx = (verse: number) => deck.findIndex((s) => s.verse === verse);

  return (
    <div className={`studio sx${immersive ? " studio--immersive" : ""}`}>
      <header className="studio-bar sx-bar">
        <div className="studio-bar__group">
          <button type="button" className="studio-btn sx-back" onClick={goBack} title="Back to the app">
            <ArrowLeft size={15} /> Back
          </button>
          <MonitorPlay size={18} />
          <div className="sx-sources" role="tablist" aria-label="What to show">
            {SOURCES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="tab" aria-selected={source === id} className={`sx-source${source === id ? " is-on" : ""}`} onClick={() => chooseSource(id)}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="studio-bar__group studio-outputs-anchor">
          <button
            type="button"
            className={`studio-btn${outputOpen ? " studio-btn--live" : " studio-btn--primary"}`}
            onClick={() => setOutputsPanel((v) => !v)}
            aria-expanded={outputsPanel}
          >
            <Monitor size={15} /> {outputOpen ? `Output: ${outputMonitorName || "on"}` : "Outputs"}
          </button>
          {outputsPanel && (
            <div className="studio-popover" role="dialog" aria-label="Outputs">
              <div className="studio-popover__section">
                <div className="studio-popover__title"><Monitor size={14} /> Projector or TV (HDMI)</div>
                <select value={monitorKey} onChange={(e) => { setMonitorKey(e.target.value); saveOutputMonitor(e.target.value); }}>
                  {monitors.length === 0 && <option value="">No screens found</option>}
                  {monitors.map((m) => (
                    <option key={m.key} value={m.key}>
                      {monitorLabel(m)}{m.isControlScreen ? " · this screen" : ""}
                    </option>
                  ))}
                </select>
                <div className="studio-popover__row">
                  <button type="button" className="studio-btn studio-btn--primary" disabled={busy || !monitorKey} onClick={() => void openProjectorOn("program", monitorKey)}>
                    <Monitor size={14} /> {outputOpen ? "Move output here" : "Open output"}
                  </button>
                  <button type="button" className="studio-btn" disabled={busy} onClick={() => void openProjectorOn("program", "window")}>
                    New window
                  </button>
                  {outputOpen && (
                    <button type="button" className="studio-btn" onClick={() => void handleCloseOutput("program")}>
                      <MonitorOff size={14} /> Close
                    </button>
                  )}
                </div>
                <p className="studio-popover__hint">Press Esc on a projector to close it. Right-click Program or Preview to open a projector, like OBS.</p>
              </div>
              <div className="studio-popover__section">
                <div className="studio-popover__title"><Wifi size={14} /> Share over Wi-Fi</div>
                {wifiLink ? (
                  <>
                    <div className="studio-link">
                      <code>{wifiLink}</code>
                      <button type="button" className="studio-btn" onClick={() => void copyWifiLink()}>
                        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="studio-popover__hint">Open this link on a smart TV, laptop or tablet on the same Wi-Fi to show the screen there.</p>
                  </>
                ) : (
                  <p className="studio-popover__hint">Connect this computer to Wi-Fi to get a link other screens can open.</p>
                )}
              </div>
              <div className="studio-popover__section studio-popover__section--soon">
                <div className="studio-popover__title"><Radio size={14} /> NDI <span className="studio-soon">Coming soon</span></div>
                <p className="studio-popover__hint">Send the screen to OBS, vMix or a switcher over your network.</p>
              </div>
            </div>
          )}
        </div>
        <div className="studio-bar__group studio-outputs-anchor">
          <button type="button" className="studio-btn" onClick={() => setSettingsPanel((v) => !v)} aria-expanded={settingsPanel} title="Settings">
            <SettingsIcon size={15} />
          </button>
          {settingsPanel && (
            <div className="studio-popover" role="dialog" aria-label="Studio settings">
              <div className="sx-settings">
                <div className="sx-settings__row">
                  <span>Clicking a slide</span>
                  <div className="studio-seg" role="group" aria-label="Clicking a slide">
                    <button type="button" className={previewFirst ? "is-on" : ""} onClick={() => setPreviewFirst(true)}>Previews it</button>
                    <button type="button" className={!previewFirst ? "is-on" : ""} onClick={() => setPreviewFirst(false)}>Shows it at once</button>
                  </div>
                </div>
                <div className="sx-settings__row">
                  <span>Bible and notes look</span>
                  <div className="studio-seg" role="group" aria-label="Look">
                    <button type="button" className={look === "fullscreen" ? "is-on" : ""} onClick={() => setLook("fullscreen")}>Full screen</button>
                    <button type="button" className={look === "lower-third" ? "is-on" : ""} onClick={() => setLook("lower-third")}>Lower third</button>
                  </div>
                </div>
                <p className="studio-popover__hint">Themes are the ones you set up in Themes. Screens and the Wi-Fi link are under Outputs.</p>
              </div>
            </div>
          )}
        </div>
        <div className="studio-bar__group">
          <label className="studio-toggle" title="Clicking a slide only previews it; press Go live to show it">
            <input type="checkbox" checked={previewFirst} onChange={(e) => setPreviewFirst(e.target.checked)} />
            <span>Preview first</span>
          </label>
        </div>
        <div className="studio-bar__group sx-bar__right">
          <button
            type="button"
            className="studio-btn"
            onClick={() => void toggleImmersive()}
            title={immersive ? "Exit full screen (F11)" : "Full screen (F11)"}
          >
            {immersive ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {immersive ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      </header>

      {message && (
        <div className="studio-message" role="status">
          {message}
          <button type="button" className="studio-message__close" onClick={() => setMessage("")} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      <div className="sx-body">
        <div className="sx-top">
          <section className="sx-left" aria-label={SOURCES.find((s) => s.id === source)?.label}>
            {source === "bible" && (
              <BibleNav
                translations={bible.translations}
                translation={bible.translation}
                onTranslation={bible.setTranslation}
                book={bible.book}
                chapter={bible.chapter}
                chapterCount={bible.chapterCount}
                onGoTo={goToReference}
              />
            )}
            {source === "worship" && (
              <SongList songs={songs} selectedId={songId} onSelect={(id) => { setSongId(id); setPreviewIdx(0); }} />
            )}
            {source === "notes" && (
              <NoteList notes={notes} selectedId={noteId} onSelect={(id) => { setNoteId(id); setPreviewIdx(0); }} />
            )}
            {source === "media" && (
              <MediaList
                media={media}
                selectedId={mediaId}
                base={base}
                onSelect={(id) => {
                  setMediaId(id);
                  const index = media.findIndex((m) => m.id === id);
                  if (index >= 0) select(index);
                }}
              />
            )}
            {source === "lower" && (
              <div className="sx-empty sx-empty--big">
                Lower thirds, banners, a logo, a camera or a looping video sit on top of the words. Add them in the panel below, then show or hide each one.
              </div>
            )}
          </section>

          <section className="sx-center">
            <div className="sx-monitors">
              <div className="studio-monitor studio-monitor--preview" onContextMenu={(e) => openMonitorMenu("preview", e)}>
                <div className="studio-monitor__label">
                  <span className="sx-badge sx-badge--next">NEXT</span> Preview
                  <span>{slideName(previewSlide) || "pick something below"}</span>
                </div>
                <ScaledFrame title="Preview" src={previewUrl} />
              </div>

              <div className="sx-ctrls" role="group" aria-label="Show controls">
                <button
                  type="button"
                  className="sx-golive"
                  disabled={!previewSlide || previewIsLive}
                  onClick={() => sendLive(safeIdx)}
                  title="Show Preview on the screen (Space)"
                >
                  <Play size={16} /> Go live
                </button>
                <div className={`sx-livestatus${screen === "black" || screen === "logo" || liveName ? " is-on" : ""}`} title="What the projector is showing now">
                  <span className="sx-badge sx-badge--live">LIVE</span>
                  <span className="sx-livestatus__text">{screen === "black" ? "Black screen" : screen === "logo" ? "Logo" : liveName || "Nothing yet"}</span>
                </div>
                <div className="sx-stepper">
                  <button type="button" className="studio-btn" disabled={safeIdx <= 0} onClick={() => select(safeIdx - 1)} title="Previous (PageUp)">◀ Prev</button>
                  <button type="button" className="studio-btn" disabled={safeIdx >= deck.length - 1} onClick={() => select(safeIdx + 1)} title="Next">Next ▶</button>
                </div>

                <div className="sx-ctrls__label">Transition</div>
                <div className="sx-stack" role="group" aria-label="Transition">
                  <button type="button" className={`studio-btn${transition === "fade" ? " studio-btn--sel" : ""}`} onClick={() => setTransition("fade")} title="Use the theme's animation">Fade</button>
                  <button type="button" className={`studio-btn${transition === "cut" ? " studio-btn--sel" : ""}`} onClick={() => setTransition("cut")} title="Change instantly">Cut</button>
                </div>

              </div>

            </div>
            <p className="studio-tip">
              Click = Preview · Double-click = Live · Space = go live and move on · PageUp = back · B = black screen. Right-click Program or Preview for projectors.
            </p>
          </section>

          <SchedulePanel onOpen={openScheduleItem} liveLabel={liveScheduleLabel} />
        </div>

        <section className="sx-bottom">
          <div className="sx-bottom__head">
            <div className="sx-tabs" role="tablist" aria-label="Bottom panel">
              {([
                ["slides", source === "bible" ? "Verses" : source === "lower" ? "Overlays" : "Slides"],
                ["verseai", "Verse AI"],
              ] as Array<[BottomTab, string]>).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={bottomTab === id}
                  className={`sx-tab${bottomTab === id ? " is-on" : ""}${id === "verseai" && ai.listening ? " is-listening" : ""}`}
                  onClick={() => { setBottomTab(id); if (id === "verseai") setAiOpened(true); }}
                >
                  {label}
                </button>
              ))}
            </div>
            {bottomTab === "slides" && (
              <>
                <strong>{bottomTitle}</strong>
                <span>{bottomHint}</span>
              </>
            )}
          </div>
          <div className={`sx-bottom__body${bottomTab === "slides" && source === "bible" ? " sx-bottom__body--flush" : ""}`}>
            {bottomTab === "slides" && source === "bible" && (
              <BibleVerses
                book={bible.book}
                chapter={bible.chapter}
                translation={bible.translation}
                verses={bible.verses}
                loading={bible.loading}
                previewVerse={previewVerse}
                liveVerse={liveVerse}
                onStep={(delta) => { setPendingVerse(1); void bible.step(delta); }}
                onPickVerse={(verse) => { const i = verseIdx(verse); if (i >= 0) select(i); }}
                onLiveVerse={(verse) => { const i = verseIdx(verse); if (i >= 0) sendLive(i); }}
              />
            )}
            {bottomTab === "slides" && (source === "worship" || source === "notes" || source === "media") && (
              <SlideCards
                slides={deck}
                previewIdx={safeIdx}
                liveIdx={liveIdx}
                base={base}
                empty={source === "worship" ? "Pick a song on the left to see its slides." : source === "notes" ? "Pick a note on the left to see its slides." : "Pick a picture or video."}
                onSelect={select}
                onLive={sendLive}
              />
            )}
            {bottomTab === "slides" && source === "lower" && (
              <MixPanel
                layers={mix}
                media={media}
                logoUrl={logoUrlFromPath(getMvSettings().brandLogoPath)}
                onChange={setMix}
                onToggle={toggleMixLayer}
                lowerThird={look === "lower-third"}
                onLowerThird={(on) => setLook(on ? "lower-third" : "fullscreen")}
              />
            )}
            {bottomTab === "verseai" && (
              <VerseAiPanel ai={ai} notes={notes} onOpenVerse={openVerse} onConvert={convertNote} />
            )}
          </div>
        </section>
      </div>

      {menu && (() => {
        const feedName = menu.feed === "program" ? "Program" : "Preview";
        const open = projectorList.filter((p) => p.feed === menu.feed);
        return (
          <>
            <div className="studio-menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
            <div className="studio-menu" style={{ left: menu.x, top: menu.y }} role="menu">
              <div className="studio-menu__item studio-menu__item--sub" role="menuitem" aria-haspopup="menu" tabIndex={0}>
                {menu.feed === "program" ? <Monitor size={14} /> : <Eye size={14} />}
                <span>Open {feedName} Projector</span>
                <ChevronRight size={14} />
                <div className="studio-menu studio-menu--flyout" role="menu">
                  {monitors.map((m) => {
                    const here = open.some((p) => p.monitorKey === m.key);
                    return (
                      <button key={m.key} type="button" role="menuitem" disabled={busy} onClick={() => void openProjectorOn(menu.feed, m.key)}>
                        <span>{monitorLabel(m)}{m.isControlScreen ? " (this screen)" : ""}</span>
                        {here && <Check size={14} />}
                      </button>
                    );
                  })}
                  {monitors.length === 0 && <div className="studio-menu__empty">No screens found</div>}
                  <div className="studio-menu__divider" />
                  <button type="button" role="menuitem" disabled={busy} onClick={() => void openProjectorOn(menu.feed, "window")}>
                    <span>New window</span>
                  </button>
                </div>
              </div>
              {open.length > 0 && (
                <>
                  <div className="studio-menu__divider" />
                  {open.map((p) => (
                    <button key={p.label} type="button" role="menuitem" onClick={() => { setMenu(null); void closeProjector(p.label); }}>
                      <X size={14} /> <span>Close {feedName} projector ({p.where})</span>
                    </button>
                  ))}
                </>
              )}
              <div className="studio-menu__divider" />
              {menu.feed === "preview" ? (
                <button type="button" role="menuitem" disabled={!previewSlide || previewIsLive} onClick={() => { setMenu(null); sendLive(safeIdx); }}>
                  <Play size={14} /> <span>Go live</span>
                </button>
              ) : (
                <>
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); toggleScreen("black"); }}>
                    <Square size={14} /> <span>{screen === "black" ? "Show content again" : "Black screen"}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); toggleScreen("logo"); }}>
                    <Sun size={14} /> <span>{screen === "logo" ? "Hide logo" : "Show logo"}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); handleClear(); }}>
                    <MonitorOff size={14} /> <span>Clear screen</span>
                  </button>
                  <div className="studio-menu__divider" />
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); setOutputsPanel(true); }}>
                    <Wifi size={14} /> <span>Share over Wi-Fi…</span>
                  </button>
                </>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}
