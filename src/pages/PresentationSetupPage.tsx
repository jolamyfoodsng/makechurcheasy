/**
 * PresentationSetupPage.tsx — Presentation Mode setup
 *
 * First screen users see when opening Presentation Mode.
 * Configures output routing before presenting content.
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle,
  Copy,
  ExternalLink,
  Globe,
  Monitor,
  RefreshCw,
  RotateCcw,
  Star,
  Tv,
  Users,
} from "lucide-react";
import {
  type PresentationOutputMode,
  type PresentationRoute,
  type PresentationSettings,
  getPresentationSettings,
  savePresentationSettings,
  regenerateSession,
  applyPreset,
  type PresentationPreset,
  ROUTE_CONTENT_TYPES,
  ROUTE_OPTIONS,
} from "../services/presentationSettings";
import { obsService } from "../services/obsService";

import "./PresentationSetupPage.css";

// ── Section Header ─────────────────────────────────────────────────────────

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="ps-section-header">
      <span className="ps-section-number">{number}</span>
      <h3 className="ps-section-title">{title}</h3>
    </div>
  );
}

// ── Output Mode Cards ──────────────────────────────────────────────────────

interface OutputModeCardsProps {
  selected: PresentationOutputMode;
  onSelect: (mode: PresentationOutputMode) => void;
}

function OutputModeCards({ selected, onSelect }: OutputModeCardsProps) {
  const { t } = useTranslation();

  const cards: {
    mode: PresentationOutputMode;
    icon: typeof Monitor;
    title: string;
    desc: string;
    recommended?: boolean;
  }[] = [
    {
      mode: "local-obs",
      icon: Monitor,
      title: t("ps.outputMode.localObs"),
      desc: t("ps.outputMode.localObsDesc"),
    },
    {
      mode: "remote-presentation",
      icon: Globe,
      title: t("ps.outputMode.remote"),
      desc: t("ps.outputMode.remoteDesc"),
    },
    {
      mode: "both",
      icon: Tv,
      title: t("ps.outputMode.both"),
      desc: t("ps.outputMode.bothDesc"),
      recommended: true,
    },
  ];

  return (
    <div className="ps-output-cards">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = selected === card.mode;
        return (
          <button
            key={card.mode}
            className={`ps-output-card${isActive ? " ps-output-card--active" : ""}`}
            onClick={() => onSelect(card.mode)}
            title={card.title}
          >
            {card.recommended && (
              <span className="ps-badge ps-badge--recommended">
                <Star size={10} /> {t("ps.recommended")}
              </span>
            )}
            <div className="ps-output-card-icon">
              <Icon size={24} />
            </div>
            <h4 className="ps-output-card-title">{card.title}</h4>
            <p className="ps-output-card-desc">{card.desc}</p>
            {isActive && (
              <div className="ps-output-card-check">
                <Check size={14} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Local OBS Configuration ────────────────────────────────────────────────

interface LocalObsConfigProps {
  settings: PresentationSettings;
  onUpdate: (patch: Partial<PresentationSettings>) => void;
}

function LocalObsConfig({ settings, onUpdate }: LocalObsConfigProps) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const obsStatus = obsService.status;

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await obsService.connect(
        `ws://${settings.obsHost}:${settings.obsPort}`,
        settings.obsPassword || undefined,
      );
      setTimeout(() => {
        const connected = obsService.status === "connected";
        setTestResult({
          ok: connected,
          message: connected ? t("ps.obs.connected") : t("ps.obs.disconnected"),
        });
        onUpdate({ obsConnected: connected });
        setTesting(false);
      }, 1500);
    } catch {
      setTestResult({ ok: false, message: t("ps.obs.disconnected") });
      onUpdate({ obsConnected: false });
      setTesting(false);
    }
  }, [settings.obsHost, settings.obsPort, settings.obsPassword, onUpdate, t]);

  const isConnected = obsStatus === "connected";

  return (
    <div className="ps-config-card">
      <div className="ps-config-card-header">
        <Monitor size={16} />
        <span>{t("ps.obs.title")}</span>
        <span className={`ps-status-dot${isConnected ? " ps-status-dot--green" : " ps-status-dot--red"}`} />
      </div>

      <div className="ps-form-row">
        <div className="ps-form-group">
          <label className="ps-label">{t("ps.obs.host")}</label>
          <input
            className="ps-input"
            value={settings.obsHost}
            onChange={(e) => onUpdate({ obsHost: e.target.value })}
            placeholder="127.0.0.1"
          />
        </div>
        <div className="ps-form-group">
          <label className="ps-label">{t("ps.obs.port")}</label>
          <input
            className="ps-input"
            value={settings.obsPort}
            onChange={(e) => onUpdate({ obsPort: e.target.value })}
            placeholder="4455"
          />
        </div>
      </div>

      <div className="ps-form-group">
        <label className="ps-label">{t("ps.obs.password")}</label>
        <input
          className="ps-input"
          type="password"
          value={settings.obsPassword}
          onChange={(e) => onUpdate({ obsPassword: e.target.value })}
          placeholder={t("ps.obs.passwordPlaceholder")}
        />
      </div>

      <button
        className="ps-btn ps-btn--secondary"
        onClick={handleTest}
        disabled={testing}
        title={t("ps.obs.testConnection")}
      >
        {testing ? (
          <>
            <RefreshCw size={14} className="ps-spin" />
            {t("ps.obs.testing")}
          </>
        ) : (
          <>
            <CheckCircle size={14} />
            {t("ps.obs.testConnection")}
          </>
        )}
      </button>

      {testResult && (
        <p className={`ps-test-result${testResult.ok ? " ps-test-result--ok" : " ps-test-result--err"}`}>
          {testResult.ok ? "✓" : "✗"} {testResult.message}
        </p>
      )}
    </div>
  );
}

// ── Remote Presentation Config ─────────────────────────────────────────────

interface RemoteConfigProps {
  settings: PresentationSettings;
  onUpdate: (patch: Partial<PresentationSettings>) => void;
}

function RemoteConfig({ settings, onUpdate }: RemoteConfigProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(settings.presentationLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [settings.presentationLink]);

  const handleOpen = useCallback(() => {
    window.open(settings.presentationLink, "_blank");
  }, [settings.presentationLink]);

  const handleRegenerate = useCallback(() => {
    const updated = regenerateSession();
    onUpdate({
      sessionId: updated.sessionId,
      presentationLink: updated.presentationLink,
      connectedViewers: 0,
    });
  }, [onUpdate]);

  return (
    <div className="ps-config-card">
      <div className="ps-config-card-header">
        <Globe size={16} />
        <span>{t("ps.remote.title")}</span>
      </div>

      <label className="ps-label">{t("ps.remote.presentationLink")}</label>
      <div className="ps-link-row">
        <input
          className="ps-input ps-input--link"
          readOnly
          value={settings.presentationLink}
        />
        <button
          className="ps-btn ps-btn--small"
          onClick={handleCopy}
          title={t("ps.remote.copyLink")}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          className="ps-btn ps-btn--small"
          onClick={handleOpen}
          title={t("ps.remote.open")}
        >
          <ExternalLink size={14} />
        </button>
        <button
          className="ps-btn ps-btn--small"
          onClick={handleRegenerate}
          title={t("ps.remote.regenerate")}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="ps-viewers">
        <Users size={14} />
        <span>{t("ps.remote.viewers")}: {settings.connectedViewers}</span>
      </div>
    </div>
  );
}

// ── Quick Presets ──────────────────────────────────────────────────────────

interface QuickPresetsProps {
  onApply: (preset: PresentationPreset) => void;
}

function QuickPresets({ onApply }: QuickPresetsProps) {
  const { t } = useTranslation();

  const presets: { id: PresentationPreset; label: string; desc: string }[] = [
    { id: "projector-stream", label: t("ps.presets.projectorStream"), desc: t("ps.presets.projectorStreamDesc") },
    { id: "obs-only", label: t("ps.presets.obsOnly"), desc: t("ps.presets.obsOnlyDesc") },
    { id: "remote-only", label: t("ps.presets.remoteOnly"), desc: t("ps.presets.remoteOnlyDesc") },
  ];

  return (
    <div className="ps-presets">
      {presets.map((p) => (
        <button
          key={p.id}
          className="ps-preset-btn"
          onClick={() => onApply(p.id)}
          title={p.desc}
        >
          <span className="ps-preset-label">{p.label}</span>
          <span className="ps-preset-desc">{p.desc}</span>
        </button>
      ))}
    </div>
  );
}

// ── Routing Table ──────────────────────────────────────────────────────────

interface RoutingTableProps {
  routes: PresentationSettings["routes"];
  onChange: (routes: Partial<PresentationSettings["routes"]>) => void;
}

function RoutingTable({ routes, onChange }: RoutingTableProps) {
  const handleRouteChange = useCallback(
    (key: keyof PresentationSettings["routes"], value: PresentationRoute) => {
      onChange({ [key]: value });
    },
    [onChange],
  );

  return (
    <div className="ps-routing-table">
      {ROUTE_CONTENT_TYPES.map((item) => (
        <div className="ps-routing-row" key={item.key}>
          <span className="ps-routing-label">{item.label}</span>
          <div className="ps-routing-select-wrap">
            <select
              className="ps-select"
              value={routes[item.key]}
              onChange={(e) => handleRouteChange(item.key, e.target.value as PresentationRoute)}
            >
              {ROUTE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Preview Diagram ────────────────────────────────────────────────────────

interface PreviewDiagramProps {
  settings: PresentationSettings;
}

function PreviewDiagram({ settings }: PreviewDiagramProps) {
  const { t } = useTranslation();

  const routeLabels: Record<PresentationRoute, string> = {
    disabled: t("ps.routing.disabled"),
    "local-obs": "Local OBS",
    "remote-presentation": "Remote",
    both: "Both",
  };

  const routeColors: Record<PresentationRoute, string> = {
    disabled: "var(--text-muted)",
    "local-obs": "#3B82F6",
    "remote-presentation": "#8B5CF6",
    both: "#F59E0B",
  };

  return (
    <div className="ps-preview">
      <div className="ps-preview-header">
        <span className="ps-preview-title">MakeChurchEasy</span>
      </div>
      <div className="ps-preview-tree">
        {ROUTE_CONTENT_TYPES.map((item) => {
          const route = settings.routes[item.key];
          return (
            <div className="ps-preview-branch" key={item.key}>
              <div className="ps-preview-connector" />
              <span className="ps-preview-item">{item.label}</span>
              <span className="ps-preview-arrow">↓</span>
              <span
                className="ps-preview-target"
                style={{ color: routeColors[route] }}
              >
                {routeLabels[route]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function PresentationSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<PresentationSettings>(() =>
    getPresentationSettings(),
  );

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleUpdate = useCallback((patch: Partial<PresentationSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...patch };
      savePresentationSettings(updated);
      return updated;
    });
  }, []);

  const handleRoutesChange = useCallback((routes: Partial<PresentationSettings["routes"]>) => {
    setSettings((prev) => {
      const updated = { ...prev, routes: { ...prev.routes, ...routes } };
      savePresentationSettings(updated);
      return updated;
    });
  }, []);

  const handleOutputModeSelect = useCallback((mode: PresentationOutputMode) => {
    const localObs = mode === "local-obs" || mode === "both";
    const remote = mode === "remote-presentation" || mode === "both";
    handleUpdate({
      outputMode: mode,
      localObsEnabled: localObs,
      remotePresentationEnabled: remote,
    });
  }, [handleUpdate]);

  const handleApplyPreset = useCallback((preset: PresentationPreset) => {
    const updated = applyPreset(preset);
    setSettings(updated);
  }, []);

  const handleContinue = useCallback(() => {
    savePresentationSettings(settings);
    navigate("/presentation/console");
  }, [settings, navigate]);

  const showObs = settings.outputMode === "local-obs" || settings.outputMode === "both";
  const showRemote = settings.outputMode === "remote-presentation" || settings.outputMode === "both";

  // ── Section Number ───────────────────────────────────────────────────

  let sectionNum = 1;

  return (
    <div className="ps-page">
      <div className="ps-container">
        {/* ── Header ── */}
        <div className="ps-header">
          <h1 className="ps-title">{t("ps.title")}</h1>
          <p className="ps-subtitle">{t("ps.subtitle")}</p>
        </div>

        {/* ── Section 1: Output Method ── */}
        <div className="ps-section">
          <SectionHeader number={sectionNum++} title={t("ps.section.outputMethod")} />
          <OutputModeCards selected={settings.outputMode} onSelect={handleOutputModeSelect} />
        </div>

        {/* ── Section 2: Local OBS Config ── */}
        {showObs && (
          <div className="ps-section">
            <SectionHeader number={sectionNum++} title={t("ps.section.obsConfig")} />
            <LocalObsConfig settings={settings} onUpdate={handleUpdate} />
          </div>
        )}

        {/* ── Section 3: Remote Config ── */}
        {showRemote && (
          <div className="ps-section">
            <SectionHeader number={sectionNum++} title={t("ps.section.remoteConfig")} />
            <RemoteConfig settings={settings} onUpdate={handleUpdate} />
          </div>
        )}

        {/* ── Section 4: Quick Presets ── */}
        <div className="ps-section">
          <SectionHeader number={sectionNum++} title={t("ps.section.quickPresets")} />
          <QuickPresets onApply={handleApplyPreset} />
        </div>

        {/* ── Section 5: Routing Table ── */}
        <div className="ps-section">
          <SectionHeader number={sectionNum++} title={t("ps.section.routing")} />
          <RoutingTable routes={settings.routes} onChange={handleRoutesChange} />
        </div>

        {/* ── Section 6: Preview Diagram ── */}
        <div className="ps-section">
          <SectionHeader number={sectionNum++} title={t("ps.section.preview")} />
          <PreviewDiagram settings={settings} />
        </div>

        {/* ── Continue Button ── */}
        <div className="ps-footer">
          <button
            className="ps-btn ps-btn--primary ps-btn--large"
            onClick={handleContinue}
            title={t("ps.continue")}
          >
            {t("ps.continue")}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
