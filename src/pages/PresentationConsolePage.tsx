import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useLocation, useNavigate } from "react-router-dom";

import { getCustomThemes } from "../bible/bibleDb";
import { BibleProvider } from "../bible/bibleStore";
import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";
import type { BibleTheme, BibleVerse } from "../bible/types";
import { getChapter } from "../bible/bibleData";
import { getCountdowns } from "../countdowns/countdownStore";
import type { CountdownConfig } from "../countdowns/types";
import { BibleModule, type BiblePresentationSelectionPayload } from "../components/modules/BibleModule";
import { MEDIA_FILE_ACCEPT, saveLibraryMediaFile } from "../library/MediaTab";
import { deleteMedia, getAllMedia, renameMedia } from "../library/libraryDb";
import type { MediaItem } from "../library/libraryTypes";
import { getPresentationRemoteAccessInfo, syncPresentationRemoteAccessInfo } from "../services/presentationRemote";
import { getPresentationSettings, regenerateSession, savePresentationSettings } from "../services/presentationSettings";
import {
  clearPresentationState,
  fetchPresentationState,
  fetchPresentationViewerCount,
  publishPresentationState,
  subscribeLocalPresentationState,
  type PresentationRemoteState,
} from "../services/presentationState";
import { launchPresentationScreen } from "../services/presentationWindow";
import { getAllSongs } from "../worship/worshipDb";
import { parseWorshipLyricSections } from "../worship/slideEngine";
import type { LyricSection, Song } from "../worship/types";
import { PresentationControls } from "../presentation/components/PresentationControls";
import { PresentationPreview } from "../presentation/components/PresentationPreview";
import { PresentationSourceSidebar } from "../presentation/components/PresentationSourceSidebar";
import { PresentationTopTabs } from "../presentation/components/PresentationTopTabs";
import { loadPresentationTextSlides, loadPresentationTickers, savePresentationTextSlides, savePresentationTickers } from "../presentation/storage";
import type {
  MinistrySource,
  PresentationConnectionStatus,
  PresentationCountdownPayload,
  PresentationMediaFit,
  PresentationMediaPlaybackState,
  PresentationMode,
  PresentationRemoteItem,
  PresentationSessionSettings,
  PresentationTextAlign,
  PresentationTextSlideRecord,
  PresentationTickerDirection,
  PresentationTickerPayload,
  PresentationTickerPosition,
  PresentationTickerRecord,
} from "../presentation/types";
import {
  buildBiblePresentationItem,
  buildCountdownPresentationItem,
  buildMediaPresentationItem,
  buildTextPresentationItem,
  buildTickerPresentationItem,
  createVideoPlaybackState,
  describePresentationItem,
  getMediaViewerUrl,
  themeToStyle,
} from "../presentation/utils";

import "../presentation/presentationConsole.css";

type MediaFilter = "all" | "image" | "video";

interface ThemeOption {
  id: string;
  name: string;
}

interface ThemeOverrides {
  themeId: string;
  fontSize: number;
  textAlign: PresentationTextAlign;
  backgroundColor: string;
  textColor?: string;
}

interface TextDraft {
  id: string;
  title: string;
  subtitle: string;
  body: string;
}

interface CountdownDraft {
  sourceCountdownId?: string;
  title: string;
  mode: "duration" | "time";
  durationHours: number;
  durationMinutes: number;
  durationSeconds: number;
  targetTime: string;
  status: "idle" | "running" | "paused" | "completed";
  startedAt?: string;
  endsAt?: string;
  pausedRemainingSeconds?: number;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  showTitle: boolean;
  showSeconds: boolean;
  completionMessage: string;
}

interface TickerDraft {
  id: string;
  name: string;
  text: string;
  position: PresentationTickerPosition;
  direction: PresentationTickerDirection;
  speed: number;
  textColor: string;
  backgroundColor: string;
  fontSize: number;
  paused: boolean;
  hidden: boolean;
}

interface MediaDraft {
  fit: PresentationMediaFit;
  backgroundColor: string;
  playback: PresentationMediaPlaybackState;
}

interface PendingBibleSelection {
  book: string;
  chapter: number;
  verse: number;
}

function parseMode(value: string | null): PresentationMode {
  return value === "bible" ? "bible" : "ministry";
}

function parseMinistrySource(value: string | null): MinistrySource {
  if (
    value === "media" ||
    value === "worship" ||
    value === "text" ||
    value === "countdown" ||
    value === "ticker"
  ) {
    return value;
  }
  return "media";
}

