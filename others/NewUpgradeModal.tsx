import "./NewUpgradeModal.css";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cloud,
  Crown,
  FolderInput,
  Image as ImageIcon,
  LayoutTemplate,
  Monitor,
  Music,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Video,
  WandSparkles,
  X,
} from "lucide-react";

import { useCountryPricing } from "../src/hooks/useCountryPricing";
import {
  getPlanConfig,
  readPlanConfigCache,
} from "../src/services/planConfig";
import {
  DEFAULT_PLAN_CONFIG,
  FEATURE_LABELS,
  type FeatureKey,
  type PlanConfig,
  type PlanEntitlements,
  type PlanTier,
} from "../src/services/planConfigTypes";
import { normalizePlanId } from "../src/lib/subscriptionSourceOfTruth";

const PRICING_URL = "https://makechurcheasy.creatorstudioslabs.stream/pricing";
const PLAN_ORDER: Array<"free" | "basic" | "growth" | "pro"> = ["free", "basic", "growth", "pro"];

const PLAN_THEMES: Record<"free" | "basic" | "growth" | "pro", { accent: string; badge: string }> = {
  free: { accent: "slate", badge: "Current access" },
  basic: { accent: "emerald", badge: "Best first upgrade" },
  growth: { accent: "blue", badge: "Most popular" },
  pro: { accent: "amber", badge: "Full production suite" },
};

const METRIC_DEFS: Array<{
  key: keyof Pick<PlanEntitlements, "songs" | "images" | "videos" | "bibleVersions" | "devices">;
  label: string;
  shortLabel: string;
  icon: typeof Music;
}> = [
  { key: "songs", label: "Songs", shortLabel: "Songs", icon: Music },
  { key: "images", label: "Images", shortLabel: "Images", icon: ImageIcon },
  { key: "videos", label: "Videos", shortLabel: "Videos", icon: Video },
  { key: "bibleVersions", label: "Bible Versions", shortLabel: "Bibles", icon: BookOpen },
  { key: "devices", label: "Devices", shortLabel: "Devices", icon: Monitor },
];

const CAPABILITY_DEFS: Array<{
  key: keyof Pick<
    PlanEntitlements,
    | "tickers"
    | "multiview"
    | "mobileControl"
    | "massImport"
    | "easyWorshipImport"
    | "proPresenterImport"
    | "cloudSync"
    | "aiFeatures"
    | "teamManagement"
  >;
  label: string;
  icon: typeof Radio;
}> = [
  { key: "tickers", label: "Tickers", icon: Radio },
  { key: "multiview", label: "Multiview", icon: LayoutTemplate },
  { key: "mobileControl", label: "Mobile Controller", icon: Smartphone },
  { key: "massImport", label: "Bulk Import", icon: FolderInput },
  { key: "easyWorshipImport", label: "EasyWorship Import", icon: WandSparkles },
  { key: "proPresenterImport", label: "ProPresenter Import", icon: Sparkles },
  { key: "cloudSync", label: "Cloud Sync", icon: Cloud },
  { key: "aiFeatures", label: "AI Tools", icon: Sparkles },
  { key: "teamManagement", label: "Team Access", icon: Users },
];

function clampPlan(plan?: string): "free" | "basic" | "growth" | "pro" {
  const normalized = normalizePlanId(plan || "free");
  return PLAN_ORDER.includes(normalized) ? normalized : "free";
}

function getDisplayLabel(plan: string | undefined, config: PlanConfig): string {
  const raw = String(plan || "").trim().toLowerCase();
  if (raw === "trial") return "Growth Trial";
  if (raw === "ambassador") return "Ambassador";
  if (raw === "unlimited") return "Unlimited";
  const normalized = clampPlan(raw);
  return config.plans[normalized]?.label || normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatLimit(limit: number, label: string): string {
  if (limit === -1 || limit === Infinity) return `Unlimited ${label}`;
  return `${limit.toLocaleString("en-US")} ${label}`;
}

function getNextRecommendedPlan(requiredPlan: "free" | "basic" | "growth" | "pro"): "basic" | "growth" | "pro" {
  if (requiredPlan === "free") return "basic";
  return requiredPlan;
}

export interface NewUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  feature?: FeatureKey | string;
  requiredPlan?: PlanTier | string;
  currentPlan?: PlanTier | string;
  message?: string;
}

