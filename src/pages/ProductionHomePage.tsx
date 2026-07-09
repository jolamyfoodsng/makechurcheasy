import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  HelpCircle,
  RotateCcw,
  AlertTriangle,
  Crown,
  Coins,
  Calendar,
  Wifi,
  Newspaper,
  Zap,
} from "lucide-react";

import DashboardTutorial, {
  isDashboardTutorialCompleted,
  markDashboardTutorialCompleted,
  resetDashboardTutorial,
} from "./DashboardTutorial";

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
import { getEffectivePlan, getUserPlanLimits, isInTrial, getTrialDaysRemaining } from "../services/licenseService";
import { fetchCreditDetails } from "../services/credits";
import { getCachedSubscription } from "../services/subscriptionCache";
import { getPlanConfig, getPlanLabel } from "../services/planConfig";

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
  onOpenTutorials: () => void;
  onOpenTutorialsWithReset: () => void;
}

function DashboardHeader({
  pastorName,
  obsStatus,
  dockAvailable,
  onConnectObs,
  onOpenTutorials,
  onOpenTutorialsWithReset,
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
      <header className="header-container" data-dt-tutorial="header">
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
            className="btn-secondary"
            onClick={() => onOpenTutorialsWithReset()}
            title={t("dt.button.tooltip")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <HelpCircle size={16} /> {t("dt.button")}
          </button>
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

      <div className="status-panel" data-dt-tutorial="status-panel">
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
        <button className="btn-secondary" onClick={onOpenTutorials} title={t("dashboard.btn.openInNewTab")}>
          <Play className="btn-icon" /> {t("dashboard.btn.watchTutorials")} <ExternalLink className="btn-icon" />
        </button>
      </div>
    </>
  );
}

// ── Dashboard Summary Cards ────────────────────────────────────────────────

interface SummaryCardData {
  plan: string;
  planLabel: string;
  credits: number | null;
  creditsTotal: number;
  deviceLimit: number;
  deviceUnlimited: boolean;
  renewalDate: string | null;
  trialActive: boolean;
  trialDaysLeft: number;
}

function DashboardSummaryCards() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<SummaryCardData | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const plan = getEffectivePlan(user);
        const limits = getUserPlanLimits(user);
        const trial = isInTrial(user);
        const trialDays = getTrialDaysRemaining(user);
        const creditDetails = await fetchCreditDetails();
        const sub = getCachedSubscription();
        const config = await getPlanConfig();
        const planLabel = getPlanLabel(config, plan);

        if (!mounted) return;
        setData({
          plan,
          planLabel,
          credits: creditDetails?.credits ?? null,
          creditsTotal: creditDetails?.planAllocation ?? 0,
          deviceLimit: limits.devices,
          deviceUnlimited: limits.unlimitedDevices,
          renewalDate: sub?.payload?.expiresAt ?? null,
          trialActive: trial,
          trialDaysLeft: trialDays,
        });
      } catch {
        if (!mounted) return;
        setData(null);
      }
    };

    load();
    return () => { mounted = false; };
  }, [user]);

  if (!data) return null;

  const renewalLabel = data.trialActive
    ? t("dashboard.summary.renewalTrial", { date: data.renewalDate ? new Date(data.renewalDate).toLocaleDateString() : `${data.trialDaysLeft}d` })
    : data.renewalDate
      ? t("dashboard.summary.renewalActive", { date: new Date(data.renewalDate).toLocaleDateString() })
      : t("dashboard.summary.renewalNone");

  const creditsLabel = data.credits === null
    ? "—"
    : data.creditsTotal <= 0
      ? t("dashboard.summary.creditsUnlimited")
      : `${data.credits}`;

  const deviceLabel = data.deviceUnlimited
    ? t("dashboard.summary.devicesUnlimited")
    : `${data.deviceLimit}`;

  return (
    <div className="summary-cards" data-dt-tutorial="summary-cards">
      <div className="summary-card summary-card--plan">
        <div className="summary-card-icon-wrap summary-card-icon--plan">
          <Crown size={18} />
        </div>
        <div className="summary-card-body">
          <span className="summary-card-label">{t("dashboard.summary.plan")}</span>
          <span className="summary-card-value">{data.planLabel || t("dashboard.summary.planFree")}</span>
          <span className="summary-card-sub">
            {data.trialActive
              ? t("dashboard.summary.planTrial") + ` — ${data.trialDaysLeft}d`
              : t("dashboard.summary.planSubtitle")}
          </span>
        </div>
      </div>

      <div className="summary-card summary-card--credits">
        <div className="summary-card-icon-wrap summary-card-icon--credits">
          <Coins size={18} />
        </div>
        <div className="summary-card-body">
          <span className="summary-card-label">{t("dashboard.summary.credits")}</span>
          <span className="summary-card-value">{creditsLabel}</span>
          <span className="summary-card-sub">
            {data.creditsTotal > 0
              ? t("dashboard.summary.creditsOf", { used: data.creditsTotal })
              : t("dashboard.summary.creditsSubtitle")}
          </span>
        </div>
      </div>

      <div className="summary-card summary-card--devices">
        <div className="summary-card-icon-wrap summary-card-icon--devices">
          <MonitorSmartphone size={18} />
        </div>
        <div className="summary-card-body">
          <span className="summary-card-label">{t("dashboard.summary.devices")}</span>
          <span className="summary-card-value">{deviceLabel}</span>
          <span className="summary-card-sub">
            {data.deviceUnlimited
              ? t("dashboard.summary.devicesUnlimited")
              : t("dashboard.summary.devicesSubtitle", { limit: data.deviceLimit })}
          </span>
        </div>
      </div>

      <div className="summary-card summary-card--renewal">
        <div className="summary-card-icon-wrap summary-card-icon--renewal">
          <Calendar size={18} />
        </div>
        <div className="summary-card-body">
          <span className="summary-card-label">{t("dashboard.summary.renewal")}</span>
          <span className="summary-card-value summary-card-value--renewal">{renewalLabel}</span>
          <span className="summary-card-sub">{t("dashboard.summary.renewalSubtitle")}</span>
        </div>
      </div>
    </div>
  );
}

