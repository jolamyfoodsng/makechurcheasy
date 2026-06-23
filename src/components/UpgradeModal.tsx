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
  basic: { label: "Basic", color: "#5b9bd5" },
  starter: { label: "Starter", color: "#70ad47" },
  growth: { label: "Growth", color: "#c55a11" },
  pro: { label: "Pro", color: "#7b68ee" },
};

type PlanFeatureRow = Record<PlanTier, string>;

const PLAN_FEATURES: Record<string, PlanFeatureRow> = {
  songs: { free: "3 songs", basic: "30 songs", starter: "∞ songs", growth: "∞ songs", pro: "∞ songs" },
  images: { free: "2 images", basic: "20 images", starter: "∞ images", growth: "∞ images", pro: "∞ images" },
  videos: { free: "1 video", basic: "10 videos", starter: "∞ videos", growth: "∞ videos", pro: "∞ videos" },
  bibleVersions: { free: "4 versions", basic: "20 versions", starter: "∞ versions", growth: "∞ versions", pro: "∞ versions" },
  themes: { free: "1 theme", basic: "3 themes", starter: "10 themes", growth: "∞ themes", pro: "∞ themes" },
  patterns: { free: "1 pattern", basic: "3 patterns", starter: "10 patterns", growth: "∞ patterns", pro: "∞ patterns" },
  lowerThirdThemes: { free: "1 theme", basic: "1 theme", starter: "10 themes", growth: "∞ themes", pro: "∞ themes" },
  devices: { free: "1 device", basic: "2 devices", starter: "5 devices", growth: "∞ devices", pro: "∞ devices" },
  easyWorshipImport: { free: "—", basic: "—", starter: "✓", growth: "✓", pro: "✓" },
  proPresenterImport: { free: "—", basic: "—", starter: "✓", growth: "✓", pro: "✓" },
  massImport: { free: "—", basic: "—", starter: "✓", growth: "✓", pro: "✓" },
  translation: { free: "—", basic: "—", starter: "✓", growth: "✓", pro: "✓" },
  multiview: { free: "—", basic: "—", starter: "✓ (limited)", growth: "✓", pro: "✓" },
  tickers: { free: "—", basic: "—", starter: "✓", growth: "✓", pro: "✓" },
  speechToScripture: { free: "—", basic: "—", starter: "✓", growth: "✓", pro: "✓" },
  sermonExport: { free: "—", basic: "—", starter: "✓", growth: "✓", pro: "✓" },
  aiFeatures: { free: "—", basic: "—", starter: "—", growth: "✓", pro: "✓" },
  cloudFeatures: { free: "—", basic: "—", starter: "—", growth: "✓", pro: "✓" },
  advancedAnalytics: { free: "—", basic: "—", starter: "—", growth: "✓", pro: "✓" },
  customReports: { free: "—", basic: "—", starter: "—", growth: "—", pro: "✓" },
  unlimitedDevices: { free: "1 device", basic: "2 devices", starter: "5 devices", growth: "∞", pro: "∞" },
  unlimitedMultiview: { free: "—", basic: "—", starter: "limited", growth: "∞", pro: "∞" },
  mobileControl: { free: "—", basic: "—", starter: "—", growth: "—", pro: "✓" },
  apiAccess: { free: "—", basic: "—", starter: "—", growth: "—", pro: "✓" },
  teamManagement: { free: "—", basic: "—", starter: "—", growth: "—", pro: "✓" },
  campusManagement: { free: "—", basic: "—", starter: "—", growth: "—", pro: "✓" },
  cloudStorageGB: { free: "0 GB", basic: "1 GB", starter: "5 GB", growth: "20 GB", pro: "∞" },
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
        <button className="um-close" onClick={onClose} aria-label="Close">
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

              {(["free", "basic", "starter", "growth", "pro"] as PlanTier[]).map((plan) => {
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
          <button className="ssm-btn-cancel" onClick={onClose}>
            Maybe Later
          </button>
          <div className="um-footer-actions">
            <button
              className="ssm-btn-start"
              onClick={() => {
                window.open("https://makechurcheasy.com/pricing", "_blank");
              }}
            >
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
