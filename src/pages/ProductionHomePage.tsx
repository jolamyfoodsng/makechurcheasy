import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Mic,
  Images,
  BookOpen,
  Music,
  Monitor,
  MonitorSmartphone,
  ExternalLink,
  ListMusic,
  Video,
  History,
  Activity,
  Image as ImageIcon,
  AlertCircle,
  Link,
  Copy,
  Check,
  Info,
  Sun,
  Moon,
  Play,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { obsService, type ConnectionStatus } from "../services/obsService";
import { lmDockService, type LmDockSnapshot } from "../services/lmDockService";
import { getInstalledTranslations, getBibleSettings } from "../bible/bibleDb";
import { getAllSongs } from "../worship/worshipDb";
import { getAllMedia } from "../library/libraryDb";
import { useAuth } from "../contexts/AuthContext";
import { getSettings } from "../multiview/mvStore";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import { getDeviceId } from "../services/authService";
import { track } from "../services/analytics";
import { TutorialModal } from "../components/TutorialModal";
import { OnboardingResumeBanner } from "./OnboardingPage";
import { useAppTheme } from "../hooks/useAppTheme";

// ── Helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ── Activity Log ───────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  icon: typeof Mic;
  iconColor: string;
  text: string;
  time: Date;
}

// ── Dashboard Header ───────────────────────────────────────────────────────

interface DashboardHeaderProps {
  pastorName: string;
  obsStatus: ConnectionStatus;
  dockAvailable: boolean;
  onConnectObs: () => void;
  onOpenTutorials: () => void;
}

function DashboardHeader({
  pastorName,
  obsStatus,
  dockAvailable,
  onConnectObs,
  onOpenTutorials,
}: DashboardHeaderProps) {
  const greeting = useMemo(() => getGreeting(), []);
  const { effective, setTheme } = useAppTheme();
  const isLight = effective === "light";
  const now = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const obsConnected = obsStatus === "connected";

  return (
    <>
      <header className="header-container">
        <div className="header-left">

          <div>
            <h2 className="header-title">
              {greeting},{" "}
              {pastorName || "User"}{" "}
              <span className="header-emoji">&#x1F44B;</span>
            </h2>
            <p className="header-subtitle">
              {obsConnected
                ? "Everything looks ready for your next service."
                : "Connect to OBS to get started."}
            </p>
          </div>
        </div>
        <div className="header-right">
          <button
            className="header-theme-toggle"
            onClick={() => setTheme(isLight ? "dark" : "light")}
            title={isLight ? "Switch to dark mode" : "Switch to light mode"}
          >
            {isLight ? <Moon className="header-theme-icon" /> : <Sun className="header-theme-icon" />}
          </button>
          <div className="header-date">{now}</div>
        </div>
      </header>

      <div className="status-panel">
        <div className="status-group">
          <div className="status-item">
            <Monitor className="status-icon" />
            <div>
              <p className="status-title">
                OBS {obsConnected ? "Connected" : "Disconnected"}{" "}
                <span
                  className="status-dot"
                  style={{
                    backgroundColor: obsConnected
                      ? "var(--success)"
                      : "var(--error)",
                  }}
                />
              </p>
              <p className="status-desc">
                {obsConnected
                  ? "Studio is online and ready"
                  : "Not connected to OBS"}
              </p>
            </div>
          </div>

          <div className="status-divider" />
          <div className="status-item">
            <MonitorSmartphone className="status-icon" />
            <div>
              <p className="status-title">
                Dock {dockAvailable ? "Connected" : "Unavailable"}{" "}
                <span
                  className="status-dot"
                  style={{
                    backgroundColor: dockAvailable
                      ? "var(--success)"
                      : "var(--text-muted)",
                  }}
                />
              </p>
              <p className="status-desc">
                {dockAvailable
                  ? "MakeChurchEasy Dock detected"
                  : "Dock not detected"}
              </p>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn-primary"
            onClick={() => {
              track("connect_obs_clicked");
              onConnectObs();
            }}
          >
            {obsConnected ? (
              <>
                <Check className="btn-icon" /> OBS Connected
              </>
            ) : (
              <>
                <Monitor className="btn-icon" /> Connect to OBS
              </>
            )}
          </button>
          <button className="btn-secondary" onClick={onOpenTutorials}>
            <Play className="btn-icon" /> Watch Tutorials <ExternalLink className="btn-icon" />
          </button>
        </div>
      </div>
    </>
  );
}

