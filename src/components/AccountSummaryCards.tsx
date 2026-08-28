import {
  Calendar,
  Coins,
  Crown,
  MonitorSmartphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../contexts/AuthContext";
import { fetchCreditDetails, getCreditsBalance } from "../services/credits";
import {
  getEffectivePlan,
  getTrialDaysRemaining,
  getUserPlan,
  getUserPlanLimits,
  isInTrial,
} from "../services/licenseService";
import { getEnvConfig } from "../services/envConfig";
import { getPlanConfig, getPlanLabel } from "../services/planConfig";
import { getCachedSubscription } from "../services/subscriptionCache";

interface SummaryCardData {
  plan: string;
  planLabel: string;
  credits: number | null;
  creditsTotal: number;
  creditsConsumed: number | null;
  deviceLimit: number;
  deviceUnlimited: boolean;
  renewalDate: string | null;
  trialActive: boolean;
  trialDaysLeft: number;
}

interface AccountSummaryCardsProps {
  className?: string;
  hideInTest?: boolean;
}

/**
 * Shared account overview used by the production dashboard and MV Settings.
 * The values come from the same plan, credit, and subscription services in
 * both locations so users see one consistent account summary.
 */
export function AccountSummaryCards({
  className = "",
  hideInTest = false,
}: AccountSummaryCardsProps) {
  if (hideInTest && getEnvConfig().isTest) return null;

  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<SummaryCardData | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const plan = getEffectivePlan(user);
        const actualPlan = getUserPlan(user);
        const limits = getUserPlanLimits(user);
        const storedPlan = String(user?.plan || "free").trim().toLowerCase();
        const trial = storedPlan === "free" && isInTrial(user);
        const trialDays = getTrialDaysRemaining(user);
        const creditDetails = await fetchCreditDetails();
        const sub = getCachedSubscription();
        const config = await getPlanConfig();
        const planLabel = getPlanLabel(config, actualPlan);

        if (!mounted) return;
        setData({
          plan,
          planLabel,
          credits: creditDetails?.credits ?? getCreditsBalance(),
          creditsTotal: creditDetails?.planAllocation ?? 0,
          creditsConsumed: creditDetails?.totalConsumed ?? null,
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

    void load();
    return () => {
      mounted = false;
    };
  }, [user]);

  if (!data) return null;

  const renewalLabel = data.trialActive
    ? t("dashboard.summary.renewalTrial", {
      date: data.renewalDate
        ? new Date(data.renewalDate).toLocaleDateString()
        : `${data.trialDaysLeft}d`,
    })
    : data.renewalDate
      ? t("dashboard.summary.renewalActive", {
        date: new Date(data.renewalDate).toLocaleDateString(),
      })
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
    <div className={`summary-cards ${className}`.trim()} aria-label="Account summary">
      <div className="summary-card summary-card--plan">
        <div className="summary-card-icon-wrap summary-card-icon--plan">
          <Crown size={18} />
        </div>
        <div className="summary-card-body">
          <span className="summary-card-label">{t("dashboard.summary.plan")}</span>
          <span className="summary-card-value">{data.planLabel || t("dashboard.summary.planFree")}</span>
          <span className="summary-card-sub">
            {data.trialActive
              ? `${t("dashboard.summary.planTrial")} — ${data.trialDaysLeft}d`
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
              ? t("dashboard.summary.creditsOf", { used: data.creditsConsumed ?? data.creditsTotal })
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