function toDateTimeLocalValue(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string {
  if (!value.trim()) return "";
  return new Date(value).toISOString();
}

function getCountdownDurationSeconds(draft: CountdownDraft): number {
  return Math.max(0, draft.durationHours * 3600 + draft.durationMinutes * 60 + draft.durationSeconds);
}

function getTargetTimeSeconds(targetTime: string): number {
  const iso = fromDateTimeLocalValue(targetTime);
  if (!iso) return 0;
  const endsAt = new Date(iso).getTime();
  if (Number.isNaN(endsAt)) return 0;
  return Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
}

function getCountdownRemaining(payload: PresentationCountdownPayload): number {
  if (payload.status === "completed") return 0;
  if (payload.status === "paused") {
    return Math.max(0, Math.floor(payload.pausedRemainingSeconds || 0));
  }
  if (payload.mode === "time" && payload.endsAt) {
    return Math.max(0, Math.floor((new Date(payload.endsAt).getTime() - Date.now()) / 1000));
  }
  if (payload.status === "running" && payload.startedAt) {
    const startedAt = new Date(payload.startedAt).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    return Math.max(0, Math.floor(payload.durationSeconds) - elapsedSeconds);
  }
  if (payload.pausedRemainingSeconds != null) {
    return Math.max(0, Math.floor(payload.pausedRemainingSeconds));
  }
  return Math.max(0, Math.floor(payload.durationSeconds));
}

function createDefaultCountdownDraft(): CountdownDraft {
  return {
    title: "Service starts soon",
    mode: "duration",
    durationHours: 0,
    durationMinutes: 10,
    durationSeconds: 0,
    targetTime: "",
    status: "idle",
    pausedRemainingSeconds: 600,
    fontSize: 120,
    textColor: "#FFFFFF",
    backgroundColor: "#050816",
    showTitle: true,
    showSeconds: true,
    completionMessage: "Service starting now",
  };
}

function createDefaultTickerDraft(): TickerDraft {
  return {
    id: "",
    name: "",
    text: "",
    position: "bottom",
    direction: "rtl",
    speed: 1,
    textColor: "#FFFFFF",
    backgroundColor: "#0F172A",
    fontSize: 32,
    paused: false,
    hidden: false,
  };
}

function createDefaultTextDraft(): TextDraft {
  return {
    id: nanoid(),
    title: "",
    subtitle: "",
    body: "",
  };
}

function mapCountdownToDraft(countdown: CountdownConfig): CountdownDraft {
  const totalSeconds = Math.max(0, Math.floor(countdown.timer.durationSeconds || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    sourceCountdownId: countdown.id,
    title: countdown.title || "Countdown",
    mode: countdown.timer.mode === "end-at-time" ? "time" : "duration",
    durationHours: hours,
    durationMinutes: minutes,
    durationSeconds: seconds,
    targetTime: toDateTimeLocalValue(countdown.timer.endAt),
    status: "idle",
    pausedRemainingSeconds: totalSeconds,
    fontSize: Math.max(32, countdown.text.fontSize * 1.6),
    textColor: countdown.text.color || "#FFFFFF",
    backgroundColor: countdown.background.color || "#050816",
    showTitle: Boolean(countdown.text.title || countdown.title),
    showSeconds: countdown.timer.showSeconds !== false,
    completionMessage: countdown.message?.text || "Service starting now",
  };
}

export default function PresentationConsolePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const [mode, setMode] = useState<PresentationMode>(() => parseMode(query.get("mode")));
  const [ministrySource, setMinistrySource] = useState<MinistrySource>(() =>
    parseMinistrySource(query.get("source")),
  );

  const [session, setSession] = useState<PresentationSessionSettings>(() => getPresentationSettings());
  const [connectionStatus, setConnectionStatus] = useState<PresentationConnectionStatus>("waiting");
  const [actionError, setActionError] = useState("");
  const hadConnectedRef = useRef(false);

  const [liveContent, setLiveContent] = useState<PresentationRemoteItem | null>(null);

  const [themes, setThemes] = useState<BibleTheme[]>(BUILTIN_THEMES);
  const themeOptions = useMemo<ThemeOption[]>(
    () => themes.map((theme) => ({ id: theme.id, name: theme.name })),
    [themes],
  );

  const [bibleTranslation, setBibleTranslation] = useState("KJV");
  const [bibleBook, setBibleBook] = useState("John");
  const [bibleChapter, setBibleChapter] = useState(3);
  const [bibleVerses, setBibleVerses] = useState<BibleVerse[]>([]);
  const [selectedVerseNumber, setSelectedVerseNumber] = useState<number | null>(null);
  const [bibleTheme, setBibleTheme] = useState<ThemeOverrides>({
    themeId: BUILTIN_THEMES[0]?.id || "default-dark-fullscreen",
    fontSize: 64,
    textAlign: "center",
    backgroundColor: "#050816",
  });
  const [pendingBibleSelection, setPendingBibleSelection] = useState<PendingBibleSelection | null>(null);
  const [bibleModuleSelection, setBibleModuleSelection] = useState<BiblePresentationSelectionPayload | null>(null);

  const [songs, setSongs] = useState<Song[]>([]);
  const [worshipSongQuery, setWorshipSongQuery] = useState("");
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [worshipTheme, setWorshipTheme] = useState<ThemeOverrides>({
    themeId: BUILTIN_THEMES[0]?.id || "default-dark-fullscreen",
    fontSize: 64,
    textAlign: "center",
    backgroundColor: "#050816",
  });

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaSearchQuery, setMediaSearchQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [mediaDraft, setMediaDraft] = useState<MediaDraft>({
    fit: "fill",
    backgroundColor: "#000000",
    playback: createVideoPlaybackState(),
  });

  const [textSlides, setTextSlides] = useState<PresentationTextSlideRecord[]>(() => loadPresentationTextSlides());
  const [selectedTextSlideId, setSelectedTextSlideId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft>(() => createDefaultTextDraft());
  const [textTheme, setTextTheme] = useState<ThemeOverrides>({
    themeId: BUILTIN_THEMES[0]?.id || "default-dark-fullscreen",
    fontSize: 56,
    textAlign: "center",
    backgroundColor: "#050816",
    textColor: "#FFFFFF",
  });

  const [countdowns, setCountdowns] = useState<CountdownConfig[]>([]);
  const [selectedCountdownId, setSelectedCountdownId] = useState<string | null>(null);
  const [countdownDraft, setCountdownDraft] = useState<CountdownDraft>(() => createDefaultCountdownDraft());

  const [tickers, setTickers] = useState<PresentationTickerRecord[]>(() => loadPresentationTickers());
  const [selectedTickerId, setSelectedTickerId] = useState<string | null>(null);
  const [tickerDraft, setTickerDraft] = useState<TickerDraft>(() => createDefaultTickerDraft());
  const mediaUploadRef = useRef<HTMLInputElement | null>(null);

  const currentSource = mode === "bible" ? "bible" : ministrySource;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (parseMode(params.get("mode")) === mode && parseMinistrySource(params.get("source")) === ministrySource) {
      return;
    }
    params.set("mode", mode);
    if (mode === "ministry") {
      params.set("source", ministrySource);
    } else {
      params.delete("source");
    }
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  }, [location.pathname, location.search, ministrySource, mode, navigate]);

  const getThemeById = useCallback(
    (themeId: string) => themes.find((theme) => theme.id === themeId),
    [themes],
  );

  const reloadMedia = useCallback(async () => {
    const items = await getAllMedia();
    setMediaItems(items);
    setSelectedMediaId((current) => current || items[0]?.id || null);
  }, []);

  const reloadCountdowns = useCallback(async () => {
    const items = await getCountdowns();
    setCountdowns(items);
    setSelectedCountdownId((current) => current || items[0]?.id || null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      try {
        const [customThemes, loadedSongs] = await Promise.all([
          getCustomThemes().catch(() => []),
          getAllSongs().catch(() => []),
        ]);

        if (cancelled) return;

        setThemes([...BUILTIN_THEMES, ...customThemes]);
        setSongs(loadedSongs);
        setSelectedSongId((current) => current || loadedSongs[0]?.id || null);
      } catch {
        if (!cancelled) {
          setThemes(BUILTIN_THEMES);
          setSongs([]);
        }
      }

      await Promise.all([
        reloadMedia().catch(() => setMediaItems([])),
        reloadCountdowns().catch(() => setCountdowns([])),
      ]);
    };

    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [reloadCountdowns, reloadMedia]);

  useEffect(() => {
    let active = true;
    getChapter(bibleBook, bibleChapter, bibleTranslation)
      .then((passage) => {
        if (!active) return;
        const nextVerses = passage?.verses ?? [];
        setBibleVerses(nextVerses);
        setSelectedVerseNumber((current) =>
          current && nextVerses.some((verse) => verse.verse === current)
            ? current
            : nextVerses[0]?.verse ?? null,
        );
      })
      .catch(() => {
        if (active) {
          setBibleVerses([]);
          setSelectedVerseNumber(null);
        }
      });

    return () => {
      active = false;
    };
  }, [bibleBook, bibleChapter, bibleTranslation]);

  const syncRemoteContext = useCallback(async () => {
    try {
      const current = getPresentationSettings();
      const [viewerCount, access] = await Promise.all([
        fetchPresentationViewerCount(current.sessionId).catch(() => 0),
        syncPresentationRemoteAccessInfo(current.sessionId).catch(() =>
          getPresentationRemoteAccessInfo(current.sessionId),
        ),
      ]);

      const nextSession = {
        ...current,
        presentationLink: access.link,
        connectedViewers: viewerCount,
      };

      savePresentationSettings(nextSession);
      setSession(nextSession);
      if (viewerCount > 0) {
        hadConnectedRef.current = true;
        setConnectionStatus("connected");
      } else {
        setConnectionStatus(hadConnectedRef.current ? "disconnected" : "waiting");
      }
    } catch {
      setConnectionStatus("error");
    }
  }, []);

  useEffect(() => {
    void syncRemoteContext();
    const interval = window.setInterval(() => {
      void syncRemoteContext();
    }, 5000);
    const refresh = () => void syncRemoteContext();
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [syncRemoteContext]);

  useEffect(() => {
    let active = true;

    const applyState = (state: PresentationRemoteState | null) => {
      if (!active) return;
      setLiveContent(state?.fullscreen || state?.lowerThird || null);
    };

    fetchPresentationState(session.sessionId)
      .then(applyState)
      .catch(() => { });

    const unsubscribe = subscribeLocalPresentationState(session.sessionId, (state) => {
      applyState(state);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [session.sessionId]);

  const filteredSongs = useMemo(() => {
    const queryText = worshipSongQuery.trim().toLowerCase();
    if (!queryText) return songs;
    return songs.filter((song) => {
      const haystack = `${song.metadata.title} ${song.metadata.artist} ${song.lyrics}`.toLowerCase();
      return haystack.includes(queryText);
    });
  }, [songs, worshipSongQuery]);

  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedSongId) || null,
    [songs, selectedSongId],
  );
  const worshipSections = useMemo<LyricSection[]>(
    () => (selectedSong ? parseWorshipLyricSections(selectedSong.lyrics, selectedSong.linesPerSlide || 2) : []),
    [selectedSong],
  );

  useEffect(() => {
    setSelectedSectionId((current) => {
      if (current && worshipSections.some((section) => section.id === current)) {
        return current;
      }
      return worshipSections[0]?.id || null;
    });
  }, [worshipSections]);

  const activeSection = useMemo(
    () => worshipSections.find((section) => section.id === selectedSectionId) || null,
    [selectedSectionId, worshipSections],
  );

  const filteredMediaItems = useMemo(() => {
    const queryText = mediaSearchQuery.trim().toLowerCase();
    return mediaItems.filter((item) => {
      if (mediaFilter !== "all" && item.type !== mediaFilter) {
        return false;
      }
      if (!queryText) return true;
      return item.name.toLowerCase().includes(queryText);
    });
  }, [mediaFilter, mediaItems, mediaSearchQuery]);

  const selectedMedia = useMemo(
    () => mediaItems.find((item) => item.id === selectedMediaId) || null,
    [mediaItems, selectedMediaId],
  );

  const selectedTextSlide = useMemo(
    () => textSlides.find((slide) => slide.id === selectedTextSlideId) || null,
    [selectedTextSlideId, textSlides],
  );

  const buildCountdownPayload = useCallback((draft: CountdownDraft): PresentationCountdownPayload => {
    const durationSeconds = draft.mode === "duration"
      ? getCountdownDurationSeconds(draft)
      : getTargetTimeSeconds(draft.targetTime);

    return {
      title: draft.title,
      mode: draft.mode,
      status: draft.status,
      durationSeconds,
      startedAt: draft.startedAt,
      endsAt: draft.endsAt,
      pausedRemainingSeconds: draft.pausedRemainingSeconds,
      completionMessage: draft.completionMessage,
      soundEnabled: false,
      showTitle: draft.showTitle,
      showHours: draft.durationHours > 0,
      showMinutes: true,
      showSeconds: draft.showSeconds,
      updatedAt: new Date().toISOString(),
      sourceCountdownId: draft.sourceCountdownId,
    };
  }, []);

  const biblePreviewItem = useMemo(() => {
    if (bibleModuleSelection?.text?.trim()) {
      const themeId = bibleModuleSelection.themeId || bibleTheme.themeId;
      return buildBiblePresentationItem({
        verse: {
          book: bibleModuleSelection.book,
          chapter: bibleModuleSelection.chapter,
          verse: bibleModuleSelection.verse,
          text: bibleModuleSelection.text,
          abbrev: bibleModuleSelection.translation.toLowerCase(),
        },
        translation: bibleModuleSelection.translation,
        style: themeToStyle(getThemeById(themeId)),
        sequenceIndex: Math.max(0, bibleModuleSelection.verse - 1),
        sequenceTotal: Math.max(1, bibleModuleSelection.verseCount || bibleVerses.length || bibleModuleSelection.verse),
      });
    }

    const verse = bibleVerses.find((entry) => entry.verse === selectedVerseNumber);
    if (!verse) return null;
    return buildBiblePresentationItem({
      verse,
      translation: bibleTranslation,
      style: themeToStyle(getThemeById(bibleTheme.themeId), {
        fontSize: bibleTheme.fontSize,
        textAlign: bibleTheme.textAlign,
        backgroundColor: bibleTheme.backgroundColor,
      }),
      sequenceIndex: bibleVerses.findIndex((entry) => entry.verse === verse.verse),
      sequenceTotal: bibleVerses.length,
    });
  }, [bibleModuleSelection, bibleTheme, bibleTranslation, bibleVerses, getThemeById, selectedVerseNumber]);

  const buildBibleItemFromVerse = useCallback((verse: BibleVerse) => {
    return buildBiblePresentationItem({
      verse,
      translation: bibleTranslation,
      style: themeToStyle(getThemeById(bibleTheme.themeId), {
        fontSize: bibleTheme.fontSize,
        textAlign: bibleTheme.textAlign,
        backgroundColor: bibleTheme.backgroundColor,
      }),
      sequenceIndex: bibleVerses.findIndex((entry) => entry.verse === verse.verse),
      sequenceTotal: bibleVerses.length,
    });
  }, [bibleTheme, bibleTranslation, bibleVerses, getThemeById]);

  const buildBibleItemFromPayload = useCallback((payload: BiblePresentationSelectionPayload) => {
    const themeId = payload.themeId || bibleTheme.themeId;
    return buildBiblePresentationItem({
      verse: {
        book: payload.book,
        chapter: payload.chapter,
        verse: payload.verse,
        text: payload.text,
        abbrev: payload.translation.toLowerCase(),
      },
      translation: payload.translation,
      style: themeToStyle(getThemeById(themeId)),
      sequenceIndex: Math.max(0, payload.verse - 1),
      sequenceTotal: Math.max(1, payload.verseCount || bibleVerses.length || payload.verse),
    });
  }, [bibleTheme.themeId, bibleVerses.length, getThemeById]);

  const worshipPreviewItem = useMemo(() => {
    if (!selectedSong || !activeSection) return null;
    const sectionIndex = worshipSections.findIndex((entry) => entry.id === activeSection.id);
    return {
      id: `worship-${selectedSong.id}-${activeSection.id}`,
      source: "worship",
      variant: "text",
      title: activeSection.lines.join("\n"),
      subtitle: activeSection.label,
      reference: selectedSong.metadata.title,
      style: themeToStyle(getThemeById(worshipTheme.themeId), {
        fontSize: worshipTheme.fontSize,
        textAlign: worshipTheme.textAlign,
        backgroundColor: worshipTheme.backgroundColor,
      }),
      meta: {
        sequenceIndex: sectionIndex,
        sequenceTotal: worshipSections.length,
        sequenceLabel: activeSection.label,
      },
    } as PresentationRemoteItem;
  }, [activeSection, getThemeById, selectedSong, worshipSections, worshipTheme]);

  const buildWorshipItem = useCallback((song: Song, section: LyricSection, sections: LyricSection[]) => {
    const sectionIndex = sections.findIndex((entry) => entry.id === section.id);
    return {
      id: `worship-${song.id}-${section.id}`,
      source: "worship",
      variant: "text",
      title: section.lines.join("\n"),
      subtitle: section.label,
      reference: song.metadata.title,
      style: themeToStyle(getThemeById(worshipTheme.themeId), {
        fontSize: worshipTheme.fontSize,
        textAlign: worshipTheme.textAlign,
        backgroundColor: worshipTheme.backgroundColor,
      }),
      meta: {
        sequenceIndex: sectionIndex,
        sequenceTotal: sections.length,
        sequenceLabel: section.label,
      },
    } as PresentationRemoteItem;
  }, [getThemeById, worshipTheme]);

  const mediaPreviewItem = useMemo(() => {
    if (!selectedMedia) return null;
    return buildMediaPresentationItem({
      media: selectedMedia,
      mediaPayload: {
        kind: selectedMedia.type,
        url: getMediaViewerUrl(selectedMedia),
        fit: mediaDraft.fit,
        backgroundColor: mediaDraft.backgroundColor,
        playback: mediaDraft.playback,
      },
    });
  }, [mediaDraft, selectedMedia]);

  const buildMediaItemForSelection = useCallback((media: MediaItem) => {
    return buildMediaPresentationItem({
      media,
      mediaPayload: {
        kind: media.type,
        url: getMediaViewerUrl(media),
        fit: mediaDraft.fit,
        backgroundColor: mediaDraft.backgroundColor,
        playback: mediaDraft.playback,
      },
    });
  }, [mediaDraft]);

  const textPreviewItem = useMemo(() => {
    if (!textDraft.title.trim() && !textDraft.body.trim() && !textDraft.subtitle.trim()) return null;
    return buildTextPresentationItem({
      slide: {
        id: textDraft.id,
        title: textDraft.title,
        subtitle: textDraft.subtitle,
        body: textDraft.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      style: themeToStyle(getThemeById(textTheme.themeId), {
        fontSize: textTheme.fontSize,
        textAlign: textTheme.textAlign,
        backgroundColor: textTheme.backgroundColor,
        textColor: textTheme.textColor || "#FFFFFF",
      }),
    });
  }, [getThemeById, textDraft, textTheme]);

  const buildTextItemFromDraft = useCallback((draft: TextDraft) => {
    if (!draft.title.trim() && !draft.body.trim() && !draft.subtitle.trim()) {
      return null;
    }
    return buildTextPresentationItem({
      slide: {
        id: draft.id,
        title: draft.title,
        subtitle: draft.subtitle,
        body: draft.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      style: themeToStyle(getThemeById(textTheme.themeId), {
        fontSize: textTheme.fontSize,
        textAlign: textTheme.textAlign,
        backgroundColor: textTheme.backgroundColor,
        textColor: textTheme.textColor || "#FFFFFF",
      }),
    });
  }, [getThemeById, textTheme]);

  const countdownPreviewItem = useMemo(() => {
    if (!countdownDraft.title.trim()) return null;
    return buildCountdownPresentationItem({
      title: countdownDraft.title,
      subtitle: countdownDraft.completionMessage,
      countdown: buildCountdownPayload(countdownDraft),
      style: themeToStyle(undefined, {
        fontSize: countdownDraft.fontSize,
        textColor: countdownDraft.textColor,
        backgroundColor: countdownDraft.backgroundColor,
        overlayOpacity: 0,
      }),
    });
  }, [buildCountdownPayload, countdownDraft]);

  const buildCountdownItemFromDraft = useCallback((draft: CountdownDraft) => {
    if (!draft.title.trim()) {
      return null;
    }
    return buildCountdownPresentationItem({
      title: draft.title,
      subtitle: draft.completionMessage,
      countdown: buildCountdownPayload(draft),
      style: themeToStyle(undefined, {
        fontSize: draft.fontSize,
        textColor: draft.textColor,
        backgroundColor: draft.backgroundColor,
        overlayOpacity: 0,
      }),
    });
  }, [buildCountdownPayload]);

  const tickerPreviewItem = useMemo(() => {
    if (!tickerDraft.text.trim()) return null;
    const payload: PresentationTickerPayload = {
      sourceTickerId: tickerDraft.id || undefined,
      text: tickerDraft.text,
      position: tickerDraft.position,
      direction: tickerDraft.direction,
      speed: tickerDraft.speed,
      textColor: tickerDraft.textColor,
      backgroundColor: tickerDraft.backgroundColor,
      fontSize: tickerDraft.fontSize,
      paused: tickerDraft.paused,
      hidden: tickerDraft.hidden,
      version: Date.now(),
    };
    return buildTickerPresentationItem({
      ticker: payload,
      style: themeToStyle(undefined, {
        backgroundColor: "#000000",
        backgroundOpacity: 1,
        overlayOpacity: 0,
      }),
    });
  }, [tickerDraft]);

  const buildTickerItemFromDraft = useCallback((draft: TickerDraft) => {
    if (!draft.text.trim()) {
      return null;
    }
    return buildTickerPresentationItem({
      ticker: {
        sourceTickerId: draft.id || undefined,
        text: draft.text,
        position: draft.position,
        direction: draft.direction,
        speed: draft.speed,
        textColor: draft.textColor,
        backgroundColor: draft.backgroundColor,
        fontSize: draft.fontSize,
        paused: draft.paused,
        hidden: draft.hidden,
        version: Date.now(),
      },
      style: themeToStyle(undefined, {
        backgroundColor: "#000000",
        backgroundOpacity: 1,
        overlayOpacity: 0,
      }),
    });
  }, []);

  const selectedContent = useMemo(() => {
    switch (currentSource) {
      case "bible":
        return biblePreviewItem;
      case "worship":
        return worshipPreviewItem;
      case "media":
        return mediaPreviewItem;
      case "text":
        return textPreviewItem;
      case "countdown":
        return countdownPreviewItem;
      case "ticker":
        return tickerPreviewItem;
      default:
        return null;
    }
  }, [biblePreviewItem, countdownPreviewItem, currentSource, mediaPreviewItem, textPreviewItem, tickerPreviewItem, worshipPreviewItem]);

  const publishItem = useCallback(async (item: PresentationRemoteItem) => {
    const nextState: PresentationRemoteState = {
      sessionId: session.sessionId,
      fullscreen: item,
      lowerThird: null,
      updatedAt: Date.now(),
    };
    await publishPresentationState(nextState);
    setLiveContent(item);
    setActionError("");
  }, [session.sessionId]);

  const pushItem = useCallback((item: PresentationRemoteItem | null) => {
    if (!item) {
      return;
    }
    void publishItem(item).catch((error) => {
      setActionError(error instanceof Error ? error.message : "Failed to present content.");
    });
  }, [publishItem]);

  const updateMediaDraft = useCallback((updater: (current: MediaDraft) => MediaDraft) => {
    setMediaDraft((current) => {
      const next = updater(current);
      if (selectedMedia) {
        const nextItem = buildMediaPresentationItem({
          media: selectedMedia,
          mediaPayload: {
            kind: selectedMedia.type,
            url: getMediaViewerUrl(selectedMedia),
            fit: next.fit,
            backgroundColor: next.backgroundColor,
            playback: next.playback,
          },
        });
        if (liveContent?.id === nextItem.id) {
          void publishItem(nextItem);
        }
      }
      return next;
    });
  }, [liveContent?.id, publishItem, selectedMedia]);

  const updateCountdownDraft = useCallback((updater: (current: CountdownDraft) => CountdownDraft) => {
    setCountdownDraft((current) => {
      const next = updater(current);
      const nextItem = buildCountdownPresentationItem({
        title: next.title,
        subtitle: next.completionMessage,
        countdown: buildCountdownPayload(next),
        style: themeToStyle(undefined, {
          fontSize: next.fontSize,
          textColor: next.textColor,
          backgroundColor: next.backgroundColor,
          overlayOpacity: 0,
        }),
      });
      if (liveContent?.id === nextItem.id) {
        void publishItem(nextItem);
      }
      return next;
    });
  }, [buildCountdownPayload, liveContent?.id, publishItem]);

  const updateTickerDraft = useCallback((updater: (current: TickerDraft) => TickerDraft) => {
    setTickerDraft((current) => {
      const next = updater(current);
      const nextItem = buildTickerPresentationItem({
        ticker: {
          sourceTickerId: next.id || undefined,
          text: next.text,
          position: next.position,
          direction: next.direction,
          speed: next.speed,
          textColor: next.textColor,
          backgroundColor: next.backgroundColor,
          fontSize: next.fontSize,
          paused: next.paused,
          hidden: next.hidden,
          version: Date.now(),
        },
        style: themeToStyle(undefined, {
          backgroundColor: "#000000",
          backgroundOpacity: 1,
          overlayOpacity: 0,
        }),
      });
      if (liveContent?.id === nextItem.id) {
        void publishItem(nextItem);
      }
      return next;
    });
  }, [liveContent?.id, publishItem]);

  const handleBibleModuleSelectionChange = useCallback((payload: BiblePresentationSelectionPayload) => {
    setBibleBook(payload.book);
    setBibleChapter(payload.chapter);
    setBibleTranslation(payload.translation);
    setSelectedVerseNumber(payload.verse);
    setBibleModuleSelection(payload);
    if (payload.themeId) {
      setBibleTheme((current) => ({ ...current, themeId: payload.themeId || current.themeId }));
    }
    pushItem(buildBibleItemFromPayload(payload));
  }, [buildBibleItemFromPayload, pushItem]);

  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(session.presentationLink);
  }, [session.presentationLink]);

  const handleOpenScreen = useCallback(async () => {
    await launchPresentationScreen(session.sessionId, session.presentationLink);
  }, [session.presentationLink, session.sessionId]);

  const handleRegenerate = useCallback(async () => {
    const previousSessionId = session.sessionId;
    const nextSession = regenerateSession();
    setSession(nextSession);
    setLiveContent(null);
    hadConnectedRef.current = false;
    setConnectionStatus("waiting");
    await clearPresentationState(previousSessionId).catch(() => { });
    await syncRemoteContext();
  }, [session.sessionId, syncRemoteContext]);

  const handleSelectWorshipSong = useCallback((songId: string) => {
    const song = songs.find((entry) => entry.id === songId) || null;
    setSelectedSongId(songId);
    if (!song) {
      setSelectedSectionId(null);
      return;
    }
    const sections = parseWorshipLyricSections(song.lyrics, song.linesPerSlide || 2);
    const firstSection = sections[0] || null;
    setSelectedSectionId(firstSection?.id || null);
    if (firstSection) {
      pushItem(buildWorshipItem(song, firstSection, sections));
    }
  }, [buildWorshipItem, pushItem, songs]);

  const handleSelectWorshipSection = useCallback((section: LyricSection) => {
    setSelectedSectionId(section.id);
    if (selectedSong) {
      pushItem(buildWorshipItem(selectedSong, section, worshipSections));
    }
  }, [buildWorshipItem, pushItem, selectedSong, worshipSections]);

  const handleSelectMedia = useCallback((item: MediaItem) => {
    setSelectedMediaId(item.id);
    pushItem(buildMediaItemForSelection(item));
  }, [buildMediaItemForSelection, pushItem]);

  const handleUploadMedia = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    void (async () => {
      for (const file of Array.from(files)) {
        await saveLibraryMediaFile(file);
      }
      await reloadMedia();
    })().catch((error) => {
      setActionError(error instanceof Error ? error.message : "Failed to upload media.");
    });
  }, [reloadMedia]);

  const handleRenameMedia = useCallback((item: MediaItem) => {
    const nextName = window.prompt("Rename media", item.name);
    if (!nextName || nextName.trim() === item.name) return;
    void renameMedia(item.id, nextName.trim())
      .then(reloadMedia)
      .catch(() => setActionError("Failed to rename media."));
  }, [reloadMedia]);

  const handleDeleteMedia = useCallback((item: MediaItem) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    void deleteMedia(item.id)
      .then(reloadMedia)
      .catch(() => setActionError("Failed to delete media."));
  }, [reloadMedia]);

  const handleSelectTextSlide = useCallback((slide: PresentationTextSlideRecord) => {
    const nextDraft = {
      id: slide.id,
      title: slide.title,
      subtitle: slide.subtitle,
      body: slide.body,
    };
    setSelectedTextSlideId(slide.id);
    setTextDraft(nextDraft);
    pushItem(buildTextItemFromDraft(nextDraft));
  }, [buildTextItemFromDraft, pushItem]);

  const handleSaveTextSlide = useCallback(() => {
    const now = new Date().toISOString();
    const record: PresentationTextSlideRecord = {
      id: textDraft.id || nanoid(),
      title: textDraft.title.trim(),
      subtitle: textDraft.subtitle.trim(),
      body: textDraft.body.trim(),
      createdAt: selectedTextSlide?.createdAt || now,
      updatedAt: now,
    };
    const nextSlides = textSlides.some((slide) => slide.id === record.id)
      ? textSlides.map((slide) => (slide.id === record.id ? record : slide))
      : [record, ...textSlides];
    setTextSlides(nextSlides);
    setSelectedTextSlideId(record.id);
    setTextDraft({ id: record.id, title: record.title, subtitle: record.subtitle, body: record.body });
    savePresentationTextSlides(nextSlides);
  }, [selectedTextSlide?.createdAt, textDraft, textSlides]);

  const handleSelectCountdown = useCallback((countdown: CountdownConfig) => {
    const nextDraft = mapCountdownToDraft(countdown);
    setSelectedCountdownId(countdown.id);
    setCountdownDraft(nextDraft);
    pushItem(buildCountdownItemFromDraft(nextDraft));
  }, [buildCountdownItemFromDraft, pushItem]);

  const handleSelectTicker = useCallback((ticker: PresentationTickerRecord) => {
    const nextDraft = {
      id: ticker.id,
      name: ticker.name,
      text: ticker.text,
      position: ticker.position,
      direction: ticker.direction,
      speed: ticker.speed,
      textColor: ticker.textColor,
      backgroundColor: ticker.backgroundColor,
      fontSize: ticker.fontSize,
      paused: false,
      hidden: false,
    };
    setSelectedTickerId(ticker.id);
    setTickerDraft(nextDraft);
    pushItem(buildTickerItemFromDraft(nextDraft));
  }, [buildTickerItemFromDraft, pushItem]);

  const handleSaveTicker = useCallback(() => {
    const now = new Date().toISOString();
    const record: PresentationTickerRecord = {
      id: tickerDraft.id || nanoid(),
      name: tickerDraft.name.trim() || "Ticker",
      text: tickerDraft.text.trim(),
      position: tickerDraft.position,
      direction: tickerDraft.direction,
      speed: tickerDraft.speed,
      textColor: tickerDraft.textColor,
      backgroundColor: tickerDraft.backgroundColor,
      fontSize: tickerDraft.fontSize,
      createdAt: tickers.find((entry) => entry.id === tickerDraft.id)?.createdAt || now,
      updatedAt: now,
    };
    const nextTickers = tickers.some((entry) => entry.id === record.id)
      ? tickers.map((entry) => (entry.id === record.id ? record : entry))
      : [record, ...tickers];
    setTickers(nextTickers);
    setSelectedTickerId(record.id);
    setTickerDraft({
      id: record.id,
      name: record.name,
      text: record.text,
      position: record.position,
      direction: record.direction,
      speed: record.speed,
      textColor: record.textColor,
      backgroundColor: record.backgroundColor,
      fontSize: record.fontSize,
      paused: false,
      hidden: false,
    });
    savePresentationTickers(nextTickers);
  }, [tickerDraft, tickers]);

  const handlePresent = useCallback(async () => {
    if (!selectedContent) {
      setActionError("Select content before presenting.");
      return;
    }
    try {
      await publishItem(selectedContent);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to present content.");
    }
  }, [publishItem, selectedContent]);

  const handleClear = useCallback(async () => {
    try {
      await clearPresentationState(session.sessionId);
      setLiveContent(null);
      setActionError("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to clear the screen.");
    }
  }, [session.sessionId]);

  const handlePrevious = useCallback(() => {
    switch (currentSource) {
      case "bible": {
        const index = bibleVerses.findIndex((verse) => verse.verse === selectedVerseNumber);
        if (index > 0) {
          const previousVerse = bibleVerses[index - 1] || null;
          setSelectedVerseNumber(previousVerse?.verse ?? null);
          if (previousVerse) {
            setPendingBibleSelection({
              book: bibleBook,
              chapter: bibleChapter,
              verse: previousVerse.verse,
            });
            pushItem(buildBibleItemFromVerse(previousVerse));
          }
        }
        break;
      }
      case "worship": {
        const index = worshipSections.findIndex((section) => section.id === selectedSectionId);
        if (index > 0) {
          const previousSection = worshipSections[index - 1] || null;
          setSelectedSectionId(previousSection?.id || null);
          if (selectedSong && previousSection) {
            pushItem(buildWorshipItem(selectedSong, previousSection, worshipSections));
          }
        }
        break;
      }
      case "media": {
        const index = filteredMediaItems.findIndex((item) => item.id === selectedMediaId);
        if (index > 0) {
          const previousItem = filteredMediaItems[index - 1] || null;
          setSelectedMediaId(previousItem?.id || null);
          if (previousItem) {
            pushItem(buildMediaItemForSelection(previousItem));
          }
        }
        break;
      }
      case "text": {
        const index = textSlides.findIndex((slide) => slide.id === selectedTextSlideId);
        if (index > 0) {
          const slide = textSlides[index - 1];
          setSelectedTextSlideId(slide.id);
          const nextDraft = { id: slide.id, title: slide.title, subtitle: slide.subtitle, body: slide.body };
          setTextDraft(nextDraft);
          pushItem(buildTextItemFromDraft(nextDraft));
        }
        break;
      }
      case "countdown": {
        const index = countdowns.findIndex((entry) => entry.id === selectedCountdownId);
        if (index > 0) {
          const item = countdowns[index - 1];
          setSelectedCountdownId(item.id);
          const nextDraft = mapCountdownToDraft(item);
          setCountdownDraft(nextDraft);
          pushItem(buildCountdownItemFromDraft(nextDraft));
        }
        break;
      }
      case "ticker": {
        const index = tickers.findIndex((entry) => entry.id === selectedTickerId);
        if (index > 0) {
          const entry = tickers[index - 1];
          setSelectedTickerId(entry.id);
          const nextDraft = {
            id: entry.id,
            name: entry.name,
            text: entry.text,
            position: entry.position,
            direction: entry.direction,
            speed: entry.speed,
            textColor: entry.textColor,
            backgroundColor: entry.backgroundColor,
            fontSize: entry.fontSize,
            paused: false,
            hidden: false,
          };
          setTickerDraft(nextDraft);
          pushItem(buildTickerItemFromDraft(nextDraft));
        }
        break;
      }
    }
  }, [bibleBook, bibleChapter, bibleVerses, buildBibleItemFromVerse, buildCountdownItemFromDraft, buildMediaItemForSelection, buildTextItemFromDraft, buildTickerItemFromDraft, buildWorshipItem, countdowns, currentSource, filteredMediaItems, pushItem, selectedCountdownId, selectedMediaId, selectedSectionId, selectedSong, selectedTextSlideId, selectedTickerId, selectedVerseNumber, textSlides, tickers, worshipSections]);

  const handleNext = useCallback(() => {
    switch (currentSource) {
      case "bible": {
        const index = bibleVerses.findIndex((verse) => verse.verse === selectedVerseNumber);
        if (index >= 0 && index < bibleVerses.length - 1) {
          const nextVerse = bibleVerses[index + 1] || null;
          setSelectedVerseNumber(nextVerse?.verse ?? null);
          if (nextVerse) {
            setPendingBibleSelection({
              book: bibleBook,
              chapter: bibleChapter,
              verse: nextVerse.verse,
            });
            pushItem(buildBibleItemFromVerse(nextVerse));
          }
        }
        break;
      }
      case "worship": {
        const index = worshipSections.findIndex((section) => section.id === selectedSectionId);
        if (index >= 0 && index < worshipSections.length - 1) {
          const nextSection = worshipSections[index + 1] || null;
          setSelectedSectionId(nextSection?.id || null);
          if (selectedSong && nextSection) {
            pushItem(buildWorshipItem(selectedSong, nextSection, worshipSections));
          }
        }
        break;
      }
      case "media": {
        const index = filteredMediaItems.findIndex((item) => item.id === selectedMediaId);
        if (index >= 0 && index < filteredMediaItems.length - 1) {
          const nextItem = filteredMediaItems[index + 1] || null;
          setSelectedMediaId(nextItem?.id || null);
          if (nextItem) {
            pushItem(buildMediaItemForSelection(nextItem));
          }
        }
        break;
      }
      case "text": {
        const index = textSlides.findIndex((slide) => slide.id === selectedTextSlideId);
        if (index >= 0 && index < textSlides.length - 1) {
          const slide = textSlides[index + 1];
          setSelectedTextSlideId(slide.id);
          const nextDraft = { id: slide.id, title: slide.title, subtitle: slide.subtitle, body: slide.body };
          setTextDraft(nextDraft);
          pushItem(buildTextItemFromDraft(nextDraft));
        }
        break;
      }
      case "countdown": {
        const index = countdowns.findIndex((entry) => entry.id === selectedCountdownId);
        if (index >= 0 && index < countdowns.length - 1) {
          const item = countdowns[index + 1];
          setSelectedCountdownId(item.id);
          const nextDraft = mapCountdownToDraft(item);
          setCountdownDraft(nextDraft);
          pushItem(buildCountdownItemFromDraft(nextDraft));
        }
        break;
      }
      case "ticker": {
        const index = tickers.findIndex((entry) => entry.id === selectedTickerId);
        if (index >= 0 && index < tickers.length - 1) {
          const entry = tickers[index + 1];
          setSelectedTickerId(entry.id);
          const nextDraft = {
            id: entry.id,
            name: entry.name,
            text: entry.text,
            position: entry.position,
            direction: entry.direction,
            speed: entry.speed,
            textColor: entry.textColor,
            backgroundColor: entry.backgroundColor,
            fontSize: entry.fontSize,
            paused: false,
            hidden: false,
          };
          setTickerDraft(nextDraft);
          pushItem(buildTickerItemFromDraft(nextDraft));
        }
        break;
      }
    }
  }, [bibleBook, bibleChapter, bibleVerses, buildBibleItemFromVerse, buildCountdownItemFromDraft, buildMediaItemForSelection, buildTextItemFromDraft, buildTickerItemFromDraft, buildWorshipItem, countdowns, currentSource, filteredMediaItems, pushItem, selectedCountdownId, selectedMediaId, selectedSectionId, selectedSong, selectedTextSlideId, selectedTickerId, selectedVerseNumber, textSlides, tickers, worshipSections]);

  const remoteStatusLabel = useMemo(() => {
    if (connectionStatus === "connected") {
      return session.connectedViewers > 1
        ? `${session.connectedViewers} screens connected`
        : "Remote screen connected";
    }
    if (connectionStatus === "disconnected") return "Remote screen disconnected";
    if (connectionStatus === "error") return "Remote status error";
    return "Waiting for remote screen";
  }, [connectionStatus, session.connectedViewers]);

  const selectedMediaUrl = useMemo(
    () => (selectedMedia ? getMediaViewerUrl(selectedMedia) : ""),
    [selectedMedia],
  );

  const renderMinistryLibrary = () => {
    switch (ministrySource) {
      case "media":
        return (
          <div className="presentation-library-panel">
            <div className="presentation-library-stack">
              <div className="presentation-library-search">
                <Search size={16} />
                <input
                  value={mediaSearchQuery}
                  className="presentation-input presentation-input--search"
                  placeholder="Search media"
                  onChange={(event) => setMediaSearchQuery(event.target.value)}
                />
              </div>
              <div className="presentation-filter-strip">
                <button type="button" className={`presentation-chip${mediaFilter === "all" ? " is-active" : ""}`} onClick={() => setMediaFilter("all")}>All</button>
                <button type="button" className={`presentation-chip${mediaFilter === "image" ? " is-active" : ""}`} onClick={() => setMediaFilter("image")}>Images</button>
                <button type="button" className={`presentation-chip${mediaFilter === "video" ? " is-active" : ""}`} onClick={() => setMediaFilter("video")}>Videos</button>
              </div>
              <button type="button" className="presentation-button" onClick={() => mediaUploadRef.current?.click()}>
                <Plus size={16} />
                <span>Upload</span>
              </button>
              <input
                ref={mediaUploadRef}
                type="file"
                accept={MEDIA_FILE_ACCEPT}
                className="hidden"
                multiple
                onChange={(event) => {
                  handleUploadMedia(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="presentation-library-list">
              {filteredMediaItems.map((item) => (
                <div
                  key={item.id}
                  className={`presentation-library-item presentation-library-item--media${selectedMediaId === item.id ? " is-active" : ""}`}
                >
                  <button type="button" className="presentation-library-item__body" onClick={() => handleSelectMedia(item)}>
                    <strong>{item.name}</strong>
                    <span>{item.type === "video" ? "Video" : "Image"}</span>
                  </button>
                  <div className="presentation-library-item__actions">
                    <button type="button" className="presentation-icon-button" onClick={() => handleRenameMedia(item)} title="Rename">
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="presentation-icon-button danger" onClick={() => handleDeleteMedia(item)} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {filteredMediaItems.length === 0 ? (
                <div className="presentation-library-empty">No media items available.</div>
              ) : null}
            </div>
          </div>
        );
      case "worship":
        return (
          <div className="presentation-library-panel">
            <div className="presentation-library-search">
              <Search size={16} />
              <input
                value={worshipSongQuery}
                className="presentation-input presentation-input--search"
                placeholder="Search songs"
                onChange={(event) => setWorshipSongQuery(event.target.value)}
              />
            </div>
            <div className="presentation-library-list">
              {filteredSongs.map((song) => (
                <button
                  key={song.id}
                  type="button"
                  className={`presentation-library-item${selectedSongId === song.id ? " is-active" : ""}`}
                  onClick={() => handleSelectWorshipSong(song.id)}
                >
                  <strong>{song.metadata.title}</strong>
                  <span>{song.metadata.artist || "Worship library"}</span>
                </button>
              ))}
              {filteredSongs.length === 0 ? (
                <div className="presentation-library-empty">No songs found.</div>
              ) : null}
            </div>
          </div>
        );
      case "text":
        return (
          <div className="presentation-library-panel">
            <div className="presentation-panel-title">Saved slides</div>
            <div className="presentation-library-list">
              {textSlides.map((slide) => (
                <button
                  key={slide.id}
                  type="button"
                  className={`presentation-library-item${selectedTextSlideId === slide.id ? " is-active" : ""}`}
                  onClick={() => handleSelectTextSlide(slide)}
                >
                  <strong>{slide.title}</strong>
                  <span>{slide.body}</span>
                </button>
              ))}
              {textSlides.length === 0 ? (
                <div className="presentation-library-empty">No saved slides yet.</div>
              ) : null}
            </div>
          </div>
        );
      case "countdown":
        return (
          <div className="presentation-library-panel">
            <div className="presentation-panel-title">Saved countdowns</div>
            <div className="presentation-library-list">
              {countdowns.map((countdown) => (
                <button
                  key={countdown.id}
                  type="button"
                  className={`presentation-library-item${selectedCountdownId === countdown.id ? " is-active" : ""}`}
                  onClick={() => handleSelectCountdown(countdown)}
                >
                  <strong>{countdown.title}</strong>
                  <span>{countdown.timer.mode === "fixed-duration" ? "Duration" : "End time"}</span>
                </button>
              ))}
              {countdowns.length === 0 ? (
                <div className="presentation-library-empty">No saved countdowns found.</div>
              ) : null}
            </div>
          </div>
        );
      case "ticker":
        return (
          <div className="presentation-library-panel">
            <div className="presentation-panel-title">Saved tickers</div>
            <div className="presentation-library-list">
              {tickers.map((ticker) => (
                <button
                  key={ticker.id}
                  type="button"
                  className={`presentation-library-item${selectedTickerId === ticker.id ? " is-active" : ""}`}
                  onClick={() => handleSelectTicker(ticker)}
                >
                  <strong>{ticker.name}</strong>
                  <span>{ticker.text}</span>
                </button>
              ))}
              {tickers.length === 0 ? (
                <div className="presentation-library-empty">No saved tickers.</div>
              ) : null}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderMinistryDetail = () => {
    switch (ministrySource) {
      case "media":
        return (
          <div className="presentation-settings-panel">
            <div className="presentation-panel-title">Selected media</div>
            {selectedMedia ? (
              <div className="presentation-media-detail">
                <div className="presentation-media-detail__stage">
                  {selectedMedia.type === "video" ? (
                    <video
                      key={selectedMedia.id}
                      className="presentation-media-detail__asset"
                      src={selectedMediaUrl}
                      controls
                      playsInline
                    />
                  ) : (
                    <img className="presentation-media-detail__asset" src={selectedMediaUrl} alt={selectedMedia.name} />
                  )}
                </div>
                <div className="presentation-media-detail__meta">
                  <strong>{selectedMedia.name}</strong>
                  <span>{selectedMedia.type === "video" ? "Video asset" : "Image asset"}</span>
                </div>
              </div>
            ) : (
              <div className="presentation-library-empty">Select a media item to inspect it here.</div>
            )}
          </div>
        );
      case "worship":
        return (
          <div className="presentation-library-panel">
            <div className="presentation-panel-title">{selectedSong ? selectedSong.metadata.title : "Sections"}</div>
            <div className="presentation-library-list">
              {worshipSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`presentation-library-item${selectedSectionId === section.id ? " is-active" : ""}`}
                  onClick={() => handleSelectWorshipSection(section)}
                >
                  <strong>{section.label}</strong>
                  <span>{section.lines.join(" ")}</span>
                </button>
              ))}
              {worshipSections.length === 0 ? (
                <div className="presentation-library-empty">Select a song to view sections.</div>
              ) : null}
            </div>
          </div>
        );
      case "text":
        return (
          <div className="presentation-settings-panel">
            <div className="presentation-panel-title">Text content</div>
            <div className="presentation-settings-grid presentation-settings-grid--single presentation-settings-panel__body">
              <label className="presentation-field">
                <span>Title</span>
                <input className="presentation-input" value={textDraft.title} onChange={(event) => setTextDraft((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="presentation-field">
                <span>Subtitle</span>
                <input className="presentation-input" value={textDraft.subtitle} onChange={(event) => setTextDraft((current) => ({ ...current, subtitle: event.target.value }))} />
              </label>
              <label className="presentation-field">
                <span>Main text</span>
                <textarea className="presentation-textarea" value={textDraft.body} onChange={(event) => setTextDraft((current) => ({ ...current, body: event.target.value }))} />
              </label>
              <div className="presentation-inline-actions">
                <button type="button" className="presentation-button" onClick={handleSaveTextSlide}>Save</button>
              </div>
            </div>
          </div>
        );
      case "countdown":
        return (
          <div className="presentation-settings-panel">
            <div className="presentation-panel-title">Countdown content</div>
            <div className="presentation-settings-grid presentation-settings-grid--single presentation-settings-panel__body">
              <label className="presentation-field">
                <span>Countdown title</span>
                <input className="presentation-input" value={countdownDraft.title} onChange={(event) => updateCountdownDraft((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="presentation-field">
                <span>Mode</span>
                <select value={countdownDraft.mode} className="presentation-input" onChange={(event) => updateCountdownDraft((current) => ({ ...current, mode: event.target.value as "duration" | "time", status: "idle" }))}>
                  <option value="duration">Countdown from duration</option>
                  <option value="time">Countdown to a time</option>
                </select>
              </label>
              {countdownDraft.mode === "duration" ? (
                <div className="presentation-settings-grid">
                  <label className="presentation-field">
                    <span>Hours</span>
                    <input type="number" className="presentation-input" min={0} value={countdownDraft.durationHours} onChange={(event) => updateCountdownDraft((current) => ({ ...current, durationHours: Number(event.target.value) || 0 }))} />
                  </label>
                  <label className="presentation-field">
                    <span>Minutes</span>
                    <input type="number" className="presentation-input" min={0} max={59} value={countdownDraft.durationMinutes} onChange={(event) => updateCountdownDraft((current) => ({ ...current, durationMinutes: Number(event.target.value) || 0 }))} />
                  </label>
                  <label className="presentation-field">
                    <span>Seconds</span>
                    <input type="number" className="presentation-input" min={0} max={59} value={countdownDraft.durationSeconds} onChange={(event) => updateCountdownDraft((current) => ({ ...current, durationSeconds: Number(event.target.value) || 0 }))} />
                  </label>
                </div>
              ) : (
                <label className="presentation-field">
                  <span>Target time</span>
                  <input type="datetime-local" className="presentation-input" value={countdownDraft.targetTime} onChange={(event) => updateCountdownDraft((current) => ({ ...current, targetTime: event.target.value }))} />
                </label>
              )}
              <label className="presentation-field">
                <span>Completion message</span>
                <input className="presentation-input" value={countdownDraft.completionMessage} onChange={(event) => updateCountdownDraft((current) => ({ ...current, completionMessage: event.target.value }))} />
              </label>
              <div className="presentation-inline-actions">
                <button type="button" className="presentation-button" onClick={() => updateCountdownDraft((current) => {
                  const nowIso = new Date().toISOString();
                  const durationSeconds = current.mode === "duration"
                    ? getCountdownDurationSeconds(current)
                    : getTargetTimeSeconds(current.targetTime);
                  return {
                    ...current,
                    status: "running",
                    startedAt: nowIso,
                    endsAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
                    pausedRemainingSeconds: durationSeconds,
                  };
                })}>Start</button>
                <button type="button" className="presentation-button" onClick={() => updateCountdownDraft((current) => {
                  const remaining = getCountdownRemaining(buildCountdownPayload(current));
                  return {
                    ...current,
                    status: "paused",
                    startedAt: undefined,
                    endsAt: undefined,
                    pausedRemainingSeconds: remaining,
                  };
                })}>Pause</button>
                <button type="button" className="presentation-button" onClick={() => updateCountdownDraft((current) => {
                  const remaining = Math.max(0, current.pausedRemainingSeconds || getCountdownDurationSeconds(current));
                  return {
                    ...current,
                    status: "running",
                    startedAt: new Date().toISOString(),
                    endsAt: new Date(Date.now() + remaining * 1000).toISOString(),
                    pausedRemainingSeconds: remaining,
                  };
                })}>Resume</button>
                <button type="button" className="presentation-button" onClick={() => updateCountdownDraft((current) => ({
                  ...current,
                  status: "idle",
                  startedAt: undefined,
                  endsAt: undefined,
                  pausedRemainingSeconds: current.mode === "duration"
                    ? getCountdownDurationSeconds(current)
                    : current.pausedRemainingSeconds,
                }))}>Reset</button>
              </div>
            </div>
          </div>
        );
      case "ticker":
        return (
          <div className="presentation-settings-panel">
            <div className="presentation-panel-title">Ticker content</div>
            <div className="presentation-settings-grid presentation-settings-grid--single presentation-settings-panel__body">
              <label className="presentation-field">
                <span>Name</span>
                <input className="presentation-input" value={tickerDraft.name} onChange={(event) => updateTickerDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="presentation-field">
                <span>Ticker text</span>
                <textarea className="presentation-textarea" value={tickerDraft.text} onChange={(event) => updateTickerDraft((current) => ({ ...current, text: event.target.value, hidden: false }))} />
              </label>
              <div className="presentation-inline-actions">
                <button type="button" className="presentation-button" onClick={handleSaveTicker}>Save</button>
                <button type="button" className="presentation-button" onClick={() => updateTickerDraft((current) => ({ ...current, paused: !current.paused, hidden: false }))}>
                  {tickerDraft.paused ? "Resume" : "Pause"}
                </button>
                <button type="button" className="presentation-button" onClick={() => updateTickerDraft((current) => ({ ...current, hidden: true }))}>Hide</button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderMinistrySettings = () => {
    switch (ministrySource) {
      case "media":
        return (
          <div className="presentation-settings-panel">
            <div className="presentation-panel-title">Presentation settings</div>
            <div className="presentation-settings-grid presentation-settings-panel__body">
              <label className="presentation-field">
                <span>Fit</span>
                <select value={mediaDraft.fit} className="presentation-input" onChange={(event) => updateMediaDraft((current) => ({ ...current, fit: event.target.value as PresentationMediaFit }))}>
                  <option value="fit">Fit</option>
                  <option value="fill">Fill</option>
                  <option value="contain">Contain</option>
                  <option value="stretch">Stretch</option>
                </select>
              </label>
              <label className="presentation-field">
                <span>Background</span>
                <input type="color" value={mediaDraft.backgroundColor} onChange={(event) => updateMediaDraft((current) => ({ ...current, backgroundColor: event.target.value }))} />
              </label>
              <label className="presentation-field">
                <span>Volume</span>
                <input type="range" min={0} max={1} step={0.05} value={mediaDraft.playback.volume} onChange={(event) => updateMediaDraft((current) => ({ ...current, playback: { ...current.playback, volume: Number(event.target.value), version: Date.now() } }))} />
              </label>
              <div className="presentation-field">
                <span>Video controls</span>
                <div className="presentation-inline-actions">
                  <button type="button" className="presentation-chip" onClick={() => updateMediaDraft((current) => ({ ...current, playback: { ...current.playback, playing: true, version: Date.now() } }))}>Play</button>
                  <button type="button" className="presentation-chip" onClick={() => updateMediaDraft((current) => ({ ...current, playback: { ...current.playback, playing: false, version: Date.now() } }))}>Pause</button>
                  <button type="button" className="presentation-chip" onClick={() => updateMediaDraft((current) => ({ ...current, playback: { ...current.playback, positionSeconds: 0, playing: true, version: Date.now() } }))}>Restart</button>
                  <button type="button" className={`presentation-chip${mediaDraft.playback.muted ? " is-active" : ""}`} onClick={() => updateMediaDraft((current) => ({ ...current, playback: { ...current.playback, muted: !current.playback.muted, version: Date.now() } }))}>Mute</button>
                  <button type="button" className={`presentation-chip${mediaDraft.playback.loop ? " is-active" : ""}`} onClick={() => updateMediaDraft((current) => ({ ...current, playback: { ...current.playback, loop: !current.playback.loop, version: Date.now() } }))}>Loop</button>
                </div>
              </div>
            </div>
          </div>
        );
      case "worship":
        return (
          <div className="presentation-settings-panel">
            <div className="presentation-panel-title">Theme settings</div>
            <div className="presentation-settings-grid presentation-settings-panel__body">
              <label className="presentation-field">
                <span>Theme</span>
                <select value={worshipTheme.themeId} className="presentation-input" onChange={(event) => setWorshipTheme((current) => ({ ...current, themeId: event.target.value }))}>
                  {themeOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </label>
              <label className="presentation-field">
                <span>Font size</span>
                <input type="range" min={28} max={120} value={worshipTheme.fontSize} onChange={(event) => setWorshipTheme((current) => ({ ...current, fontSize: Number(event.target.value) }))} />
              </label>
              <label className="presentation-field">
                <span>Alignment</span>
                <select value={worshipTheme.textAlign} className="presentation-input" onChange={(event) => setWorshipTheme((current) => ({ ...current, textAlign: event.target.value as PresentationTextAlign }))}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="presentation-field">
                <span>Background</span>
                <input type="color" value={worshipTheme.backgroundColor} onChange={(event) => setWorshipTheme((current) => ({ ...current, backgroundColor: event.target.value }))} />
              </label>
            </div>
          </div>
        );
      case "text":
        return (
          <div className="presentation-settings-panel">
            <div className="presentation-panel-title">Theme settings</div>
            <div className="presentation-settings-grid presentation-settings-panel__body">
              <label className="presentation-field">
                <span>Theme</span>
                <select value={textTheme.themeId} className="presentation-input" onChange={(event) => setTextTheme((current) => ({ ...current, themeId: event.target.value }))}>
                  {themeOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </label>
              <label className="presentation-field">
                <span>Font size</span>
                <input type="range" min={24} max={120} value={textTheme.fontSize} onChange={(event) => setTextTheme((current) => ({ ...current, fontSize: Number(event.target.value) }))} />
              </label>
              <label className="presentation-field">
                <span>Alignment</span>
                <select value={textTheme.textAlign} className="presentation-input" onChange={(event) => setTextTheme((current) => ({ ...current, textAlign: event.target.value as PresentationTextAlign }))}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="presentation-field">
                <span>Text colour</span>
                <input type="color" value={textTheme.textColor || "#FFFFFF"} onChange={(event) => setTextTheme((current) => ({ ...current, textColor: event.target.value }))} />
              </label>
              <label className="presentation-field">
                <span>Background</span>
                <input type="color" value={textTheme.backgroundColor} onChange={(event) => setTextTheme((current) => ({ ...current, backgroundColor: event.target.value }))} />
              </label>
            </div>
          </div>
        );
      case "countdown":
        return (
          <div className="presentation-settings-panel">
            <div className="presentation-panel-title">Appearance settings</div>
            <div className="presentation-settings-grid presentation-settings-panel__body">
              <label className="presentation-field">
                <span>Font size</span>
                <input type="range" min={28} max={180} value={countdownDraft.fontSize} onChange={(event) => updateCountdownDraft((current) => ({ ...current, fontSize: Number(event.target.value) }))} />
              </label>
              <label className="presentation-field">
                <span>Text colour</span>
                <input type="color" value={countdownDraft.textColor} onChange={(event) => updateCountdownDraft((current) => ({ ...current, textColor: event.target.value }))} />
              </label>
              <label className="presentation-field">
                <span>Background</span>
                <input type="color" value={countdownDraft.backgroundColor} onChange={(event) => updateCountdownDraft((current) => ({ ...current, backgroundColor: event.target.value }))} />
              </label>
              <label className="presentation-toggle">
                <input type="checkbox" checked={countdownDraft.showTitle} onChange={(event) => updateCountdownDraft((current) => ({ ...current, showTitle: event.target.checked }))} />
                <span>Show title</span>
              </label>
              <label className="presentation-toggle">
                <input type="checkbox" checked={countdownDraft.showSeconds} onChange={(event) => updateCountdownDraft((current) => ({ ...current, showSeconds: event.target.checked }))} />
                <span>Show seconds</span>
              </label>
            </div>
          </div>
        );
      case "ticker":
        return (
          <div className="presentation-settings-panel">
            <div className="presentation-panel-title">Appearance settings</div>
            <div className="presentation-settings-grid presentation-settings-panel__body">
              <label className="presentation-field">
                <span>Position</span>
                <select value={tickerDraft.position} className="presentation-input" onChange={(event) => updateTickerDraft((current) => ({ ...current, position: event.target.value as PresentationTickerPosition }))}>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
              <label className="presentation-field">
                <span>Direction</span>
                <select value={tickerDraft.direction} className="presentation-input" onChange={(event) => updateTickerDraft((current) => ({ ...current, direction: event.target.value as PresentationTickerDirection }))}>
                  <option value="rtl">Right to left</option>
                  <option value="ltr">Left to right</option>
                  <option value="static">Static</option>
                </select>
              </label>
              <label className="presentation-field">
                <span>Speed</span>
                <input type="range" min={0.25} max={4} step={0.25} value={tickerDraft.speed} onChange={(event) => updateTickerDraft((current) => ({ ...current, speed: Number(event.target.value) }))} />
              </label>
              <label className="presentation-field">
                <span>Font size</span>
                <input type="range" min={18} max={72} value={tickerDraft.fontSize} onChange={(event) => updateTickerDraft((current) => ({ ...current, fontSize: Number(event.target.value) }))} />
              </label>
              <label className="presentation-field">
                <span>Text colour</span>
                <input type="color" value={tickerDraft.textColor} onChange={(event) => updateTickerDraft((current) => ({ ...current, textColor: event.target.value }))} />
              </label>
              <label className="presentation-field">
                <span>Background</span>
                <input type="color" value={tickerDraft.backgroundColor} onChange={(event) => updateTickerDraft((current) => ({ ...current, backgroundColor: event.target.value }))} />
              </label>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const liveLabel = liveContent ? `Live: ${describePresentationItem(liveContent)}` : "Live: cleared";
  const selectedContentIsLive = Boolean(selectedContent && liveContent?.id === selectedContent.id);

  return (
    <div className="presentation-console-page">
      <div className="presentation-console-shell">
        <PresentationTopTabs
          title="Presentation Console"
          description="Choose content, preview it locally, then present it to the locally hosted screen."
          mode={mode}
          onChange={setMode}
          session={session}
          connectionStatus={connectionStatus}
          onCopyLink={handleCopyLink}
          onOpenScreen={handleOpenScreen}
          onRegenerateLink={handleRegenerate}
          onRefreshStatus={syncRemoteContext}
        />

        <div className="presentation-console-layout">
          <div className="presentation-console-content">
            {mode === "ministry" ? (
              <div className="presentation-ministry-layout">
                <div className="presentation-ministry-column presentation-ministry-column--library">
                  <PresentationSourceSidebar value={ministrySource} onChange={setMinistrySource} />
                  {renderMinistryLibrary()}
                </div>

                <div className="presentation-ministry-column presentation-ministry-column--detail">
                  {renderMinistryDetail()}
                </div>

                <div className="presentation-ministry-column presentation-ministry-column--preview">
                  <PresentationPreview
                    content={selectedContent}
                    label="Live Preview"
                    live={selectedContentIsLive}
                    waitingCopy="Select or create content to preview it here."
                  />
                  {renderMinistrySettings()}
                </div>
              </div>
            ) : (
              <div className="presentation-console-main">
                <div className="presentation-console-workspace">
                  <BibleProvider>
                    <BibleModule
                      isActive={mode === "bible"}
                      presentationMode
                      homePath="/presentation/console?mode=ministry&source=media"
                      initialSelectBible={pendingBibleSelection}
                      onConsumeInitialSelect={() => setPendingBibleSelection(null)}
                      onPresentToScreen={handleBibleModuleSelectionChange}
                      onClearScreen={() => {
                        void handleClear();
                      }}
                    />
                  </BibleProvider>
                </div>
              </div>
            )}

            {actionError ? <div className="presentation-error-banner">{actionError}</div> : null}

            <PresentationControls
              canPresent={Boolean(selectedContent)}
              canClear={Boolean(liveContent)}
              liveLabel={liveLabel}
              remoteStatusLabel={remoteStatusLabel}
              onPrevious={handlePrevious}
              onPresent={handlePresent}
              onClear={handleClear}
              onNext={handleNext}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
