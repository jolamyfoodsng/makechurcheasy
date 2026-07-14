import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BibleProvider } from "../bible/bibleStore";
import { BibleModule } from "../components/modules/BibleModule";
import GlobalSearchModal, { type GlobalSearchTarget } from "../components/GlobalSearchModal";
import Icon from "../components/Icon";
import { WorshipModule } from "../components/modules/WorshipModule";
import { getCountdowns } from "../countdowns/countdownStore";
import type { CountdownConfig } from "../countdowns/types";
import { MEDIA_FILE_ACCEPT, saveLibraryMediaFile } from "../library/MediaTab";
import { getAllMedia } from "../library/libraryDb";
import type { MediaItem } from "../library/libraryTypes";
import {
  ensureMinistryData,
  getMinistryData,
  type MinistryData,
} from "../services/ministryStore";
import {
  clearPresentationScreen,
  publishBibleToPresentation,
  publishCountdownToPresentation,
  publishMediaToPresentation,
  publishMinistryToPresentation,
  publishWorshipToPresentation,
} from "../services/presentationPublish";
import {
  getPresentationRemoteAccessInfo,
  syncPresentationRemoteAccessInfo,
  type PresentationRemoteAccessInfo,
} from "../services/presentationRemote";
import { getPresentationSettings } from "../services/presentationSettings";
import { fetchPresentationViewerCount } from "../services/presentationState";
import { launchPresentationScreen } from "../services/presentationWindow";
import { resolveOverlayAssetUrl } from "../services/overlayUrl";

import "./ServiceHubPage.css";

type ServiceHubTab = "worship" | "bible" | "media" | "ministry" | "countdown";
type MediaFilter = "all" | "image" | "video";

type TabDef = {
  id: ServiceHubTab;
  icon: string;
  labelKey: string;
  defaultLabel: string;
};

const HUB_TABS: readonly TabDef[] = [
  { id: "worship", icon: "music_note", labelKey: "serviceHub.tabs.worship", defaultLabel: "Worship" },
  { id: "bible", icon: "menu_book", labelKey: "serviceHub.tabs.bible", defaultLabel: "Bible" },
  { id: "media", icon: "perm_media", labelKey: "serviceHub.tabs.media", defaultLabel: "Media" },
  { id: "ministry", icon: "church", labelKey: "serviceHub.tabs.ministry", defaultLabel: "Ministry" },
  { id: "countdown", icon: "timer", labelKey: "serviceHub.tabs.countdown", defaultLabel: "Countdown" },
];

const TAB_STORAGE_KEY = "presentation-hub.active-tab";

function parseHubTab(value: string | null): ServiceHubTab | null {
  if (!value) return null;
  if (value === "worship" || value === "bible" || value === "media" || value === "ministry" || value === "countdown") {
    return value;
  }
  if (value === "graphics" || value === "speaker") return "ministry";
  if (value === "ticker") return "countdown";
  return null;
}

function loadStoredHubTab(): ServiceHubTab | null {
  try {
    return parseHubTab(localStorage.getItem(TAB_STORAGE_KEY));
  } catch {
    return null;
  }
}

function normalizeSpeakerKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function formatCountdownSubtitle(countdown: CountdownConfig): string {
  if (countdown.timer.mode === "fixed-duration") {
    const total = Math.max(0, Math.floor(countdown.timer.durationSeconds));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return countdown.timer.endAt || "Countdown";
}

function compareIsoDesc(left?: string, right?: string): number {
  return new Date(right || 0).getTime() - new Date(left || 0).getTime();
}

function getMinistrySpeakers(data: MinistryData) {
  if (data.speakers.length > 0) return data.speakers;
  if (data.mainPastorName.trim()) {
    return [{
      name: data.mainPastorName.trim(),
      role: data.mainPastorRole.trim(),
      imageUrl: "",
      isMain: true,
    }];
  }
  return [];
}

export default function ServiceHubPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const initialTab = useMemo(
    () => parseHubTab(query.get("tab")) ?? loadStoredHubTab() ?? "worship",
    [],
  );

  const [activeTab, setActiveTab] = useState<ServiceHubTab>(initialTab);
  const [mountedTabs, setMountedTabs] = useState<Record<ServiceHubTab, boolean>>(() => ({
    worship: initialTab === "worship",
    bible: initialTab === "bible",
    media: initialTab === "media",
    ministry: initialTab === "ministry",
    countdown: initialTab === "countdown",
  }));

  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchInitial, setGlobalSearchInitial] = useState("");
  const globalSearchOpenRef = useRef(false);
  globalSearchOpenRef.current = globalSearchOpen;

  const [pendingBibleTarget, setPendingBibleTarget] = useState<{ book: string; chapter: number; verse: number } | null>(null);
  const [pendingSongId, setPendingSongId] = useState<string | null>(null);
  const [pendingSpeakerId, setPendingSpeakerId] = useState<string | null>(null);

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [countdowns, setCountdowns] = useState<CountdownConfig[]>([]);
  const [ministryData, setMinistryData] = useState<MinistryData>(() => getMinistryData());
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [selectedMinistryId, setSelectedMinistryId] = useState<string | null>(null);
  const [selectedCountdownId, setSelectedCountdownId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [liveLabel, setLiveLabel] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [sessionId, setSessionId] = useState(() => getPresentationSettings().sessionId);
  const [presentationLink, setPresentationLink] = useState(() => getPresentationSettings().presentationLink);
  const [remoteAccess, setRemoteAccess] = useState<PresentationRemoteAccessInfo | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const syncPresentationContext = useCallback(async () => {
    const settings = getPresentationSettings();
    const [nextViewerCount, nextRemoteAccess] = await Promise.all([
      fetchPresentationViewerCount(settings.sessionId).catch(() => 0),
      syncPresentationRemoteAccessInfo(settings.sessionId).catch(() =>
        getPresentationRemoteAccessInfo(settings.sessionId),
      ),
    ]);

    setSessionId(settings.sessionId);
    setPresentationLink(nextRemoteAccess.link);
    setViewerCount(nextViewerCount);
    setRemoteAccess(nextRemoteAccess);
  }, []);

  const reloadMedia = useCallback(async () => {
    const items = await getAllMedia();
    setMediaItems(items.sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt)));
  }, []);

  const reloadCountdowns = useCallback(async () => {
    const items = await getCountdowns();
    setCountdowns(items.sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt)));
  }, []);

  const reloadMinistry = useCallback(async () => {
    await ensureMinistryData().catch(() => false);
    setMinistryData(getMinistryData());
  }, []);

  useEffect(() => {
    void reloadMedia().catch(() => setMediaItems([]));
    void reloadCountdowns().catch(() => setCountdowns([]));
    void reloadMinistry().catch(() => setMinistryData(getMinistryData()));
  }, [reloadMedia, reloadCountdowns, reloadMinistry]);

  useEffect(() => {
    const handleRefresh = () => {
      void reloadMedia().catch(() => {});
      void reloadCountdowns().catch(() => {});
      void reloadMinistry().catch(() => {});
      void syncPresentationContext().catch(() => {});
    };

    handleRefresh();
    const interval = window.setInterval(handleRefresh, 5000);
    window.addEventListener("focus", handleRefresh);
    window.addEventListener("storage", handleRefresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("storage", handleRefresh);
    };
  }, [reloadMedia, reloadCountdowns, reloadMinistry, syncPresentationContext]);

  useEffect(() => {
    const queryTab = parseHubTab(query.get("tab"));
    if (queryTab && queryTab !== activeTab) {
      setActiveTab(queryTab);
    }
  }, [activeTab, query]);

  useEffect(() => {
    setMountedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));

    try {
      localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch {
      // Ignore storage failures.
    }
  }, [activeTab]);

  useEffect(() => {
    const warmTabsId = window.setTimeout(() => {
      setMountedTabs((prev) => {
        if (prev.worship && prev.bible && prev.media && prev.ministry && prev.countdown) {
          return prev;
        }
        return {
          worship: true,
          bible: true,
          media: true,
          ministry: true,
          countdown: true,
        };
      });
    }, 160);

    return () => window.clearTimeout(warmTabsId);
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (globalSearchOpenRef.current) return;
      if (document.querySelector(".bible-search-dropdown, .bible-modal-overlay")) return;
      if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
        event.preventDefault();
        setGlobalSearchInitial(event.key);
        setGlobalSearchOpen(true);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const mediaList = useMemo(() => {
    if (mediaFilter === "all") return mediaItems;
    return mediaItems.filter((item) => item.type === mediaFilter);
  }, [mediaFilter, mediaItems]);

  const speakers = useMemo(() => getMinistrySpeakers(ministryData), [ministryData]);

  useEffect(() => {
    if (!pendingSpeakerId || activeTab !== "ministry") return;
    const match = speakers.find((speaker) => normalizeSpeakerKey(speaker.name) === pendingSpeakerId);
    if (match) {
      setSelectedMinistryId(normalizeSpeakerKey(match.name));
    }
    setPendingSpeakerId(null);
  }, [activeTab, pendingSpeakerId, speakers]);

  const presentAction = useCallback(async (label: string, action: () => Promise<void>) => {
    setActionError("");
    try {
      await action();
      setLiveLabel(label);
      void syncPresentationContext();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [syncPresentationContext]);

  const handlePresentBible = useCallback((payload: {
    book: string;
    chapter: number;
    verse: number;
    translation: string;
    text: string;
  }) => {
    const label = `${payload.book} ${payload.chapter}:${payload.verse}`;
    void presentAction(label, () => publishBibleToPresentation(payload));
  }, [presentAction]);

  const handlePresentWorship = useCallback((payload: {
    song: { metadata: { title: string; artist: string }; slides: { label?: string; content: string }[] };
    slide: { label?: string; content: string };
    slideIndex: number;
  }) => {
    const title = payload.song.metadata.title || t("serviceHub.defaults.untitledSong", { defaultValue: "Untitled Song" });
    void presentAction(title, () => publishWorshipToPresentation({
      title,
      artist: payload.song.metadata.artist || "",
      label: payload.slide.label || "",
      content: payload.slide.content,
      slideIndex: payload.slideIndex,
      slideCount: payload.song.slides.length,
    }));
  }, [presentAction, t]);

  const handleClearScreen = useCallback(async () => {
    setActionError("");
    try {
      await clearPresentationScreen();
      setLiveLabel("");
      void syncPresentationContext();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [syncPresentationContext]);

  const handleGlobalSearchNavigate = useCallback((target: GlobalSearchTarget) => {
    switch (target.type) {
      case "bible":
        setActiveTab("bible");
        setPendingBibleTarget({ book: target.book, chapter: target.chapter, verse: target.verse });
        break;
      case "worship":
        setActiveTab("worship");
        setPendingSongId(target.songId);
        break;
      case "speaker":
        setActiveTab("ministry");
        setPendingSpeakerId(target.presetId);
        break;
    }

    setGlobalSearchOpen(false);
  }, []);

  const handleCopyLink = useCallback(() => {
    if (!presentationLink) return;
    navigator.clipboard.writeText(presentationLink).then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  }, [presentationLink]);

  const handleLaunchScreen = useCallback(() => {
    if (!presentationLink || !sessionId) return;
    void launchPresentationScreen(sessionId, presentationLink);
  }, [presentationLink, sessionId]);

  const handleUploadMedia = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setUploadingMedia(true);
    setActionError("");

    try {
      await Promise.all(files.map((file) => saveLibraryMediaFile(file)));
      await reloadMedia();
      setActiveTab("media");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadingMedia(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  }, [reloadMedia]);

  const remoteStatusLabel = viewerCount > 0
    ? t("serviceHub.presentation.connectedScreens", {
      defaultValue: `${viewerCount} screen${viewerCount === 1 ? "" : "s"} connected`,
    })
    : remoteAccess?.running
      ? t("serviceHub.presentation.waitingForScreen", {
        defaultValue: "Waiting for the presentation screen to open the link",
      })
      : t("serviceHub.presentation.linkUnavailable", {
        defaultValue: "Presentation link unavailable",
      });

  return (
    <div className="presentation-hub-page">
      <header className="ph-header">
        <div className="ph-header-copy">
          <p className="ph-eyebrow">
            {t("serviceHub.presentation.mode", { defaultValue: "Presentation Mode" })}
          </p>
          <h1 className="ph-title">
            {t("serviceHub.presentation.title", { defaultValue: "Presentation Hub" })}
          </h1>
          <p className="ph-subtitle">
            {t("serviceHub.presentation.subtitle", {
              defaultValue: "Use this laptop to control the content. The browser link is the presentation screen.",
            })}
          </p>
        </div>

        <div className="ph-screen-card">
          <div className="ph-screen-card-top">
            <div className={`ph-connection-pill${viewerCount > 0 ? " is-live" : ""}`}>
              <Icon name="link" size={16} />
              <span>{remoteStatusLabel}</span>
            </div>
            <button
              type="button"
              className="ph-icon-btn"
              onClick={() => void syncPresentationContext()}
              title={t("serviceHub.actions.refreshConnection", { defaultValue: "Refresh presentation connection" })}
            >
              <Icon name="refresh" size={18} />
            </button>
          </div>

          <label className="ph-link-label">
            {t("serviceHub.presentation.linkLabel", { defaultValue: "Presentation link" })}
          </label>
          <div className="ph-link-row">
            <input className="ph-link-input" readOnly value={presentationLink} />
            <button type="button" className="ph-icon-btn" onClick={handleCopyLink} title={t("serviceHub.actions.copyLink", { defaultValue: "Copy presentation link" })}>
              <Icon name={linkCopied ? "check" : "content_copy"} size={18} />
            </button>
            <button type="button" className="ph-icon-btn" onClick={handleLaunchScreen} title={t("serviceHub.actions.launchScreen", { defaultValue: "Launch presentation screen" })}>
              <Icon name="open_in_new" size={18} />
            </button>
          </div>

          <div className="ph-action-row">
            <button type="button" className="ph-primary-btn" onClick={handleLaunchScreen}>
              <Icon name="tv" size={18} />
              <span>{t("serviceHub.actions.launchScreen", { defaultValue: "Launch Screen" })}</span>
            </button>
            <button type="button" className="ph-secondary-btn" onClick={() => void handleClearScreen()}>
              <Icon name="block" size={18} />
              <span>{t("serviceHub.actions.clearScreen", { defaultValue: "Clear Screen" })}</span>
            </button>
            <button type="button" className="ph-secondary-btn" onClick={() => navigate("/presentation/setup")}>
              <Icon name="settings" size={18} />
              <span>{t("serviceHub.actions.screenSetup", { defaultValue: "Screen Setup" })}</span>
            </button>
            <button type="button" className="ph-secondary-btn" onClick={() => navigate("/")}>
              <Icon name="close" size={18} />
              <span>{t("serviceHub.actions.exitPresentationMode", { defaultValue: "Exit" })}</span>
            </button>
          </div>

          {liveLabel ? (
            <div className="ph-live-note">
              <span>{t("serviceHub.presentation.liveNow", { defaultValue: "Live now" })}</span>
              <strong>{liveLabel}</strong>
            </div>
          ) : (
            <div className="ph-live-note ph-live-note--idle">
              <span>{t("serviceHub.presentation.liveNow", { defaultValue: "Live now" })}</span>
              <strong>{t("serviceHub.presentation.nothingLive", { defaultValue: "Nothing on screen yet" })}</strong>
            </div>
          )}

          {actionError && <p className="ph-error">{actionError}</p>}
        </div>
      </header>

      <div className="ph-tabs" role="tablist" aria-label={t("serviceHub.aria.presentationTabs", { defaultValue: "Presentation tabs" })}>
        {HUB_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`ph-tab${isActive ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon name={tab.icon} size={18} />
              <span>{t(tab.labelKey, { defaultValue: tab.defaultLabel })}</span>
            </button>
          );
        })}
      </div>

      <main className="ph-body" aria-live="polite">
        {mountedTabs.worship && (
          <section
            className={`ph-panel ph-panel--embedded${activeTab === "worship" ? " is-active" : ""}`}
            aria-hidden={activeTab !== "worship"}
          >
            <WorshipModule
              isActive={activeTab === "worship"}
              presentationMode
              initialSelectSongId={pendingSongId}
              onConsumeInitialSelect={() => setPendingSongId(null)}
              onPresentToScreen={handlePresentWorship}
              onClearScreen={() => void handleClearScreen()}
            />
          </section>
        )}

        {mountedTabs.bible && (
          <section
            className={`ph-panel ph-panel--embedded${activeTab === "bible" ? " is-active" : ""}`}
            aria-hidden={activeTab !== "bible"}
          >
            <BibleProvider>
              <BibleModule
                isActive={activeTab === "bible"}
                presentationMode
                initialSelectBible={pendingBibleTarget}
                onConsumeInitialSelect={() => setPendingBibleTarget(null)}
                onPresentToScreen={handlePresentBible}
                onClearScreen={() => void handleClearScreen()}
              />
            </BibleProvider>
          </section>
        )}

        {mountedTabs.media && (
          <section
            className={`ph-panel${activeTab === "media" ? " is-active" : ""}`}
            aria-hidden={activeTab !== "media"}
          >
            <div className="ph-library-shell">
              <div className="ph-library-toolbar">
                <div className="ph-filter-group" role="tablist" aria-label={t("serviceHub.media.filterLabel", { defaultValue: "Media filter" })}>
                  {(["all", "image", "video"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`ph-filter-btn${mediaFilter === filter ? " is-active" : ""}`}
                      onClick={() => setMediaFilter(filter)}
                    >
                      {t(`serviceHub.media.filter.${filter}`, {
                        defaultValue: filter === "all" ? "All" : filter === "image" ? "Images" : "Videos",
                      })}
                    </button>
                  ))}
                </div>

                <div className="ph-toolbar-actions">
                  <button
                    type="button"
                    className="ph-primary-btn"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={uploadingMedia}
                  >
                    <Icon name={uploadingMedia ? "refresh" : "upload_file"} size={18} />
                    <span>
                      {uploadingMedia
                        ? t("serviceHub.media.uploading", { defaultValue: "Uploading..." })
                        : t("serviceHub.media.upload", { defaultValue: "Upload Media" })}
                    </span>
                  </button>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept={MEDIA_FILE_ACCEPT}
                    multiple
                    hidden
                    onChange={(event) => void handleUploadMedia(event)}
                  />
                </div>
              </div>

              {mediaList.length === 0 ? (
                <div className="ph-empty-state">
                  <Icon name="perm_media" size={28} />
                  <h3>{t("serviceHub.media.emptyTitle", { defaultValue: "No media here yet" })}</h3>
                  <p>{t("serviceHub.media.emptyDescription", { defaultValue: "Upload images or videos, then click any item to put it on the presentation screen." })}</p>
                </div>
              ) : (
                <div className="ph-media-grid">
                  {mediaList.map((item) => {
                    const isSelected = selectedMediaId === item.id;
                    const previewUrl = resolveOverlayAssetUrl(item.thumbnailUrl || item.url);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`ph-media-card${isSelected ? " is-selected" : ""}`}
                        onClick={() => {
                          setSelectedMediaId(item.id);
                          void presentAction(item.name, () => publishMediaToPresentation(item));
                        }}
                        onDoubleClick={() => {
                          setSelectedMediaId(item.id);
                          void presentAction(item.name, () => publishMediaToPresentation(item));
                        }}
                      >
                        <div className="ph-media-card-preview">
                          {item.type === "video" ? (
                            <video src={previewUrl} muted playsInline />
                          ) : (
                            <img src={previewUrl} alt={item.name} />
                          )}
                          <span className="ph-media-badge">
                            {item.type === "video"
                              ? t("serviceHub.media.video", { defaultValue: "Video" })
                              : t("serviceHub.media.image", { defaultValue: "Image" })}
                          </span>
                        </div>
                        <div className="ph-media-card-copy">
                          <strong>{item.name}</strong>
                          <span>{item.type === "video" && item.durationSec ? `${item.durationSec}s` : t("serviceHub.media.ready", { defaultValue: "Ready to present" })}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {mountedTabs.ministry && (
          <section
            className={`ph-panel${activeTab === "ministry" ? " is-active" : ""}`}
            aria-hidden={activeTab !== "ministry"}
          >
            <div className="ph-library-shell">
              {speakers.length === 0 ? (
                <div className="ph-empty-state">
                  <Icon name="church" size={28} />
                  <h3>{t("serviceHub.ministry.emptyTitle", { defaultValue: "No ministry profiles yet" })}</h3>
                  <p>{t("serviceHub.ministry.emptyDescription", { defaultValue: "Add speakers in settings, then click any profile here to present it." })}</p>
                </div>
              ) : (
                <div className="ph-list-grid">
                  {speakers.map((speaker) => {
                    const speakerId = normalizeSpeakerKey(speaker.name);
                    const isSelected = selectedMinistryId === speakerId;
                    return (
                      <button
                        key={speakerId}
                        type="button"
                        className={`ph-list-card${isSelected ? " is-selected" : ""}`}
                        onClick={() => {
                          setSelectedMinistryId(speakerId);
                          void presentAction(speaker.name, () => publishMinistryToPresentation({
                            speakerName: speaker.name,
                            speakerRole: speaker.role || ministryData.mainPastorRole,
                            churchName: ministryData.churchName,
                          }));
                        }}
                        onDoubleClick={() => {
                          setSelectedMinistryId(speakerId);
                          void presentAction(speaker.name, () => publishMinistryToPresentation({
                            speakerName: speaker.name,
                            speakerRole: speaker.role || ministryData.mainPastorRole,
                            churchName: ministryData.churchName,
                          }));
                        }}
                      >
                        <div className="ph-list-card-head">
                          <div className="ph-avatar">
                            {speaker.imageUrl ? (
                              <img src={resolveOverlayAssetUrl(speaker.imageUrl)} alt={speaker.name} />
                            ) : (
                              <Icon name="person" size={18} />
                            )}
                          </div>
                          <div className="ph-list-card-copy">
                            <strong>{speaker.name}</strong>
                            <span>{speaker.role || t("serviceHub.ministry.speaker", { defaultValue: "Speaker" })}</span>
                          </div>
                        </div>
                        <span className="ph-list-card-meta">
                          {ministryData.churchName || t("serviceHub.ministry.churchFallback", { defaultValue: "Ministry profile" })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {mountedTabs.countdown && (
          <section
            className={`ph-panel${activeTab === "countdown" ? " is-active" : ""}`}
            aria-hidden={activeTab !== "countdown"}
          >
            <div className="ph-library-shell">
              {countdowns.length === 0 ? (
                <div className="ph-empty-state">
                  <Icon name="timer" size={28} />
                  <h3>{t("serviceHub.countdown.emptyTitle", { defaultValue: "No countdowns yet" })}</h3>
                  <p>{t("serviceHub.countdown.emptyDescription", { defaultValue: "Create a countdown, then click it here to start it on the presentation screen." })}</p>
                </div>
              ) : (
                <div className="ph-list-grid">
                  {countdowns.map((countdown) => {
                    const isSelected = selectedCountdownId === countdown.id;
                    return (
                      <button
                        key={countdown.id}
                        type="button"
                        className={`ph-list-card ph-list-card--countdown${isSelected ? " is-selected" : ""}`}
                        onClick={() => {
                          setSelectedCountdownId(countdown.id);
                          void presentAction(countdown.title || t("serviceHub.tabs.countdown", { defaultValue: "Countdown" }), () =>
                            publishCountdownToPresentation(countdown),
                          );
                        }}
                        onDoubleClick={() => {
                          setSelectedCountdownId(countdown.id);
                          void presentAction(countdown.title || t("serviceHub.tabs.countdown", { defaultValue: "Countdown" }), () =>
                            publishCountdownToPresentation(countdown),
                          );
                        }}
                      >
                        <div className="ph-countdown-icon">
                          <Icon name="timer" size={18} />
                        </div>
                        <div className="ph-list-card-copy">
                          <strong>{countdown.title || t("serviceHub.tabs.countdown", { defaultValue: "Countdown" })}</strong>
                          <span>{formatCountdownSubtitle(countdown)}</span>
                        </div>
                        <span className="ph-list-card-meta">
                          {countdown.templateId}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <GlobalSearchModal
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onNavigate={handleGlobalSearchNavigate}
        initialQuery={globalSearchInitial}
      />
    </div>
  );
}