export default function NewUpgradeModal({
  open,
  onClose,
  feature,
  requiredPlan = "basic",
  currentPlan = "free",
  message,
}: NewUpgradeModalProps) {
  const [planConfig, setPlanConfig] = useState<PlanConfig>(() => readPlanConfigCache() || DEFAULT_PLAN_CONFIG);
  const { pricing, formatPrice, getPlanPrice, getIntroPrice } = useCountryPricing();

  useEffect(() => {
    if (!open) return undefined;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    let cancelled = false;
    if (!open) return undefined;

    void getPlanConfig()
      .then((config) => {
        if (!cancelled) setPlanConfig(config);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open]);

  const currentPlanKey = clampPlan(currentPlan);
  const requiredPlanKey = getNextRecommendedPlan(clampPlan(requiredPlan));
  const currentTier = planConfig.plans[currentPlanKey] || planConfig.plans.free;
  const requiredTier = planConfig.plans[requiredPlanKey] || planConfig.plans.basic;
  const currentLabel = getDisplayLabel(currentPlan, planConfig);
  const requiredLabel = getDisplayLabel(requiredPlanKey, planConfig);
  const featureLabel = feature && FEATURE_LABELS[feature] ? FEATURE_LABELS[feature] : "premium access";

  const unlocks = useMemo(() => {
    const items: Array<{ label: string; icon: typeof Radio; detail: string }> = [];

    for (const capability of CAPABILITY_DEFS) {
      const currentEnabled = currentTier.entitlements[capability.key];
      const nextEnabled = requiredTier.entitlements[capability.key];
      if (!currentEnabled && nextEnabled) {
        items.push({
          label: capability.label,
          icon: capability.icon,
          detail: `${capability.label} unlocks on ${requiredLabel}.`,
        });
      }
    }

    for (const metric of METRIC_DEFS) {
      const currentLimit = currentTier.entitlements[metric.key];
      const nextLimit = requiredTier.entitlements[metric.key];
      if (nextLimit > currentLimit || nextLimit === -1) {
        items.push({
          label: metric.label,
          icon: metric.icon,
          detail: formatLimit(nextLimit, metric.label.toLowerCase()),
        });
      }
    }

    if (requiredPlanKey === "pro" && !currentTier.entitlements.advancedAnalytics) {
      items.push({
        label: "Priority support",
        icon: Crown,
        detail: "Highest credit allocation, priority support, and early access.",
      });
    }

    return items.slice(0, 8);
  }, [currentTier, requiredTier, requiredLabel, requiredPlanKey]);

  const priceBlock = useMemo(() => {
    if (!pricing) return null;
    const recurring = getPlanPrice(requiredPlanKey, "monthly");
    const intro = getIntroPrice(requiredPlanKey);
    return {
      recurring,
      intro,
      recurringLabel: `${formatPrice(recurring)}/mo`,
      introLabel: intro ? formatPrice(intro) : null,
      regionLabel:
        pricing.region === "NG"
          ? "Nigeria pricing"
          : pricing.region === "AFRICA"
            ? "Africa pricing"
            : "Rest of world pricing",
    };
  }, [formatPrice, getIntroPrice, getPlanPrice, pricing, requiredPlanKey]);

  const title = `Upgrade to ${requiredLabel}`;
  const subtitle =
    message
    || `${featureLabel} is gated by your effective plan. Upgrade to ${requiredLabel} to raise your limits and unlock the matching premium tools.`;

  if (!open) return null;

  return (
    <div className="upgrade-modal-backdrop" onClick={onClose}>
      <div
        aria-labelledby="upgrade-modal-title"
        aria-modal="true"
        className={`upgrade-modal-shell upgrade-modal-shell--${PLAN_THEMES[requiredPlanKey].accent}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Close upgrade modal"
          className="upgrade-modal-close"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>

        <div className="upgrade-modal-hero">
          <div className="upgrade-modal-eyebrow">
            <Sparkles size={14} />
            <span>{featureLabel}</span>
          </div>
          <h1 className="upgrade-modal-title" id="upgrade-modal-title">{title}</h1>
          <p className="upgrade-modal-subtitle">{subtitle}</p>
        </div>

        <div className="upgrade-modal-panels">
          <section className="upgrade-plan-card upgrade-plan-card--current">
            <div className="upgrade-plan-card__head">
              <div>
                <p className="upgrade-plan-card__eyebrow">Current plan</p>
                <h2>{currentLabel}</h2>
              </div>
              <span className="upgrade-plan-chip upgrade-plan-chip--muted">Now</span>
            </div>

            <div className="upgrade-metrics-grid">
              {METRIC_DEFS.map((metric) => {
                const Icon = metric.icon;
                return (
                  <div className="upgrade-metric" key={`current-${metric.key}`}>
                    <div className="upgrade-metric__icon"><Icon size={15} /></div>
                    <div>
                      <strong>{formatLimit(currentTier.entitlements[metric.key], metric.shortLabel.toLowerCase())}</strong>
                      <span>{metric.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="upgrade-plan-card upgrade-plan-card--next">
            <div className="upgrade-plan-card__head">
              <div>
                <p className="upgrade-plan-card__eyebrow">Recommended plan</p>
                <h2>{requiredLabel}</h2>
              </div>
              <span className="upgrade-plan-chip upgrade-plan-chip--accent">{PLAN_THEMES[requiredPlanKey].badge}</span>
            </div>

            {priceBlock && (
              <div className="upgrade-price-card">
                {priceBlock.introLabel ? (
                  <>
                    <div className="upgrade-price-card__label">First month</div>
                    <div className="upgrade-price-card__amount">{priceBlock.introLabel}</div>
                    <div className="upgrade-price-card__detail">Then {priceBlock.recurringLabel}</div>
                  </>
                ) : (
                  <>
                    <div className="upgrade-price-card__label">{priceBlock.regionLabel}</div>
                    <div className="upgrade-price-card__amount">{priceBlock.recurringLabel}</div>
                  </>
                )}
              </div>
            )}

            <div className="upgrade-capability-list">
              {CAPABILITY_DEFS.filter((capability) => requiredTier.entitlements[capability.key]).map((capability) => {
                const Icon = capability.icon;
                const highlighted = !currentTier.entitlements[capability.key] && requiredTier.entitlements[capability.key];
                return (
                  <div
                    className={`upgrade-capability ${highlighted ? "upgrade-capability--highlighted" : ""}`}
                    key={capability.key}
                  >
                    <Icon size={15} />
                    <span>{capability.label}</span>
                    <CheckCircle2 size={15} />
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="upgrade-unlocks">
          <div className="upgrade-unlocks__head">
            <h3>What changes immediately</h3>
            <p>Every limit and permission below is derived from the same entitlement engine the API enforces.</p>
          </div>

          <div className="upgrade-unlocks__grid">
            {unlocks.map((item) => {
              const Icon = item.icon;
              return (
                <div className="upgrade-unlock" key={`${item.label}-${item.detail}`}>
                  <div className="upgrade-unlock__icon">
                    <Icon size={16} />
                  </div>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="upgrade-modal-actions">
          <button className="upgrade-modal-button upgrade-modal-button--ghost" onClick={onClose} type="button">
            Maybe later
          </button>
          <button
            className="upgrade-modal-button upgrade-modal-button--primary"
            onClick={() => window.open(PRICING_URL, "_blank", "noopener,noreferrer")}
            type="button"
          >
            <span>View {requiredLabel} plans</span>
            <ArrowRight size={16} />
          </button>
        </div>

        <div className="upgrade-modal-footnote">
          <ShieldCheck size={15} />
          <span>
            Country changes the price, not the entitlements. Billing can be cancelled anytime.
          </span>
        </div>
      </div>
    </div>
  );
}
