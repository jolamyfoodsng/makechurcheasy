/**
 * UpgradeModal.tsx — Reusable upgrade prompt
 *
 * Shows when a free user hits a restriction. Displays what plan is needed
 * and what features that plan unlocks. Used by gating wrappers throughout the app.
 */

import { Award, Crown, Music, ArrowRight, Tag, Zap, Lock } from "lucide-react";
import Icon from "./Icon";
import type { PlanTier } from "../services/licenseService";

const PLAN_DISPLAY: Record<PlanTier, { label: string; color: string }> = {
  free: { label: "Free", color: "#8a8a8a" },
  trial: { label: "Trial", color: "#7b68ee" },
  basic: { label: "Basic", color: "#5b9bd5" },
  growth: { label: "Growth", color: "#c55a11" },
  pro: { label: "Pro", color: "#7b68ee" },
  ambassador: { label: "Ambassador", color: "#d4af37" },
};

type PlanFeatureRow = Record<PlanTier, string>;

const PLAN_FEATURES: Record<string, PlanFeatureRow> = {
  songs: { free: "3 songs", trial: "∞ songs", basic: "70 songs", growth: "∞ songs", pro: "∞ songs", ambassador: "∞ songs" },
  images: { free: "3 images", trial: "∞ images", basic: "70 images", growth: "∞ images", pro: "∞ images", ambassador: "∞ images" },
  videos: { free: "3 videos", trial: "∞ videos", basic: "70 videos", growth: "∞ videos", pro: "∞ videos", ambassador: "∞ videos" },
  bibleVersions: { free: "3 versions", trial: "∞ versions", basic: "10 versions", growth: "∞ versions", pro: "∞ versions", ambassador: "∞ versions" },
  themes: { free: "2 themes", trial: "∞ themes", basic: "3 themes", growth: "∞ themes", pro: "∞ themes", ambassador: "∞ themes" },
  patterns: { free: "0 patterns", trial: "∞ patterns", basic: "3 patterns", growth: "∞ patterns", pro: "∞ patterns", ambassador: "∞ patterns" },
  lowerThirdThemes: { free: "1 theme", trial: "∞ themes", basic: "2 themes", growth: "∞ themes", pro: "∞ themes", ambassador: "∞ themes" },
  devices: { free: "1 device", trial: "∞ devices", basic: "5 devices", growth: "∞ devices", pro: "∞ devices", ambassador: "∞ devices" },
  easyWorshipImport: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  proPresenterImport: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  massImport: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  translation: { free: "—", trial: "✓", basic: "✓", growth: "✓", pro: "✓", ambassador: "✓" },
  multiview: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  tickers: { free: "—", trial: "✓", basic: "✓", growth: "✓", pro: "✓", ambassador: "✓" },
  speechToScripture: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  sermonExport: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  aiFeatures: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  cloudFeatures: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  advancedAnalytics: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  customReports: { free: "—", trial: "✓", basic: "—", growth: "—", pro: "✓", ambassador: "✓" },
  unlimitedDevices: { free: "1 device", trial: "∞", basic: "5 devices", growth: "∞", pro: "∞", ambassador: "∞" },
  unlimitedMultiview: { free: "—", trial: "∞", basic: "—", growth: "∞", pro: "∞", ambassador: "∞" },
  mobileControl: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  apiAccess: { free: "—", trial: "✓", basic: "—", growth: "—", pro: "✓", ambassador: "✓" },
  teamManagement: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓" },
  campusManagement: { free: "—", trial: "✓", basic: "—", growth: "—", pro: "✓", ambassador: "✓" },
  cloudStorageGB: { free: "0 GB", trial: "∞", basic: "1 GB", growth: "20 GB", pro: "200 GB", ambassador: "200 GB" },
};

const FEATURE_ICONS: Record<string, typeof Music> = {
  songs: Music,
  images: Music,
  videos: Music,
};

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  feature: string;
  requiredPlan: PlanTier;
  currentPlan: PlanTier;
  message?: string;
}

