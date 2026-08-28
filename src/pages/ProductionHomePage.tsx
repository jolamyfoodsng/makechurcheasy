import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Crown,
  History,
  Image as ImageIcon,
  Images,
  Info,
  Link,
  ListMusic,
  Mic,
  Monitor,
  MonitorSmartphone,
  Moon,
  Music,
  Sun,
  Video
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { getBibleSettings, getInstalledTranslations } from "../bible/bibleDb";
import { AccountSummaryCards } from "../components/AccountSummaryCards";
import { useAuth } from "../contexts/AuthContext";
import { useAppTheme } from "../hooks/useAppTheme";
import { useCountryPricing } from "../hooks/useCountryPricing";
import { getAllMedia } from "../library/libraryDb";
import { getSettings } from "../multiview/mvStore";
import { track } from "../services/analytics";
import { getTrialDaysRemaining, getUserPlan, isInTrial } from "../services/licenseService";
import { lmDockService, type LmDockSnapshot } from "../services/lmDockService";
import { obsService, type ConnectionStatus } from "../services/obsService";
import { getDockBaseUrl, getOverlayBaseUrlSync } from "../services/overlayUrl";
import { confirmStopVoiceBibleForPresentation } from "../services/voiceBiblePresentationGuard";
import { getAllSongs } from "../worship/worshipDb";
import { OnboardingResumeBanner } from "./OnboardingPage";
import MovePluginInstallModal from "../components/MovePluginInstallModal";
import {
  ensureMoveTransition,
  getObsMovePluginStatus,
  isMceBridgeLoaded,
  isMovePluginLoaded,
} from "../services/obsMovePlugin";
import { UPGRADE_PROMO_FALLBACK } from "../lib/upgradePromo";

// ── Helpers ────────────────────────────────────────────────────────────────

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "dashboard.greeting.morning";
  if (hour < 17) return "dashboard.greeting.afternoon";
  return "dashboard.greeting.evening";
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
}

function DashboardHeader({
  pastorName,
  obsStatus,
  dockAvailable,
  onConnectObs,
}: DashboardHeaderProps) {
  const { t } = useTranslation();
  const greetingKey = useMemo(() => getGreetingKey(), []);
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
              {t(greetingKey)},{" "}
              {pastorName || "User"}{" "}
              <span className="header-emoji">&#x1F44B;</span>
            </h2>
            <p className="header-subtitle">
              {obsConnected
                ? t("dashboard.header.readyMessage")
                : t("dashboard.header.connectMessage")}
            </p>
          </div>
        </div>
        <div className="header-right">
          <button
            className="header-theme-toggle"
            onClick={() => setTheme(isLight ? "dark" : "light")}
            title={isLight ? t("dashboard.header.themeToggle.dark") : t("dashboard.header.themeToggle.light")}
          >
            {isLight ? <Moon className="header-theme-icon" /> : <Sun className="header-theme-icon" />}
          </button>
          <div className="header-date">{now}</div>
        </div>
      </header>

      <div className="status-panel">
        <div className="status-item">
          <Monitor className="status-icon" />
          <div>
            <p className="status-title">
              {t("dashboard.status.obs")} {obsConnected ? t("dashboard.obs.connected") : t("dashboard.obs.disconnected")}{" "}
              <span
                className={`status-dot ${obsConnected ? "status-dot--live" : ""}`}
                style={{
                  backgroundColor: obsConnected
                    ? "var(--success)"
                    : "var(--error)",
                }}
              />
            </p>
            <p className="status-desc">
              {obsConnected
                ? t("dashboard.obs.studioOnline")
                : t("dashboard.obs.notConnected")}
            </p>
          </div>
        </div>
        <div className="status-item">
          <MonitorSmartphone className="status-icon" />
          <div>
            <p className="status-title">
              {t("dashboard.status.dock")} {dockAvailable ? t("dashboard.dock.detected") : t("dashboard.dock.notDetected")}{" "}
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
                ? t("dashboard.dock.detected")
                : t("dashboard.dock.notDetected")}
            </p>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            track("connect_obs_clicked");
            onConnectObs();
          }}
          title={t("dashboard.btn.connect")}>
          {obsConnected ? (
            <>
              <Check className="btn-icon" /> {t("dashboard.btn.obsConnected")}
            </>
          ) : (
            <>
              <Monitor className="btn-icon" /> {t("dashboard.btn.connectToObs")}
            </>
          )}
        </button>
      </div>
    </>
  );
}

