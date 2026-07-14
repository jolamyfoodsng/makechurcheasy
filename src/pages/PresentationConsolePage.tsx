/**
 * PresentationConsolePage.tsx — Browser-linked presentation control room
 *
 * This page drives one output:
 * - the remote presentation screen opened from the presentation link
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Music,
  Presentation,
  RefreshCw,
  Search,
  Settings,
  Users,
  Wifi,
  X,
} from "lucide-react";

import { BIBLE_BOOKS, type BibleVerse } from "../bible/types";
import { getChapter } from "../bible/bibleData";
import { getInstalledTranslations } from "../bible/bibleDb";
import { getAllSongs } from "../worship/worshipDb";
import type { Song } from "../worship/types";
import { getAllMedia } from "../library/libraryDb";
import type { MediaItem } from "../library/libraryTypes";
import { getCountdowns } from "../countdowns/countdownStore";
import type { CountdownConfig } from "../countdowns/types";
import {
  getPresentationSettings,
  type PresentationSettings,
} from "../services/presentationSettings";
import {
  clearPresentationState,
  fetchPresentationViewerCount,
  publishPresentationState,
  type PresentationRemoteItem,
  type PresentationRemoteState,
} from "../services/presentationState";
import {
  getPresentationRemoteAccessInfo,
  syncPresentationRemoteAccessInfo,
  type PresentationRemoteAccessInfo,
} from "../services/presentationRemote";
import { launchPresentationScreen } from "../services/presentationWindow";
import { BOOK_CHAPTERS } from "../dock/dockTypes";
import {
  ensureMinistryData,
  getMinistryData,
  type MinistryData,
} from "../services/ministryStore";
import { resolveOverlayAssetUrl, toStoredOverlayAssetUrl } from "../services/overlayUrl";

import "./PresentationConsole.css";

type ContentSource = "bible" | "worship" | "media" | "text" | "ministry" | "countdown";

type PresentationContentData =
  | { kind: "bible"; verse: BibleVerse; translation: string }
  | { kind: "worship"; song: Song; slide: Song["slides"][number]; slideIndex: number }
  | { kind: "media"; media: MediaItem }
  | { kind: "text"; text: string }
  | { kind: "ministry"; speakerName: string; speakerRole: string; churchName: string }
  | { kind: "countdown"; countdown: CountdownConfig };

interface PresentationContent {
  id: string;
  source: ContentSource;
  title: string;
  subtitle?: string;
  body?: string;
  reference?: string;
  imageUrl?: string;
  videoUrl?: string;
  data: PresentationContentData;
}

interface StageSurfaceProps {
  content: PresentationContent | null;
  label: string;
  live?: boolean;
}

const SOURCES: { id: ContentSource; icon: typeof BookOpen; label: string }[] = [
  { id: "bible", icon: BookOpen, label: "Bible" },
  { id: "worship", icon: Music, label: "Worship" },
  { id: "media", icon: ImageIcon, label: "Media" },
  { id: "text", icon: FileText, label: "Text" },
  { id: "ministry", icon: Presentation, label: "Ministry" },
  { id: "countdown", icon: Clock, label: "Countdown" },
];

const TEXT_SLIDES = [
  { id: "welcome", title: "Welcome to Church", text: "Welcome to our service today!" },
  { id: "offering", title: "Offering Time", text: "It is time for our offering." },
  { id: "silence", title: "Silence Your Phones", text: "Please silence your phones." },
  { id: "baptism", title: "Baptism", text: "We will now witness the baptism." },
  { id: "communion", title: "Communion", text: "It is time for Holy Communion." },
  {
    id: "technical",
    title: "Technical Difficulty",
    text: "We are experiencing technical difficulties. Please stand by.",
  },
];

function excerpt(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function getRemoteViewerAssetUrl(media: MediaItem): string | undefined {
  if (media.diskFileName) {
    return `/uploads/${encodeURIComponent(media.diskFileName)}`;
  }

  const stored = toStoredOverlayAssetUrl(media.url);
  if (stored.startsWith("/uploads/")) {
    return stored;
  }

  return undefined;
}

function buildRemoteScreenItem(content: PresentationContent): PresentationRemoteItem {
  switch (content.data.kind) {
    case "bible":
    case "worship":
    case "text":
      return {
        id: content.id,
        source: content.source,
        title: content.title,
        subtitle: content.subtitle,
        body: content.body,
        reference: content.reference,
      };
    case "media":
      return {
        id: content.id,
        source: content.source,
        title: content.title,
        subtitle: content.subtitle,
        imageUrl: content.data.media.type === "image" ? getRemoteViewerAssetUrl(content.data.media) : undefined,
        videoUrl: content.data.media.type === "video" ? getRemoteViewerAssetUrl(content.data.media) : undefined,
      };
    case "ministry":
      return {
        id: content.id,
        source: content.source,
        title: content.title,
        body: [content.subtitle, content.body].filter(Boolean).join(" • "),
      };
    case "countdown":
      return {
        id: content.id,
        source: content.source,
        title: content.title,
        subtitle: content.subtitle,
        countdown: {
          config: content.data.countdown,
          startedAt: Date.now(),
        },
      };
    default:
      return {
        id: content.id,
        source: content.source,
        title: content.title,
        subtitle: content.subtitle,
        body: content.body,
        reference: content.reference,
      };
  }
}

function getStatusTone(status: "ready" | "waiting" | "error"): string {
  if (status === "ready") return "pc-target-card--ready";
  if (status === "waiting") return "pc-target-card--waiting";
  return "pc-target-card--error";
}

function getStageBadgeLabel(live = false): string {
  return live ? "Live" : "Preview";
}

function getContentDescriptor(content: PresentationContent | null): string {
  if (!content) return "No item selected.";
  switch (content.source) {
    case "bible":
      return content.reference || "Bible verse";
    case "worship":
      return content.subtitle || "Worship lyrics";
    case "media":
      return content.subtitle || "Media item";
    case "text":
      return "Text slide";
    case "ministry":
      return content.body || content.subtitle || "Speaker card";
    case "countdown":
      return content.subtitle || "Countdown";
    default:
      return "";
  }
}

function StageSurface({ content, label, live = false }: StageSurfaceProps) {
  const emptyText = content ? "Ready" : "Nothing queued";
  const body = content?.body || content?.subtitle;

  return (
    <div className="pc-surface-card">
      <div className="pc-surface-head">
        <div>
          <p className="pc-surface-label">{label}</p>
          <p className="pc-surface-route">Browser screen</p>
        </div>
        <span className={`pc-surface-badge${live ? " pc-surface-badge--live" : ""}`}>
          {getStageBadgeLabel(live)}
        </span>
      </div>

      <div className="pc-surface-frame">
        {!content ? (
          <div className="pc-surface-empty">{emptyText}</div>
        ) : content.videoUrl ? (
          <video className="pc-surface-media" src={content.videoUrl} autoPlay muted loop playsInline />
        ) : content.imageUrl ? (
          <img className="pc-surface-media" src={content.imageUrl} alt={content.title} />
        ) : (
          <div className="pc-surface-copy">
            {content.reference && <p className="pc-surface-reference">{content.reference}</p>}
            <p className="pc-surface-title">{content.title}</p>
            {body && <p className="pc-surface-body">{body}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PresentationConsolePage() {
  const navigate = useNavigate();

  const [activeSource, setActiveSource] = useState<ContentSource>("bible");
  const [selectedContent, setSelectedContent] = useState<PresentationContent | null>(null);
  const [liveContent, setLiveContent] = useState<PresentationContent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionError, setActionError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const [bibleTranslation, setBibleTranslation] = useState("KJV");
  const [bibleBook, setBibleBook] = useState("John");
  const [bibleChapter, setBibleChapter] = useState(3);
  const [bibleTranslations, setBibleTranslations] = useState<{ abbr: string; name: string }[]>([]);
  const [bibleVerses, setBibleVerses] = useState<BibleVerse[]>([]);

  const [songs, setSongs] = useState<Song[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [countdowns, setCountdowns] = useState<CountdownConfig[]>([]);
  const [ministryData, setMinistryData] = useState<MinistryData>(() => getMinistryData());

  const [viewerCount, setViewerCount] = useState(0);
  const [presentationSettings, setPresentationSettings] = useState<PresentationSettings>(() =>
    getPresentationSettings(),
  );
  const [remoteAccess, setRemoteAccess] = useState<PresentationRemoteAccessInfo | null>(null);
  const [refreshingRemoteAccess, setRefreshingRemoteAccess] = useState(false);

  useEffect(() => {
    getInstalledTranslations()
      .then((list) => {
        const next = list.map((entry) => ({ abbr: entry.abbr, name: entry.name }));
        setBibleTranslations(next);
        setBibleTranslation((current) => {
          if (next.length === 0 || next.some((entry) => entry.abbr === current)) {
            return current;
          }
          return next[0].abbr;
        });
      })
      .catch(() => {});

    getAllSongs().then(setSongs).catch(() => {});
    getAllMedia().then(setMediaItems).catch(() => {});
    getCountdowns().then(setCountdowns).catch(() => {});

    ensureMinistryData()
      .then(() => setMinistryData(getMinistryData()))
      .catch(() => setMinistryData(getMinistryData()));
  }, []);

  useEffect(() => {
    getChapter(bibleBook, bibleChapter, bibleTranslation)
      .then((passage) => setBibleVerses(passage?.verses ?? []))
      .catch(() => setBibleVerses([]));
  }, [bibleBook, bibleChapter, bibleTranslation]);

  const syncPresentationContext = useCallback(async (showBusy = false) => {
    if (showBusy) {
      setRefreshingRemoteAccess(true);
    }

    try {
      const nextSettings = getPresentationSettings();
      const [nextViewerCount, nextRemoteAccess] = await Promise.all([
        fetchPresentationViewerCount(nextSettings.sessionId).catch(() => 0),
        syncPresentationRemoteAccessInfo(nextSettings.sessionId).catch(() =>
          getPresentationRemoteAccessInfo(nextSettings.sessionId),
        ),
      ]);

      setPresentationSettings({
        ...nextSettings,
        presentationLink: nextRemoteAccess.link,
        connectedViewers: nextViewerCount,
      });
      setViewerCount(nextViewerCount);
      setRemoteAccess(nextRemoteAccess);
    } finally {
      if (showBusy) {
        setRefreshingRemoteAccess(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      await syncPresentationContext();
      if (cancelled) return;
    };

    void sync();
    const interval = window.setInterval(() => {
      void sync();
    }, 5000);

    const handleStorage = () => {
      void sync();
    };
    const handleFocus = () => {
      void sync();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [syncPresentationContext]);

  const bibleContent = useMemo<PresentationContent[]>(() => {
    return bibleVerses.map((verse) => {
      const reference = `${verse.book} ${verse.chapter}:${verse.verse} (${bibleTranslation})`;
      return {
        id: `bible-${verse.book}-${verse.chapter}-${verse.verse}-${bibleTranslation}`,
        source: "bible",
        title: `${verse.book} ${verse.chapter}:${verse.verse}`,
        subtitle: excerpt(verse.text),
        body: verse.text,
        reference,
        data: {
          kind: "bible",
          verse,
          translation: bibleTranslation,
        },
      };
    });
  }, [bibleTranslation, bibleVerses]);

  const worshipContent = useMemo<PresentationContent[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const items: PresentationContent[] = [];

    for (const song of songs) {
      const title = song.metadata.title || "Untitled Song";
      const artist = song.metadata.artist || "";
      if (
        query
        && !title.toLowerCase().includes(query)
        && !artist.toLowerCase().includes(query)
        && !song.lyrics.toLowerCase().includes(query)
      ) {
        continue;
      }

      song.slides.forEach((slide, index) => {
        items.push({
          id: `worship-${song.id}-${slide.id || index}`,
          source: "worship",
          title,
          subtitle: `${slide.label || `Slide ${index + 1}`} • ${index + 1}/${song.slides.length}`,
          body: slide.content,
          reference: artist || title,
          data: {
            kind: "worship",
            song,
            slide,
            slideIndex: index,
          },
        });
      });
    }

    return items;
  }, [searchQuery, songs]);

  const mediaContent = useMemo<PresentationContent[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    return mediaItems
      .filter((item) => !query || item.name.toLowerCase().includes(query))
      .map((item) => ({
        id: `media-${item.id}`,
        source: "media" as const,
        title: item.name,
        subtitle: item.type,
        imageUrl: item.type === "image" ? resolveOverlayAssetUrl(item.url) : undefined,
        videoUrl: item.type === "video" ? resolveOverlayAssetUrl(item.url) : undefined,
        data: {
          kind: "media",
          media: item,
        },
      }));
  }, [mediaItems, searchQuery]);

  const textContent = useMemo<PresentationContent[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    return TEXT_SLIDES
      .filter((slide) => !query || slide.title.toLowerCase().includes(query) || slide.text.toLowerCase().includes(query))
      .map((slide) => ({
        id: `text-${slide.id}`,
        source: "text" as const,
        title: slide.title,
        subtitle: excerpt(slide.text, 96),
        body: slide.text,
        reference: slide.title,
        data: {
          kind: "text",
          text: slide.text,
        },
      }));
  }, [searchQuery]);

  const ministryContent = useMemo<PresentationContent[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const speakers = ministryData.speakers.length > 0
      ? ministryData.speakers
      : ministryData.mainPastorName
        ? [{
          name: ministryData.mainPastorName,
          role: ministryData.mainPastorRole,
          imageUrl: "",
          isMain: true,
        }]
        : [];

    return speakers
      .filter((speaker) => {
        if (!query) return true;
        return speaker.name.toLowerCase().includes(query) || (speaker.role || "").toLowerCase().includes(query);
      })
      .map((speaker) => ({
        id: `ministry-${speaker.name.toLowerCase().replace(/\s+/g, "-")}`,
        source: "ministry" as const,
        title: speaker.name,
        subtitle: speaker.role || "Speaker",
        body: ministryData.churchName || "",
        data: {
          kind: "ministry",
          speakerName: speaker.name,
          speakerRole: speaker.role || "",
          churchName: ministryData.churchName || "",
        },
      }));
  }, [ministryData, searchQuery]);

  const countdownContent = useMemo<PresentationContent[]>(() => {
    return countdowns.map((countdown) => ({
      id: `countdown-${countdown.id}`,
      source: "countdown" as const,
      title: countdown.title || "Countdown",
      subtitle:
        countdown.timer.mode === "fixed-duration"
          ? `${Math.floor(countdown.timer.durationSeconds / 60)} min`
          : countdown.timer.endAt || "End at time",
      data: {
        kind: "countdown",
        countdown,
      },
    }));
  }, [countdowns]);

  const currentContentList = useMemo<PresentationContent[]>(() => {
    switch (activeSource) {
      case "bible":
        return bibleContent;
      case "worship":
        return worshipContent;
      case "media":
        return mediaContent;
      case "text":
        return textContent;
      case "ministry":
        return ministryContent;
      case "countdown":
        return countdownContent;
      default:
        return [];
    }
  }, [
    activeSource,
    bibleContent,
    countdownContent,
    mediaContent,
    ministryContent,
    textContent,
    worshipContent,
  ]);

  useEffect(() => {
    if (currentContentList.length === 0) {
      if (selectedContent) {
        setSelectedContent(null);
      }
      return;
    }

    if (!selectedContent || !currentContentList.some((item) => item.id === selectedContent.id)) {
      setSelectedContent(currentContentList[0] ?? null);
    }
  }, [currentContentList, selectedContent]);

  const contentCounts = useMemo(
    () => ({
      bible: bibleContent.length,
      worship: worshipContent.length,
      media: mediaContent.length,
      text: textContent.length,
      ministry: ministryContent.length,
      countdown: countdownContent.length,
    }),
    [
      bibleContent.length,
      countdownContent.length,
      mediaContent.length,
      ministryContent.length,
      textContent.length,
      worshipContent.length,
    ],
  );

  const selectedIndex = useMemo(() => {
    if (!selectedContent) return -1;
    return currentContentList.findIndex((item) => item.id === selectedContent.id);
  }, [currentContentList, selectedContent]);

  const chapterCount = useMemo(() => BOOK_CHAPTERS[bibleBook] ?? 1, [bibleBook]);
  const remoteLink = remoteAccess?.link || presentationSettings.presentationLink;

  const handleSelectContent = useCallback((content: PresentationContent) => {
    setSelectedContent(content);
  }, []);

  const publishRemoteContent = useCallback(async (content: PresentationContent) => {
    const nextState: PresentationRemoteState = {
      sessionId: presentationSettings.sessionId,
      updatedAt: Date.now(),
      fullscreen: buildRemoteScreenItem(content),
      lowerThird: null,
    };
    await publishPresentationState(nextState);
  }, [presentationSettings.sessionId]);

  const handlePresent = useCallback(async (content?: PresentationContent) => {
    const nextContent = content ?? selectedContent;
    if (!nextContent) return;

    setActionError("");
    try {
      await publishRemoteContent(nextContent);
      setLiveContent(nextContent);
      void syncPresentationContext();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [publishRemoteContent, selectedContent, syncPresentationContext]);

  const handleClear = useCallback(async () => {
    setActionError("");

    try {
      await clearPresentationState(presentationSettings.sessionId);
      setLiveContent(null);
      void syncPresentationContext();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [presentationSettings.sessionId, syncPresentationContext]);

  const handlePrevious = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedContent(currentContentList[selectedIndex - 1] ?? null);
    }
  }, [currentContentList, selectedIndex]);

  const handleNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < currentContentList.length - 1) {
      setSelectedContent(currentContentList[selectedIndex + 1] ?? null);
    }
  }, [currentContentList, selectedIndex]);

  const handleCopyLink = useCallback(() => {
    if (!remoteLink) return;
    navigator.clipboard.writeText(remoteLink).then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  }, [remoteLink]);

  const handleOpenRemoteLink = useCallback(() => {
    if (!remoteLink) return;
    void launchPresentationScreen(presentationSettings.sessionId, remoteLink);
  }, [presentationSettings.sessionId, remoteLink]);

  const handleRefreshConnections = useCallback(() => {
    void syncPresentationContext(true);
  }, [syncPresentationContext]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;

      if (event.code === "Space") {
        event.preventDefault();
        void handlePresent();
      }
      if (event.code === "Escape") {
        event.preventDefault();
        void handleClear();
      }
      if (event.code === "ArrowUp") {
        event.preventDefault();
        handlePrevious();
      }
      if (event.code === "ArrowDown") {
        event.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClear, handleNext, handlePresent, handlePrevious]);

  const activeSourceMeta = SOURCES.find((source) => source.id === activeSource);

  const remoteCardStatus = viewerCount > 0
    ? "ready"
    : remoteAccess?.running
      ? "waiting"
      : "error";
  const remoteCardLabel = viewerCount > 0
    ? `${viewerCount} screen${viewerCount > 1 ? "s" : ""} connected`
    : remoteAccess?.running
      ? "Waiting for the presentation screen to open the link"
      : "Presentation link unavailable";

  return (
    <div className="pc-page">
      <aside className="pc-sidebar">
        <div className="pc-sidebar-panel">
          <p className="pc-eyebrow">Presentation Console</p>
          <h1 className="pc-sidebar-title">Control here. Present from the browser link.</h1>
          <p className="pc-sidebar-copy">
            Use this laptop to queue content. On the presentation laptop or external display, open the link and keep that browser page full screen.
          </p>
        </div>

        <div className="pc-sidebar-panel">
          <div className="pc-sidebar-section-head">
            <span>Sources</span>
            <span>{currentContentList.length}</span>
          </div>
          <div className="pc-source-list">
            {SOURCES.map((source) => {
              const Icon = source.icon;
              const isActive = activeSource === source.id;
              return (
                <button
                  key={source.id}
                  className={`pc-source-item${isActive ? " pc-source-item--active" : ""}`}
                  onClick={() => {
                    setActiveSource(source.id);
                    setSelectedContent(null);
                    setSearchQuery("");
                  }}
                >
                  <div className="pc-source-icon">
                    <Icon size={15} />
                  </div>
                  <div className="pc-source-body">
                    <span className="pc-source-text">{source.label}</span>
                    <span className="pc-source-count">{contentCounts[source.id]} items</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pc-sidebar-panel">
          <div className="pc-sidebar-section-head">
            <span>Shortcuts</span>
          </div>
          <div className="pc-kbd-hints">
            <div className="pc-kbd-hint"><kbd className="pc-kbd">Space</kbd> Present selection</div>
            <div className="pc-kbd-hint"><kbd className="pc-kbd">Esc</kbd> Clear live output</div>
            <div className="pc-kbd-hint"><kbd className="pc-kbd">↑</kbd> Previous item</div>
            <div className="pc-kbd-hint"><kbd className="pc-kbd">↓</kbd> Next item</div>
          </div>
        </div>
      </aside>

      <section className="pc-library">
        <div className="pc-library-header">
          <div>
            <p className="pc-panel-kicker">Library</p>
            <h2 className="pc-panel-title">{activeSourceMeta?.label || "Content"}</h2>
          </div>
          {activeSource !== "countdown" && (
            <div className="pc-search-wrap">
              <Search size={15} className="pc-search-icon" />
              <input
                className="pc-search"
                placeholder={`Search ${activeSource}...`}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          )}
        </div>

        {activeSource === "bible" && (
          <div className="pc-bible-selectors">
            <select
              className="pc-bible-select"
              value={bibleTranslation}
              onChange={(event) => setBibleTranslation(event.target.value)}
            >
              {bibleTranslations.map((translation) => (
                <option key={translation.abbr} value={translation.abbr}>
                  {translation.abbr}
                </option>
              ))}
            </select>
            <select
              className="pc-bible-select"
              value={bibleBook}
              onChange={(event) => {
                setBibleBook(event.target.value);
                setBibleChapter(1);
              }}
            >
              {BIBLE_BOOKS.map((book) => (
                <option key={book} value={book}>
                  {book}
                </option>
              ))}
            </select>
            <select
              className="pc-bible-select"
              value={bibleChapter}
              onChange={(event) => setBibleChapter(Number(event.target.value))}
            >
              {Array.from({ length: chapterCount }, (_, index) => index + 1).map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="pc-library-body">
          {currentContentList.length === 0 ? (
            <div className="pc-empty">
              <Search size={26} className="pc-empty-icon" />
              <p className="pc-empty-title">No content available</p>
              <p className="pc-empty-desc">
                {activeSource === "bible"
                  ? "Choose a translation, book, and chapter to load verses."
                  : activeSource === "ministry"
                    ? "Add speaker profiles in Ministry settings first."
                    : "Populate this library before presenting from it."}
              </p>
            </div>
          ) : (
            <div className="pc-content-list">
              {currentContentList.map((item) => {
                const isSelected = selectedContent?.id === item.id;
                const isLive = liveContent?.id === item.id;
                return (
                  <button
                    key={item.id}
                    className={`pc-content-item${isSelected ? " pc-content-item--selected" : ""}${isLive ? " pc-content-item--live" : ""}`}
                    onClick={() => handleSelectContent(item)}
                    onDoubleClick={() => void handlePresent(item)}
                  >
                    <div className="pc-content-item-top">
                      <p className="pc-content-item-title">{item.title}</p>
                      {isLive && <span className="pc-live-badge">Live</span>}
                      {isSelected && !isLive && <span className="pc-selected-badge">Queued</span>}
                    </div>
                    {item.subtitle && <p className="pc-content-item-sub">{item.subtitle}</p>}
                    <p className="pc-content-item-meta">{getContentDescriptor(item)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="pc-stage">
        <div className="pc-stage-header">
          <div>
            <p className="pc-panel-kicker">Outputs</p>
            <h2 className="pc-panel-title">Send the presentation screen with one link</h2>
            <p className="pc-stage-subtitle">
              Keep this console on the operator laptop. On the screen laptop or projector display, open the browser link below and leave it full screen.
            </p>
          </div>

          <div className="pc-stage-header-actions">
            <button
              className="pc-icon-btn"
              onClick={handleRefreshConnections}
              title="Refresh connection status"
              disabled={refreshingRemoteAccess}
            >
              <RefreshCw size={15} className={refreshingRemoteAccess ? "pc-spin" : ""} />
            </button>
            <button
              className="pc-stage-link-btn"
              onClick={() => navigate("/presentation")}
              title="Open presentation settings"
            >
              <Settings size={14} />
              Settings
            </button>
          </div>
        </div>

        <div className={`pc-target-card pc-target-card--browser ${getStatusTone(remoteCardStatus)}`}>
          <div className="pc-target-card-head">
            <div className="pc-target-icon">
              <Wifi size={18} />
            </div>
            <div>
              <p className="pc-target-title">Presentation Link</p>
              <p className="pc-target-status">{remoteCardLabel}</p>
            </div>
            <div className="pc-target-pill">
              <Users size={13} />
              {viewerCount}
            </div>
          </div>

          <p className="pc-target-lead">
            Copy this URL to the laptop connected to the projector or TV. Launch Screen opens the same presentation viewer on this computer and moves it to the external display when one is available.
          </p>

          <div className="pc-target-link-row">
            <input className="pc-link-input" readOnly value={remoteLink} />
            <button className="pc-icon-btn" onClick={handleCopyLink} title="Copy presentation link">
              {linkCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          <div className="pc-target-actions">
            <button className="pc-stage-link-btn" onClick={handleCopyLink} title="Copy presentation link">
              {linkCopied ? <Check size={14} /> : <Copy size={14} />}
              {linkCopied ? "Copied" : "Copy Link"}
            </button>
            <button
              className="pc-stage-link-btn"
              onClick={handleOpenRemoteLink}
              title="Launch presentation screen"
            >
              <ExternalLink size={14} />
              Launch Screen
            </button>
          </div>

          <div className="pc-target-steps">
            <span>1. Keep this console on the control laptop</span>
            <span>2. Open the link or Launch Screen on the presentation display</span>
            <span>3. Keep that viewer full screen while you present</span>
          </div>

          <div className="pc-target-meta">
            <span>Network IP: {remoteAccess?.ip || "Detecting..."}</span>
            <span>Viewer Port: {remoteAccess?.httpPort || "..."}</span>
            <span>Live Sync: {remoteAccess?.wsPort || "..."}</span>
          </div>
        </div>

        <div className="pc-stage-grid">
          <div className="pc-stage-main">
            <div className="pc-stage-card pc-stage-card--preview">
              <div className="pc-stage-card-head">
                <div>
                  <p className="pc-card-kicker">Next to send</p>
                  <h3 className="pc-card-title">{selectedContent?.title || "Select an item from the library"}</h3>
                </div>
                {selectedContent && (
                  <div className="pc-card-summary">
                    <span>{selectedContent.source}</span>
                    <span>{getContentDescriptor(selectedContent)}</span>
                  </div>
                )}
              </div>

              <div className="pc-surface-grid">
                <StageSurface
                  content={selectedContent}
                  label="Presentation screen"
                />
              </div>
            </div>

            <div className="pc-stage-card">
              <div className="pc-stage-card-head">
                <div>
                  <p className="pc-card-kicker">Send controls</p>
                  <h3 className="pc-card-title">Send the selected item live.</h3>
                </div>
                <div className="pc-card-summary">
                  <span>Link: {remoteLink ? "Ready" : "Unavailable"}</span>
                  <span>Viewers: {viewerCount}</span>
                </div>
              </div>

              <div className="pc-controls">
                <button
                  className="pc-ctrl-btn"
                  onClick={handlePrevious}
                  disabled={selectedIndex <= 0}
                  title="Previous (↑)"
                >
                  <ArrowLeft size={15} />
                  Prev
                </button>
                <button
                  className="pc-ctrl-btn pc-ctrl-btn--present"
                  onClick={() => void handlePresent()}
                  disabled={!selectedContent}
                  title="Present (Space)"
                >
                  <Presentation size={15} />
                  Present
                </button>
                <button
                  className="pc-ctrl-btn pc-ctrl-btn--clear"
                  onClick={() => void handleClear()}
                  disabled={!liveContent}
                  title="Clear (Esc)"
                >
                  <X size={15} />
                  Clear
                </button>
                <button
                  className="pc-ctrl-btn"
                  onClick={handleNext}
                  disabled={selectedIndex < 0 || selectedIndex >= currentContentList.length - 1}
                  title="Next (↓)"
                >
                  Next
                  <ArrowRight size={15} />
                </button>
              </div>

              {actionError && <div className="pc-inline-alert">{actionError}</div>}

              <div className="pc-routing-grid">
                <div className="pc-routing-card">
                  <p className="pc-routing-title">Remote screen</p>
                  <div className="pc-routing-row">
                    <span>Share link</span>
                    <strong>{remoteLink ? "Ready" : "Unavailable"}</strong>
                  </div>
                  <div className="pc-routing-row">
                    <span>Viewer screen</span>
                    <strong>{viewerCount > 0 ? "Connected" : "Waiting"}</strong>
                  </div>
                </div>

                <div className="pc-routing-card">
                  <p className="pc-routing-title">Live state</p>
                  <div className="pc-routing-row">
                    <span>Queued source</span>
                    <strong>{selectedContent?.source || "None"}</strong>
                  </div>
                  <div className="pc-routing-row">
                    <span>Live source</span>
                    <strong>{liveContent?.source || "None"}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pc-stage-side">
            <div className="pc-stage-card">
              <div className="pc-stage-card-head">
                <div>
                  <p className="pc-card-kicker">Live now</p>
                  <h3 className="pc-card-title">{liveContent?.title || "No live output"}</h3>
                </div>
                {liveContent && (
                  <div className="pc-card-summary">
                    <span>{liveContent.source}</span>
                    <span>{getContentDescriptor(liveContent)}</span>
                  </div>
                )}
              </div>

              <div className="pc-surface-stack">
                <StageSurface
                  content={liveContent}
                  label="Presentation screen"
                  live
                />
              </div>
            </div>

            <div className="pc-stage-card">
              <div className="pc-stage-card-head">
                <div>
                  <p className="pc-card-kicker">Operator focus</p>
                  <h3 className="pc-card-title">Keep the next cue ready.</h3>
                </div>
              </div>

              <div className="pc-operator-note">
                <p className="pc-operator-note-title">Selected item</p>
                <p className="pc-operator-note-value">{selectedContent?.title || "Nothing selected"}</p>
              </div>
              <div className="pc-operator-note">
                <p className="pc-operator-note-title">Live item</p>
                <p className="pc-operator-note-value">{liveContent?.title || "Screen is clear"}</p>
              </div>
              <div className="pc-operator-note">
                <p className="pc-operator-note-title">Remote viewers</p>
                <p className="pc-operator-note-value">
                  {viewerCount > 0 ? `${viewerCount} screen${viewerCount > 1 ? "s" : ""} joined` : "No screen joined yet"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
