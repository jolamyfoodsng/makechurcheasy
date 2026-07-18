import { useMemo } from "react";
import Icon from "./Icon";
import { useAuth } from "../contexts/AuthContext";
import { getEffectivePlan, isTrialExpired } from "../services/licenseService";
import "./TrialExpiredUpgradeModal.css";

const TRIAL_EXPIRED_CHECKOUT_URL =
  "https://makechurcheasy.creatorstudioslabs.stream/subscription/plans?checkout=growth&billingCycle=monthly&reason=trial_expired";

async function openCheckout() {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(TRIAL_EXPIRED_CHECKOUT_URL);
  } catch {
    window.open(TRIAL_EXPIRED_CHECKOUT_URL, "_blank", "noopener,noreferrer");
  }
}

export default function TrialExpiredUpgradeModal() {
  const { user, authenticated, loading, isAdmin } = useAuth();

  const shouldShow = useMemo(() => {
    if (loading || !authenticated || !user || isAdmin) return false;
    return getEffectivePlan(user) === "free" && isTrialExpired(user);
  }, [authenticated, isAdmin, loading, user]);

  if (!shouldShow) return null;

  return (
    <div
      className="trial-expired-upgrade"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-expired-upgrade-title"
    >
      <div className="trial-expired-upgrade__card">
        <div className="trial-expired-upgrade__header">
          <div className="trial-expired-upgrade__badge">
            <Icon name="lock" size={14} />
            Free trial ended
          </div>
          <h2
            id="trial-expired-upgrade-title"
            className="trial-expired-upgrade__title"
          >
            Upgrade to continue using MakeChurchEasy
          </h2>
          <p className="trial-expired-upgrade__copy">
            Your free trial has ended. Upgrade to Growth to keep presentation,
            broadcast, library, and team tools active for your church.
          </p>
        </div>

        <div className="trial-expired-upgrade__body">
          <div className="trial-expired-upgrade__plan">
            <div className="trial-expired-upgrade__plan-icon">
              <Icon name="auto_awesome" size={22} />
            </div>
            <div>
              <p className="trial-expired-upgrade__plan-title">Growth plan</p>
              <p className="trial-expired-upgrade__plan-copy">
                The dashboard will open and start the secure Paystack checkout.
                Your desktop access updates after payment is confirmed.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="trial-expired-upgrade__button"
            onClick={() => void openCheckout()}
          >
            Upgrade to continue
            <Icon name="arrow_forward" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