// ── Feature Grid ───────────────────────────────────────────────────────────

interface FeatureGridProps {
  voiceBibleStatus: LmDockSnapshot["status"];
  voiceBibleConnected: boolean;
  translationCount: number;
  activeTranslation: string;
  songCount: number;
  recentSongCount: number;
  mediaCount: number;
  recentMediaCount: number;
  onStartVoiceBible: () => void;
  onNavigate: (path: string) => void;
}

function FeatureGrid({
  voiceBibleStatus,
  voiceBibleConnected,
  translationCount,
  activeTranslation,
  songCount,
  recentSongCount,
  mediaCount,
  recentMediaCount,
  onStartVoiceBible,
  onNavigate,
}: FeatureGridProps) {
  const vbStatusLabel = useMemo(() => {
    switch (voiceBibleStatus) {
      case "listening":
        return "Listening";
      case "connecting":
        return "Connecting...";
      case "requesting-mic":
        return "Requesting Mic...";
      case "error":
        return "Error";
      default:
        return voiceBibleConnected ? "Ready" : "Disconnected";
    }
  }, [voiceBibleStatus, voiceBibleConnected]);

  return (
    <div className="grid-container">
      {/* Voice Bible */}
      <div className="feature-card group card-purple">
        <div className="card-bg-purple" />
        <div className="icon-wrapper icon-wrapper-purple">
          <Mic className="feature-icon icon-purple" />
        </div>
        <h3 className="card-title">Voice Bible</h3>
        <p className="card-subtitle card-subtitle-purple">
          {vbStatusLabel}
        </p>
        <p className="card-info">
          {voiceBibleConnected ? "Voice Ready" : "Not connected"}
        </p>
        <button
          className="card-btn card-btn-purple"
          onClick={onStartVoiceBible}
        >
          <Mic className="card-btn-icon" />{" "}
          {voiceBibleStatus === "listening"
            ? "Stop Listening"
            : "Start Listening"}
        </button>
      </div>

      {/* Bible */}
      <div className="feature-card group card-blue">
        <div className="card-bg-blue" />
        <div className="icon-wrapper icon-wrapper-blue">
          <BookOpen className="feature-icon icon-blue" />
        </div>
        <h3 className="card-title">Bible</h3>
        <p className="card-subtitle card-subtitle-blue">
          {activeTranslation} Active
        </p>
        <p className="card-info">
          {translationCount} Translation{translationCount !== 1 ? "s" : ""}{" "}
          Installed
        </p>
        <button
          className="card-btn card-btn-blue"
          onClick={() => { track("dashboard_card_clicked", { card: "bible" }); onNavigate("/resources?tab=bible"); }}
        >
          <BookOpen className="card-btn-icon" /> Open Bible
        </button>
      </div>

      {/* Worship */}
      <div className="feature-card group card-green">
        <div className="card-bg-green" />
        <div className="icon-wrapper icon-wrapper-green">
          <Music className="feature-icon icon-green" />
        </div>
        <h3 className="card-title">Worship</h3>
        <p className="card-subtitle card-subtitle-green">
          {songCount} Song{songCount !== 1 ? "s" : ""}
        </p>
        <p className="card-info">
          {recentSongCount} Recently Used
        </p>
        <button
          className="card-btn card-btn-green"
          onClick={() => { track("dashboard_card_clicked", { card: "worship" }); onNavigate("/resources?tab=worship"); }}
        >
          <ListMusic className="card-btn-icon" /> Open Worship
        </button>
      </div>

      {/* Media */}
      <div className="feature-card group card-orange">
        <div className="card-bg-orange" />
        <div className="icon-wrapper icon-wrapper-orange">
          <Images className="feature-icon icon-orange" />
        </div>
        <h3 className="card-title">Media</h3>
        <p className="card-subtitle card-subtitle-orange">
          {mediaCount} Asset{mediaCount !== 1 ? "s" : ""}
        </p>
        <p className="card-info">
          {recentMediaCount} Recent Upload{recentMediaCount !== 1 ? "s" : ""}
        </p>
        <button
          className="card-btn card-btn-orange"
          onClick={() => { track("dashboard_card_clicked", { card: "media" }); onNavigate("/resources?tab=media"); }}
        >
          <Video className="card-btn-icon" /> Open Media
        </button>
      </div>
    </div>
  );
}