export function UpgradeModal({
  open,
  onClose,
  feature,
  requiredPlan,
  currentPlan,
  message,
}: UpgradeModalProps) {
  if (!open) return null;

  const required = PLAN_DISPLAY[requiredPlan];
  const current = PLAN_DISPLAY[currentPlan];
  const featureData = PLAN_FEATURES[feature];
  const FeatureIcon = FEATURE_ICONS[feature] || Music;
  const isDark = !document.documentElement.classList.contains("light");

  return (
    <div className="ssm-backdrop" onClick={onClose}>
      <div
        className="ssm-modal"
        style={{ maxWidth: 620 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button className="um-close" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close" size={20} />
        </button>

        {/* Header */}
        <div className="um-header">
          <div className="um-icon">
            {isDark ? <Crown size={32} strokeWidth={2.5} /> : <Award size={32} strokeWidth={2.5} />}
          </div>
          <div className="um-header-text">
            <h1 className="um-title">Upgrade Required</h1>
            <p className="um-subtitle">
              {message || `${feature} requires the ${required.label} plan or higher.`}
            </p>
            <p className="um-subtitle">
              Upgrade to create more {feature} and unlock powerful features.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="um-body">
          {/* Plan cards */}
          <div className="um-plan-cards">
            <div className="um-plan-card">
              <div className="um-plan-label">Your Plan</div>
              <div className="um-plan-details">
                <div>
                  <div className="um-plan-name" style={{ color: current.color }}>{current.label}</div>
                  {featureData && (
                    <div className="um-plan-limit">{featureData[currentPlan]}</div>
                  )}
                </div>
                <span className="um-badge um-badge-current">Current</span>
              </div>
            </div>

            <div className="um-plan-card um-plan-card--recommended">
              <div className="um-plan-label um-plan-label--recommended">Recommended Plan</div>
              <div className="um-plan-details">
                <div>
                  <div className="um-plan-name um-plan-name--recommended">{required.label}</div>
                  {featureData && (
                    <div className="um-plan-limit">{featureData[requiredPlan]}</div>
                  )}
                </div>
                <span className="um-badge um-badge-rec">Next Step</span>
              </div>
            </div>
          </div>

          {/* Limits table */}
          {featureData && (
            <div className="um-limits-table">
              <div className="um-table-header">
                <FeatureIcon size={16} />
                <span>{feature} Limits by Plan</span>
              </div>

              {(["free", "basic", "growth", "pro", "ambassador"] as PlanTier[]).map((plan) => {
                const display = PLAN_DISPLAY[plan];
                const val = featureData[plan];
                const isRequired = plan === requiredPlan;
                const isCurrent = plan === currentPlan;
                return (
                  <div
                    key={plan}
                    className={`um-table-row${isRequired ? " um-table-row--active" : ""}`}
                  >
                    <div className="um-row-left">
                      {isRequired && <ArrowRight size={16} className="um-arrow-icon" />}
                      <span>{display.label}</span>
                      {isCurrent && <span className="um-badge um-badge-current">Current</span>}
                      {isRequired && <span className="um-badge um-badge-rec">Recommended</span>}
                    </div>
                    <span className={val === "∞" ? "um-unlimited" : undefined}>{val}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Promo banner */}
          <div className="um-promo-banner">
            <div className="um-promo-icon-wrap">
              <div className="um-promo-icon">
                <Tag size={24} />
              </div>
              <span className="um-limited-tag">Limited Time</span>
            </div>

            <div className="um-promo-content">
              <div className="um-promo-price-info">
                <span className="um-promo-text">Upgrade to {required.label} for as low as</span>
                <div className="um-price-row">
                  <span className="um-current-price">$4.99</span>
                  <span className="um-old-price">$9.99</span>
                </div>
                <span className="um-promo-note">First month only</span>
              </div>

              <div className="um-promo-divider" />

              <div className="um-promo-renewal">
                <span className="um-renewal-price">Then <strong>$9.99</strong> / month</span>
                <span className="um-renewal-note">Cancel anytime. No hidden fees.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="ssm-footer">
          <button className="ssm-btn-cancel" onClick={onClose} title="Maybe Later">
            Maybe Later
          </button>
          <div className="um-footer-actions">
            <button
              className="ssm-btn-start"
              onClick={() => {
                window.open("https://makechurcheasy.creatorstudioslabs.stream/pricing", "_blank");
              }}
              title="Start">
              <Zap size={18} />
              <div className="um-btn-text">
                <span>Upgrade to {required.label}</span>
                <span className="um-btn-subtitle">Start for $4.99 first month</span>
              </div>
            </button>
            <div className="um-secure-note">
              <Lock size={12} /> Secure checkout · Cancel anytime
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UpgradeModal;