// ── Plan Upgrade Banner ────────────────────────────────────────────────────

function PlanUpgradeBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { getFormattedPlanPrice, loading } = useCountryPricing();
  const storedPlan = String(user?.plan || "free").trim().toLowerCase();
  const trialActive = storedPlan === "free" && isInTrial(user);
  const plan = getUserPlan(user);
  const isFree = plan === "free";
  const promoText = t("common.upgradePlansStartToday", {
    amount: "3,500",
    defaultValue: UPGRADE_PROMO_FALLBACK,
  });

  if (!trialActive && !isFree) return null;

  const handleUpgrade = () => {
    openUrl("https://makechurcheazy.com/subscription/plans");
  };

  if (trialActive) {
    const days = getTrialDaysRemaining(user);
    return (
      <div className="plan-upgrade-banner plan-upgrade-banner--trial">
        <div className="plan-upgrade-banner-content">
          <Crown size={16} className="plan-upgrade-banner-icon" />
          <div className="plan-upgrade-banner-copy">
            <span>Free trial — {days} day{days !== 1 ? "s" : ""} remaining</span>
            <span className="plan-upgrade-banner-promo">{promoText}</span>
          </div>
        </div>
        <button className="plan-upgrade-banner-btn" onClick={handleUpgrade}>
          Upgrade <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  const monthly = loading ? "..." : getFormattedPlanPrice("basic", "monthly");

  return (
    <div className="plan-upgrade-banner">
      <div className="plan-upgrade-banner-content">
        <Crown size={16} className="plan-upgrade-banner-icon" />
        <div className="plan-upgrade-banner-copy">
          <span>Upgrade to Basic — from {monthly}/month</span>
          <span className="plan-upgrade-banner-promo">{promoText}</span>
        </div>
      </div>
      <button className="plan-upgrade-banner-btn" onClick={handleUpgrade}>
        Subscribe <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ── Monthly Usage Widget ────────────────────────────────────────────────────



// ── Remote Presentation Status ─────────────────────────────────────────────



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
  const { t } = useTranslation();
  const vbStatusLabel = useMemo(() => {
    switch (voiceBibleStatus) {
      case "listening":
        return t("dashboard.vb.listening");
      case "connecting":
        return t("dashboard.vb.connecting");
      case "requesting-mic":
        return t("dashboard.vb.requestingMic");
      case "error":
        return t("dashboard.vb.error");
      default:
        return voiceBibleConnected ? t("dashboard.vb.ready") : t("dashboard.vb.disconnected");
    }
  }, [voiceBibleStatus, voiceBibleConnected, t]);

  return (
    <div className="grid-container">
      {/* Voice Bible */}
      <div className="feature-card group card-purple">
        <div className="card-bg-purple" />
        <div className="icon-wrapper icon-wrapper-purple">
          <Mic className="feature-icon icon-purple" />
        </div>
        <h3 className="card-title">{t("dashboard.vb.title")}</h3>
        <p className="card-subtitle card-subtitle-purple">
          {vbStatusLabel}
        </p>
        <p className="card-info">
          {voiceBibleConnected ? t("dashboard.vb.voiceReady") : t("dashboard.vb.notConnected")}
        </p>
        <button
          className="card-btn card-btn-purple"
          onClick={onStartVoiceBible}
          title={t("dashboard.vb.start")}>
          <Mic className="card-btn-icon" />{" "}
          {voiceBibleStatus === "listening"
            ? t("dashboard.vb.stopListening")
            : t("dashboard.vb.startListening")}
        </button>
      </div>

      {/* Bible */}
      <div className="feature-card group card-blue">
        <div className="card-bg-blue" />
        <div className="icon-wrapper icon-wrapper-blue">
          <BookOpen className="feature-icon icon-blue" />
        </div>
        <h3 className="card-title">{t("dashboard.bible.title")}</h3>
        <p className="card-subtitle card-subtitle-blue">
          {t("dashboard.bible.active", { translation: activeTranslation })}
        </p>
        <p className="card-info">
          {t("dashboard.bible.translationsInstalled", { count: translationCount })}
        </p>
        <button
          className="card-btn card-btn-blue"
          onClick={() => { track("dashboard_card_clicked", { card: "bible" }); onNavigate("/resources?tab=bible"); }}
          title={t("dashboard.bible.open")}>
          <BookOpen className="card-btn-icon" /> {t("dashboard.bible.open")}
        </button>
      </div>

      {/* Worship */}
      <div className="feature-card group card-green">
        <div className="card-bg-green" />
        <div className="icon-wrapper icon-wrapper-green">
          <Music className="feature-icon icon-green" />
        </div>
        <h3 className="card-title">{t("dashboard.worship.title")}</h3>
        <p className="card-subtitle card-subtitle-green">
          {t("dashboard.worship.songs", { count: songCount })}
        </p>
        <p className="card-info">
          {t("dashboard.worship.recentlyUsed", { count: recentSongCount })}
        </p>
        <button
          className="card-btn card-btn-green"
          onClick={() => { track("dashboard_card_clicked", { card: "worship" }); onNavigate("/resources?tab=worship"); }}
          title={t("dashboard.worship.open")}>
          <ListMusic className="card-btn-icon" /> {t("dashboard.worship.open")}
        </button>
      </div>

      {/* Media */}
      <div className="feature-card group card-orange">
        <div className="card-bg-orange" />
        <div className="icon-wrapper icon-wrapper-orange">
          <Images className="feature-icon icon-orange" />
        </div>
        <h3 className="card-title">{t("dashboard.media.title")}</h3>
        <p className="card-subtitle card-subtitle-orange">
          {t("dashboard.media.assets", { count: mediaCount })}
        </p>
        <p className="card-info">
          {t("dashboard.media.recentUploads", { count: recentMediaCount })}
        </p>
        <button
          className="card-btn card-btn-orange"
          onClick={() => { track("dashboard_card_clicked", { card: "media" }); onNavigate("/resources?tab=media"); }}
          title={t("dashboard.media.open")}>
          <Video className="card-btn-icon" /> {t("dashboard.media.open")}
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
  const { t } = useTranslation();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const base = getDockBaseUrl();

  const overlayUrl = `${base}/dock`;
  const lmDockUrl = `${base}/lm-dock`;

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
          <h3 className="urls-title">{t("dashboard.urls.title")}</h3>
          <p className="urls-subtitle">
            {t("dashboard.urls.subtitle")}
          </p>
        </div>
      </div>

      <div className="urls-row">
        <div className="urls-group">
          <div className="url-label-block">
            <span className="url-label-text text-indigo">{t("dashboard.urls.bibleOverlay")}</span>
            <p className="url-label-desc">
              {t("dashboard.urls.bibleOverlayDesc")}
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
              title={t("dashboard.urls.copy")}>
              {copiedId === "overlay" ? (
                <Check className="url-btn-icon" />
              ) : (
                <Copy className="url-btn-icon" />
              )}
              {copiedId === "overlay" ? t("dashboard.urls.copied") : t("dashboard.urls.copy")}
            </button>
          </div>
        </div>

        <div className="urls-group">
          <span className="url-label-text text-green">{t("dashboard.urls.scriptureAssistant")}</span>
          <p className="url-label-desc">
            {t("dashboard.urls.scriptureAssistantDesc")}
          </p>
          <div className="url-input-group">
            <input
              className="url-input input-green"
              readOnly
              value={lmDockUrl}
            />
            <button
              className="url-btn btn-green"
              onClick={() => handleCopy("dock", lmDockUrl)}
              title={t("dashboard.urls.copy")}>
              {copiedId === "dock" ? (
                <Check className="url-btn-icon" />
              ) : (
                <Copy className="url-btn-icon" />
              )}
              {copiedId === "dock" ? t("dashboard.urls.copied") : t("dashboard.urls.copy")}
            </button>
          </div>
        </div>
      </div>

      <div className="urls-info-box">
        <div className="urls-info-header">
          <Info className="urls-info-icon" />
          <span className="urls-info-title">
            {obsConnected
              ? t("dashboard.urls.obsConnectedInfo")
              : t("dashboard.urls.obsNotConnectedInfo")}
          </span>
        </div>
        <button
          className="urls-info-toggle"
          onClick={() => setShowInstructions(!showInstructions)}
          title={t("dashboard.urls.howToAdd")}>
          {showInstructions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="urls-info-subtitle">{t("dashboard.urls.howToAdd")}</span>
        </button>
        {showInstructions && (
          <>
            <ol className="urls-info-list">
              <li>{t("dashboard.urls.step1")}</li>
              <li>{t("dashboard.urls.step2")}</li>
              <li>{t("dashboard.urls.step3")}</li>
              <li>{t("dashboard.urls.step4")}</li>
              <li>{t("dashboard.urls.step5")}</li>
              <li>{t("dashboard.urls.step6")}</li>
            </ol>
            <div className="urls-info-footer">
              <AlertCircle className="urls-info-footer-icon" />
              <span>{t("dashboard.urls.warning")}</span>
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
  const { t } = useTranslation();
  const obsConnected = obsStatus === "connected";
  const vbStatusLabel = useMemo(() => {
    switch (voiceBibleStatus) {
      case "listening":
        return t("dashboard.vb.listening");
      case "connecting":
        return t("dashboard.vb.connecting");
      case "requesting-mic":
        return t("dashboard.vb.requestingMic");
      case "error":
        return t("dashboard.vb.error");
      case "idle":
        return t("dashboard.vb.ready");
      default:
        return t("dashboard.vb.disconnected");
    }
  }, [voiceBibleStatus, t]);

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
            <History className="panel-icon" /> {t("dashboard.activity.recentActivity")}
          </h3>
          <button
            className="btn-view-all"
            onClick={() => onNavigate("/settings")}
            title={t("dashboard.activity.viewAll")}>
            {t("dashboard.activity.viewAll")}
          </button>
        </div>

        <div className="activity-list">
          {activities.length === 0 && (
            <div className="activity-item-last">
              <div className="activity-content">
                <Activity className="activity-icon icon-variant" />
                <p className="activity-text" style={{ color: "var(--text-muted)" }}>
                  {t("dashboard.activity.noActivity")}
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
          <Activity className="panel-icon" /> {t("dashboard.status.systemStatus")}
        </h3>

        <div className="status-grid">
          <div className="status-card">
            <div className="status-card-header">
              <Monitor className="status-card-icon icon-variant" />
              {obsConnected && <span className="status-dot" />}
            </div>
            <div>
              <p className="status-card-title">{t("dashboard.status.obs")}</p>
              <p
                className={`status-card-subtitle ${obsConnected ? "text-secondary-color" : ""
                  }`}
                style={
                  !obsConnected ? { color: "var(--text-muted)" } : undefined
                }
              >
                {obsConnected ? t("dashboard.status.connected") : t("dashboard.status.disconnected")}
              </p>
            </div>
          </div>

          <div className="status-card">
            <div className="status-card-header">
              <MonitorSmartphone className="status-card-icon icon-variant" />
              {dockAvailable && <span className="status-dot" />}
            </div>
            <div>
              <p className="status-card-title">{t("dashboard.status.dock")}</p>
              <p
                className={`status-card-subtitle ${dockAvailable ? "text-secondary-color" : ""
                  }`}
                style={
                  !dockAvailable ? { color: "var(--text-muted)" } : undefined
                }
              >
                {dockAvailable ? t("dashboard.status.connected") : t("dashboard.status.unavailable")}
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
              <p className="status-card-title">{t("dashboard.status.voiceBible")}</p>
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
              <p className="status-card-title">{t("dashboard.status.bible")}</p>
              <p className="status-card-subtitle text-blue-color">
                {t("dashboard.status.installed", { count: translationCount })}
              </p>
            </div>
          </div>

          <div className="status-card">
            <div className="status-card-header">
              <ImageIcon className="status-card-icon text-orange-color" />
            </div>
            <div>
              <p className="status-card-title">{t("dashboard.status.media")}</p>
              <p className="status-card-subtitle text-orange-color">
                {t("dashboard.media.assets", { count: mediaCount })}
              </p>
            </div>
          </div>

          <div className="status-card">
            <div className="status-card-header">
              <Music className="status-card-icon text-green-color" />
            </div>
            <div>
              <p className="status-card-title">{t("dashboard.status.worship")}</p>
              <p className="status-card-subtitle text-green-color">
                {t("dashboard.worship.songs", { count: songCount })}
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
  const { t } = useTranslation();
  const [showMovePluginPrompt, setShowMovePluginPrompt] = useState(false);
  const moveTransitionEnsureAttempt = useRef(false);

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
    detectionSpeed: "sharp",
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
          t("dashboard.activity.translationsInstalled", { count: list.length }),
        );
      }
    });
    getAllSongs().then((songs) => {
      if (songs.length > 0) {
        addActivity(
          Music,
          "icon-green",
          t("dashboard.activity.songsInLibrary", { count: songs.length }),
        );
      }
    });
    getAllMedia().then((items) => {
      if (items.length > 0) {
        addActivity(
          ImageIcon,
          "icon-orange",
          t("dashboard.activity.mediaLoaded", { count: items.length }),
        );
      }
    });

    return () => clearInterval(dockInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, t]);

  // Older installations and users who skipped onboarding still get the
  // bundled Move plugin offer from the dashboard.
  useEffect(() => {
    let active = true;
    getObsMovePluginStatus()
      .then(async (status) => {
        if (active && status.bundled && status.bridgeBundled && (!status.installed || !status.bridgeInstalled)) {
          setShowMovePluginPrompt(true);
        }
        if (active && status.installed && status.bridgeInstalled && obsService.isConnected) {
          const [moveLoaded, bridgeLoaded] = await Promise.all([
            isMovePluginLoaded(),
            isMceBridgeLoaded(),
          ]);
          if (moveLoaded && bridgeLoaded) {
            void ensureMoveTransition();
          }
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, []);

  // Apply the bridge once after OBS becomes available. This keeps the setup
  // automatic without repeatedly replacing a transition during normal use.
  useEffect(() => {
    if (obsStatus !== "connected" || moveTransitionEnsureAttempt.current) return;
    moveTransitionEnsureAttempt.current = true;
    getObsMovePluginStatus()
      .then(async (status) => {
        if (status.installed && status.bridgeInstalled) {
          await ensureMoveTransition();
        }
      })
      .catch(() => { });
  }, [obsStatus]);

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
      addActivity(Monitor, "icon-primary", t("dashboard.activity.obsConnected"));
    } else if (obsStatus === "error") {
      addActivity(Monitor, "icon-variant", t("dashboard.activity.obsError"));
    }
  }, [obsStatus, addActivity, t]);

  // ── Track Voice Bible events ──
  const prevVbStatus = useMemo(() => voiceBible.status, [voiceBible.status]);
  useEffect(() => {
    if (voiceBible.status === "listening" && prevVbStatus !== "listening") {
      addActivity(Mic, "icon", t("dashboard.activity.vbStarted"));
    } else if (voiceBible.status === "idle" && prevVbStatus === "listening") {
      addActivity(Mic, "icon", t("dashboard.activity.vbStopped"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceBible.status]);

  // ── Actions ──
  const handleNavigate = useCallback(
    (path: string) => {
      if (!confirmStopVoiceBibleForPresentation(path)) return;
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

  const handleConnectObs = useCallback(async () => {
    try {
      // If obsService.connect does not exist, replace with appropriate connect/reconnect method.
      await obsService.connect();

      // Give OBS status a moment to update.
      setTimeout(() => {
        if (obsService.status !== "connected") {
          navigate("/settings?tab=obs");
        }
      }, 1500);
    } catch {
      navigate("/settings?tab=obs");
    }
  }, [navigate]);

  return (
    <div className="app-page__inner">
      <OnboardingResumeBanner />

      {/* <AppIdCard /> */}
      <DashboardHeader
        pastorName={pastorName}
        obsStatus={obsStatus}
        dockAvailable={dockAvailable}
        onConnectObs={handleConnectObs}
      />
      <AccountSummaryCards hideInTest />
      <PlanUpgradeBanner />
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
      {/* <RemotePresentationStatus /> */}
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
      {/* <WhatsNewSection /> */}
      {showMovePluginPrompt && (
        <MovePluginInstallModal onClose={() => setShowMovePluginPrompt(false)} />
      )}
    </div>
  );
}