// ── Monthly Usage Widget ────────────────────────────────────────────────────

interface UsageItem {
  icon: typeof Mic;
  label: string;
  used: number;
  limit: number;
  color: string;
}

function MonthlyUsageWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<UsageItem[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const limits = getUserPlanLimits(user);
        const creditDetails = await fetchCreditDetails();
        const creditsUsed = creditDetails?.totalConsumed ?? 0;
        const creditsTotal = creditDetails?.planAllocation ?? 0;

        if (!mounted) return;
        setItems([
          {
            icon: BookOpen,
            label: t("dashboard.monthlyUsage.translation"),
            used: 0,
            limit: limits.translation ? -1 : 0,
            color: "var(--accent-blue)",
          },
          {
            icon: Zap,
            label: t("dashboard.monthlyUsage.aiSummary"),
            used: 0,
            limit: limits.aiFeatures ? -1 : 0,
            color: "var(--primary)",
          },
          {
            icon: Mic,
            label: t("dashboard.monthlyUsage.speechToScripture"),
            used: 0,
            limit: limits.speechToScripture ? -1 : 0,
            color: "var(--success)",
          },
          {
            icon: Coins,
            label: t("dashboard.monthlyUsage.creditsUsed"),
            used: creditsUsed,
            limit: creditsTotal,
            color: "var(--accent-orange)",
          },
        ]);
      } catch {
        if (!mounted) return;
      }
    };

    load();
    return () => { mounted = false; };
  }, [user, t]);

  if (items.length === 0) return null;

  return (
    <div className="panel usage-widget" data-dt-tutorial="monthly-usage">
      <h3 className="panel-title">
        <Activity className="panel-icon" /> {t("dashboard.monthlyUsage.title")}
      </h3>
      <div className="usage-grid">
        {items.map((item) => {
          const IconComp = item.icon;
          const isUnlimited = item.limit === -1;
          const pct = isUnlimited ? 0 : item.limit > 0 ? Math.min((item.used / item.limit) * 100, 100) : 0;

          return (
            <div key={item.label} className="usage-item">
              <div className="usage-item-header">
                <IconComp size={14} style={{ color: item.color }} />
                <span className="usage-item-label">{item.label}</span>
              </div>
              <div className="usage-bar-track">
                <div
                  className="usage-bar-fill"
                  style={{ width: `${pct}%`, backgroundColor: item.color }}
                />
              </div>
              <span className="usage-item-value">
                {isUnlimited
                  ? t("dashboard.monthlyUsage.unlimited")
                  : item.limit > 0
                    ? `${item.used} / ${item.limit}`
                    : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Remote Presentation Status ─────────────────────────────────────────────

function RemotePresentationStatus() {
  const { t } = useTranslation();
  const mockConnected = true;
  const mockDeviceCount = 2;

  return (
    <div className="panel remote-panel" data-dt-tutorial="remote-status">
      <div className="remote-header">
        <div className="remote-header-left">
          <Wifi size={18} className="remote-icon" />
          <h3 className="panel-title" style={{ marginBottom: 0 }}>{t("dashboard.remote.title")}</h3>
        </div>
        <span className={`remote-badge ${mockConnected ? "remote-badge--connected" : "remote-badge--disconnected"}`}>
          {mockConnected ? t("dashboard.remote.connected") : t("dashboard.remote.disconnected")}
        </span>
      </div>
      <div className="remote-body">
        <p className="remote-detail">
          {mockConnected
            ? t("dashboard.remote.devicesActive", { count: mockDeviceCount })
            : t("dashboard.remote.noDevices")}
        </p>
        <p className="remote-hint">{t("dashboard.remote.controlHint")}</p>
      </div>
    </div>
  );
}

// ── What's New Section ─────────────────────────────────────────────────────

function WhatsNewSection() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="panel whatsnew-panel" data-dt-tutorial="whats-new">
      <div className="whatsnew-header">
        <div className="whatsnew-header-left">
          <Newspaper size={18} className="whatsnew-icon" />
          <h3 className="panel-title" style={{ marginBottom: 0 }}>{t("dashboard.whatsNew.title")}</h3>
          <span className="whatsnew-badge">{t("dashboard.whatsNew.version", { version: "2.4" })}</span>
        </div>
        <button className="whatsnew-dismiss" onClick={() => setDismissed(true)} title={t("dashboard.whatsNew.dismiss")}>
          ✕
        </button>
      </div>
      <div className="whatsnew-body">
        <ul className="whatsnew-list">
          <li>{t("dashboard.monthlyUsage.title")} — track your AI and credit usage at a glance</li>
          <li>Remote Presentation — control slides from any device</li>
          <li>Dashboard summary cards — plan, credits, devices, renewal at a glance</li>
        </ul>
        <div className="whatsnew-footer">
          <a className="whatsnew-link" href="https://github.com/MakeChurchEasy/makechurcheasy/releases" target="_blank" rel="noreferrer" title={t("dashboard.whatsNew.readMore")}>
            {t("dashboard.whatsNew.readMore")}
          </a>
        </div>
      </div>
    </div>
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
    <div className="grid-container" data-dt-tutorial="feature-grid">
      {/* Voice Bible */}
      <div className="feature-card group card-purple" data-dt-tutorial="voice-bible">
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
    detectionSpeed: "balanced",
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

  // ── Tutorial state ──
  const [tourActive, setTourActive] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

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

  // ── Auto-start tutorial on first visit ──
  useEffect(() => {
    if (!isDashboardTutorialCompleted() && !tourActive) {
      const timer = setTimeout(() => setTourActive(true), 600);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleOpenTutorials = useCallback(() => {
    track("tutorial_modal_opened");
    openUrl("https://www.youtube.com/watch?v=08UjSYtjmLU");
  }, []);

  return (
    <div className="app-page__inner">
      <OnboardingResumeBanner />

      {/* ── Incomplete tutorial banner ── */}
      {!tourActive && !isDashboardTutorialCompleted() && !bannerDismissed && (
        <div className="tst-tutorial-banner" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} />
          <span>{t("dt.banner")}</span>
          <div className="tst-tutorial-banner-actions">
            <button className="tst-banner-btn tst-banner-btn--primary" onClick={() => setTourActive(true)}>
              {t("dt.banner.continue")}
            </button>
            <button className="tst-banner-btn" onClick={() => { resetDashboardTutorial(); setTourActive(true); setBannerDismissed(false); }}>
              <RotateCcw size={12} /> {t("dt.banner.restart")}
            </button>
            <button className="tst-banner-btn" onClick={() => setBannerDismissed(true)}>
              {t("dt.banner.dismiss")}
            </button>
          </div>
        </div>
      )}

      {/* <AppIdCard /> */}
      <DashboardHeader
        pastorName={pastorName}
        obsStatus={obsStatus}
        dockAvailable={dockAvailable}
        onConnectObs={handleConnectObs}
        onOpenTutorials={handleOpenTutorials}
        onOpenTutorialsWithReset={() => {
          resetDashboardTutorial();
          setTourActive(true);
          setBannerDismissed(false);
        }}
      />
      <DashboardSummaryCards />
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
      <MonthlyUsageWidget />
      <div data-dt-tutorial="connection-urls">
        <ConnectionUrls obsStatus={obsStatus} />
      </div>
      <RemotePresentationStatus />
      <div data-dt-tutorial="activity-log">
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
      </div>
      <WhatsNewSection />
      <TutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
      />
      <DashboardTutorial
        isActive={tourActive}
        onClose={() => setTourActive(false)}
        onFinish={() => { markDashboardTutorialCompleted(); setTourActive(false); }}
      />
    </div>
  );
}