// ── Connection URLs ──────────────────────────────────────────────────────

interface ConnectionUrlsProps {
  obsStatus: ConnectionStatus;
}

function ConnectionUrls({ obsStatus }: ConnectionUrlsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const isDev =
    window.location.protocol === "http:" && window.location.port === "1420";
  const base = isDev ? window.location.origin : getOverlayBaseUrlSync();

  const deviceId = getDeviceId();
  const deviceIdParam = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  const overlayUrl = (isDev ? `${base}/dock` : `${base}/dock.html`) + deviceIdParam;
  const lmDockUrl = (isDev ? `${base}/lm-dock` : `${base}/lm-dock.html`) + deviceIdParam;

  const obsConnected = obsStatus === "connected";

  const handleCopy = useCallback((id: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  return (
    <div className="urls-section">
      <div className="urls-header">
        <Link className="urls-header-icon" />
        <div>
          <h3 className="urls-title">Connection URLs</h3>
          <p className="urls-subtitle">
            Add these URLs as OBS Custom Browser Docks
          </p>
        </div>
      </div>

      <div className="urls-row">
        <div className="urls-group">
          <div className="url-label-block">
            <span className="url-label-text text-indigo">Bible Overlay Dock</span>
            <p className="url-label-desc">
              Scripture presentation and Bible controls inside OBS
            </p>
          </div>
          <div className="url-input-group">
            <input
              className="url-input input-indigo"
              readOnly
              value={overlayUrl}
            />
            <button
              className="url-btn btn-indigo"
              onClick={() => handleCopy("overlay", overlayUrl)}
            >
              {copiedId === "overlay" ? (
                <Check className="url-btn-icon" />
              ) : (
                <Copy className="url-btn-icon" />
              )}
              {copiedId === "overlay" ? "Copied" : "Copy URL"}
            </button>
          </div>
        </div>

        <div className="urls-group">
          <div className="url-label-block">
            <span className="url-label-text text-green">MakeChurchEasy Control Dock</span>
            <p className="url-label-desc">
              Full MakeChurchEasy control panel for live service management
            </p>
          </div>
          <div className="url-input-group">
            <input
              className="url-input input-green"
              readOnly
              value={lmDockUrl}
            />
            <button
              className="url-btn btn-green"
              onClick={() => handleCopy("dock", lmDockUrl)}
            >
              {copiedId === "dock" ? (
                <Check className="url-btn-icon" />
              ) : (
                <Copy className="url-btn-icon" />
              )}
              {copiedId === "dock" ? "Copied" : "Copy URL"}
            </button>
          </div>
        </div>
      </div>

      <div className="urls-info-box">
        <div className="urls-info-header">
          <Info className="urls-info-icon" />
          <span className="urls-info-title">
            {obsConnected
              ? "OBS is connected — these URLs are ready to use"
              : "Connect to OBS first, then add these as Custom Browser Docks"}
          </span>
        </div>
        <button
          className="urls-info-toggle"
          onClick={() => setShowInstructions(!showInstructions)}
        >
          {showInstructions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="urls-info-subtitle">How to Add a Dock in OBS</span>
        </button>
        {showInstructions && (
          <>
            <ol className="urls-info-list">
              <li>Open OBS Studio.</li>
              <li>Go to <strong>Docks → Custom Browser Docks</strong>.</li>
              <li>Enter a name for the dock (e.g. "MakeChurchEasy Bible" or "MakeChurchEasy Control").</li>
              <li>Paste the URL.</li>
              <li>Click <strong>Apply</strong>.</li>
              <li>The dock will appear inside OBS and can be moved, resized, or docked anywhere in the interface.</li>
            </ol>
            <div className="urls-info-footer">
              <AlertCircle className="urls-info-footer-icon" />
              <span>These are OBS Dock URLs, not Browser Sources. Do not add them under Sources.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Activity & Status ──────────────────────────────────────────────────────

interface ActivityAndStatusProps {
  activities: ActivityEntry[];
  obsStatus: ConnectionStatus;
  dockAvailable: boolean;
  voiceBibleStatus: LmDockSnapshot["status"];
  translationCount: number;
  mediaCount: number;
  songCount: number;
  onNavigate: (path: string) => void;
}

function ActivityAndStatus({
  activities,
  obsStatus,
  dockAvailable,
  voiceBibleStatus,
  translationCount,
  mediaCount,
  songCount,
  onNavigate,
}: ActivityAndStatusProps) {
  const obsConnected = obsStatus === "connected";
  const vbStatusLabel = useMemo(() => {
    switch (voiceBibleStatus) {
      case "listening":
        return "Listening";
      case "connecting":
        return "Connecting";
      case "requesting-mic":
        return "Requesting Mic";
      case "error":
        return "Error";
      case "idle":
        return "Ready";
      default:
        return "Disconnected";
    }
  }, [voiceBibleStatus]);

  const vbStatusColor = useMemo(() => {
    if (voiceBibleStatus === "listening") return "var(--success)";
    if (voiceBibleStatus === "error") return "var(--error)";
    return "var(--text-secondary)";
  }, [voiceBibleStatus]);

  return (
    <div className="activity-status-grid">
      {/* Recent Activity */}
      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <History className="panel-icon" /> Recent Activity
          </h3>
          <button
            className="btn-view-all"
            onClick={() => onNavigate("/settings")}
          >
            View All
          </button>
        </div>

        <div className="activity-list">
          {activities.length === 0 && (
            <div className="activity-item-last">
              <div className="activity-content">
                <Activity className="activity-icon icon-variant" />
                <p className="activity-text" style={{ color: "var(--text-muted)" }}>
                  No recent activity yet
                </p>
              </div>
            </div>
          )}
          {activities.slice(0, 5).map((entry, i) => {
            const IconComponent = entry.icon;
            const isLast = i === activities.length - 1 || i === 4;
            return (
              <div
                key={entry.id}
                className={isLast ? "activity-item-last" : "activity-item"}
              >
                <div className="activity-content">
                  <IconComponent
                    className={`activity-icon ${entry.iconColor}`}
                  />
                  <p className="activity-text">{entry.text}</p>
                </div>
                <span className="activity-time">
                  {formatRelativeTime(entry.time)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* System Status */}
      <div className="panel">
        <h3 className="panel-title panel-title-mb">
          <Activity className="panel-icon" /> System Status
        </h3>

        <div className="status-grid">
          <div className="status-card">
            <div className="status-card-header">
              <Monitor className="status-card-icon icon-variant" />
              {obsConnected && <span className="status-dot" />}
            </div>
            <div>
              <p className="status-card-title">OBS</p>
              <p
                className={`status-card-subtitle ${obsConnected ? "text-secondary-color" : ""
                  }`}
                style={
                  !obsConnected ? { color: "var(--text-muted)" } : undefined
                }
              >
                {obsConnected ? "Connected" : "Disconnected"}
              </p>
            </div>
          </div>

          <div className="status-card">
            <div className="status-card-header">
              <MonitorSmartphone className="status-card-icon icon-variant" />
              {dockAvailable && <span className="status-dot" />}
            </div>
            <div>
              <p className="status-card-title">Dock</p>
              <p
                className={`status-card-subtitle ${dockAvailable ? "text-secondary-color" : ""
                  }`}
                style={
                  !dockAvailable ? { color: "var(--text-muted)" } : undefined
                }
              >
                {dockAvailable ? "Connected" : "Unavailable"}
              </p>
            </div>
          </div>

          <div className="status-card">
            <div className="status-card-header">
              <Mic className="status-card-icon icon-variant" />
              {(voiceBibleStatus === "listening" ||
                voiceBibleStatus === "idle") && (
                  <span
                    className="status-dot"
                    style={{ backgroundColor: vbStatusColor }}
                  />
                )}
            </div>
            <div>
              <p className="status-card-title">Voice Bible</p>
              <p
                className="status-card-subtitle"
                style={{ color: vbStatusColor }}
              >
                {vbStatusLabel}
              </p>
            </div>
          </div>

          <div className="status-card">
            <div className="status-card-header">
              <BookOpen className="status-card-icon text-blue-color" />
            </div>
            <div>
              <p className="status-card-title">Bible</p>
              <p className="status-card-subtitle text-blue-color">
                {translationCount} Installed
              </p>
            </div>
          </div>

          <div className="status-card">
            <div className="status-card-header">
              <ImageIcon className="status-card-icon text-orange-color" />
            </div>
            <div>
              <p className="status-card-title">Media</p>
              <p className="status-card-subtitle text-orange-color">
                {mediaCount} Asset{mediaCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="status-card">
            <div className="status-card-header">
              <Music className="status-card-icon text-green-color" />
            </div>
            <div>
              <p className="status-card-title">Worship</p>
              <p className="status-card-subtitle text-green-color">
                {songCount} Song{songCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Quick Actions & Footer ─────────────────────────────────────────────────

// ── Main Dashboard Component ───────────────────────────────────────────────

export default function ProductionHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Settings ──
  const [pastorName, setPastorName] = useState("");

  // ── OBS ──
  const [obsStatus, setObsStatus] = useState<ConnectionStatus>(
    obsService.status,
  );

  // ── Dock ──
  const [dockAvailable, setDockAvailable] = useState(false);

  // ── Voice Bible ──
  const [voiceBible, setVoiceBible] = useState<LmDockSnapshot>({
    status: "idle",
    entries: [],
    candidates: [],
    queue: [],
    suggestions: [],
    matching: false,
    inputLevel: 0,
  });

  // ── Bible ──
  const [translationCount, setTranslationCount] = useState(0);
  const [activeTranslation, setActiveTranslation] = useState("KJV");

  // ── Worship ──
  const [songCount, setSongCount] = useState(0);
  const [recentSongCount, setRecentSongCount] = useState(0);

  // ── Media ──
  const [mediaCount, setMediaCount] = useState(0);
  const [recentMediaCount, setRecentMediaCount] = useState(0);

  // ── Activity ──
  const [activities, setActivities] = useState<ActivityEntry[]>([]);

  // ── Add activity entry ──
  const addActivity = useCallback(
    (
      icon: typeof Mic,
      iconColor: string,
      text: string,
    ) => {
      setActivities((prev) => {
        const entry: ActivityEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          icon,
          iconColor,
          text,
          time: new Date(),
        };
        return [entry, ...prev].slice(0, 20);
      });
    },
    [],
  );

  // ── Load initial data ──
  useEffect(() => {
    // Settings
    const s = getSettings();
    setPastorName(s.mainPastorName || user?.name || "User");

    // OBS
    setObsStatus(obsService.status);

    // Dock availability (overlay server running)
    const checkDock = () => {
      try {
        const url = getOverlayBaseUrlSync();
        setDockAvailable(Boolean(url));
      } catch {
        setDockAvailable(false);
      }
    };
    checkDock();
    const dockInterval = setInterval(checkDock, 10_000);

    // Bible
    getInstalledTranslations()
      .then((list) => {
        setTranslationCount(list.length);
        if (list.length > 0) {
          getBibleSettings().then((settings) => {
            const active = list.find(
              (t) =>
                t.abbr.toUpperCase() ===
                settings.defaultTranslation.toUpperCase(),
            );
            setActiveTranslation(active?.abbr || list[0].abbr);
          });
        }
      })
      .catch(() => { });

    // Worship
    getAllSongs()
      .then((songs) => {
        setSongCount(songs.length);
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recent = songs.filter(
          (s) => new Date(s.updatedAt).getTime() > oneWeekAgo,
        );
        setRecentSongCount(recent.length);
      })
      .catch(() => { });

    // Media
    getAllMedia()
      .then((items) => {
        setMediaCount(items.length);
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recent = items.filter(
          (m) => new Date(m.createdAt).getTime() > oneWeekAgo,
        );
        setRecentMediaCount(recent.length);
      })
      .catch(() => { });

    // Seed initial activity from loaded data
    getInstalledTranslations().then((list) => {
      if (list.length > 0) {
        addActivity(
          BookOpen,
          "icon-blue",
          `${list.length} translation${list.length !== 1 ? "s" : ""} installed`,
        );
      }
    });
    getAllSongs().then((songs) => {
      if (songs.length > 0) {
        addActivity(
          Music,
          "icon-green",
          `${songs.length} song${songs.length !== 1 ? "s" : ""} in library`,
        );
      }
    });
    getAllMedia().then((items) => {
      if (items.length > 0) {
        addActivity(
          ImageIcon,
          "icon-orange",
          `${items.length} media asset${items.length !== 1 ? "s" : ""} loaded`,
        );
      }
    });

    return () => clearInterval(dockInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Subscribe to OBS status ──
  useEffect(() => {
    const unsub = obsService.onStatusChange((status) => {
      setObsStatus(status);
    });
    return unsub;
  }, []);

  // ── Subscribe to Voice Bible state ──
  useEffect(() => {
    const unsub = lmDockService.subscribe((snapshot) => {
      setVoiceBible(snapshot);
    });
    return unsub;
  }, []);

  // ── Track OBS connection events ──
  useEffect(() => {
    if (obsStatus === "connected") {
      addActivity(Monitor, "icon-primary", "OBS connected");
    } else if (obsStatus === "error") {
      addActivity(Monitor, "icon-variant", "OBS connection error");
    }
  }, [obsStatus, addActivity]);

  // ── Track Voice Bible events ──
  const prevVbStatus = useMemo(() => voiceBible.status, [voiceBible.status]);
  useEffect(() => {
    if (voiceBible.status === "listening" && prevVbStatus !== "listening") {
      addActivity(Mic, "icon", "Voice Bible started listening");
    } else if (voiceBible.status === "idle" && prevVbStatus === "listening") {
      addActivity(Mic, "icon", "Voice Bible stopped listening");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceBible.status]);

  // ── Actions ──
  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  const handleToggleVoiceBible = useCallback(() => {
    if (voiceBible.status === "listening") {
      lmDockService.stopListening();
    } else {
      lmDockService.startListening();
    }
  }, [voiceBible.status]);

  // ── Tutorial Modal ──
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const handleConnectObs = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleOpenTutorials = useCallback(() => {
    track("tutorial_modal_opened");
    openUrl("https://www.youtube.com/watch?v=aaF7_BhfC7o&list=PLKAqdarZMn35-DSSxdUw_8IzhPKh6YzSI&pp=sAgC");
  }, []);

  return (
    <div className="app-page__inner">
      <OnboardingResumeBanner />
      {/* <AppIdCard /> */}
      <DashboardHeader
        pastorName={pastorName}
        obsStatus={obsStatus}
        dockAvailable={dockAvailable}
        onConnectObs={handleConnectObs}
        onOpenTutorials={handleOpenTutorials}
      />
      <FeatureGrid
        voiceBibleStatus={voiceBible.status}
        voiceBibleConnected={voiceBible.status !== "error"}
        translationCount={translationCount}
        activeTranslation={activeTranslation}
        songCount={songCount}
        recentSongCount={recentSongCount}
        mediaCount={mediaCount}
        recentMediaCount={recentMediaCount}
        onStartVoiceBible={handleToggleVoiceBible}
        onNavigate={handleNavigate}
      />
      <ConnectionUrls obsStatus={obsStatus} />
      <ActivityAndStatus
        activities={activities}
        obsStatus={obsStatus}
        dockAvailable={dockAvailable}
        voiceBibleStatus={voiceBible.status}
        translationCount={translationCount}
        mediaCount={mediaCount}
        songCount={songCount}
        onNavigate={handleNavigate}
      />
      <TutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
      />
    </div>
  );
}
